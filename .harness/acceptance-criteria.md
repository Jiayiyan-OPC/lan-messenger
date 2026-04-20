# Acceptance Criteria — LinkLan UI Full Redesign

## Task
Port the LinkLan design handoff (`/Users/yanjiayi/Downloads/design_handoff_linklan_im`) into the Tauri + React app on branch `feat/linklan-ui-full-redesign`. Replace the current React scaffold UI with a pixel-faithful implementation wired to the existing Rust backend (LAN UDP discovery, TCP messaging, file transfer). Self-iterate via code-review + test gates until UI fidelity ≥90% and the macOS↔Linux end-to-end flow works.

## Tier
polished

## Outcomes

- OUT-1: Design tokens & global chrome match handoff. `:root` CSS variables in `frontend/src/index.css` equal the values listed in `design_handoff_linklan_im/README.md` ("Colors", "Spacing", "Radii", "Animations") within 0 tolerance on hex and ±20ms on animation durations. Window: outer bg `#E6EDF2`, inner-card radius `26px`, shadow `0 18px 48px rgba(30,50,70,0.15)`, 36px macOS title bar with red/yellow/green lights + centered "LinkLan".

- OUT-2: Three-column layout renders at 1280×760. Sidebar 320px, Chat flex-1, Detail 320px (collapsible). At `1280×760` the three panels are visible; collapsing the detail panel via the header Info button hides only the right column. Screenshot at 1280×760 and 1440×900 compared side-by-side against the handoff prototype shows layout divergence ≤2px on every panel boundary.

- OUT-3: Sidebar components (Brand, Search, Tabs, ConvoRow, DeviceRow, Self) render from live stores. 会话 tab pulls from the messaging store and shows `ConvoRow` (42px avatar, online dot, time, preview, unread badge). 设备 tab shows `扫描中 · 发现 N 台` with a pulse-ring, and renders `DeviceRow` (38px avatar, name, OS badge, `hostname+IP`) from the existing `peer-found`/`peer-lost`/`peer-updated` events. Clicking a `DeviceRow` opens the DM. Self row at the bottom shows real device name + IP sourced from a backend command (add `get_device_info` in Rust if missing).

- OUT-4: Chat area (Header, MessageList, Composer) supports the full real-message flow. Real messages dispatched via `sendMessage` appear as `TextBubble` (others left tail `18 18 18 6`, self accent-gradient right tail `18 18 6 18`); incoming `message-received` events append in place; `DayDivider` inserts on date change; status transitions sending→delivered; `msg-pop` entrance animation plays (260ms). Composer: `#F4F7FA` pill at radius 18, auto-grow textarea (max-h 160px), send on Enter, newline on Shift+Enter, send button 36×36 gradient; Chinese IME composition (`nativeEvent.isComposing`) does NOT trigger send.

- OUT-5: File transfer renders FileBubble + DropOverlay with live backend events. Dragging a file over the chat area shows `DropOverlay` (3px dashed accent border, translucent fill, upload icon) and drop triggers Tauri v2 `onDragDropEvent` → `initiate_file_transfer` for the active peer. `FileBubble` 320px wide renders a 44×52 folded-corner color block keyed to MIME (IMG/JSON/ZIP/PDF/APP/FILE), filename, size/progress, 6px progress bar with shimmer, `↑/↓ LAN direct` label, cancel button. Progress updates from the existing `file-transfer-progress` event; on completion the download button opens the finished file.

- OUT-6: Detail panel (Peer Hero, quick-action tiles, Files/Info tabs) works and is togglable. 72px avatar with online dot, `host+IP` pill with Wifi icon, three tiles (通话/文件/置顶), tabs (文件/详情) — `文件` lists past transfers with 38×44 ext color block + download button; `详情` shows key/value rows (host, IP, OS, latency, encryption, first-seen). Collapse state persists through `localStorage('ll-detail-open')` and restores on reload; `localStorage('ll-active')` restores the selected conversation.

