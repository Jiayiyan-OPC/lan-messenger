# Visual Fidelity Test Plan — run_1

Target commit: `aac6625` on `feat/linklan-ui-full-redesign`.
Reference prototype: `/Users/yanjiayi/Downloads/design_handoff_linklan_im/LinkLan.html`.
Reference tokens / measurements: `design_handoff_linklan_im/README.md` + inline styles in `src/app.jsx`, `src/sidebar.jsx`, `src/chat.jsx`, `src/detail.jsx`, `src/overlays.jsx` (these are the authoritative source for pixel values).

## Scope
Pixel-faithful comparison: screenshots of the running Tauri app vs the `LinkLan.html` prototype, at matching viewports, for every zone on the acceptance-criteria visual checklist. Quality bar: ≥90% fidelity; no panel-boundary drift >2px; exact hex / radius / shadow matches on tokens.

Out of scope for this run (explicitly deferred below): animation-timing measurement that requires video capture, real cross-host file transfer flow, and interactive modal coverage beyond static snapshot.

## Viewport Matrix
- **1280×760** — the minimum supported size from the handoff README; tightest layout check.
- **1440×900** — common MacBook default; gives extra room on chat column and detail panel.

Both must render without horizontal scroll; the inner card keeps its 24px inset and 26px radius at both sizes.

## Reference Preparation (test-execute does this once)
```bash
# 1. Launch our app (assumes tauri builds cleanly from repo root)
cd /Users/yanjiayi/workspace/lan-messenger/frontend
pnpm install --frozen-lockfile  # if not already
pnpm tauri dev &   # wait ~20s for the window
OURS_PID=$!

# 2. Launch the reference prototype in Chrome with identical viewport.
#    Must use Chrome (the prototype relies on babel-standalone + React 18 UMD).
open -na 'Google Chrome' --args \
  --app=file:///Users/yanjiayi/Downloads/design_handoff_linklan_im/LinkLan.html \
  --window-size=1280,760 \
  --user-data-dir=/tmp/ll-ref-profile
# For the 1440x900 pass, repeat with --window-size=1440,900
```

For each viewport, resize the Tauri window using AppleScript:
```bash
osascript -e 'tell application "System Events" to tell (first process whose frontmost is true) to set size of window 1 to {1280, 760}'
# then swap in 1440,900 for the second pass
```

Screenshots go to `.harness/nodes/test-execute/run_1/` with names:
- `ours-1280.png`, `ref-1280.png`, `ours-1440.png`, `ref-1440.png` (full-window baseline)
- Per-zone crops: `ours-1280-<vc-id>.png`, `ref-1280-<vc-id>.png` (see each VC for `-R x,y,w,h`)

`screencapture -x -R x,y,w,h /tmp/path.png` is used throughout — `-x` silences the shutter sound; `-R` crops.

---

## Test Cases

### VC-1 — Window chrome + 3-column layout baseline
- **Why it matters:** OUT-1 / OUT-2. Everything else sits inside this chrome.
- **Steps for test-execute:**
  1. Launch both apps at 1280×760 per the Reference Preparation.
  2. Position both windows at screen origin (0,0).
  3. `screencapture -x -R 0,0,1280,780 /tmp/ours-1280.png` then move to `.harness/nodes/test-execute/run_1/ours-1280.png`.
  4. Bring Chrome reference to front; repeat capture → `ref-1280.png`.
  5. Repeat at 1440×900.
