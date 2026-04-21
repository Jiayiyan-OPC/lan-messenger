use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

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

/// Thread-safe database wrapper. Uses Mutex<Connection> to satisfy Send+Sync
/// required by Tauri's managed state.
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        // `messages` and `file_transfers` have MUTUALLY REFERENCING FK
        // clauses (`messages.file_transfer_id → file_transfers.id` and
        // `file_transfers.message_id → messages.id`) so no insert order
        // can satisfy both at once. Enforcement has to be off — which is
        // the SQLite default, but rusqlite + bundled SQLite in some
        // versions flip it on, so we set it explicitly to be safe.
        // Integrity is managed in app code instead.
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=OFF;")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn open_in_memory() -> Result<Self> {
        // Same rationale as `open`: explicitly disable FK enforcement so
        // test behaviour matches production.
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys=OFF;")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    /// Acquire the connection lock. Panics if poisoned.
    fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().expect("Database mutex poisoned")
    }

    // --- Contacts ---

    pub fn upsert_contact(&self, contact: &Contact) -> Result<()> {
        self.conn().execute(
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
        let conn = self.conn();
        let mut stmt = conn.prepare(
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
        let conn = self.conn();
        let mut stmt = conn.prepare(
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
        let conn = self.conn();
        let mut stmt = conn.prepare(
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
        self.conn().execute("DELETE FROM contacts WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn set_contact_online(&self, id: &str, online: bool) -> Result<()> {
        self.conn().execute(
            "UPDATE contacts SET online = ?1, last_seen = ?2 WHERE id = ?3",
            params![online as i32, chrono::Utc::now().timestamp_millis(), id],
        )?;
        Ok(())
    }

    /// Reset every contact's `online` flag to `false`.
    ///
    /// Called once on app startup, before discovery starts. Without this,
    /// rows persisted as `online = 1` from a previous session "poison" the
    /// initial UI state: the discovery service has an empty in-memory peer
    /// table on startup, so it never emits `peer-lost` for a contact it has
    /// never seen — leaving the stale `online = 1` row visible in the UI.
    /// Discovery will flip the flag back to true as heartbeats arrive.
    pub fn mark_all_contacts_offline(&self) -> Result<()> {
        self.conn().execute("UPDATE contacts SET online = 0", [])?;
        Ok(())
    }

    /// On startup, any `pending` / `transferring` / `pending_response` row
    /// cannot possibly still be live — the worker task died when the app
    /// closed. Mark them failed so the persisted chat card reflects
    /// reality instead of showing a progress bar that never advances.
    pub fn mark_in_flight_transfers_failed(&self) -> Result<()> {
        self.conn().execute(
            "UPDATE file_transfers \
             SET status = 'failed', updated_at = ?1 \
             WHERE status IN ('pending', 'transferring', 'pending_response')",
            params![chrono::Utc::now().timestamp_millis()],
        )?;
        Ok(())
    }

    // --- Messages ---

    pub fn insert_message(&self, msg: &StoredMessage) -> Result<()> {
        self.conn().execute(
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
        let conn = self.conn();
        let mut stmt = conn.prepare(
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
        let conn = self.conn();
        let mapper = |row: &rusqlite::Row| -> rusqlite::Result<StoredMessage> {
            Ok(StoredMessage {
                id: row.get(0)?,
                sender_id: row.get(1)?,
                recipient_id: row.get(2)?,
                content: row.get(3)?,
                timestamp: row.get(4)?,
                status: row.get(5)?,
                file_transfer_id: row.get(6)?,
            })
        };
        if let Some(cid) = contact_id {
            let mut stmt = conn.prepare(
                "SELECT id, sender_id, recipient_id, content, timestamp, status, file_transfer_id
                 FROM messages WHERE sender_id = ?1 OR recipient_id = ?1
                 ORDER BY timestamp DESC LIMIT ?2 OFFSET ?3"
            )?;
            let rows = stmt.query_map(params![cid, limit, offset], mapper)?;
            rows.collect()
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, sender_id, recipient_id, content, timestamp, status, file_transfer_id
                 FROM messages ORDER BY timestamp DESC LIMIT ?1 OFFSET ?2"
            )?;
            let rows = stmt.query_map(params![limit, offset], mapper)?;
            rows.collect()
        }
    }

    pub fn update_message_status(&self, id: &str, status: &str) -> Result<()> {
        self.conn().execute(
            "UPDATE messages SET status = ?1 WHERE id = ?2",
            params![status, id],
        )?;
        Ok(())
    }

    pub fn delete_message(&self, id: &str) -> Result<()> {
        self.conn().execute("DELETE FROM messages WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_messages_by_contact(&self, contact_id: &str) -> Result<()> {
        self.conn().execute(
            "DELETE FROM messages WHERE sender_id = ?1 OR recipient_id = ?1",
            params![contact_id],
        )?;
        Ok(())
    }

    // --- File Transfers ---

    pub fn insert_file_transfer(&self, t: &FileTransfer) -> Result<()> {
        self.conn().execute(
            "INSERT INTO file_transfers (id, message_id, file_name, file_size, checksum, status, bytes_transferred, local_path, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                t.id, t.message_id, t.file_name, t.file_size, t.checksum,
                t.status, t.bytes_transferred, t.local_path, t.created_at, t.updated_at
            ],
        )?;
        Ok(())
    }

    /// Fills in the checksum once the worker has computed it — the sender
    /// path eagerly inserts the row with an empty checksum in the Tauri
    /// command (so the chat card survives app close before the peer's
    /// accept), and the worker calls this once the SHA-256 pass completes.
    pub fn set_transfer_checksum(&self, id: &str, checksum: &str) -> Result<()> {
        self.conn().execute(
            "UPDATE file_transfers SET checksum = ?1, updated_at = ?2 WHERE id = ?3",
            params![checksum, chrono::Utc::now().timestamp_millis(), id],
        )?;
        Ok(())
    }

    pub fn get_file_transfer(&self, id: &str) -> Result<Option<FileTransfer>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
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
        self.conn().execute(
            "UPDATE file_transfers SET bytes_transferred = ?1, status = ?2, updated_at = ?3 WHERE id = ?4",
            params![bytes, status, chrono::Utc::now().timestamp_millis(), id],
        )?;
        Ok(())
    }

    pub fn set_transfer_local_path(&self, id: &str, path: &str) -> Result<()> {
        self.conn().execute(
            "UPDATE file_transfers SET local_path = ?1, updated_at = ?2 WHERE id = ?3",
            params![path, chrono::Utc::now().timestamp_millis(), id],
        )?;
        Ok(())
    }

    /// Bulk variant of `get_file_transfer` — used by the frontend to rehydrate
    /// its in-memory transfers store after app restart from a batch of
    /// message ids that reference file transfers. Preserves input order is
    /// not required; the frontend re-indexes by id.
    pub fn get_file_transfers_by_ids(&self, ids: &[String]) -> Result<Vec<FileTransfer>> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let conn = self.conn();
        let placeholders = std::iter::repeat("?")
            .take(ids.len())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT id, message_id, file_name, file_size, checksum, status, \
             bytes_transferred, local_path, created_at, updated_at \
             FROM file_transfers WHERE id IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&sql)?;
        let params_vec: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        let rows = stmt.query_map(params_vec.as_slice(), |row| {
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
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn get_transfer_by_message(&self, message_id: &str) -> Result<Option<FileTransfer>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
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
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT value FROM config WHERE key = ?1")?;
        let mut rows = stmt.query_map(params![key], |row| row.get(0))?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn set_config(&self, key: &str, value: &str) -> Result<()> {
        self.conn().execute(
            "INSERT INTO config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ft_row(id: &str) -> FileTransfer {
        FileTransfer {
            id: id.to_string(),
            message_id: id.to_string(),
            file_name: "f.bin".to_string(),
            file_size: 1,
            checksum: String::new(),
            status: "pending".to_string(),
            bytes_transferred: 0,
            local_path: Some("/tmp/f.bin".to_string()),
            created_at: 0,
            updated_at: 0,
        }
    }

    fn msg_row(id: &str, ft_id: Option<&str>) -> StoredMessage {
        StoredMessage {
            id: id.to_string(),
            sender_id: "me".to_string(),
            recipient_id: "peer".to_string(),
            content: "f.bin".to_string(),
            timestamp: 0,
            status: "sent".to_string(),
            file_transfer_id: ft_id.map(str::to_string),
        }
    }

    /// `messages ↔ file_transfers` have mutually-referencing FK clauses.
    /// Integrity has to rely on app-level ordering, NOT SQLite's FK
    /// enforcement — enabling `foreign_keys=ON` makes every file-transfer
    /// insert fail whatever order you use. This test pins that the two
    /// rows written by `commands::initiate_file_transfer` (transfer then
    /// message, both keyed by transfer_id) round-trip through the DB
    /// without a constraint error.
    #[test]
    fn file_transfer_plus_message_round_trip() {
        let db = Database::open_in_memory().unwrap();
        db.insert_file_transfer(&ft_row("tx-1")).unwrap();
        db.insert_message(&msg_row("tx-1", Some("tx-1"))).unwrap();

        let got_msg = db.get_message("tx-1").unwrap().unwrap();
        assert_eq!(got_msg.file_transfer_id.as_deref(), Some("tx-1"));
        let got_ft = db.get_file_transfer("tx-1").unwrap().unwrap();
        assert_eq!(got_ft.id, "tx-1");
    }

    #[test]
    fn mark_in_flight_transfers_failed_touches_only_transient_rows() {
        let db = Database::open_in_memory().unwrap();
        for (id, status) in [
            ("a", "pending"),
            ("b", "transferring"),
            ("c", "pending_response"),
            ("d", "completed"),
            ("e", "failed"),
            ("f", "rejected"),
        ] {
            let mut row = ft_row(id);
            row.status = status.to_string();
            db.insert_file_transfer(&row).unwrap();
        }
        db.mark_in_flight_transfers_failed().unwrap();
        let status_of = |id: &str| db.get_file_transfer(id).unwrap().unwrap().status;
        assert_eq!(status_of("a"), "failed");
        assert_eq!(status_of("b"), "failed");
        assert_eq!(status_of("c"), "failed");
        assert_eq!(status_of("d"), "completed");
        assert_eq!(status_of("e"), "failed"); // was already failed
        assert_eq!(status_of("f"), "rejected");
    }

    #[test]
    fn get_file_transfers_by_ids_returns_matching_rows_only() {
        let db = Database::open_in_memory().unwrap();
        db.insert_file_transfer(&ft_row("x")).unwrap();
        db.insert_file_transfer(&ft_row("y")).unwrap();
        db.insert_file_transfer(&ft_row("z")).unwrap();
        let rows = db
            .get_file_transfers_by_ids(&["x".to_string(), "z".to_string(), "nope".to_string()])
            .unwrap();
        let mut ids: Vec<_> = rows.into_iter().map(|r| r.id).collect();
        ids.sort();
        assert_eq!(ids, vec!["x".to_string(), "z".to_string()]);
    }
}
