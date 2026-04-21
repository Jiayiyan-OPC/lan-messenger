use anyhow::{bail, Context, Result};
use log::{error, info, warn};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::future::Future;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex, RwLock};

use crate::protocol::codec::FrameCodec;
use crate::protocol::types::*;
use crate::storage::db::{Database, FileTransfer as DbFileTransfer, StoredMessage};

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
    /// **Our** device_id — gets written to `FileRequest.from_id` so the
    /// receiver knows who sent the file. Previously mis-named / mis-used as
    /// the recipient's id, which broke the receiver's inline card indexing.
    sender_device_id: String,
    /// Flipped to `true` by `FileTransferHandle::cancel_transfer` — the
    /// chunk loop reads this between frames and bails with a `FileCancel`
    /// frame for the peer.
    cancel_flag: Arc<AtomicBool>,
}

/// Shared map of `transfer_id → cancel flag`. Lives on `FileTransferHandle`
/// so the Tauri `cancel_file_transfer` command can set the flag, and the
/// chunk loops can observe it between frames.
pub type CancelFlags = Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>;

pub struct FileTransferService {
    port: u16,
    db: Arc<Database>,
    download_dir: PathBuf,
    /// **Our** device_id. Written into the `recipient_id` column of the
    /// message row we persist on every accepted incoming transfer, so
    /// the chat history shows the file bubble under the correct peer
    /// after app restart. Plumbed from `lib.rs` setup.
    recipient_device_id: String,
    on_progress: Option<OnProgress>,
    on_file_request: Option<OnFileRequest>,
    on_complete: Option<OnComplete>,
    on_failed: Option<OnFailed>,
}

pub struct FileTransferHandle {
    outbound_tx: mpsc::Sender<SendRequest>,
    transfers: Arc<RwLock<HashMap<String, TransferState>>>,
    cancel: tokio::sync::watch::Sender<bool>,
    cancel_flags: CancelFlags,
}

impl FileTransferHandle {
    /// Initiate sending a file to a peer.
    ///
    /// `sender_device_id` is this machine's device_id — it ends up in
    /// `FileRequest.from_id` on the wire so the receiver can route the
    /// inline card to the right conversation.
    pub async fn send_file(
        &self,
        peer_addr: SocketAddr,
        file_path: PathBuf,
        sender_device_id: String,
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

        let cancel_flag = Arc::new(AtomicBool::new(false));
        self.cancel_flags
            .lock()
            .await
            .insert(transfer_id.clone(), cancel_flag.clone());

        self.outbound_tx
            .send(SendRequest {
                peer_addr,
                file_path,
                transfer_id: transfer_id.clone(),
                sender_device_id,
                cancel_flag,
            })
            .await
            .context("Outbound channel closed")?;

        Ok(transfer_id)
    }