- **Assertions (measure in Preview / ruler):**
  - Outer workspace background hex `#E6EDF2` (sample a few pixels outside the card with the digital color meter).
  - Inner card radius **26px** on all four corners (tweaks roundness default 22 → `calc(18+8)=26` in prototype, but our app should match the README token of 18+8). Accept 22-28px for this run if tweaks default differs.
  - Inner card shadow visible on all sides; matches `0 18px 48px rgba(30,50,70,0.15)` by eye.
  - Inner card inset from the viewport edge: **24px** on all sides.
  - Titlebar height **36px** exactly (measure with pixel ruler).
  - Three dots in top-left, order red-yellow-green, 12×12, 7px gap; colors `#FF6A5A / #FFBD3E / #4CD263`.
  - Centered title text "LinkLan", 12px, semi-bold, color `#7A8892`.
  - Below titlebar, three columns visible: sidebar 320, chat fluid, detail 320. Measure each boundary with a ruler overlay.
  - No OS-native chrome (no title bar above our custom bar; no window controls outside traffic lights). Verify `tauri.conf.json` has `"decorations": false` by reading the config (see Appendix).
- **Pass criteria:** panel-boundary drift ≤2px vs reference at both viewports; titlebar pixel-identical; colors match the specified hex (±1 on each channel due to JPEG-vs-PNG tolerance).
- **Flag RED if:** sidebar width not 320, detail width not 320, card inset not 24, or native title bar showing.

### VC-2 — Sidebar brand row
- **Steps:** crop from `ours-1280.png` and `ref-1280.png`: `screencapture -x -R 24,60,320,56 /tmp/ours-1280-vc2.png` (adjust y if title bar differs). Save both crops.
- **Assertions:**
  - Logo tile **30×30**, radius **9**, linear gradient **135deg, #4E9AB8 → #3A7D99**, centered white uppercase "L" at 14px 800-weight.
  - Shadow on logo: `0 2px 6px rgba(58,125,153,0.35)` (sample pixel below tile — should show faint blue cast).
  - Title "LinkLan" 15px 800-weight, color `#1E2A33`, letter-spacing -0.2.
  - Subtitle "connected · 192.168.1.0/24" in **JetBrains Mono** 10.5px, color `#7A8892`. (We should substitute the real host CIDR; font must still be JetBrains Mono.)
  - "+" button on the right, 30×30, radius 9, `#F4F7FA` background, 1px border `rgba(30,42,51,0.08)`.
  - Row padding: `18px 18px 8px`.
- **Pass criteria:** font family verified as JetBrains Mono (inspect via DevTools in the running app using `document.fonts`; or visually compare letterforms against the reference). Logo square hex match ±1.
- **RED if:** subtitle is UI-font not mono; logo is flat color rather than gradient.

### VC-3 — Search box
- **Steps:** crop `R 24,116,320,44` (adjust based on actual y).
- **Assertions:**
  - Rounded container background `#F4F7FA`, **radius 12**, border `rgba(30,42,51,0.06)`.
  - Container padding `8px 12px`, gap 8 between icon and input.
  - Magnifying-glass icon on left (15px, stroke 1.8, color `#7A8892`).
  - Placeholder text exactly `搜索联系人、设备、消息…` (note fullwidth comma and ellipsis).
  - Placeholder color `#7A8892`, text color on input `#1E2A33`, font-size 13.
  - When the user types (test-execute, type `test` into the input), clear × appears on the right.
- **RED if:** placeholder text differs (English, half-width ellipsis, missing terms), or radius ≠ 12.

### VC-4 — Tabs pill (会话 | 设备)
- **Steps:** crop the tabs strip (two buttons side-by-side with count badges).
- **Assertions:**
  - Two equal-flex buttons, padding `7px 0`, gap 4 between them, horizontal padding `0 14px` on container.
  - **Active button**: background `#F4F7FA`, color `#1E2A33`, font-weight 700, font-size 12.5, radius 10, shadow `0 1px 3px rgba(30,50,70,0.06), 0 0 0 1px rgba(30,42,51,0.05)`.
  - **Inactive button**: background transparent, color `#7A8892`, font-weight 500.
  - Count badge on each tab: min-width 17, height 16, radius 999. Active badge: bg `#4E9AB8`, white text. Inactive badge: bg `rgba(30,42,51,0.08)`, text `#7A8892`.
  - Tab count reflects real data: "会话" = total unread count across convos; "设备" = number of discovered peers (filtering out self).
