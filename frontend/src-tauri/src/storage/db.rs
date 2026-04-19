use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::path::Path;

const SCHEMA: &str = include_str!("schema.sql");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contact {
    pub id: String,
    pub name: String,
    pub ip_address: String,
    pub port: u16,
    pub online: bool,
    pub last_seen: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredMessage {
    pub id: String,
    pub sender_id: String,
    pub recipient_id: String,
    pub content: String,
    pub timestamp: i64,
    pub status: String,
    pub file_transfer_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTransfer {
    pub id: String,
    pub message_id: String,
    pub file_name: String,
    pub file_size: i64,
    pub checksum: String,
    pub status: String,
    pub bytes_transferred: i64,
    pub local_path: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self { conn })
    }

    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self { conn })
    }

    // --- Contacts ---

    pub fn upsert_contact(&self, contact: &Contact) -> Result<()> {
        self.conn.execute(
            "INSERT INTO contacts (id, name, ip_address, port, online, last_seen, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               ip_address = excluded.ip_address,
               port = excluded.port,
               online = excluded.online,
               last_seen = excluded.last_seen",
            params![
                contact.id, contact.name, contact.ip_address,
                contact.port, contact.online as i32,
                contact.last_seen, contact.created_at
            ],
        )?;
        Ok(())
    }

    pub fn get_contact(&self, id: &str) -> Result<Option<Contact>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, ip_address, port, online, last_seen, created_at FROM contacts WHERE id = ?1"
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(Contact {
                id: row.get(0)?,
                name: row.get(1)?,
                ip_address: row.get(2)?,
                port: row.get(3)?,
                online: row.get::<_, i32>(4)? != 0,
                last_seen: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn get_all_contacts(&self) -> Result<Vec<Contact>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, ip_address, port, online, last_seen, created_at FROM contacts ORDER BY last_seen DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Contact {
                id: row.get(0)?,
                name: row.get(1)?,
                ip_address: row.get(2)?,
                port: row.get(3)?,
                online: row.get::<_, i32>(4)? != 0,
                last_seen: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_online_contacts(&self) -> Result<Vec<Contact>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, ip_address, port, online, last_seen, created_at FROM contacts WHERE online = 1"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Contact {
                id: row.get(0)?,
                name: row.get(1)?,
                ip_address: row.get(2)?,
                port: row.get(3)?,
                online: row.get::<_, i32>(4)? != 0,
                last_seen: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        rows.collect()
    }

    pub fn delete_contact(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM contacts WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn set_contact_online(&self, id: &str, online: bool) -> Result<()> {
        self.conn.execute(
            "UPDATE contacts SET online = ?1, last_seen = ?2 WHERE id = ?3",
            params![online as i32, chrono::Utc::now().timestamp_millis(), id],
        )?;
        Ok(())
    }

    // --- Messages ---

    pub fn insert_message(&self, msg: &StoredMessage) -> Result<()> {
        self.conn.execute(
            "INSERT INTO messages (id, sender_id, recipient_id, content, timestamp, status, file_transfer_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                msg.id, msg.sender_id, msg.recipient_id,
                msg.content, msg.timestamp, msg.status, msg.file_transfer_id
            ],
        )?;
        Ok(())
    }

    pub fn get_message(&self, id: &str) -> Result<Option<StoredMessage>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, sender_id, recipient_id, content, timestamp, status, file_transfer_id
             FROM messages WHERE id = ?1"
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(StoredMessage {
                id: row.get(0)?,
                sender_id: row.get(1)?,
                recipient_id: row.get(2)?,
                content: row.get(3)?,
                timestamp: row.get(4)?,
                status: row.get(5)?,
                file_transfer_id: row.get(6)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn query_messages(&self, contact_id: Option<&str>, limit: i64, offset: i64) -> Result<Vec<StoredMessage>> {
        let sql = match contact_id {
            Some(_) => "SELECT id, sender_id, recipient_id, content, timestamp, status, file_transfer_id
                        FROM messages WHERE sender_id = ?1 OR recipient_id = ?1
                        ORDER BY timestamp DESC LIMIT ?2 OFFSET ?3",
            None => "SELECT id, sender_id, recipient_id, content, timestamp, status, file_transfer_id
                     FROM messages ORDER BY timestamp DESC LIMIT ?1 OFFSET ?2",
        };
        let mut stmt = self.conn.prepare(sql)?;
        let rows = match contact_id {
            Some(cid) => stmt.query_map(params![cid, limit, offset], |row| {
                Ok(StoredMessage {
                    id: row.get(0)?,
                    sender_id: row.get(1)?,
                    recipient_id: row.get(2)?,
                    content: row.get(3)?,
                    timestamp: row.get(4)?,
                    status: row.get(5)?,
                    file_transfer_id: row.get(6)?,
                })
            })?,
            None => stmt.query_map(params![limit, offset], |row| {
                Ok(StoredMessage {
                    id: row.get(0)?,
                    sender_id: row.get(1)?,
                    recipient_id: row.get(2)?,
                    content: row.get(3)?,
                    timestamp: row.get(4)?,
                    status: row.get(5)?,
                    file_transfer_id: row.get(6)?,
                })
            })?,
        };
        rows.collect()
    }

    pub fn update_message_status(&self, id: &str, status: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE messages SET status = ?1 WHERE id = ?2",
            params![status, id],
        )?;
        Ok(())
    }

    pub fn delete_message(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM messages WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_messages_by_contact(&self, contact_id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM messages WHERE sender_id = ?1 OR recipient_id = ?1",
            params![contact_id],
        )?;
        Ok(())
    }

    // --- File Transfers ---

    pub fn insert_file_transfer(&self, t: &FileTransfer) -> Result<()> {
        self.conn.execute(
            "INSERT INTO file_transfers (id, message_id, file_name, file_size, checksum, status, bytes_transferred, local_path, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                t.id, t.message_id, t.file_name, t.file_size, t.checksum,
                t.status, t.bytes_transferred, t.local_path, t.created_at, t.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get_file_transfer(&self, id: &str) -> Result<Option<FileTransfer>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, message_id, file_name, file_size, checksum, status, bytes_transferred, local_path, created_at, updated_at
             FROM file_transfers WHERE id = ?1"
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(FileTransfer {
                id: row.get(0)?,
                message_id: row.get(1)?,
                file_name: row.get(2)?,
                file_size: row.get(3)?,
                checksum: row.get(4)?,
                status: row.get(5)?,
                bytes_transferred: row.get(6)?,
                local_path: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn update_transfer_progress(&self, id: &str, bytes: i64, status: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE file_transfers SET bytes_transferred = ?1, status = ?2, updated_at = ?3 WHERE id = ?4",
            params![bytes, status, chrono::Utc::now().timestamp_millis(), id],
        )?;
        Ok(())
    }

    pub fn set_transfer_local_path(&self, id: &str, path: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE file_transfers SET local_path = ?1, updated_at = ?2 WHERE id = ?3",
            params![path, chrono::Utc::now().timestamp_millis(), id],
        )?;
        Ok(())
    }

    pub fn get_transfer_by_message(&self, message_id: &str) -> Result<Option<FileTransfer>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, message_id, file_name, file_size, checksum, status, bytes_transferred, local_path, created_at, updated_at
             FROM file_transfers WHERE message_id = ?1"
        )?;
        let mut rows = stmt.query_map(params![message_id], |row| {
            Ok(FileTransfer {
                id: row.get(0)?,
                message_id: row.get(1)?,
                file_name: row.get(2)?,
                file_size: row.get(3)?,
                checksum: row.get(4)?,
                status: row.get(5)?,
                bytes_transferred: row.get(6)?,
                local_path: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    // --- Config ---

    pub fn get_config(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self.conn.prepare("SELECT value FROM config WHERE key = ?1")?;
        let mut rows = stmt.query_map(params![key], |row| row.get(0))?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn set_config(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
}
