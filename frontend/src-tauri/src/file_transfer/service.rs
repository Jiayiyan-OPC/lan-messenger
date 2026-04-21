use anyhow::{bail, Context, Result};
use log::{error, info, warn};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::future::Future;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex, RwLock};

use crate::protocol::codec::FrameCodec;
use crate::protocol::types::*;
use crate::storage::db::{Database, FileTransfer as DbFileTransfer};

/// Default TCP port for file transfer.
pub const FILE_PORT: u16 = 2427;
/// Default chunk size: 64 KB.
pub const DEFAULT_CHUNK_SIZE: u32 = 64 * 1024;

/// Progress callback: (transfer_id, bytes_transferred, total_bytes)
pub type OnProgress = Arc<dyn Fn(&str, u64, u64) + Send + Sync>;
/// Decision returned by the file-request handler. Accept carries the
/// user-chosen save path so the receiver writes the file where the user
/// wants, not into a hardcoded downloads folder.
#[derive(Debug, Clone)]
pub enum FileRequestDecision {
    Accept { save_path: PathBuf },
    Reject,
}
/// Async incoming file request callback: (request) -> decision.
/// The callback typically emits an event to the UI and blocks on a
/// oneshot channel until the user clicks accept-with-path or reject.
pub type OnFileRequest = Arc<
    dyn Fn(FileRequest) -> Pin<Box<dyn Future<Output = FileRequestDecision> + Send + 'static>>
        + Send
        + Sync,
>;

/// Pending receive-side requests awaiting a user decision. Keyed by
/// transfer_id. The lib-layer callback parks a oneshot tx here; the
/// accept/reject commands pop it and send the decision.
pub type PendingRequests =
    Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<FileRequestDecision>>>>;
/// Transfer complete callback: (transfer_id)
pub type OnComplete = Arc<dyn Fn(&str) + Send + Sync>;
/// Transfer failed callback: (transfer_id, reason)
pub type OnFailed = Arc<dyn Fn(&str, &str) + Send + Sync>;

/// Active transfer state.
struct TransferState {
    transfer_id: String,
    filename: String,
    file_size: u64,
    bytes_transferred: u64,
    status: String,
    local_path: Option<PathBuf>,
}

/// Outbound send request.
struct SendRequest {
    peer_addr: SocketAddr,
    file_path: PathBuf,
    transfer_id: String,
    peer_id: String,
}

pub struct FileTransferService {
    port: u16,
    db: Arc<Database>,
    download_dir: PathBuf,
    on_progress: Option<OnProgress>,
    on_file_request: Option<OnFileRequest>,
    on_complete: Option<OnComplete>,
    on_failed: Option<OnFailed>,
}

pub struct FileTransferHandle {
    outbound_tx: mpsc::Sender<SendRequest>,
    transfers: Arc<RwLock<HashMap<String, TransferState>>>,
    cancel: tokio::sync::watch::Sender<bool>,
}

impl FileTransferHandle {
    /// Initiate sending a file to a peer.
    pub async fn send_file(
        &self,
        peer_addr: SocketAddr,
        file_path: PathBuf,
        peer_id: String,
    ) -> Result<String> {
        let transfer_id = uuid::Uuid::new_v4().to_string();

        // Get file metadata
        let metadata = tokio::fs::metadata(&file_path).await?;

        self.transfers.write().await.insert(
            transfer_id.clone(),
            TransferState {
                transfer_id: transfer_id.clone(),
                filename: file_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                file_size: metadata.len(),
                bytes_transferred: 0,
                status: "pending".to_string(),
                local_path: Some(file_path.clone()),
            },
        );

        self.outbound_tx
            .send(SendRequest {
                peer_addr,
                file_path,
                transfer_id: transfer_id.clone(),
                peer_id,
            })
            .await
            .context("Outbound channel closed")?;

        Ok(transfer_id)
    }

    pub fn shutdown(&self) {
        let _ = self.cancel.send(true);
    }
}

impl FileTransferService {
    pub fn new(port: u16, db: Arc<Database>, download_dir: PathBuf) -> Self {
        Self {
            port,
            db,
            download_dir,
            on_progress: None,
            on_file_request: None,
            on_complete: None,
            on_failed: None,
        }
    }