- **RED if:** active-state indicator absent, or both tabs styled identically.

### VC-5 — ConvoRow at the default density
- **Precondition:** 会话 tab selected, at least one pinned and one non-pinned conversation in the list. If the app ships with seed data, screenshot first visible row; otherwise trigger `handleStartWithPeer` by clicking the Linux peer and return to 会话.
- **Steps:** crop a single active row (sidebar y-span one row wide) at both viewports.
- **Assertions:**
  - Row padding `10px 12px`, radius 14, gap 12.
  - Active-row background `rgba(78,154,184,0.14)`.
  - **Avatar 42×42**, circular (size×0.5), gradient fill `convoColor(convo) → shade(-12)`. Group avatars: rounded-square (size×0.32).
  - **Presence dot** (DM only): bottom-right, **10×10**, radius 50%, background `#5FB39A`, **2px border `#F4F7FA`** (the white ring). Position: `bottom: -1, right: -1`.
  - Title: 14.5px / 600 weight / color `#1E2A33`, truncates with ellipsis.
  - Time on right: 11.5px color `#7A8892`, `tabular-nums`.
  - Preview line: 12.5px color `#7A8892`, ellipsis.
  - Unread badge: min-width 18, height 18, radius 999, bg `#4E9AB8` if not muted else `#AEB8C0`, white text, 11px 700 weight. Padding `0 6px`.
  - Pinned icon (Pin) appears between title and time for pinned rows.
  - Sections labeled `置顶` and `所有会话` appear as 10.5px uppercase `#A6B0B8` 700-weight letter-spacing 0.6 with padding `12px 12px 6px`.
- **RED if:** avatar size ≠ 42, presence dot not ringed in white, or unread capsule wrong color.

### VC-6 — DeviceRow
- **Precondition:** switch to 设备 tab. At least one real peer on the LAN (Linux `192.168.50.48`) should appear.
- **Steps:** crop one DeviceRow.
- **Assertions:**
  - Avatar **38×38**, gradient fill (same convoColor logic), DM kind.
  - Presence dot **9px** (slightly smaller than ConvoRow).
  - Name 14px 600 `#1E2A33`.
  - `OsBadge` pill immediately right of name: min-height 16px, radius 999, padding `1px 6px`, 10px 600 weight. Colors:
    - `macOS`: bg `#DEE6ED` / fg `#55656F` (README says `#DEE6ED` — README 表面里值是 `DEE6ED`, source code uses the same).
    - `Win`:   bg `#D9E4EA` / fg `#4F6670`.
    - `Linux`: bg `#E0E6EC` / fg `#4A5C52`.
  - Hostname + IP line: **JetBrains Mono**, 11.5px `#7A8892`, format `{host} · {ip}`, ellipsis overflow.
  - Trailing chat-icon button on the right: 26×26, radius 8, bg `rgba(30,42,51,0.05)`, color `#495A66`.
- **RED if:** hostname/IP renders in UI font instead of JetBrains Mono; OS badge label uses wrong color pair.

### VC-7 — Pulse-ring on 设备 tab header
- **Precondition:** 设备 tab active.
- **Steps:** screenshot the header strip containing `扫描中 · 发现 N 台` at the top of the list. Compare the green dot to the reference (static frame is sufficient for structural check; true animation-timing verification is deferred).
- **Assertions:**
  - Strip padding `10px 12px 8px`; gap 8.
  - Two stacked dots 8×8 on top of each other, both `#5FB39A`. Outer one has `animation: pulse-ring 1.8s ease-out infinite` defined in CSS.
  - Label text `扫描中 · 发现 N 台` — 11.5px `#495A66` 600 weight, where **N matches the count of DeviceRows below** (exclude self).
  - Refresh icon button on the right: transparent bg, `#7A8892` color, padding 4, radius 6.
  - **Keyframes defined somewhere in CSS** — test-execute greps `frontend/src/**/*.css` for `@keyframes pulse-ring` and verifies duration 1.8s ease-out infinite (±20ms tolerance per OUT-1).
