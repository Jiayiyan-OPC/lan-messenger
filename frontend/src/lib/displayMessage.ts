import type { StoredMessage } from '../types'
import { formatClock } from './format'

/** Display-facing shape used by TextBubble/FileBubble. */
export interface DisplayMessage {
  id: string
  kind: 'text' | 'file'
  /** 'me' for self, otherwise the remote peer id. */
  from: 'me' | string
  text: string
  /** Clock time for the bubble footer. */
  t: string
  /** Raw timestamp for day divider calculations. */
  ts: number
  /** Lifecycle — only self messages carry a status icon. */
  status?: StoredMessage['status']
  /** Backing file transfer id when kind === 'file'. */
  fileTransferId?: string
}

/**
 * Adapt a backend StoredMessage to the display shape without renaming
 * the underlying fields (keeps Rust contract intact).
 */
export function toDisplayMessage(msg: StoredMessage, selfId: string | null): DisplayMessage {
  return {
    id: msg.id,
    kind: msg.file_transfer_id ? 'file' : 'text',
    from: msg.sender_id === selfId ? 'me' : msg.sender_id,
    text: msg.content,
    t: formatClock(msg.timestamp),
    ts: msg.timestamp,
    status: msg.status,
    fileTransferId: msg.file_transfer_id,
  }
}
