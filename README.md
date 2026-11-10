# hermes-acrylic

Windows 11 **Acrylic** look for Hermes Desktop, as a disk plugin (no build, no native code).

## What it contributes
- **Theme `Windows Acrylic`** (`windows-acrylic`) — WinUI Acrylic Base palette
  (dark tint `#202020`, light `#FCFCFC`), Segoe UI Variable / Cascadia Code, Fluent accent.
- **Four presets** (tokens only, no extra paint): **Acrylic** (glass `.14` light / `.12` dark, no-Glass `.52` / `.55`, 14px),
  **Frosted** (`.64` / `.68`, 18px, saturate 1.12), **Sanded** (Frosted + a static SVG grain tile),
  **Expressive** (`.68` / `.70`, 16px). Preset buttons live in the Appearance card and in ⌘K.
- **Auto Glass sync (Light *and* Dark)**: `Apply`, preset picks, and the material toggles write the
  host store `hermes.desktop.translucency.v2` with `mode:'glass'` and `scope:'window'` on **both** the
  `light` and `dark` slots, then dispatch a `StorageEvent` and call
  `window.hermesDesktop.setTranslucency(...)` over IPC. This is what stopped Light mode from falling
  back to `scope:'sidebar'` / intensity 0 and painting an opaque white slab. A user-tuned non-zero
  glass intensity is preserved; otherwise it defaults to `85` (matches native Win11 acrylic 1:1).
- **Mica / Acrylic drag toggle**: **Live Acrylic (under-window)** = live desktop blur, re-blurs on every
  DWM move (higher drag cost). **Smooth Drag Mica (titlebar)** = smoother drag. **Wake / Re-sync DWM**
  bounces Electron's material off→on to recover a dropped `setBackgroundMaterial('acrylic')`.