- **RED if:** no pulse-ring keyframe; label wording differs; count mismatches.

### VC-8 — ChatHeader
- **Precondition:** pick any convo with non-empty messages.
- **Steps:** crop the chat-column header strip (62px tall, full chat width).
- **Assertions:**
  - Height **exactly 62px**.
  - Background `#FCFDFE`. Bottom border 1px `rgba(30,42,51,0.06)`.
  - Horizontal padding `0 20px`, gap 14.
  - 40×40 avatar on the left, with PresenceDot overlay for DM.
  - Title (convoTitle): 15.5px 700 `#1E2A33` letter-spacing -0.2.
  - **Online pill** (DM only): text `在线`, padding `2px 7px`, radius 999, bg `rgba(95,179,154,0.18)` (i.e. `--online-tint`), fg `#3F8A73`, 10.5px 600, leading 6×6 green dot `#5FB39A`.
  - Subtitle: 11.5px `#7A8892`, **JetBrains Mono** for DM (show host · IP), UI font for groups.
  - Three trailing buttons: Phone, Search, Info. Each 34×34, radius 10. Info button lights up `rgba(78,154,184,0.15)` + color `#3A7D99` when detail panel is open.
- **RED if:** height ≠ 62, online pill absent, or Info button not showing active state when detail is open.

