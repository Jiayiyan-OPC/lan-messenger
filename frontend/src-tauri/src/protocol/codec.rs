use anyhow::{bail, Result};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Protocol magic bytes: "LM" (0x4C4D)
pub const FRAME_MAGIC: [u8; 2] = [0x4C, 0x4D];
/// Header: 2 (magic) + 4 (length) = 6 bytes
pub const HEADER_SIZE: usize = 6;
/// Max payload: 16 MB
pub const MAX_PAYLOAD_SIZE: u32 = 16 * 1024 * 1024;

pub struct FrameCodec;

impl FrameCodec {
    /// Encode a message into framed bytes: [magic(2)] [len(4 BE)] [payload]
    pub fn encode<T: serde::Serialize>(msg: &T) -> Result<Vec<u8>> {
        let payload = rmp_serde::to_vec(msg)?;
        let len = payload.len() as u32;
        if len > MAX_PAYLOAD_SIZE {
            bail!("Payload size {} exceeds max {}", len, MAX_PAYLOAD_SIZE);
        }
        let mut frame = Vec::with_capacity(HEADER_SIZE + payload.len());
        frame.extend_from_slice(&FRAME_MAGIC);
        frame.extend_from_slice(&len.to_be_bytes());
        frame.extend_from_slice(&payload);
        Ok(frame)
    }

    /// Read one frame from an async reader.
    pub async fn read_frame<R: AsyncReadExt + Unpin, T: serde::de::DeserializeOwned>(
        reader: &mut R,
    ) -> Result<T> {
        let mut header = [0u8; HEADER_SIZE];
        reader.read_exact(&mut header).await?;
        if header[0] != FRAME_MAGIC[0] || header[1] != FRAME_MAGIC[1] {
            bail!("Invalid magic: {:02X}{:02X}", header[0], header[1]);
        }
        let len = u32::from_be_bytes([header[2], header[3], header[4], header[5]]);
        if len > MAX_PAYLOAD_SIZE {
            bail!("Payload length {} exceeds max {}", len, MAX_PAYLOAD_SIZE);
        }
        let mut payload = vec![0u8; len as usize];
        reader.read_exact(&mut payload).await?;
        Ok(rmp_serde::from_slice(&payload)?)
    }

    /// Read one frame as raw payload bytes (for when you need to peek msg_type before deserializing).
    pub async fn read_raw_frame<R: AsyncReadExt + Unpin>(
        reader: &mut R,
    ) -> Result<Vec<u8>> {
        let mut header = [0u8; HEADER_SIZE];
        reader.read_exact(&mut header).await?;
        if header[0] != FRAME_MAGIC[0] || header[1] != FRAME_MAGIC[1] {
            bail!("Invalid magic: {:02X}{:02X}", header[0], header[1]);
        }
        let len = u32::from_be_bytes([header[2], header[3], header[4], header[5]]);
        if len > MAX_PAYLOAD_SIZE {
            bail!("Payload length {} exceeds max {}", len, MAX_PAYLOAD_SIZE);
        }
        let mut payload = vec![0u8; len as usize];
        reader.read_exact(&mut payload).await?;
        Ok(payload)
    }

    /// Peek the msg_type (first field) from a raw MessagePack payload.
    /// All protocol structs serialize as arrays with msg_type as the first element.
    pub fn peek_msg_type(payload: &[u8]) -> Result<u8> {
        if payload.is_empty() {
            bail!("Empty payload");
        }
        // Skip array header to get to first element
        let offset = if payload[0] & 0xF0 == 0x90 {
            1 // fixarray (up to 15 elements)
        } else if payload[0] == 0xdc {
            3 // array 16
        } else if payload[0] == 0xdd {
            5 // array 32
        } else {
            bail!("Expected array header, got 0x{:02X}", payload[0]);
        };
        if offset >= payload.len() {
            bail!("Payload too short to contain msg_type");
        }
        // Read the first element as a positive fixint or u8
        let b = payload[offset];
        if b <= 0x7f {
            Ok(b) // positive fixint
        } else if b == 0xcc && offset + 1 < payload.len() {
            Ok(payload[offset + 1]) // uint 8
        } else {
            bail!("Unexpected msg_type encoding: 0x{:02X}", b);
        }
    }

    /// Deserialize raw payload into a typed message.
    pub fn decode<T: serde::de::DeserializeOwned>(payload: &[u8]) -> Result<T> {
        Ok(rmp_serde::from_slice(payload)?)
    }

    /// Write one frame to an async writer.
    pub async fn write_frame<W: AsyncWriteExt + Unpin, T: serde::Serialize>(
        writer: &mut W,
        msg: &T,
    ) -> Result<()> {
        let frame = Self::encode(msg)?;
        writer.write_all(&frame).await?;
        writer.flush().await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::types::{TextMessage, MessageType};

    #[test]
    fn test_encode_decode_roundtrip() {
        let msg = TextMessage {
            msg_type: MessageType::TextMsg as u8,
            msg_id: "test-123".to_string(),
            from_id: "user-1".to_string(),
            timestamp: 1234567890,
            content: "Hello, world!".to_string(),
        };
        let frame = FrameCodec::encode(&msg).unwrap();
        assert_eq!(&frame[0..2], &FRAME_MAGIC);
        let len = u32::from_be_bytes([frame[2], frame[3], frame[4], frame[5]]);
        assert_eq!(len as usize, frame.len() - HEADER_SIZE);
        let decoded: TextMessage = rmp_serde::from_slice(&frame[HEADER_SIZE..]).unwrap();
        assert_eq!(decoded.msg_id, "test-123");
        assert_eq!(decoded.content, "Hello, world!");
    }

    #[tokio::test]
    async fn test_async_read_write_frame() {
        let msg = TextMessage {
            msg_type: MessageType::TextMsg as u8,
            msg_id: "async-test".to_string(),
            from_id: "user-2".to_string(),
            timestamp: 9999,
            content: "Async!".to_string(),
        };
        let mut buf = Vec::new();
        FrameCodec::write_frame(&mut buf, &msg).await.unwrap();
        let mut cursor = std::io::Cursor::new(buf);
        let decoded: TextMessage = FrameCodec::read_frame(&mut cursor).await.unwrap();
        assert_eq!(decoded.msg_id, "async-test");
    }

    #[test]
    fn test_peek_msg_type() {
        use crate::protocol::types::{FileDone, FileData};

        let text_msg = TextMessage {
            msg_type: MessageType::TextMsg as u8,
            msg_id: "t1".into(), from_id: "u1".into(),
            timestamp: 0, content: "hi".into(),
        };
        let payload = rmp_serde::to_vec(&text_msg).unwrap();
        assert_eq!(FrameCodec::peek_msg_type(&payload).unwrap(), MessageType::TextMsg as u8);

        let done = FileDone {
            msg_type: MessageType::FileDone as u8,
            transfer_id: "x1".into(),
            checksum: "abc".into(),
        };
        let payload = rmp_serde::to_vec(&done).unwrap();
        assert_eq!(FrameCodec::peek_msg_type(&payload).unwrap(), MessageType::FileDone as u8);

        let data = FileData {
            msg_type: MessageType::FileData as u8,
            transfer_id: "x2".into(),
            seq: 0,
            data: vec![1, 2, 3],
        };
        let payload = rmp_serde::to_vec(&data).unwrap();
        assert_eq!(FrameCodec::peek_msg_type(&payload).unwrap(), MessageType::FileData as u8);
    }
}
