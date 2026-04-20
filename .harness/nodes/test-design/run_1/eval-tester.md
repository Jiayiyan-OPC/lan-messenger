# Test Plan — run_1

## Scope

Verify the LinkLan UI port (commits `e93b592` initial + `aac6625` R1 fixes) against acceptance criteria OUT-1 through OUT-7 on branch `feat/linklan-ui-full-redesign`. Cover mechanical (lint/tsc/cargo/test), component (Vitest + jsdom), integration (mocked Tauri events), and visual (Tauri dev + `screencapture`) dimensions. **OUT-7 real-hardware E2E is explicitly DEFERRED** (no SSH to 192.168.50.48 from the test-execute environment); a simulated-peer substitute plus a runnable handoff script cover the gap.

## Pre-Run Sanity

All three "quality-gate" commands are non-negotiable; test-execute invokes them first and aborts on failure.

| TC | Type | Command (run from `/Users/yanjiayi/workspace/lan-messenger/frontend` unless noted) | Expected | Maps to |
|---|---|---|---|---|
| TC-Q.1 | mechanical | `pnpm lint` | exit 0, no TS errors | Quality Constraints · lint |
| TC-Q.2 | mechanical | `pnpm test` | `Test Files 8 passed (8) / Tests 43 passed (43)` | Quality Constraints · test |
| TC-Q.3 | mechanical | `cd ../frontend/src-tauri && cargo check` | exit 0, 0 errors (warnings OK) | Quality Constraints · Rust |

---

## Test Cases

### OUT-1 — Design tokens & global chrome

- **TC-1.1 Hex token parity (scoped diff)** — _mechanical_.
  Command:
  ```bash
  diff \
    <(grep -Eo '#[0-9A-Fa-f]{6}' /Users/yanjiayi/workspace/lan-messenger/frontend/src/index.css | sort -u) \
    <(awk '/Colors — 冷色清新调/,/头像色（peer/' /Users/yanjiayi/Downloads/design_handoff_linklan_im/README.md | grep -Eo '#[0-9A-Fa-f]{6}' | sort -u)
  ```
  Expected: empty output (zero diff). _Dry-run during plan authoring returned empty — script is validated._ (Note: the `/头像色/` anchor intentionally stops before peer-avatar palette — those hexes live in `lib/peer.ts`, not `:root`.)

- **TC-1.2 Peer avatar palette parity** — _mechanical_.
  Command:
  ```bash
  diff \
    <(grep -Eo '#[0-9A-Fa-f]{6}' /Users/yanjiayi/workspace/lan-messenger/frontend/src/lib/peer.ts | sort -u) \
    <(awk '/头像色（peer/,/```/' /Users/yanjiayi/Downloads/design_handoff_linklan_im/README.md | grep -Eo '#[0-9A-Fa-f]{6}' | sort -u)
  ```
  Expected: each of `#4E9AB8, #6FA78B, #8C8AB8, #5E7AA8, #4AA3A0, #7792A8, #5F8A9B` present on both sides (empty diff). Maps to OUT-1.

- **TC-1.3 Keyframe durations & easings** — _mechanical_.
  Command:
  ```bash
  grep -E '(ms|s)\s+(cubic-bezier|ease|linear)' /Users/yanjiayi/workspace/lan-messenger/frontend/src/index.css
  ```
  Expected lines (exact match, ±20ms tolerance per acceptance):
  - `msg-pop 260ms cubic-bezier(.2,.9,.3,1.4)`
  - `toast-in 280ms cubic-bezier(.2,.9,.3,1.2)`
  - `fade-in 200ms ease`
  - `pulse-ring 1.8s ease-out infinite`
  - `shimmer 1.4s linear infinite`
  - `spin 0.9s linear infinite`