- OUT-7: End-to-end bidirectional flow verified on real hardware. Sending text from Mac (192.168.50.138) to Linux (192.168.50.48) and back via the existing expect wrapper at `/tmp/sshrun.exp` shows the message in both clients within 3 seconds, with status reaching `delivered`; sending a ≥1MB file in either direction completes with `FileBubble` progress animating and landing in the download dir.

## Verification

| Outcome | How |
|---|---|
| OUT-1 | `grep -E '^\s*--[a-z]' frontend/src/index.css` diffed against `design_handoff_linklan_im/README.md` tokens; assert every token present and matching |
| OUT-2 | `pnpm run tauri dev` → screenshot at 1280×760 and 1440×900, side-by-side pixel diff vs `LinkLan.html` rendered in Chromium at the same viewport |
| OUT-3 | Start mac client with Linux peer reachable via `bash /tmp/sshrun.exp`; screenshot sidebar, assert `扫描中 · 发现 1 台` appears, DeviceRow shows Linux hostname + `192.168.50.48`; click → chat opens |
| OUT-4 | Automated: Vitest component tests for `TextBubble` tail radii, composer IME guard, Enter/Shift+Enter behavior. Manual: send text Mac→Linux and back, screenshot both |
| OUT-5 | Drop a file onto the chat area; capture screen recording showing DropOverlay, FileBubble progress shimmer, completion; verify received file hash equals source hash |
| OUT-6 | Click header Info toggle twice, assert `localStorage.getItem('ll-detail-open')` flips and persists across reload; screenshot both states |
| OUT-7 | `bash /tmp/sshrun.exp "pgrep -a lan-messenger"` to confirm peer running; run a 2-way text + file transfer script; capture both screenshots; `pnpm lint && pnpm test` clean |

## Quality Constraints

- Visual fidelity ≥ 90%: layout widths, paddings, radii, shadows, animation timings within ±1px / ±20ms of handoff spec
- `pnpm lint` (tsc --noEmit) exits 0
- `pnpm test` — existing 23 store unit tests still pass; new component tests added
- No console errors on normal usage (capture devtools)
- Focus rings visible on all interactive elements; keyboard: Tab cycles sidebar→chat→detail, Enter sends, Escape closes overlays
- Message list renders 100 synthetic messages with no dropped frames in DevTools performance recording (0 long tasks >50ms)
- No regressions on the existing `peer-found`/`peer-lost`/`peer-updated`/`message-received`/`file-transfer-*` event pipeline
- IME safety: Chinese IME composition DOES NOT trigger accidental send (composition events guarded)
- Failure modes: failed message → red `!` + 重试; failed file transfer → red FileBubble state; offline peer → greyed row; empty peer list → `等待局域网内设备…`; empty convo → friendly hint

## Quality Baseline (polished)

- [ ] Dark/light: handoff is light-only — explicitly light-theme-only acceptable
- [ ] Responsive: desktop-only ≥1280×760 per handoff; no mobile
- [ ] Loading state: sidebar `扫描中…` while 设备 tab initializes; chat spinner on first fetch
- [ ] Error state: failed message red `!` + 重试; failed file bubble red
- [ ] Empty state: no peers → `等待局域网内设备…`; no messages → friendly hint
- [ ] Favicon / app icon: existing Tauri icons
- [ ] Focus styles visible on buttons, inputs, list rows (accent outline)
- [ ] Keyboard: Tab cycles sidebar→chat→detail; Enter sends; Escape closes modals/overlays
- [ ] No console errors during normal usage

## Out of Scope

- Group chat creation — backend has no multi-peer group support; sidebar `+` shows a `coming soon` toast (tracked in OUT-3 stub)
- Tweaks panel (handoff: "生产代码中可省略")
- Voice/phone-call button — static icon only
- Windows native title bar styling (Tauri default OK)
- Dark theme (handoff is light-only)
- Read receipts (backend doesn't emit)