- **Native Win11 DWM tint (no double-tint)**: while live Glass is on (`[data-hermes-glass]` /
  `[data-hermes-glass-on]`), DWM **already** applies Windows 11's native acrylic tint in the compositor.
  Body therefore paints only `--material-tint-glass` — a light whisper (`.14` light / `.12` dark for the
  default *Acrylic* preset; `.38` for *Frosted*/*Sanded*; `.50` for *Expressive*). Painting Packshot's
  full `--material-tint` (`.52`/`.55`) on top of DWM's ~`.50` compounded to a **77.5 % opaque charcoal**
  that buried half the desktop colour (measured `#1C2B22` vs native Win11 `#255336`). With Glass **off**,
  body falls back to the full `--material-tint` (`.52` light / `.55` dark) over the blurred Chat Backdrop.
- **Single-layer cards (Light-mode fix)**: raised cards paint ONE `--control-fill` layer over body's
  tint (`composer-surface`, `user-message`, bubbles, standalone inputs). Nested inputs inside a card
  (`composer-rich-input`, `input-group-control`, composer textarea/input, `command-input`) are fully
  **transparent** so they never double-paint. No more stacking `--material-tint` + a
  `linear-gradient(--control-fill)` on both parent and child (the ~99.2%-opaque-white bug).
- **Real acrylic** when `[data-hermes-glass]` is set: the OS blurs the desktop. Chat Backdrop is hidden
  (`display:none`) so the drag frame never composites the filler JPEG.
- **CSS fallback** when `[data-hermes-glass]` is absent (Linux always; Windows or macOS before Glass): the same tint over a blurred Chat Backdrop. That is a demo/screenshot stand-in. It does not blur other apps.
- **Terminal (single card, true transparency via the DOM renderer)**: only `[data-terminal]` paints the one rounded acrylic
  card (`--control-fill` + `--layer-stroke` + `border-radius: 8px`, `inset: 4px 6px 6px 6px`, `contain:none`).
  `[data-terminal-slot]` and the fixed `[data-persistent-terminal]` overlay stay **paint-free and
  margin-free** (`background: transparent`, `border: none`, `margin: 0`, `contain: none`) — the old build
  carded *both*, and the overlay's `margin: 4px` shifted the fixed box 4px off the slot, producing the
  offset "card under a card" border.
- **Why the terminal was an opaque black slab, and the fix.** xterm runs `allowTransparency: false`, so its
  WebGL `<canvas>` paints an **opaque** background. No CSS blend mode can erase an opaque source: in W3C
  *src-over* (`Compositing & Blending`) a source with `alpha_s = 1.0` emits
  `alpha_out = alpha_s + alpha_b(1 − alpha_s) = 1.0` to Chromium's root surface regardless of
  `mix-blend-mode`, and when Windows 11 DWM receives an opaque pixel it draws **zero OS acrylic** behind it.
  The plugin therefore switches xterm to its **native HTML DOM renderer** (`.xterm-rows`, whose default cell
  background has `alpha = 0`): `installTerminalAcrylicDomRenderer()` finds every `.xterm-screen canvas`
  (at load and, via a debounced `MutationObserver`, for future tabs) while the `windows-acrylic` theme is
  active, marks it `data-hermes-acrylic-lost`, and loses its GL context —
  `getContext('webgl2'|'webgl').getExtension('WEBGL_lose_context').loseContext()` plus a
  `new Event('webglcontextlost', { bubbles: false, cancelable: true })` dispatch. That fires Hermes's own
  `webgl.onContextLoss` handler (`use-terminal-session.ts:434`, `use-agent-terminal.ts:157`), which
  `webgl.dispose()`s the canvas and repaints via the DOM renderer.
- **The surface token goes fully clear.** `--ui-terminal-surface-background: transparent !important` on
  `:root` (dark and light) — so `[data-terminal]` (instance.tsx), `[data-persistent-terminal]`
  (persistent.tsx), the terminal slot (surfaces.tsx), `.xterm-screen` / `.xterm-viewport`, and the
  right-side **tab rail** (rail.tsx `TerminalRail`, `bg-(--ui-terminal-surface-background)`, also cleared
  explicitly via `[data-suppress-pane-reveal]`) all paint **100 % transparent** over DWM Acrylic.
  `resolveSurfaceColor()` (`selection.ts:87`) probes the token on a hidden `<span>`; seeing
  `rgba(0, 0, 0, 0)` it falls back to the theme background, so xterm's `minimumContrastRatio: 4.5` text
  math stays correct. `.xterm-rows` / `.xterm-rows > div` are cleared too, and
  `.xterm-screen:has(.xterm-rows) canvas { display: none !important; }` hides any WebGL canvas that
  lingers before disposal. The old `#000000`/`#ffffff` token + `mix-blend-mode: screen|multiply` canvas
  hacks are gone — they never made the opaque WebGL frame transparent.
- **Solid holdouts** on both paths: dropdown/context/select menus, popovers, dialogs, code cards, and a
  `[data-slot='tooltip-arrow']` fill that fixes the white arrow on a dark tooltip. Only **secondary** and
  **outline** buttons get the acrylic fill — primary/destructive/ghost keep their theme colors.
- **Settings → Appearance card**: Enable theme button, live status (preset · Glass on/off · Light/Dark
  scope synced · current backdrop material), the material row above, and steps that do not send Linux
  users to a Glass row.
- **⌘K palette**: `Apply Acrylic look`, four `Acrylic preset: …`, `Acrylic: Wake / Re-sync Windows DWM`,
  `Acrylic: Smooth Drag mode (Mica)`, `Acrylic: Live Blur mode (Acrylic)`, `Acrylic: clear Chat Backdrop`,
  `Acrylic: open Settings`.
- **Status-bar chip** (right): `◇ acrylic` / `(no glass)` / `(css)` / `off` — click to apply.

## Native Acrylic fidelity (Packshot Studio method)
Follows Packshot Studio's proven Electron acrylic (`exp/nav-acrylic`):
- **One API**: `win.setBackgroundMaterial('acrylic')` — Hermes already does this
  for Glass + frost under-window. This plugin never touches DWM / P/Invoke.
- **Tint under live Glass is DWM's, not ours.** Packshot's full sheet is
  `rgba(32,32,32,0.55)` dark / `rgba(252,252,252,0.52)` light, but when
  `[data-hermes-glass]` / `[data-hermes-glass-on]` is live the Windows 11 DWM compositor
  **already** paints its own native acrylic tint (~`.50`). Painting `.55` on top of DWM's
  `.50` compounds to `1 - (1-.50)(1-.55) = 77.5 %` opaque and chokes ~half the desktop
  colour. So `<body>` paints **`--material-tint-glass`** under Glass (`.14` light / `.12`
  dark for *Acrylic*; `.38` *Frosted*/*Sanded*; `.50` *Expressive*) — just enough to unify
  the surface while matching native Windows 11 acrylic swatches 1:1. Host `intensity` is
  synced to **85** so Hermes's live acrylic keeps 85 % of the sampled desktop.
  Only on the **no-Glass** path does body paint the full `--material-tint`
  (Packshot `.52` / `.55`) as the complete CSS plate over the blurred Chat Backdrop.
- **Math vs Hermes host default.** Host body rule is
  `color-mix(in srgb, var(--ui-bg-chrome) var(--translucency-glass-keep), transparent)`
  where `glassSurfaceKeep(intensity) = 100 - intensity`. Default Glass intensity
  **29** → keep **71%** → ~`rgba(32,32,32,0.71)`. Packshot `.55` ≡ keep **55%** ≡
  intensity **45**. The plugin syncs intensity to **85** and paints only the light
  DWM-complementary `.12`/`.14` glass sheet, so DWM's native acrylic is not buried by
  a second coat.