- **TC-1.4 Window chrome constants** — _mechanical_.
  Grep `App.tsx` for the outer-card spec:
  ```bash
  grep -nE 'borderRadius: 26|padding: 24|shadow-window|height: 36' /Users/yanjiayi/workspace/lan-messenger/frontend/src/App.tsx
  ```
  Expected: `padding: 24` (outer gutter), `borderRadius: 26` (inner card), `boxShadow: 'var(--shadow-window)'`, `height: 36` (title bar). Maps to OUT-1.

- **TC-1.5 Tauri window config** — _mechanical_.
  Command:
  ```bash
  grep -nE '"width"|"height"|"minWidth"|"minHeight"|"decorations"|"dragDropEnabled"|"titleBarStyle"' /Users/yanjiayi/workspace/lan-messenger/frontend/src-tauri/tauri.conf.json
  ```
  Expected: `width:1280`, `height:800`, `minWidth:1280`, `minHeight:760`, `decorations:false`, `dragDropEnabled:true`, `titleBarStyle:"Overlay"` (or `hiddenTitle:true` on macOS). Maps to OUT-1 + build run_2 fixes.

---

### OUT-2 — Three-column layout

- **TC-2.1 Compiled-output smoke** — _mechanical_.
  ```bash
  cd /Users/yanjiayi/workspace/lan-messenger/frontend && pnpm build \
    && grep -cE '320|width:320|width: 320' dist/assets/index-*.js dist/assets/index-*.css \
    && grep -cE '26px|borderRadius:26' dist/assets/index-*.js
  ```
  Expected: `pnpm build` exits 0; both greps return ≥1 per bundle. Confirms 320-col and 26-radius survive minification. Maps to OUT-2.

- **TC-2.2 jsdom layout assertion (feasibility note)** — _component, LIMITED_.
  jsdom does **not** compute real layout (`getBoundingClientRect` returns zeros). A Vitest test asserting real pixel widths is **not viable**. Substitute: render `<Sidebar/>` and `<DetailPanel/>` and assert the inline `style` attribute carries `width: 320px` via `toHaveStyle`.
  ```tsx
  // frontend/src/components/__tests__/Layout.test.tsx (new)
  render(<Sidebar />); expect(screen.getByRole('complementary', {name: /sidebar/i})).toHaveStyle({ width: '320px' })
  ```
  Expected: both side panels declare `width: 320` inline; `ChatView` declares `flex-1`. Maps to OUT-2.

- **TC-2.3 Visual baseline @ 1280×760** — _visual_.
  Steps:
  1. `cd /Users/yanjiayi/workspace/lan-messenger/frontend && pnpm tauri dev` (background).
  2. Wait until window is up (`pgrep -f 'lan-messenger'`).
  3. Resize to 1280×760 via AppleScript:
     ```osascript
     tell application "System Events" to tell process "lan-messenger" to set size of front window to {1280, 760}
     ```
  4. Capture: `screencapture -x -l $(osascript -e 'tell app "lan-messenger" to id of window 1') /tmp/ll-1280.png`
     Or fallback rectangle: `screencapture -x -R0,0,1280,760 /tmp/ll-1280.png`.
  5. Also render the prototype at the same viewport: `open -na 'Google Chrome' --args --window-size=1280,760 file:///Users/yanjiayi/Downloads/design_handoff_linklan_im/LinkLan.html` and `screencapture -x -R0,0,1280,760 /tmp/ll-proto-1280.png`.
  Expected evidence: two PNGs saved; visual inspection (or `compare` from ImageMagick if installed) shows ≤2px divergence on panel boundaries (320 / flex / 320). Maps to OUT-2.

- **TC-2.4 Visual baseline @ 1440×900** — _visual_. Repeat TC-2.3 at `1440×900`. Files: `/tmp/ll-1440.png`, `/tmp/ll-proto-1440.png`. Maps to OUT-2.

---

### OUT-3 — Sidebar & discovery

- **TC-3.1 Seeded sidebar screenshot (empty state)** — _visual + integration_.
  With Tauri dev running and **no peers discovered**, open devtools and run:
  ```js
  window.__ll_devhook?.resetContacts?.() /* if exposed, else reload */
  ```
  Screenshot the 设备 tab. Expected: copy reads `扫描中 · 发现 0 台` and empty-state text `等待局域网内设备…` renders (verified in `DeviceList.tsx:66`). Maps to OUT-3, Quality Baseline · empty state.