    pub fn on_progress<F: Fn(&str, u64, u64) + Send + Sync + 'static>(&mut self, f: F) {
        self.on_progress = Some(Arc::new(f));
    }

    pub fn on_file_request<F, Fut>(&mut self, f: F)
    where
        F: Fn(FileRequest) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = FileRequestDecision> + Send + 'static,
    {
        self.on_file_request = Some(Arc::new(move |req| Box::pin(f(req))));
    }

    pub fn on_complete<F: Fn(&str) + Send + Sync + 'static>(&mut self, f: F) {
        self.on_complete = Some(Arc::new(f));
    }

    pub fn on_failed<F: Fn(&str, &str) + Send + Sync + 'static>(&mut self, f: F) {
        self.on_failed = Some(Arc::new(f));
    }

    pub async fn start(self) -> Result<FileTransferHandle> {
        let addr = format!("0.0.0.0:{}", self.port);
        let listener = TcpListener::bind(&addr)
            .await
            .with_context(|| format!("Failed to bind file transfer on {}", addr))?;
        info!("File transfer listening on {}", addr);

        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
        let (outbound_tx, mut outbound_rx) = mpsc::channel::<SendRequest>(64);
        let transfers = Arc::new(RwLock::new(HashMap::new()));

        let db = self.db.clone();
        let download_dir = self.download_dir.clone();
        let on_progress = self.on_progress.clone();
        let on_file_request = self.on_file_request.clone();
        let on_complete = self.on_complete.clone();
        let on_failed = self.on_failed.clone();
        let transfers_listener = transfers.clone();

        // Listener task: accept incoming file transfers
        let mut cancel_rx_listener = cancel_rx.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = cancel_rx_listener.changed() => {
                        info!("File transfer listener shutting down");
                        break;
                    }
                    accept_result = listener.accept() => {
                        match accept_result {
                            Ok((stream, peer)) => {
                                let db = db.clone();
                                let dir = download_dir.clone();
                                let prog = on_progress.clone();
                                let req_cb = on_file_request.clone();
                                let comp = on_complete.clone();
                                let fail = on_failed.clone();
                                let xfers = transfers_listener.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = handle_incoming_transfer(
                                        stream, peer, db, dir, prog, req_cb, comp, fail, xfers,
                                    ).await {
                                        warn!("Incoming transfer from {} failed: {}", peer, e);
                                    }
                                });
                            }
                            Err(e) => error!("Accept error: {}", e),
                        }
                    }
                }
            }
        });

        // Outbound task
        let transfers_outbound = transfers.clone();
        let on_progress_out = self.on_progress.clone();
        let on_complete_out = self.on_complete.clone();
        let on_failed_out = self.on_failed.clone();
        let db_out = self.db.clone();
        let mut cancel_rx_outbound = cancel_rx.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = cancel_rx_outbound.changed() => break,
                    Some(req) = outbound_rx.recv() => {
                        let xfers = transfers_outbound.clone();
                        let prog = on_progress_out.clone();
                        let comp = on_complete_out.clone();
                        let fail = on_failed_out.clone();
                        let db = db_out.clone();
                        tokio::spawn(async move {
                            if let Err(e) = send_file_to_peer(
                                req, db, prog, comp, fail, xfers,
                            ).await {
                                error!("Outbound transfer failed: {}", e);
                            }
                        });
                    }
                    else => break,
                }
            }
        });

        Ok(FileTransferHandle {
            outbound_tx,
            transfers,
            cancel: cancel_tx,
        })
    }
}

