use anyhow::{Context, Result};
use log::{error, info, warn};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;

use crate::protocol::codec::FrameCodec;
use crate::protocol::types::{MessageType, TextAck, TextMessage};
use crate::storage::db::Database;

/// Default TCP port for messaging.
pub const MSG_PORT: u16 = 2426;

/// Callback type for incoming messages.
pub type OnMessageReceived = Arc<dyn Fn(TextMessage) + Send + Sync>;

/// Messenger service: TCP listener + send API.
pub struct MessengerService {
    port: u16,
    db: Arc<Database>,
    on_message: Option<OnMessageReceived>,
}

/// Handle for sending messages and shutting down.
pub struct MessengerHandle {
    outbound_tx: mpsc::Sender<(SocketAddr, TextMessage)>,
    cancel: tokio::sync::watch::Sender<bool>,
}

impl MessengerHandle {
    /// Send a text message to a peer via short-lived TCP connection.
    pub async fn send_message(&self, peer_addr: SocketAddr, msg: TextMessage) -> Result<()> {
        self.outbound_tx
            .send((peer_addr, msg))
            .await
            .context("Outbound channel closed")?;
        Ok(())
    }

    pub fn shutdown(&self) {
        let _ = self.cancel.send(true);
    }
}

impl MessengerService {
    pub fn new(port: u16, db: Arc<Database>) -> Self {
        Self { port, db, on_message: None }
    }

    pub fn on_message<F: Fn(TextMessage) + Send + Sync + 'static>(&mut self, f: F) {
        self.on_message = Some(Arc::new(f));
    }

    pub async fn start(self) -> Result<MessengerHandle> {
        let addr = format!("0.0.0.0:{}", self.port);
        let listener = TcpListener::bind(&addr)
            .await
            .with_context(|| format!("Failed to bind TCP on {}", addr))?;
        info!("Messenger listening on {}", addr);

        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
        let (outbound_tx, mut outbound_rx) = mpsc::channel::<(SocketAddr, TextMessage)>(256);

        let db = self.db.clone();
        let on_message = self.on_message.clone();

        // Listener task
        let mut cancel_rx_l = cancel_rx.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = cancel_rx_l.changed() => { info!("Messenger shutting down"); break; }
                    res = listener.accept() => {
                        match res {
                            Ok((stream, peer)) => {
                                let db = db.clone();
                                let cb = on_message.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = handle_incoming(stream, peer, db, cb).await {
                                        warn!("Incoming msg from {} error: {}", peer, e);
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
        let mut cancel_rx_o = cancel_rx.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = cancel_rx_o.changed() => break,
                    Some((peer, msg)) = outbound_rx.recv() => {
                        tokio::spawn(async move {
                            if let Err(e) = send_to_peer(peer, &msg).await {
                                error!("Send to {} failed: {}", peer, e);
                            }
                        });
                    }
                    else => break,
                }
            }
        });

        Ok(MessengerHandle { outbound_tx, cancel: cancel_tx })
    }
}

/// Handle incoming: read TextMsg → store → ACK → callback.
async fn handle_incoming(
    mut stream: TcpStream,
    peer: SocketAddr,
    db: Arc<Database>,
    on_message: Option<OnMessageReceived>,
) -> Result<()> {
    let msg: TextMessage = FrameCodec::read_frame(&mut stream).await?;
    if msg.msg_type != MessageType::TextMsg as u8 {
        warn!("Unexpected msg_type {} from {}", msg.msg_type, peer);
        return Ok(());
    }

    info!("Received message {} from {}", msg.msg_id, peer);

    let stored = crate::storage::db::StoredMessage {
        id: msg.msg_id.clone(),
        sender_id: msg.from_id.clone(),
        recipient_id: "self".to_string(),
        content: msg.content.clone(),
        timestamp: msg.timestamp as i64,
        status: "received".to_string(),
        file_transfer_id: None,
    };
    if let Err(e) = db.insert_message(&stored) {
        error!("Failed to store message: {}", e);
    }

    let ack = TextAck {
        msg_type: MessageType::TextAck as u8,
        msg_id: msg.msg_id.clone(),
        status: "received".to_string(),
    };
    FrameCodec::write_frame(&mut stream, &ack).await?;

    if let Some(cb) = on_message { cb(msg); }
    Ok(())
}

/// Send TextMessage via short-lived TCP connection.
async fn send_to_peer(peer_addr: SocketAddr, msg: &TextMessage) -> Result<()> {
    let mut stream = TcpStream::connect(peer_addr)
        .await
        .with_context(|| format!("Connect to {} failed", peer_addr))?;

    FrameCodec::write_frame(&mut stream, msg).await?;

    let ack: TextAck = FrameCodec::read_frame(&mut stream).await?;
    if ack.msg_id != msg.msg_id {
        warn!("ACK msg_id mismatch: expected {}, got {}", msg.msg_id, ack.msg_id);
    }
    info!("Message {} delivered, status: {}", msg.msg_id, ack.status);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_send_receive_message() {
        let db = Arc::new(Database::open_in_memory().unwrap());

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        let (msg_tx, mut msg_rx) = mpsc::channel::<TextMessage>(1);
        let db_recv = db.clone();
        tokio::spawn(async move {
            let (stream, peer) = listener.accept().await.unwrap();
            handle_incoming(stream, peer, db_recv, Some(Arc::new(move |msg| {
                let _ = msg_tx.try_send(msg);
            }))).await.unwrap();
        });

        let msg = TextMessage {
            msg_type: MessageType::TextMsg as u8,
            msg_id: "test-msg-001".to_string(),
            from_id: "sender-1".to_string(),
            timestamp: 1234567890000,
            content: "Hello from test!".to_string(),
        };

        let addr: SocketAddr = format!("127.0.0.1:{}", port).parse().unwrap();
        send_to_peer(addr, &msg).await.unwrap();

        let received = tokio::time::timeout(
            std::time::Duration::from_secs(2), msg_rx.recv()
        ).await.unwrap().unwrap();
        assert_eq!(received.msg_id, "test-msg-001");
        assert_eq!(received.content, "Hello from test!");

        let stored = db.get_message("test-msg-001").unwrap().unwrap();
        assert_eq!(stored.content, "Hello from test!");
        assert_eq!(stored.status, "received");
    }
}