- **TC-3.2 Seeded sidebar screenshot (one peer)** — _visual + integration_.
  Run in devtools console:
  ```js
  const s = window.__zustand_contacts || useContactsStore; // exposed via debug shim or imported
  useContactsStore.setState({ contacts: [{ id: 'linux-01', name: 'Linux-Lab', ip_address: '192.168.50.48', port: 9876, online: true, last_seen: Date.now(), created_at: Date.now(), hostname: 'linux-lab', os: 'Linux' }] });
  ```
  Expected: DeviceRow renders with 38px avatar, "Linux-Lab" name, Linux OS badge, `linux-lab · 192.168.50.48` in mono font, pulse-ring animates on the "发现 1 台" dot. Screenshot to `/tmp/ll-sidebar-peer.png`. Maps to OUT-3.

- **TC-3.3 DeviceRow click → DM open** — _component_.
  Add a Vitest test:
  ```tsx
  // frontend/src/components/__tests__/DeviceRow.test.tsx (new)
  import { render, fireEvent } from '@testing-library/react'
  import { DeviceList } from '../Sidebar/DeviceList'
  import { useContactsStore } from '../../stores/contacts'
  import { useUiStore } from '../../stores/ui'
  useContactsStore.setState({ contacts: [peer] })
  const { getByText } = render(<DeviceList searchQuery="" />)
  fireEvent.click(getByText('Linux-Lab'))
  expect(useUiStore.getState().activeConvoId).toBe('linux-01')
  expect(useUiStore.getState().sidebarTab).toBe('chats')
  ```
  Expected: pass. Maps to OUT-3 click flow.

- **TC-3.4 Self row renders live device info** — _integration_.
  With Tauri dev running, assert via devtools:
  ```js
  document.querySelector('[data-ll=self-row]').innerText.includes('192.168.')
  ```
  (If no `data-ll` attribute exists, scope by the bottom-left sidebar region.) Expected: shows real hostname + IPv4 from `get_device_info`, not a placeholder. Maps to OUT-3 Self row.

---

### OUT-4 — Chat area

- **TC-4.1 TextBubble tail radii (existing)** — _component_. Already in `Composer.test.tsx` / `TextBubble.test.tsx`. Flag as DONE — re-asserted by TC-Q.2.

- **TC-4.2 Composer IME & Shift+Enter (existing)** — _component_. Already covered by four assertions in `Composer.test.tsx` (Enter, Shift+Enter, `compositionStart`, `keyCode 229`). Flag as DONE.

- **TC-4.3 DayDivider inserts on date boundary** — _component, NEW_.
  ```tsx
  // frontend/src/components/__tests__/MessageList.test.tsx (new)
  const t0 = new Date('2026-04-19T12:00:00Z').getTime()
  const t1 = new Date('2026-04-20T08:30:00Z').getTime() // next day
  const msgs = [mkMsg('m1', t0), mkMsg('m2', t1)]
  const { container } = render(<MessageList messages={msgs} deviceId="me" peer={peer} />)
  // Expect 2 dividers (one above m1, one between m1 and m2)
  expect(container.querySelectorAll('[class*="h-px flex-1"]').length).toBeGreaterThanOrEqual(4) // 2 dividers × 2 hairlines each
  ```
  Expected: pass. Maps to OUT-4 DayDivider.

- **TC-4.4 Status icon transitions sending → delivered** — _component, NEW_.
  ```tsx
  const { rerender, container } = render(<TextBubble msg={{...base, status: 'sending'}} mine showAvatar fresh={false} />)
  expect(container.querySelector('.animate-spin-slow')).not.toBeNull()
  rerender(<TextBubble msg={{...base, status: 'delivered'}} mine showAvatar fresh={false} />)
  expect(container.querySelector('.animate-spin-slow')).toBeNull()
  ```
  Expected: pass. Maps to OUT-4 status transitions.