/// Handle incoming file transfer: read FileReq, accept/reject, receive chunks, verify.
async fn handle_incoming_transfer(
    mut stream: TcpStream,
    peer: SocketAddr,
    db: Arc<Database>,
    download_dir: PathBuf,
    on_progress: Option<OnProgress>,
    on_file_request: Option<OnFileRequest>,
    on_complete: Option<OnComplete>,
    on_failed: Option<OnFailed>,
    transfers: Arc<RwLock<HashMap<String, TransferState>>>,
) -> Result<()> {
    // Read file request
    let req: FileRequest = FrameCodec::read_frame(&mut stream).await?;

    if req.msg_type != MessageType::FileReq as u8 {
        bail!("Expected FileReq, got msg_type {}", req.msg_type);
    }

    info!(
        "Incoming file request: {} ({} bytes) from {}",
        req.filename, req.file_size, peer
    );

    // Ask the UI layer what to do. If no callback wired (tests, headless),
    // fall back to auto-accept into the default download directory —
    // preserves the old behaviour for existing test suites.
    let decision = if let Some(cb) = on_file_request.as_ref() {
        cb(req.clone()).await
    } else {
        FileRequestDecision::Accept {
            save_path: download_dir.join(&req.filename),
        }
    };

    let save_path = match decision {
        FileRequestDecision::Reject => {
            let reject = FileResponse {
                msg_type: MessageType::FileReject as u8,
                transfer_id: req.transfer_id.clone(),
            };
            FrameCodec::write_frame(&mut stream, &reject).await?;
            info!("Rejected file transfer {}", req.transfer_id);
            return Ok(());
        }
        FileRequestDecision::Accept { save_path } => save_path,
    };

    // Accept
    let accept = FileResponse {
        msg_type: MessageType::FileAccept as u8,
        transfer_id: req.transfer_id.clone(),
    };
    FrameCodec::write_frame(&mut stream, &accept).await?;

    // Prepare local file — ensure the parent dir exists so a user-chosen
    // save_path with a nested path still works.
    if let Some(parent) = save_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let mut file = File::create(&save_path).await?;
    let mut hasher = Sha256::new();
    let mut bytes_received: u64 = 0;
    let chunk_size = if req.chunk_size > 0 {
        req.chunk_size
    } else {
        DEFAULT_CHUNK_SIZE
    };
    let total_chunks = ((req.file_size + chunk_size as u64 - 1) / chunk_size as u64) as u32;

    // Track state
    transfers.write().await.insert(
        req.transfer_id.clone(),
        TransferState {
            transfer_id: req.transfer_id.clone(),
            filename: req.filename.clone(),
            file_size: req.file_size,
            bytes_transferred: 0,
            status: "transferring".to_string(),
            local_path: Some(save_path.clone()),
        },
    );

    // Record in DB
    let now = chrono::Utc::now().timestamp_millis();
    let db_record = DbFileTransfer {
        id: req.transfer_id.clone(),
        message_id: req.transfer_id.clone(), // use transfer_id as message_id for now
        file_name: req.filename.clone(),
        file_size: req.file_size as i64,
        checksum: req.checksum.clone(),
        status: "transferring".to_string(),
        bytes_transferred: 0,
        local_path: Some(save_path.to_string_lossy().to_string()),
        created_at: now,
        updated_at: now,
    };
    let _ = db.insert_file_transfer(&db_record);

    // Receive chunks
    loop {
        let raw = match FrameCodec::read_raw_frame(&mut stream).await {
            Ok(r) => r,
            Err(e) => {
                let err_str = e.to_string();
                if let Some(on_fail) = &on_failed {
                    on_fail(&req.transfer_id, &err_str);
                }
                let _ = db.update_transfer_progress(
                    &req.transfer_id,
                    bytes_received as i64,
                    "failed",
                );
                return Err(e);
            }
        };

        let msg_type = FrameCodec::peek_msg_type(&raw)?;

        // Check for FileDone
        if msg_type == MessageType::FileDone as u8 {
            break;
        }

        if msg_type == MessageType::FileCancel as u8 {
            info!("Transfer {} cancelled by sender", req.transfer_id);
            let _ = db.update_transfer_progress(
                &req.transfer_id,
                bytes_received as i64,
                "cancelled",
            );
            if let Some(on_fail) = &on_failed {
                on_fail(&req.transfer_id, "Cancelled by sender");
            }
            return Ok(());
        }

        if msg_type != MessageType::FileData as u8 {
            warn!("Unexpected msg_type {} during transfer", msg_type);
            continue;
        }

        let chunk: FileData = FrameCodec::decode(&raw)?;

        // Write chunk to file
        file.write_all(&chunk.data).await?;
        hasher.update(&chunk.data);
        bytes_received += chunk.data.len() as u64;

        // Send ACK
        let ack = FileChunkAck {
            msg_type: MessageType::FileAck as u8,
            transfer_id: req.transfer_id.clone(),
            seq: chunk.seq,
            status: None,
        };
        FrameCodec::write_frame(&mut stream, &ack).await?;

        // Progress callback
        if let Some(prog) = &on_progress {
            prog(&req.transfer_id, bytes_received, req.file_size);
        }

        // Update DB periodically (every 10 chunks)
        if chunk.seq % 10 == 0 {
            let _ = db.update_transfer_progress(
                &req.transfer_id,
                bytes_received as i64,
                "transferring",
            );
        }
    }

    file.flush().await?;

    // Verify checksum
    let computed = format!("{:x}", hasher.finalize());
    let verified = computed == req.checksum;

    let final_ack = FileChunkAck {
        msg_type: MessageType::FileAck as u8,
        transfer_id: req.transfer_id.clone(),
        seq: total_chunks,
        status: Some(if verified {
            "verified".to_string()
        } else {
            "checksum_mismatch".to_string()
        }),
    };
    FrameCodec::write_frame(&mut stream, &final_ack).await?;

    let status = if verified { "completed" } else { "failed" };
    let _ = db.update_transfer_progress(&req.transfer_id, bytes_received as i64, status);

    if verified {
        info!("Transfer {} completed, {} bytes", req.transfer_id, bytes_received);
        if let Some(comp) = &on_complete {
            comp(&req.transfer_id);
        }
    } else {
        warn!(
            "Transfer {} checksum mismatch: expected {}, got {}",
            req.transfer_id, req.checksum, computed
        );
        if let Some(fail) = &on_failed {
            fail(&req.transfer_id, "Checksum mismatch");
        }
    }

    transfers.write().await.remove(&req.transfer_id);
    Ok(())
}

