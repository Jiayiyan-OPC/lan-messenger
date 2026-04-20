import { describe, it, expect, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

import { render, screen, fireEvent } from '@testing-library/react'
import { Composer } from '../Chat/Composer'

describe('Composer', () => {
  it('Enter sends the trimmed text and clears the input', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} />)
    const ta = screen.getByPlaceholderText(/写点什么/) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: '  hello  ' } })
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('hello')
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('Shift+Enter inserts a newline (does NOT send)', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} />)
    const ta = screen.getByPlaceholderText(/写点什么/) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'line 1' } })
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does NOT send while IME composition is active (onCompositionStart + isComposing)', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} />)
    const ta = screen.getByPlaceholderText(/写点什么/) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'ni' } })
    fireEvent.compositionStart(ta)
    // isComposing flag — simulate the native event attribute used by Chinese IMEs.
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.compositionEnd(ta)
    // After composition ends, a subsequent Enter *does* send.
    fireEvent.change(ta, { target: { value: '你好' } })
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('你好')
  })

  it('keyCode 229 fallback guards against IME mid-composition on some browsers', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} />)
    const ta = screen.getByPlaceholderText(/写点什么/) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'x' } })
    fireEvent.keyDown(ta, { key: 'Enter', keyCode: 229 })
    expect(onSend).not.toHaveBeenCalled()
  })
})
