import { describe, it, expect, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

import { render, screen } from '@testing-library/react'
import { TextBubble } from '../Chat/TextBubble'
import type { DisplayMessage } from '../../lib/displayMessage'

const base: DisplayMessage = {
  id: 'm1',
  kind: 'text',
  from: 'me',
  text: 'hi',
  t: '10:00',
  ts: Date.now(),
  status: 'delivered',
}

describe('TextBubble', () => {
  it('applies self tail radii on mine=true (18 18 6 18)', () => {
    render(<TextBubble msg={base} mine showAvatar fresh={false} />)
    const bubble = screen.getByText('hi')
    expect(bubble).toHaveStyle({ borderRadius: '18px 18px 6px 18px' })
  })

  it('applies other tail radii on mine=false (18 18 18 6)', () => {
    const other = { ...base, from: 'peer-1' }
    render(<TextBubble msg={other} mine={false} showAvatar peerName="Alice" fresh={false} />)
    const bubble = screen.getByText('hi')
    expect(bubble).toHaveStyle({ borderRadius: '18px 18px 18px 6px' })
  })

  it('renders timestamp and adds pop animation when fresh', () => {
    const { container } = render(<TextBubble msg={base} mine showAvatar fresh />)
    expect(screen.getByText('10:00')).toBeInTheDocument()
    // The outermost flex wrapper carries the animate-msg-pop class when fresh.
    expect(container.querySelector('.animate-msg-pop')).not.toBeNull()
  })
})