/// Send a file to a peer: connect, send FileReq, wait accept, stream chunks, verify.
async fn send_file_to_peer(
    req: SendRequest,
    db: Arc<Database>,
    on_progress: Option<OnProgress>,
    on_complete: Option<OnComplete>,
    on_failed: Option<OnFailed>,
    transfers: Arc<RwLock<HashMap<String, TransferState>>>,
) -> Result<()> {
    let mut stream = TcpStream::connect(req.peer_addr)
        .await
        .with_context(|| format!("Connect to {} failed", req.peer_addr))?;

    let metadata = tokio::fs::metadata(&req.file_path).await?;
    let file_size = metadata.len();
    let filename = req
        .file_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    // Compute SHA-256
    let checksum = compute_file_checksum(&req.file_path).await?;

    let chunk_size = DEFAULT_CHUNK_SIZE;
    let total_chunks = ((file_size + chunk_size as u64 - 1) / chunk_size as u64) as u32;

    // Send FileReq
    let file_req = FileRequest {
        msg_type: MessageType::FileReq as u8,
        transfer_id: req.transfer_id.clone(),
        from_id: req.peer_id.clone(),
        filename: filename.clone(),
        file_size,
        checksum: checksum.clone(),
        chunk_size,
        resume_from_seq: None,
    };
    FrameCodec::write_frame(&mut stream, &file_req).await?;

    // Wait for accept/reject
    let response: FileResponse = FrameCodec::read_frame(&mut stream).await?;
    if response.msg_type == MessageType::FileReject as u8 {
        info!("File transfer {} rejected by peer", req.transfer_id);
        let _ = db.update_transfer_progress(&req.transfer_id, 0, "rejected");
        if let Some(fail) = &on_failed {
            fail(&req.transfer_id, "Rejected by peer");
        }
        return Ok(());
    }

    // Record in DB
    let now = chrono::Utc::now().timestamp_millis();
    let db_record = DbFileTransfer {
        id: req.transfer_id.clone(),
        message_id: req.transfer_id.clone(),
        file_name: filename,
        file_size: file_size as i64,
        checksum: checksum.clone(),
        status: "transferring".to_string(),
        bytes_transferred: 0,
        local_path: Some(req.file_path.to_string_lossy().to_string()),
        created_at: now,
        updated_at: now,
    };
    let _ = db.insert_file_transfer(&db_record);

    // Stream file chunks
    let mut file = File::open(&req.file_path).await?;
    let mut buf = vec![0u8; chunk_size as usize];
    let mut seq: u32 = 0;
    let mut bytes_sent: u64 = 0;

    loop {
        let n = file.read(&mut buf).await?;
        if n == 0 {
            break;
        }

        let chunk = FileData {
            msg_type: MessageType::FileData as u8,
            transfer_id: req.transfer_id.clone(),
            seq,
            data: buf[..n].to_vec(),
        };
        FrameCodec::write_frame(&mut stream, &chunk).await?;

        // Wait for chunk ACK
        let ack: FileChunkAck = FrameCodec::read_frame(&mut stream).await?;
        if ack.seq != seq {
            warn!("ACK seq mismatch: expected {}, got {}", seq, ack.seq);
        }

        bytes_sent += n as u64;
        seq += 1;

        if let Some(prog) = &on_progress {
            prog(&req.transfer_id, bytes_sent, file_size);
        }

        if seq % 10 == 0 {
            let _ = db.update_transfer_progress(
                &req.transfer_id,
                bytes_sent as i64,
                "transferring",
            );
        }
    }

    // Send FileDone
    let done = FileDone {
        msg_type: MessageType::FileDone as u8,
        transfer_id: req.transfer_id.clone(),
        checksum: checksum.clone(),
    };
    FrameCodec::write_frame(&mut stream, &done).await?;

    // Wait for final ACK with verification status
    let final_ack: FileChunkAck = FrameCodec::read_frame(&mut stream).await?;
    let verified = final_ack
        .status
        .as_deref()
        .map(|s| s == "verified")
        .unwrap_or(false);

    let status = if verified { "completed" } else { "failed" };
    let _ = db.update_transfer_progress(&req.transfer_id, bytes_sent as i64, status);

    if verified {
        info!("Transfer {} completed successfully", req.transfer_id);
        if let Some(comp) = &on_complete {
            comp(&req.transfer_id);
        }
    } else {
        warn!("Transfer {} verification failed", req.transfer_id);
        if let Some(fail) = &on_failed {
            fail(&req.transfer_id, "Verification failed on receiver");
        }
    }

    transfers.write().await.remove(&req.transfer_id);
    Ok(())
}