### VC-9 — TextBubble (self)
- **Precondition:** send a message in the current convo (test-execute types "test" + Enter once). Capture before the auto-reply arrives.
- **Steps:** crop the most-recent right-aligned bubble.
- **Assertions:**
  - Flex direction row-reverse (bubble hugs right edge, max-width 64% of chat column).
  - Background: **linear-gradient(135deg, #6FB5D0, #4E9AB8)**.
  - Text color white `#fff`.
  - Border-radius exactly `18px 18px 6px 18px` (tail on bottom-right).
  - Shadow: `0 2px 6px rgba(58,125,153,0.25)`.
  - Font-size 14 (comfy) / 13 (compact). Line-height 1.5.
  - Padding `10px 14px` (comfy) / `6px 10px` (compact).
  - Below the bubble: right-aligned timestamp at 10.5px `#A6B0B8`, plus status icon. Status transitions: spin-ring → Check (1) → CheckDouble (2, color `#4E9AB8`).
  - Entrance animation: `msg-pop` 260ms cubic-bezier(.2,.9,.3,1.4). (Visual: bubble pops in; for this test confirm the keyframe exists in CSS with correct duration ±20ms.)
- **RED if:** not a gradient (flat color); radius tail on wrong corner; no status indicator.

### VC-10 — TextBubble (other party)
- **Precondition:** an incoming message present (either from auto-reply or a real peer echo).
- **Steps:** crop the most-recent left-aligned bubble.
- **Assertions:**
  - Flex direction row (avatar left, bubble right of avatar).
  - **32×32 avatar** on the left; shown only for first-in-run (last message from this author before it switches). Consecutive same-author bubbles have the 32-wide placeholder but no avatar drawn.
  - Background `#F4F7FA`, text `#1E2A33`, padding/fs per density.
  - Border-radius exactly `18px 18px 18px 6px` (tail on bottom-left).
  - Subtle shadow `0 1px 2px rgba(30,50,70,0.06), 0 0 0 1px rgba(30,42,51,0.04)`.
  - In **group** conversations only: author's name appears above the bubble at 11.5px `#7A8892` 600 weight, padding `0 8px 2px`.
  - Below bubble: left-aligned 10.5px `#A6B0B8` timestamp. No status indicator.
- **RED if:** avatar on wrong side, tail on wrong corner, or name label missing in group chats.

### VC-11 — FileBubble
- **Precondition:** drop a file (any small file) onto the chat area, or click the composer paperclip. Capture while progress < 100 (transferring) and again after completion.
- **Steps:** crop both states.
- **Assertions:**
  - Bubble width **320px** (maxWidth 100% of parent slot). Container padding 12, radius 16, bg `#E6F0F6` for mine / `#F4F7FA` for theirs, border `rgba(30,42,51,0.05)`.
  - **File tile 44×52** on the left, radius 8. Colors by MIME:
    - IMG: `#D9E3EC` / `#3F6B8A`
    - ZIP: `#DCE2EA` / `#5E6A7E`
    - JSON/TXT: `#D9E8E3` / `#3F7A66`
    - PDF: `#D6E4E9` / `#3F7A91`
    - APP (octet-stream): `#DDE3EB` / `#4E637A`
    - FILE (fallback): `#DFE6ED` / `#55656F`
  - Tile has a 10×10 **folded-corner** triangle in top-right: `background: #F4F7FA; clip-path: polygon(0 0, 100% 100%, 100% 0);` — a subtle white triangle.
  - Extension label centered in the tile: uppercase 4-char, 10px 800 weight, letter-spacing 0.5.
  - Filename 13.5px 600 `#1E2A33`, ellipsis; subtitle 11.5px `#7A8892` with tabular-nums showing either `{bytesDone} / {total} · {pct}%` while transferring or `{total} · 已接收/已发送` when complete.
  - **Progress bar** (transferring only): 6px tall, radius 999, bg `rgba(30,42,51,0.06)`, fill gradient `linear-gradient(90deg, #6FB5D0, #4E9AB8)`. Overlay shimmer `linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)` with `animation: shimmer 1.4s linear infinite`.
  - Under the bar: footer row with left `↑ 上传中 / ↓ 接收中 · LAN 直连` in JetBrains Mono 11px `#7A8892`, and right "取消" button text `#3A7D99` 600.
  - **When complete** (progress=100): progress bar + footer disappear; a 32×32 download button with radius 10, bg `rgba(30,42,51,0.04)`, color `#495A66` appears to the right of the filename block.
- **RED if:** bubble width ≠ 320, folded-corner triangle missing, shimmer keyframes absent, or MIME tint wrong.

### VC-12 — Composer
- **Steps:** crop the bottom 80px of the chat column.
- **Assertions:**
  - Outer wrapper padding `12px 20px 16px`, bg `#FCFDFE`, top border `rgba(30,42,51,0.06)`.
  - Pill container bg `#F4F7FA`, border `rgba(30,42,51,0.08)`, **radius 18**, padding `8px 8px 8px 12px`, shadow `0 1px 2px rgba(30,50,70,0.04)`, align-items flex-end, gap 8.
  - Left icon button: Paperclip 18px in a 32×32 radius-10 transparent button (`#7A8892`).
  - Textarea: auto-grow to max-height 160, font-size 14, line-height 1.45, color `#1E2A33`, placeholder `写点什么…  ⌘↵ 发送  |  拖拽文件即可上传` (verify the exact string including the 2-space separators and the `⌘↵` key glyphs).
  - Right icons: Smile 18 in a 32×32 transparent button, then Send.
  - **Send button: 36×36**, radius 12, when text is non-empty: `linear-gradient(135deg, #6FB5D0, #4E9AB8)` + white Send icon 16 + shadow `0 2px 6px rgba(58,125,153,0.3)`. Disabled state: bg `rgba(30,42,51,0.08)` + color `#A6B0B8` + no shadow + cursor default.
  - **IME safety**: test-execute should type a Chinese pinyin into the textarea (e.g. `nihao` without committing), press Enter, and verify **no** message is sent. Only after pressing Enter again to commit the candidate should subsequent Enter actually send. (OUT-4 requires `nativeEvent.isComposing` guarding; record the result as pass/fail.)
  - **Keyboard:** plain `Enter` sends; `Shift+Enter` inserts a newline.
- **RED if:** send button not 36×36 gradient, placeholder text wrong, or IME Enter triggers send.

### VC-13 — DetailPanel PeerHero
- **Precondition:** detail panel open (default); a DM convo active so online dot shows.
- **Steps:** crop the top ~200px of the 320-wide right column.
- **Assertions:**
  - Hero section padding `24px 20px 16px`, centered flex column.
  - Background `linear-gradient(180deg, #EDF2F6 0%, #FCFDFE 100%)`. Bottom border `rgba(30,42,51,0.06)`.
  - **72×72 avatar**, circular for DM, convoColor gradient.
  - **Outer ring online dot**: positioned `bottom:2, right:2`, **16×16**, radius 50%, bg `#5FB39A`, **3px border `#FCFDFE`** (thick white ring is distinct from sidebar's 2px).
  - Name below avatar: 17px 700 `#1E2A33` letter-spacing -0.3, margin-top 10.
  - Role text (DM): 12px `#7A8892`, margin-top 2.
  - **Host+IP pill**: JetBrains Mono 11px `#7A8892`, padding `4px 10px`, bg `rgba(30,42,51,0.04)`, radius 8, inline-flex gap 6 with Wifi icon (12px stroke) on the left.
  - Three quick-action tiles row (通话 / 文件 / 置顶): each 64 wide, padding `10px 0`, radius 12, bg `#F4F7FA`, border `rgba(30,42,51,0.06)`, center-aligned icon+label, label 10.5px 600 `#495A66`.
- **RED if:** online dot doesn't have 3px white ring, Wifi icon missing in pill, or host/IP not mono.

### VC-14 — DropOverlay
- **Precondition:** drag (don't drop) any file over the chat area. While dragged, screenshot.
- **Steps:** To automate: use `osascript` or manually hold a drag. Simpler: modify Composer test hook to toggle `dragOver` state via devtools, screenshot, revert. If this is impractical, test-execute can at minimum verify the overlay DOM by evaluating `document.querySelector('[data-testid="drop-overlay"]')` or inspecting a React DevTools state toggle. If the screenshot is infeasible, mark this VC **YELLOW** and note the structural check from DOM inspection.
- **Assertions:**
  - Overlay covers the chat column only (not sidebar or detail): `position:absolute; inset:0; zIndex:50; pointer-events:none; padding:16`.
  - Inner box: **3px dashed `#4E9AB8` border**, radius 24, bg `rgba(111,181,208,0.08)`, `backdrop-filter: blur(2px)`, fade-in 200ms.
  - Centered upload-icon tile: 80×80 radius 24, gradient `linear-gradient(135deg, #6FB5D0, #4E9AB8)`, white icon (inline SVG, strokeWidth 2).
  - Heading `松开以发送` 18px 700 `#1E2A33`.
  - Body `文件将通过 LAN 直连，无需中转服务器` 13px `#7A8892`.
- **RED if:** the overlay covers the sidebar or detail panel; border not dashed; icon tile flat color.

### VC-15 — ToastStack
- **Precondition:** trigger a toast. Easiest: wait 1.8s after mount (prototype auto-fires a peer-found toast) OR send a file until completion OR click sidebar "+" (the acceptance criteria says this should show a "coming soon" toast as out-of-scope fallback).
- **Steps:** screencapture the bottom-right corner (240×160 area) while a toast is visible.
- **Assertions:**
  - Container fixed at `right:20, bottom:20, zIndex:100`, flex-column gap 8.
  - Each toast: min-width 280, max-width 360, radius 14, padding `10px 12px`, shadow `0 8px 24px rgba(30,50,70,0.14)`, border depending on kind.
    - info: bg `#F4F7FA` border `rgba(30,42,51,0.08)`, icon color `#495A66`.
    - success: bg `#EEF6EE` border `rgba(95,179,154,0.3)`, icon `#3F8A73`.
    - file: bg `#E6F0F6` border `rgba(78,154,184,0.3)`, icon `#3A7D99`.
    - peer: bg `#E6F0FA` border `rgba(78,130,168,0.3)`, icon `#4E82A8`.
  - 32×32 radius-10 icon tile on the left, bg `rgba(255,255,255,0.7)`, correct icon for kind (Files / Devices / Check / Info).
  - Title 13px 700 `#1E2A33`; body 12px `#55656F` line-height 1.4.
  - Close button (×) on the right, 14px icon, color `#A6B0B8`.
  - Entrance animation: `toast-in` 280ms cubic-bezier(.2,.9,.3,1.2). Verify keyframe in CSS (structural check — timing ±20ms).
  - Auto-dismiss at 3800ms (sanity check — watch it disappear).
- **RED if:** toast appears anywhere other than bottom-right; wrong tint for kind; title above 280px min-width would overflow.

---

## Deferred Checks (cannot verify from static screenshots alone)

- **D-1 Pulse-ring animation 1.8s ease-out infinite** — VC-7 verifies keyframe presence in CSS, but actual visible timing needs `QuickTime` screen recording. Defer observational verification to a future run with video tooling.
- **D-2 Toast-in entrance 280ms** — VC-15 confirms keyframe; full cubic-bezier feel needs video.
- **D-3 msg-pop entrance** — same as above for VC-9/VC-10.
- **D-4 Shimmer scan on progress bar** — VC-11 confirms the CSS; speed/coverage needs video.
- **D-5 Real cross-host file transfer end-to-end** — OUT-5/OUT-7 needs the Linux peer live on 192.168.50.48; this plan covers the UI only, not the network round-trip.
- **D-6 Focus rings on keyboard navigation** — covered by OUT quality baseline, needs a11y-focused test plan (tab order, escape, arrow keys). Not in scope here.

---

## Checklist for test-execute
- [ ] Capture screenshots at both 1280×760 and 1440×900 viewports.
- [ ] Save each baseline screenshot to `.harness/nodes/test-execute/run_1/ours-<w>.png` and `ref-<w>.png`.
- [ ] For each VC, capture a zone crop named `ours-<w>-vc<N>.png` / `ref-<w>-vc<N>.png`.
- [ ] For each VC, write a single-line comparison result to `.harness/nodes/test-execute/run_1/eval-visual.md` (format: `VC-N: PASS | YELLOW | RED — <one-line reason>`).
- [ ] If any panel boundary drifts >2px, flag **RED** and include the measured delta.
- [ ] Verify CSS keyframes by greppimg `frontend/src/**/*.css` for: `@keyframes pulse-ring`, `@keyframes toast-in`, `@keyframes msg-pop`, `@keyframes shimmer`, `@keyframes fade-in`, `@keyframes spin`. Log missing ones as RED under OUT-1.
- [ ] Inspect `frontend/src/index.css` `:root` and diff its custom properties against the README token list (OUT-1) — log any missing or mismatched token as RED.
- [ ] Sanity-check `tauri.conf.json` has `"decorations": false` (or equivalent) so no native title bar renders above the 36px custom titlebar.
- [ ] Run `cd frontend && pnpm lint && pnpm test` once; capture exit codes. (OUT-1 requires lint clean; existing 23 unit tests must still pass.)
- [ ] On IME safety (VC-12), record a short video or describe the observed behavior and log pass/fail.

## Appendix — Useful commands for test-execute

```bash
# Read the Tauri config to verify window decorations are off
cat /Users/yanjiayi/workspace/lan-messenger/frontend/src-tauri/tauri.conf.json | grep -E 'decorations|transparent|width|height'

# Grep CSS tokens
grep -E '^\s*--[a-z]' /Users/yanjiayi/workspace/lan-messenger/frontend/src/index.css

# Grep keyframes
grep -nE '@keyframes (msg-pop|toast-in|pulse-ring|shimmer|fade-in|spin)' /Users/yanjiayi/workspace/lan-messenger/frontend/src/**/*.css

# Read the README token block for side-by-side diff
sed -n '/^### Colors/,/^### Typography/p' /Users/yanjiayi/Downloads/design_handoff_linklan_im/README.md
```

---

## Verdict: LGTM