- Theme chrome seeds stay `#FCFCFC` / `#202020` (correct for `--ui-bg-chrome`);
  alpha comes from `--material-tint-glass` under Glass, `--material-tint` otherwise.
- **Per-element transparency** decides what shows through: field + rail transparent;
  every raised card is filled with a SINGLE `--control-fill` layer (light
  rgba(255,255,255,.32) / dark rgba(255,255,255,.055)) over the body tint, edged by
  `--layer-stroke` (light rgba(0,0,0,.08) / dark rgba(255,255,255,.09)); nested inputs
  inside a card stay `background: transparent`.
- **Never `backdrop-filter` on shell chrome when Glass is on** — over Windows acrylic it becomes a dark
  plate. Shell and holdouts set `backdrop-filter: none`. The no-Glass fallback blurs the Chat Backdrop **image** with `filter: blur(30px) saturate(1.25)`, then paints `--material-tint` over that image. It does not use `backdrop-filter` to pretend the window is sampling the desktop.
- OS limits: unfocused window goes flat (Windows behaviour); real material needs Win11 22H2+. Linux has no Glass row.

## Fill vs decorative figures (Chat Backdrop)

Hermes paints **two** layers behind the transcript:

1. **Chrome fill** — `<body>` paints `--material-tint-glass` (`.12` dark / `.14` light)
   under live Glass so it does **not** double-tint over DWM's native acrylic, or the full
   Packshot `--material-tint` (`rgba(..., 0.55)`) on the no-Glass path. Theme seeds
   `#FCFCFC` / `#202020` remain the chrome hex; the plugin overrides the host's
   `color-mix(... var(--translucency-glass-keep) ...)` so keep 71%
   (intensity 29) cannot wash the shell. Field surfaces
   (`--ui-chat-surface-background`, etc.) go fully transparent under
   `[data-hermes-glass]`.
2. **Decorative figures** — Settings → Appearance → **Chat Backdrop** mounts
   `Backdrop` (`apps/desktop/src/components/Backdrop.tsx`) with
   `public/ds-assets/filler-bg0.jpg`: a **baked duotone** (cream plate + etched
   classical figures). Default host styling is `opacity: 0.025` +
   `mix-blend-difference` (+ invert in light mode).

**Apply Acrylic** sets `backdrop.v1` to `true`.

- **Glass on:** the Chat Backdrop wrapper is hidden (`display: none`) so DWM's own blur is the only material and dragging never re-composites the JPEG.
- **Glass off:** the wrapper is fully visible (`opacity: 1`, `mix-blend-mode: normal`). The image is `filter: blur(30px) saturate(1.25)`, and an `::after` plate of `var(--material-tint)` sits on that blurred JPEG. Shell fills are cleared so the same tint shows in the rail. This is the Linux / no-Glass fallback.

Limitation: cream and figures share one JPEG. True cream-only alpha needs a
Hermes-core transparent PNG / luminance mask — out of reach for a disk plugin.

## Linux / no Glass

Hermes hides Glass on Linux (`glassSupportedOn` / `translucencySupportedOn` are darwin and win32 only). Electron `setBackgroundMaterial` is Windows-only. This plugin does not call Glasstron, KWin, or Hyprland.

| | Real acrylic | CSS fallback |
|---|---|---|
| When | `[data-hermes-glass]` present | Theme active, attribute absent |
| Where | Windows 11 22H2+, Glass, frost **under-window**, scope **window** | Linux always; other desktops until Glass is turned on |
| Blur | OS material behind the window | `filter` on the Chat Backdrop image only |
| Tint | `body { background: var(--material-tint-glass) }` (.12/.14 over DWM) | `body { background: var(--material-tint) }` (.55), plus the plate over the blurred backdrop |
| Other apps | Sampled by DWM / vibrancy | Not blurred |

Optional, and **not applied by this plugin**: a Hyprland window rule or KWin’s Blur desktop effect can frost the Hermes window at the compositor. Treat that like any other outside-the-app glass hint. The CSS fallback does not require it and does not claim to have set it.

`smoke/linux-fallback.html` shows the fallback over a wallpaper gradient and checks the .55 composite against `tint * 0.55 + wallpaper * 0.45`.


## What currently blocks real Glass acrylic in Hermes

Host Glass (`data-hermes-glass`) already:
- sets `<html>` transparent, field tokens (`--ui-chat-surface-background`,
  `--ui-sidebar-surface-background`, `--ui-editor-surface-background`) to
  `transparent`, and paints **one** tint on `<body>` via
  `color-mix(--ui-bg-chrome @ --translucency-glass-keep)`;
- clears `[data-contrib-shell]` + `[data-slot='sidebar-wrapper']`.

