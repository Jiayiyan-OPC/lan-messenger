-- LAN Messenger Database Schema
-- SQLite

CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    port INTEGER NOT NULL,
    online INTEGER NOT NULL DEFAULT 0,
    last_seen INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent',
    file_transfer_id TEXT,
    FOREIGN KEY (file_transfer_id) REFERENCES file_transfers(id)
);

CREATE TABLE IF NOT EXISTS file_transfers (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    bytes_transferred INTEGER NOT NULL DEFAULT 0,
    local_path TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_contacts_online ON contacts(online);
CREATE INDEX IF NOT EXISTS idx_file_transfers_message ON file_transfers(message_id);

CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
