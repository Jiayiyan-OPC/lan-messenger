/** MIME → file tint block for FileBubble / FileList. */

export interface FileTint {
  bg: string
  fg: string
  label: string
}

/** Keep hex values aligned with :root `--file-*` custom props in index.css. */
export function fileTintForMime(mime: string | undefined | null): FileTint {
  if (!mime) return { bg: '#DFE6ED', fg: '#55656F', label: 'FILE' }
  const m = mime.toLowerCase()
  if (m.startsWith('image/')) return { bg: '#D9E3EC', fg: '#3F6B8A', label: 'IMG' }
  if (m.includes('zip') || m.includes('gzip') || m.includes('tar')) return { bg: '#DCE2EA', fg: '#5E6A7E', label: 'ZIP' }
  if (m.includes('json') || m.startsWith('text/')) return { bg: '#D9E8E3', fg: '#3F7A66', label: 'JSON' }
  if (m.includes('pdf')) return { bg: '#D6E4E9', fg: '#3F7A91', label: 'PDF' }
  if (m.includes('disk') || m.includes('octet')) return { bg: '#DDE3EB', fg: '#4E637A', label: 'APP' }
  return { bg: '#DFE6ED', fg: '#55656F', label: 'FILE' }
}

/** Sniff MIME from filename extension when backend doesn't tell us. */
export function mimeFromFileName(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  const ext = name.slice(dot + 1).toLowerCase()
  switch (ext) {
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'bmp': case 'heic':
      return 'image/' + (ext === 'jpg' ? 'jpeg' : ext)
    case 'zip': return 'application/zip'
    case 'gz': case 'tgz': return 'application/gzip'
    case 'tar': return 'application/x-tar'
    case 'json': return 'application/json'
    case 'txt': case 'md': case 'log': case 'csv': case 'xml':
      return 'text/plain'
    case 'pdf': return 'application/pdf'
    case 'dmg': case 'iso': case 'img':
      return 'application/octet-stream'
    case 'app': case 'exe': case 'apk':
      return 'application/octet-stream'
    default: return ''
  }
}

/** Best-effort "extension" label for bubble corner (≤4 chars, uppercase). */
export function extLabel(name: string, fallback: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0 || dot === name.length - 1) return fallback
  return name.slice(dot + 1).toUpperCase().slice(0, 4)
}
