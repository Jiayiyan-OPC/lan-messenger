import type { Contact } from '../types'

/** Avatar color palette from design handoff Colors §"头像色". */
export const AVATAR_PALETTE = [
  '#4E9AB8',
  '#6FA78B',
  '#8C8AB8',
  '#5E7AA8',
  '#4AA3A0',
  '#7792A8',
  '#5F8A9B',
] as const

/** Stable hash → palette index. */
export function avatarColorForId(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]!
}

/** Initials: first non-space, non-ASCII-punctuation char uppercased. */
export function initialsFor(name: string | null | undefined): string {
  if (!name) return '?'
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return trimmed.charAt(0).toUpperCase()
}

/** Hostname best-effort from Contact (backend currently puts hostname in `name`). */
export function hostnameFor(c: Contact | null | undefined): string {
  if (!c) return ''
  if (c.hostname && c.hostname.trim()) return c.hostname
  return c.name
}

/** OS bucket for the OsBadge. Returns null when unknown so UI can render nothing. */
export function osBucket(os: string | undefined | null): 'mac' | 'win' | 'linux' | null {
  if (!os) return null
  const s = os.toLowerCase()
  if (s.includes('mac') || s === 'darwin') return 'mac'
  if (s.includes('win')) return 'win'
  if (s.includes('linux') || s.includes('ubuntu') || s.includes('debian') || s.includes('fedora')) return 'linux'
  return null
}

/** Shade a hex color by `pct` points on each channel. Positive = lighter. */
export function shadeHex(hex: string, pct: number): string {
  const clean = hex.replace('#', '')
  const n = parseInt(clean, 16)
  if (Number.isNaN(n) || clean.length !== 6) return hex
  const r = Math.min(255, Math.max(0, ((n >> 16) & 0xff) + pct))
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + pct))
  const b = Math.min(255, Math.max(0, (n & 0xff) + pct))
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}