It does **not** clear the layers that actually paint:

| Layer | Selector / utility | Token | Effect under Glass |
|---|---|---|---|
| Sidebar column fill | `[data-slot='sidebar-inner']` `bg-sidebar` | `--sidebar` → `--ui-bg-sidebar` | **Opaque plate over acrylic** (brown/maroon wash when the active theme’s sidebar seed is warm) |
| Content column | `[data-slot='sidebar-inset']` `bg-background` | `--background` → `--ui-bg-chrome` | Opaque over acrylic unless scope=`sidebar` (intentional Finder solid column) |
| Chat surface | `[data-chat-surface]` `bg-(--ui-chat-surface-background)` | token → transparent under glass | OK once parents clear |
| Chat Backdrop figures | `Backdrop` → `img[src*='filler-bg0']` | separate img | Glass: normal blend at 0.12. No Glass: blurred stand-in under the .55 plate |
| Clear mode overlays | `:root[data-hermes-clear] [data-overlay-surface]` | `backdrop-filter: blur(0.5rem)` | **Fake frost** — not DWM acrylic |

This plugin’s customCSS forces
`sidebar-inner` / `[data-sidebar=sidebar]` / `sidebar-container` (and
`sidebar-inset` when Glass scope=`window`, or always on the no-Glass path)
to `background: transparent` and `backdrop-filter: none`. Holdouts (composer, bubbles, menus, code, dialogs)
stay solid on both paths. Shell chrome never uses `backdrop-filter`.

**Use Glass, not Clear,** when the row exists. Clear lowers window opacity and CSS-blurs overlays. It is not Win11 Acrylic Base. On Linux that row is absent; use the CSS fallback instead of hunting for it.

## Demo
Put colorful real content **behind** the window (a gradient wallpaper from
`test-gradients/`, a magenta browser page, photos) and drag the window over it.
Do not paint fake gradients inside the app — real acrylic only samples the desktop.

## Testing
See `TEST.md` for the Win11 drag-over-desktop checklist. The Linux fallback demo is `smoke/linux-fallback.html` (Packshot .55 over a blurred wallpaper). It is not DWM.

## Roadmap
Acrylic by default, with **Frosted / Sanded / Expressive** presets as token variants
(shipped). Future: Apple-glass style variants.

## Prerequisite: Glass
The plugin does not use P/Invoke or call DWM directly: it drives the host's own
translucency store (`hermes.desktop.translucency.v2`, both `light` and `dark` slots)
and Electron's `setTranslucency` IPC, which is what calls
`BrowserWindow.setBackgroundMaterial('acrylic')` under Glass.
Real acrylic still comes from the host: with **Settings → Appearance → Window Translucency = Glass** and frost
**under-window**, Hermes calls Electron `BrowserWindow.setBackgroundMaterial('acrylic')`.
Requires **Windows 11 22H2 (build 22621)+**. macOS uses vibrancy. Linux has no first-party backdrop material (Glass is not offered); the theme still applies the CSS fallback over Chat Backdrop.

## Install / reload
1. Copy this folder into Hermes Desktop's disk-plugins dir (folder name = plugin id):
   - **Windows:** `%LOCALAPPDATA%\hermes\desktop-plugins\hermes-acrylic\`
   - **macOS / Linux:** `~/.hermes/desktop-plugins/hermes-acrylic/`
2. The app hot-loads within seconds; otherwise ⌘K / Ctrl+K → **Reload desktop plugins**.
3. Ctrl+K → **Apply Acrylic look**. On Windows, turn on Glass (frost under-window, scope window). On Linux there is no Glass row — the Appearance card describes the CSS fallback.

## Screenshot recipe
1. Windows 11 22H2+, put a busy **real wallpaper** (or open colorful apps) behind Hermes so the live blur reads when you drag the window.
2. Settings → Appearance → Window Translucency: **Glass**, frost **under-window**.
3. Scope: **window** (full-glass hero shot) — or **sidebar** for the Finder-style rail.
4. Theme: **Windows Acrylic** (dark mode looks closest to Win11 flyouts). Body
   chrome paints only the light `--material-tint-glass` sheet (`.12` dark / `.14` light) while
   the theme + Glass are on, so DWM's native acrylic is not double-tinted; host intensity is
   synced to 85.
5. Open a chat with a code block, a user bubble, and an open dropdown/menu so the solid
   holdouts contrast against the glass. Drag the window over the wallpaper edge; capture with Win+Shift+S.

On Linux, open `smoke/linux-fallback.html` in a browser for the same tint math over a gradient. That page does not show other apps through the window.

## Notes
- Disable the plugin in Capabilities → Plugins to remove everything; the theme
  selection falls back to the host's handling of a missing theme.
- Allowed imports only: `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`.