- **TC-4.5 Integration — `message-received` dispatch renders bubble** — _integration, NEW_.
  ```tsx
  // frontend/src/components/__tests__/ChatFlow.test.tsx (new)
  import { useMessagesStore } from '../../stores/messages'
  // Seed peer + active convo
  useUiStore.setState({ activeConvoId: 'peer-1' })
  useContactsStore.setState({ contacts: [peer] })
  const { findByText, container } = render(<ChatView />)
  useMessagesStore.setState({ messagesByContact: { 'peer-1': [mkIncoming('hi there')] } })
  expect(await findByText('hi there')).toBeInTheDocument()
  expect(container.querySelector('.animate-msg-pop')).not.toBeNull()
  ```
  Expected: pass. Maps to OUT-4 incoming flow.

- **TC-4.6 100-message scroll performance (scripted synthetic)** — _integration, NEW_.
  Load 100 synthetic messages and snapshot render time:
  ```tsx
  const msgs = Array.from({length: 100}, (_, i) => mkMsg(`m${i}`, Date.now() - i * 60_000))
  const t0 = performance.now()
  render(<MessageList messages={msgs} deviceId="me" peer={peer} />)
  const dt = performance.now() - t0
  expect(dt).toBeLessThan(200) // jsdom budget — tight on CI
  ```
  Expected: initial render < 200ms in jsdom (budget is generous to avoid flakes). Note: jsdom is NOT a perf oracle — if we want real perf verification, recommend a manual Chrome Performance recording in Tauri dev with >50ms long-task threshold (document, don't gate). Maps to Quality Constraints · 100-msg perf.

---

### OUT-5 — File transfer

- **TC-5.1 Simulated transfer lifecycle** — _integration, NEW_.
  Drive the store directly; FileBubble subscribes to it.
  ```tsx
  // frontend/src/components/__tests__/FileBubble.test.tsx (new)
  const transferId = 'xfer-1'
  useTransfersStore.setState({ transfers: [{ id: transferId, message_id: 'mid', file_name: 'photo.png', file_size: 1_048_576, checksum: '', status: 'in_progress', bytes_transferred: 0, created_at: Date.now(), updated_at: Date.now() }] })
  const msg = { id: 'mid', kind: 'file', from: 'peer-1', text: 'photo.png', t: '10:00', ts: Date.now(), fileTransferId: transferId }
  const { rerender, getByText, container } = render(<FileBubble msg={msg} mine={false} showAvatar fresh={false} peerName="Mia" />)
  expect(container.querySelector('.animate-shimmer')).not.toBeNull() // in-progress shimmer
  useTransfersStore.setState((s) => ({ transfers: s.transfers.map(t => ({ ...t, bytes_transferred: 471_859 })) })) // ~45%
  // Assert the progress bar width style updates accordingly
  expect(container.querySelector('[style*="width: 45%"]')).not.toBeNull()
  useTransfersStore.setState((s) => ({ transfers: s.transfers.map(t => ({ ...t, status: 'completed', bytes_transferred: 1_048_576 })) }))
  // Download button appears only when done
  expect(container.querySelector('[title="下载"]')).not.toBeNull()
  ```
  Expected: pass. Maps to OUT-5 progress + completion.

- **TC-5.2 Cancel removes transfer from store** — _integration, NEW_.
  Extend TC-5.1:
  ```tsx
  fireEvent.click(getByText('取消'))
  expect(useTransfersStore.getState().transfers.find(t => t.id === transferId)).toBeUndefined()
  ```
  Expected: pass. Maps to OUT-5 cancel button.

- **TC-5.3 Completed download surfaces local_path via toast** — _integration, NEW_.
  ```tsx
  useTransfersStore.setState({ transfers: [{ ...base, status: 'completed', local_path: '/Users/me/Downloads/photo.png' }] })
  fireEvent.click(getByTitle('下载'))
  expect(useUiStore.getState().toasts.some(t => t.body?.includes('/Users/me/Downloads/photo.png'))).toBe(true)
  ```
  Expected: pass. Maps to OUT-5 completion handling.

- **TC-5.4 Visual progress snapshots** — _visual_.
  With Tauri dev, use devtools to seed three transfer states (pending/45%/completed). Screenshot each:
  - `/tmp/ll-file-0.png` (pending, shimmer)
  - `/tmp/ll-file-45.png` (mid-progress, bar half-filled)
  - `/tmp/ll-file-100.png` (done, download button visible)
  Expected: bubble width 320px, 44×52 folded-corner tint block, 6px rounded progress bar, `↑ 上传中 · LAN 直连` / `↓ 接收中 · LAN 直连` label. Maps to OUT-5.

- **TC-5.5 DropOverlay appearance** — _visual, manual_.
  Drag a file from Finder over the chat area; expect overlay with 3px dashed accent border + upload icon + "松开以发送" appears, and disappears on drag-leave / Escape (App.tsx:18 handles Escape). Capture short screen recording. Maps to OUT-5 DropOverlay.

---

### OUT-6 — Detail panel

- **TC-6.1 toggleDetail persists to localStorage** — _integration, NEW_.
  ```tsx
  // Extend existing ui.test.ts
  localStorage.clear()
  useUiStore.getState().toggleDetail() // true → false
  expect(localStorage.getItem('ll-detail-open')).toBe('0')
  useUiStore.getState().toggleDetail() // back to true
  expect(localStorage.getItem('ll-detail-open')).toBe('1')
  ```
  Expected: pass. Maps to OUT-6 persistence.

- **TC-6.2 State restores on reload** — _integration, NEW_.
  ```tsx
  localStorage.setItem('ll-detail-open', '0')
  // Re-import the module so top-level `loadDetailOpen()` re-runs
  vi.resetModules()
  const { useUiStore: fresh } = await import('../../stores/ui')
  expect(fresh.getState().detailOpen).toBe(false)
  ```
  Expected: pass. Maps to OUT-6 restore.

- **TC-6.3 PeerHero + FileList + InfoList screenshots** — _visual_.
  With Tauri dev + seeded peer (from TC-3.2), click a DeviceRow to open the DM, then:
  - Screenshot Detail panel default (Files tab): `/tmp/ll-detail-files.png`
  - Click 详情 tab, screenshot: `/tmp/ll-detail-info.png`
  - Click chat-header Info button, screenshot collapsed: `/tmp/ll-detail-collapsed.png` (right column absent).
  Expected: Peer Hero shows 72px avatar + online dot + `host+IP` pill with Wifi icon; FileList shows 38×44 ext tiles; InfoList shows 6 key-value rows (host/IP/OS/latency/encryption/first-seen). Maps to OUT-6.

---

### OUT-7 — E2E (DEFERRED)

- **TC-7.sim Simulated bidirectional flow via mocked Tauri events** — _integration, NEW_.
  Stand-in for real hardware. Drives both halves of a conversation through the React boundary.
  ```tsx
  // frontend/src/components/__tests__/E2ESim.test.tsx (new)
  vi.mock('@tauri-apps/api/event', () => {
    const handlers = new Map<string, Function>()
    return {
      listen: vi.fn(async (name: string, cb: Function) => { handlers.set(name, cb); return () => handlers.delete(name) }),
      __emit: (name: string, payload: unknown) => handlers.get(name)?.({ payload }),
    }
  })
  // Setup peer + init stores
  useContactsStore.setState({ contacts: [linuxPeer] })
  useUiStore.setState({ activeConvoId: 'linux-01' })
  await useMessagesStore.getState().init()
  // Simulate Linux → Mac text arriving after 500ms
  setTimeout(() => (require('@tauri-apps/api/event') as any).__emit('message-received', {
    id: 'srv-1', sender_id: 'linux-01', recipient_id: 'me', content: '你好 from Linux', timestamp: Date.now(), status: 'received'
  }), 500)
  await waitFor(() => expect(screen.getByText('你好 from Linux')).toBeInTheDocument(), { timeout: 3000 })
  // Simulate optimistic send status promotion sending → delivered within 3s
  const api = await import('../../api/messages')
  vi.spyOn(api.messages, 'send').mockResolvedValue({ id: 'local-1', sender_id: 'me', recipient_id: 'linux-01', content: 'hi back', timestamp: Date.now(), status: 'delivered' })
  await useMessagesStore.getState().sendMessage('linux-01', 'hi back')
  await waitFor(() => {
    const m = useMessagesStore.getState().messagesByContact['linux-01']?.find(x => x.content === 'hi back')
    expect(m?.status).toBe('delivered')
  }, { timeout: 3000 })
  ```
  Expected: pass within 3s. Documents the real-hardware contract we can't execute this run.

- **TC-7.handoff Runnable E2E script for post-merge human** — _artifact, NEW_.
  Create `/Users/yanjiayi/workspace/lan-messenger/scripts/e2e-peer-check.sh` with the following (a human with SSH credentials runs it once they exist):
  ```bash
  #!/usr/bin/env bash
  # Run from host Mac with the app running locally AND Linux peer at 192.168.50.48 reachable.
  # Requires: /tmp/sshrun.exp (expect wrapper w/ credentials) or ~/.ssh/id_ed25519 configured.
  set -euo pipefail
  PEER_IP="${PEER_IP:-192.168.50.48}"
  SSH="${SSHRUN:-bash /tmp/sshrun.exp}"
  echo "[1/4] Checking peer process..."
  $SSH "pgrep -a lan-messenger" || { echo "lan-messenger not running on $PEER_IP"; exit 2; }
  echo "[2/4] Mac→Linux text: type a test line in the running Mac app within 10s."
  sleep 10
  $SSH "tail -n 5 ~/Library/Application\\ Support/lan-messenger/logs/*.log 2>/dev/null || tail -n 5 ~/.local/share/lan-messenger/logs/*.log" \
    | grep -q 'message-received' || { echo "no message-received in peer log"; exit 3; }
  echo "[3/4] Linux→Mac text: triggering a synthetic peer send."
  $SSH "echo 'ack from linux' | /usr/bin/lan-messenger-cli send --to $(hostname -s)"   # or equivalent backend CLI
  echo "[4/4] File transfer: drop a ≥1MB file onto Mac chat; verify completion appears on peer..."
  $SSH "ls -la ~/Downloads | head -5"
  echo "E2E peer check: PASS (human must verify timing ≤3s & file hash)."
  ```
  Expected: script is executable (`chmod +x`), non-zero exits on first failed step, and serves as the handoff deliverable when SSH becomes available.

- **TC-7.doc DEFERRED annotation** — _documentation_. Add a note to the aggregator handshake that real-hardware verification (≤3s text, ≥1MB file each direction with hash match) is blocked on credentials. This TC requires no execution — it is a flagging action for the gate aggregator.

---

### Quality Constraints — cross-cutting

- **TC-QC.1 No console errors during dev session** — _manual_.
  Spawn `pnpm tauri dev` via test-execute, pipe stderr. After 30s of idle + one DeviceRow click + one dummy send, assert no `[ERROR]` or `Uncaught` lines in stderr. Maps to Quality Constraints · no console errors.

- **TC-QC.2 Focus ring visibility** — _manual_. Tab through sidebar → chat input → composer send → detail-toggle. Each element must show a visible `outline: 2px var(--accent)` focus ring. Screenshot focus states. Maps to Quality Baseline · focus styles.

- **TC-QC.3 Keyboard order** — _manual_. Press `Tab` repeatedly from fresh state; expected order: SearchBar → Tab 会话 → first ConvoRow → ChatHeader buttons → Composer textarea → Send button → Detail Info toggle. `Escape` clears drop overlay (covered by `App.tsx:18`).

- **TC-QC.4 Failure-state rendering** — _integration, NEW_.
  ```tsx
  useTransfersStore.setState({ transfers: [{ ...base, status: 'failed' }] })
  render(<FileBubble ... />)
  expect(screen.getByText(/传输失败/)).toBeInTheDocument()
  ```
  Also: mutate a `StoredMessage` to `status: 'failed'` and assert the red `!` + 重试 renders in `TextBubble`. Maps to Quality Baseline · error states.

---

## Out-of-Scope / Deferred

- **TC-7.real** (real-hardware Mac↔Linux bidirectional on 192.168.50.138 ↔ 192.168.50.48) — **DEFERRED**: the test-execute orchestrator has no SSH credentials for `192.168.50.48` (no password, no key). **Substitute executed this run:** TC-7.sim (mocked `listen('message-received', …)` with 500ms delay + status-promotion assertion within 3s). **Human action item post-merge:** run `scripts/e2e-peer-check.sh` against the Linux peer to close the loop; attach its output under `.harness/nodes/test-execute/run_X/artifacts/`.
- **Real-layout pixel-width assertions in Vitest** (`getBoundingClientRect` in jsdom) — **not viable**; substituted with inline-style assertions in TC-2.2 and visual screenshots in TC-2.3/2.4.
- **True Chrome Performance recording for 100-message scroll** — NOT gated; recommended manual run. TC-4.6 provides a coarse jsdom render-time sanity check only.
- **Windows native title-bar styling, group chat, dark theme, read receipts, voice call** — explicitly out of scope per acceptance-criteria.md "Out of Scope".

---

## Tooling & Pre-reqs

- Node 18+, `pnpm` (workspace root)
- Rust toolchain + `cargo check` working in `frontend/src-tauri`
- `pnpm tauri dev` launches the app for visual tests (macOS)
- `screencapture` (macOS built-in at `/usr/sbin/screencapture`) for PNG artifacts; prefer `screencapture -x -R<x>,<y>,<w>,<h>` (no shutter sound, fixed rect)
- `osascript` to resize the window to exact viewports (1280×760 / 1440×900)
- Chromium/Chrome to render `/Users/yanjiayi/Downloads/design_handoff_linklan_im/LinkLan.html` at the matching viewport for side-by-side diffing
- _Future:_ ImageMagick `compare -metric AE` for automated pixel-diff when an expected-baseline image set exists
- _Future:_ SSH key / `/tmp/sshrun.exp` credentials for 192.168.50.48 — required to run TC-7.real

---

## Execution Order for test-execute

1. **Gate commands** (abort on fail): TC-Q.1 `pnpm lint` → TC-Q.2 `pnpm test` → TC-Q.3 `cargo check`.
2. **Token sweep** (mechanical, fast): TC-1.1, TC-1.2, TC-1.3, TC-1.4, TC-1.5.
3. **Build smoke**: TC-2.1 `pnpm build` + post-build greps.
4. **New component + integration tests** (one Vitest run covers TC-2.2, TC-3.3, TC-4.3, TC-4.4, TC-4.5, TC-4.6, TC-5.1, TC-5.2, TC-5.3, TC-6.1, TC-6.2, TC-7.sim, TC-QC.4). Expected post-authoring: test count rises from 43 → ~55.
5. **Write & chmod handoff script**: TC-7.handoff.
6. **Start Tauri dev** (background); capture visual baselines: TC-2.3, TC-2.4, TC-3.1, TC-3.2, TC-5.4, TC-6.3.
7. **Manual visual checks**: TC-5.5 (DropOverlay), TC-QC.1 (no console errors), TC-QC.2/QC.3 (focus + keyboard).
8. **Aggregate evidence**: collect PNGs under `.harness/nodes/test-execute/run_1/artifacts/`, annotate TC-7.doc DEFERRED flag in handshake.

Stop conditions: any of {TC-Q.1, TC-Q.2, TC-Q.3} fail → hand back to implementer. TC-1.x hex/keyframe diff fails → likewise. All other failures degrade to findings.

## Verdict: LGTM