/// Compute SHA-256 checksum of a file.
async fn compute_file_checksum(path: &Path) -> Result<String> {
    let mut file = File::open(path).await?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db::Database;
    use tokio::io::AsyncWriteExt;

    #[tokio::test]
    async fn test_file_transfer_send_receive() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let tmp_dir = tempfile::tempdir().unwrap();
        let download_dir = tmp_dir.path().join("downloads");

        // Create a test file
        let test_file = tmp_dir.path().join("test.txt");
        let test_data = "Hello, this is a test file for transfer!\n".repeat(100);
        tokio::fs::write(&test_file, &test_data).await.unwrap();

        // Setup receiver
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        let db_recv = db.clone();
        let dl_dir = download_dir.clone();
        let (complete_tx, mut complete_rx) = mpsc::channel::<String>(1);

        tokio::spawn(async move {
            let (stream, peer) = listener.accept().await.unwrap();
            handle_incoming_transfer(
                stream,
                peer,
                db_recv,
                dl_dir,
                None,
                None, // auto-accept
                Some(Arc::new(move |id| {
                    let _ = complete_tx.try_send(id.to_string());
                })),
                None,
                Arc::new(RwLock::new(HashMap::new())),
            )
            .await
            .unwrap();
        });

        // Send file
        let send_req = SendRequest {
            peer_addr: format!("127.0.0.1:{}", port).parse().unwrap(),
            file_path: test_file.clone(),
            transfer_id: "xfer-001".to_string(),
            peer_id: "sender-1".to_string(),
        };

        send_file_to_peer(
            send_req,
            db.clone(),
            None,
            None,
            None,
            Arc::new(RwLock::new(HashMap::new())),
        )
        .await
        .unwrap();

        // Wait for completion
        let completed_id =
            tokio::time::timeout(std::time::Duration::from_secs(5), complete_rx.recv())
                .await
                .unwrap()
                .unwrap();
        assert_eq!(completed_id, "xfer-001");

        // Verify downloaded file matches
        let downloaded = tokio::fs::read_to_string(download_dir.join("test.txt"))
            .await
            .unwrap();
        assert_eq!(downloaded, test_data);
    }

    #[tokio::test]
    async fn test_file_checksum() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        tokio::fs::write(tmp.path(), b"hello world").await.unwrap();
        let checksum = compute_file_checksum(tmp.path()).await.unwrap();
        // SHA-256 of "hello world"
        assert_eq!(
            checksum,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }
}