    /// Signal the chunk loop for `transfer_id` to abort. Returns true if a
    /// matching in-flight transfer was found. Actual teardown (writing a
    /// `FileCancel` frame, emitting `transfer-failed`) happens on the loop's
    /// next chunk boundary, not here — so the caller sees success as soon
    /// as the signal is recorded.
    pub async fn cancel_transfer(&self, transfer_id: &str) -> bool {
        let map = self.cancel_flags.lock().await;
        if let Some(flag) = map.get(transfer_id) {
            flag.store(true, Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    pub fn shutdown(&self) {
        let _ = self.cancel.send(true);
    }
}

impl FileTransferService {
    pub fn new(
        port: u16,
        db: Arc<Database>,
        download_dir: PathBuf,
        recipient_device_id: String,
    ) -> Self {
        Self {
            port,
            db,
            download_dir,
            recipient_device_id,
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
        let cancel_flags: CancelFlags = Arc::new(Mutex::new(HashMap::new()));

        let db = self.db.clone();
        let download_dir = self.download_dir.clone();
        let recipient_device_id = self.recipient_device_id.clone();
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
                                let recipient_id = recipient_device_id.clone();
                                let prog = on_progress.clone();
                                let req_cb = on_file_request.clone();
                                let comp = on_complete.clone();
                                let fail = on_failed.clone();
                                let xfers = transfers_listener.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = handle_incoming_transfer(
                                        stream, peer, db, dir, recipient_id,
                                        prog, req_cb, comp, fail, xfers,
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
        let cancel_flags_outbound = cancel_flags.clone();
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
                        let flags = cancel_flags_outbound.clone();
                        tokio::spawn(async move {
                            let transfer_id = req.transfer_id.clone();
                            if let Err(e) = send_file_to_peer(
                                req, db, prog, comp, fail, xfers,
                            ).await {
                                error!("Outbound transfer failed: {}", e);
                            }
                            // Always drop the cancel flag once the worker
                            // returns so stale ids don't accumulate.
                            flags.lock().await.remove(&transfer_id);
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
            cancel_flags,
        })
    }
}

/// Handle incoming file transfer: read FileReq, accept/reject, receive chunks, verify.
async fn handle_incoming_transfer(
    mut stream: TcpStream,
    peer: SocketAddr,
    db: Arc<Database>,
    download_dir: PathBuf,
    recipient_device_id: String,
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

    // Record in DB: both the file_transfer row AND the message row that
    // references it. Persisting the message here (not inside the Tauri
    // `accept_file_transfer` command) keeps the data we need on hand —
    // filename, file_size, sender id — without plumbing the FileRequest
    // out to the command layer.
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
    let msg_record = StoredMessage {
        id: req.transfer_id.clone(),
        sender_id: req.from_id.clone(),
        recipient_id: recipient_device_id,
        content: req.filename.clone(),
        timestamp: now,
        status: "received".to_string(),
        file_transfer_id: Some(req.transfer_id.clone()),
    };
    if let Err(e) = db.insert_message(&msg_record) {
        // Non-fatal — the transfer itself still works, we just lose the
        // chat-history persistence for this one row.
        warn!("persist incoming file message row failed: {}", e);
    }

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
        from_id: req.sender_device_id.clone(),
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

    // The Tauri `initiate_file_transfer` command already inserted the
    // message + file_transfer rows eagerly (so the chat card survives
    // app close before the peer's accept). Here we just (a) fill in the
    // SHA-256 the command could not compute, and (b) flip status to
    // `transferring` now that the peer has accepted.
    let _ = db.set_transfer_checksum(&req.transfer_id, &checksum);
    let _ = db.update_transfer_progress(&req.transfer_id, 0, "transferring");

    // Stream file chunks
    let mut file = File::open(&req.file_path).await?;
    let mut buf = vec![0u8; chunk_size as usize];
    let mut seq: u32 = 0;
    let mut bytes_sent: u64 = 0;

    loop {
        // Cancellation is checked between chunks rather than via `select!`
        // around the IO — chunks are small (64 KB) and the LAN round-trip
        // for one ACK is ~ms, so worst-case user-visible latency is on the
        // order of a single chunk's send+ack. Keeps the IO path simple.
        if req.cancel_flag.load(Ordering::SeqCst) {
            info!("Transfer {} cancelled by sender", req.transfer_id);
            let cancel_frame = FileCancel {
                msg_type: MessageType::FileCancel as u8,
                transfer_id: req.transfer_id.clone(),
                reason: Some("Cancelled by sender".to_string()),
            };
            // Best-effort notify the peer; if the write fails the peer's
            // read loop will surface the broken connection anyway.
            let _ = FrameCodec::write_frame(&mut stream, &cancel_frame).await;
            let _ = db.update_transfer_progress(
                &req.transfer_id,
                bytes_sent as i64,
                "cancelled",
            );
            if let Some(fail) = &on_failed {
                fail(&req.transfer_id, "Cancelled by sender");
            }
            transfers.write().await.remove(&req.transfer_id);
            return Ok(());
        }

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
                "test-recipient".to_string(),
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
            sender_device_id: "sender-1".to_string(),
            cancel_flag: Arc::new(AtomicBool::new(false)),
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
