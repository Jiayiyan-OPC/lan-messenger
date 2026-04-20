import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Paperclip, Send, Smile } from 'lucide-react'
import { cn } from '../../lib/cn'

interface ComposerProps {
  onSend: (text: string) => void
  onAttach?: () => void
  disabled?: boolean
}

const MAX_HEIGHT = 160

/**
 * Multi-line composer with IME-safe Enter-to-send. Shift+Enter inserts newline.
 *
 * IME guard: we track `composing` via `onCompositionStart` / `onCompositionEnd`
 * AND also consult `e.nativeEvent.isComposing` — both are required because
 * some IMEs fire keydown(Enter) without a trailing compositionend, while
 * others (Safari) emit compositionend first. The `keyCode === 229` fallback
 * covers ancient Chromium / Electron corner cases.
 */
export function Composer({ onSend, onAttach, disabled }: ComposerProps) {
  const [text, setText] = useState('')
  const [composing, setComposing] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow textarea up to MAX_HEIGHT.
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(MAX_HEIGHT, ta.scrollHeight)}px`
  }, [text])

  const submit = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    // Restore focus on next tick so state update completes first.
    setTimeout(() => taRef.current?.focus(), 0)
  }, [text, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Enter') return
      // Shift+Enter → newline, let default handle it.
      if (e.shiftKey) return
      // IME guard — any of these three indicate an active composition.
      const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean; keyCode?: number }
      if (composing || native.isComposing || native.keyCode === 229) return
      e.preventDefault()
      submit()
    },
    [composing, submit],
  )

  // Autofocus on mount so users can just start typing.
  useEffect(() => {
    taRef.current?.focus()
  }, [])

  const canSend = Boolean(text.trim()) && !disabled

  return (
    <div
      className="px-5 pt-3 pb-4"
      style={{
        background: 'var(--surface-window)',
        borderTop: '1px solid var(--border-soft)',
      }}
    >
      <div
        className="flex items-end gap-2 rounded-[18px] px-3 py-2"
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid rgba(30,42,51,0.08)',
          boxShadow: '0 1px 2px rgba(30,50,70,0.04)',
        }}
      >
        <button
          type="button"
          title="附件"
          onClick={onAttach}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--text-muted)] transition-colors hover:bg-white hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          <Paperclip size={18} strokeWidth={1.8} />
        </button>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          placeholder="写点什么…  Enter 发送 · Shift+Enter 换行 · 拖拽文件即可上传"
          rows={1}
          className="flex-1 resize-none border-none bg-transparent py-[6px] text-[14px] leading-[1.45] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
          style={{ maxHeight: MAX_HEIGHT }}
        />
        <button
          type="button"
          title="表情（敬请期待）"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--text-muted)] transition-colors hover:bg-white hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          <Smile size={18} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          title="发送"
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border-0 transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
            canSend ? 'cursor-pointer text-white' : 'cursor-default text-[var(--text-hint)]',
          )}
          style={
            canSend
              ? {
                  background:
                    'linear-gradient(135deg, var(--accent-light), var(--accent))',
                  boxShadow: '0 2px 6px rgba(58,125,153,0.3)',
                }
              : { background: 'rgba(30,42,51,0.08)' }
          }
        >
          <Send size={16} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}
