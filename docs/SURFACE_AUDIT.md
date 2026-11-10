# Surface audit: every background Hermes paints, and what it becomes under Acrylic

Date: 2026-11-10. Hermes Desktop source read at `%LOCALAPPDATA%\hermes\hermes-agent\apps\desktop\src` (dist built 2026-11-06). Plugin read at `plugin.js` (SHA-256 `5a6f6337…`, before packet A1).

This document answers one question for every background in Hermes Desktop: **should it be glass, and is it?** It complements `SURFACE_TIER_MAP.md`, which describes how the four tiers are built. Line numbers for `plugin.js` refer to the file before packet A1.

## 1. The rule

1. Every background Hermes paints is a **material** under Acrylic. A surface that is filled in stock Hermes is never left with no fill.
2. A surface is one of seven roles. The role decides the material.
3. A surface that floats over other content gets a hole cut under it (`installFlyoutCutoutMask`), so only the blurred desktop is behind it. Without the hole, a translucent fill shows the text below it, which reads as broken, not as glass.
4. Solid colour that carries meaning (accent, status, a white QR code) stays solid. That is ink, not background.

| Role | What it is | Material under Glass | Without Glass (Linux, Glass off) |
|---|---|---|---|
| Field | The window itself and the layout boxes between `<body>` and the content | Transparent; `<body>` paints `--material-tint-glass` once | Transparent; `<body>` paints `--material-tint` over the blurred Chat Backdrop |
| Well | A sunken box: lane, track, code box, settings group | `--acrylic-recessed` (Tier 1) | Same |
| Card | A raised box in the page: tool block, bubble, terminal card | `--control-fill` (Tier 2) | Same |
| Control state | Hover, pressed, selected, the active pill of a switcher | `--control-fill-hover` or the host's own low-alpha hover mix | Same |
| Flyout | Anything floating: menu, popover, palette, dialog, tooltip, another plugin's card | `--acrylic-flyout` + grain (Tier 3) over a cutout hole, no `backdrop-filter` | `--acrylic-flyout` + `backdrop-filter: blur(24px)` |
| Scrim | A veil over the whole window or over one box | `--acrylic-scrim` (new in A1), no `backdrop-filter` | Same fill; the host's own blur stays |
| Ink | Accent fills, status dots, progress bars, media backgrounds | Unchanged | Unchanged |

## 2. Token map

Hermes paints backgrounds through a small set of tokens and Tailwind utilities. Counts are call sites in `src/**/*.tsx` (tests excluded). "Status" is the state before packet A1.

| Token or utility | Sites | Role in Hermes | Plugin maps it to | Status |
|---|---|---|---|---|
| `--ui-chat-surface-background`, `--ui-sidebar-surface-background`, `--ui-editor-surface-background`, `--ui-surface-background` | 33+ | Field | `transparent` (`plugin.js:177-180`) | OK |
| `bg-(--ui-bg-chrome)` | 6 | Field, sticky bars | forced transparent (`plugin.js:465`) | OK for fields. **Gap** for sticky bars, see 4.3 |
| `bg-sidebar` → `--sidebar` | 5 | Field | `transparent` (`plugin.js:185`); inner rail gets `--acrylic-sidebar-tint` | OK |
| `bg-(--ui-bg-tertiary)`, `bg-(--ui-bg-quaternary)`, `bg-(--ui-bg-quinary)`, `bg-muted` → `--dt-muted` | 84 | Well, track | `--acrylic-recessed` (`plugin.js:188-191`) | OK |
| `bg-card` → `--dt-card`, `bg-(--ui-bg-editor)`, `--ui-bg-card`, `--ui-widget-surface-background` | 11+ | Card | `--control-fill` (`plugin.js:194-197`) | OK |
| `bg-(--ui-chat-bubble-background)`, `--dt-user-bubble` | 15 | Card (bubble); also the command palette shell | `--bubble-fill`; palette overridden to `--acrylic-flyout` by selector | OK |
| `bg-secondary` → `--dt-secondary` | 2 | Card | `--control-fill` | OK |
| `bg-accent` → `--dt-accent`, `bg-sidebar-accent` | 43 | Control state | `--control-fill-hover`; `--sidebar-accent` is the host's low-alpha mix | OK |
| `bg-(--chrome-action-hover)`, `bg-(--ui-control-hover-background)`, `bg-(--ui-control-active-background)`, `bg-(--ui-row-active-background)`, `bg-(--ui-row-hover-background)` | 159 | Control state | not remapped; the host values are 4–13% alpha mixes | OK as is: already translucent |
| `bg-(--ui-bg-elevated)`, `bg-elevated`, `bg-popover` → `--dt-popover`, `--popover-surface` | 28 | Flyout; a few in-page chips | `--acrylic-flyout` (`plugin.js:206-207`) | OK where the element is a listed cutout source. **Gap** otherwise, see 4.2 |
| **`bg-background` → `--dt-background`** | 28 | Mixed: Field (4), Well (9), Control state (5), sticky bar (6), other (4) | `transparent` (`plugin.js:182-183`) | **Broken** for every non-field use. Fixed in A1 for pills and rounded boxes |
| **`bg-background/NN`** (40–90%) | ~32 | Well (settings groups, chips), Scrim (first-run, install, loading veils) | computes to transparent | **Broken.** Fixed in A1 |
| **`bg-foreground` + `text-background`** | 3 | Inverted pill: tooltip, send button, switch thumb | text colour restored (`plugin.js:523`); tooltip fill fights the flyout rule | **Broken** for tooltips. Fixed in A1 |
| `bg-black/NN` scrims (`dialog-overlay`, `overlay-view`, `session-picker`) | 6 | Scrim | not remapped; `backdrop-blur` stays on `dialog-overlay` | Fill OK. Blur removed under Glass in A1 for `dialog-overlay`; `[data-overlay-surface]` already handled |
| `backdrop-blur*` | 28 | Host's own glass on popovers, context menus, toasts, chips | cleared on listed flyouts only | **Gap** for unlisted users, see 4.4 |
| `bg-primary`, `bg-primary/NN`, `bg-destructive*`, `bg-emerald-*`, `bg-amber-*`, `bg-white`, `bg-black` (media) | 120+ | Ink | untouched | OK |
| `[data-hud-glass]` (`rgb(12 14 18 / .55–.82)`) | 1 | HUD window sheet | untouched | Out of scope: separate transparent window |

## 3. The seven reported examples

| # | What the user saw | Cause | Evidence | Packet |
|---|---|---|---|---|
| 1 | Triage skill card: chat text runs through it | The card (`.hsj-detail`) is not a cutout source, and its 180ms open transition ends with no re-sync | Source read; `div.hsj-overlay` measured as a `<body>` child outside every cutout target | A1 changes 4, 5, 7 |
| 2 | Command palette: lines from the page show through | In a clean window nothing paints under the palette (measured: 0 elements). The lines come from a layer outside the listed targets, most likely another plugin's `<body>`-level overlay | Not reproduced; the general fix is to cut every `<body>` layer below the palette | A1 change 6 |
| 3 | System Resources panel: flat, no glass | It is a status-bar dropdown, so it has the flyout fill and the hole. The grain is 3.5% and there is no blur of its own, so over a dark desktop it reads flat | Source read (`system-resources-statusbar.tsx:154`); not measured | Open, see 4.5 |
| 4 | "Smart" chip: tooltip text unreadable, box around the chip | Tooltip gets the 72% flyout fill, dark text on a dark plate, no hole. The box is most likely Hermes's keyboard focus ring, which also explains why the tooltip was open | Tooltip measured: background alpha 0.725, text `rgb(13,17,23)`. Chip at rest measured clean (no border, no fill) | A1 changes 2, 5 |
| 5 | Attach menu: a "100%" chip shows through | The chip belongs to a `<body>`-level plugin overlay, which is never cut | Menu measured clean in a window without that overlay | A1 change 6 |
| 6 | Review tabs (Uncommitted / Branch / Last turn): active tab has no pill | `SegmentedControl` paints the active pill with `bg-background`, which the plugin clears | Source read (`segmented-control.tsx:53`) | A1 change 3 |
| 7 | "Layout editor" tooltip over the tab bar: see-through | Same as 4 | Same measurement | A1 changes 2, 5 |

## 4. Open gaps after A1

These are known and not fixed by A1. Each needs a decision or a measurement first.

1. **Structural `bg-background` uses that are neither round nor stateful** stay transparent on purpose. Risk: a box that should be a well but has no `rounded-*` class stays empty. Known candidates: `preview-console.tsx:200`, `prepared-image-recovery.tsx:40` (covered: it is `rounded-md`), `pagination.tsx:41` (active page, a `button`).
2. **In-page uses of `--ui-bg-elevated`** (Kanban cards, reaction bar, connector rows, plan cards) get the flyout fill without a hole. They sit on the field, not over text, so they read as cards. Decision needed: remap them to `--control-fill` by selector, or accept.
3. **Sticky bars** (`artifacts/index.tsx:366`, the preview pane bars, `thread/list.tsx:1622`) were masks for content scrolling under them. They are transparent now, so scrolled content passes behind their text. A real fix needs a cutout on the scroll container, the way the composer has one.
4. **Host `backdrop-blur` on surfaces the plugin does not list** (toasts `notifications.tsx:43`, the scroll-to-bottom pill, zoom controls, voice pill). Under Glass, a blur over nothing in-page renders as a flat plate. Each needs either a hole or an opaque-enough fill.
5. **Flyouts read flat over a dark, even desktop.** The material is correct; the grain is very light. Options: stronger grain, a specular top edge, or a preset with more character (see 6).
6. **Other windows** (HUD, pet overlay, quick entry) own their backgrounds and never load the same rules. Not mapped.
7. **Bleed check tool.** The X-Ray finds opaque surfaces. It does not find text showing through a flyout. A "what paints under this flyout" audit was used over CDP for this document and could ship as a second palette command.

## 5. Linux and WSL

Corrected 2026-11-10: an earlier version of this section said desktop blur on Linux was out of reach. It is reachable. It needs one change in Hermes itself, which a disk plugin cannot make.

**WinUI acrylic is a recipe, not a Windows API:** blurred desktop + tint + luminosity + noise. On Windows, DWM supplies the blur. On Linux the compositor supplies it, and the plugin already supplies the other three layers.

**What Linux needs:**
1. A transparent window. Electron on Linux gives one with `transparent: true` and `backgroundColor: '#00000000'`. No native module is involved.
2. A compositor that blurs behind transparent windows: KWin (Blur effect, Plasma 6.7 also has the `ext-background-effect-v1` protocol), Hyprland (default), GNOME 51 or a blur extension, niri, Sway forks, picom on X11.
3. A page that paints no opaque fill, only the tint and grain. This is what the plugin does under Glass today.

Precedent: the Electron app Orca shipped exactly this ("Window Blur" on Linux, tested on Fedora 44, KDE Plasma 6.7, Wayland; stablyai/orca PR 36197, superseded by PR 36580 which offers Opaque, Translucent and Blurred materials on all three platforms).

**What blocks it in Hermes today (verified in source):**
- `apps/shared/src/translucency.ts:202` — `translucencySupportedOn()` returns true only for `darwin` and `win32`.
- `apps/shared/src/translucency.ts:211` — `glassSupportedOn()` returns false for Linux, so the Glass mode never activates and `data-hermes-glass` is never set.
- `apps/desktop/electron/main.ts`, `chatWindowSurfaceOptions()` — the chat window is created without `transparent: true`.

Window transparency is fixed when the window is created, in the main process. The plugin runs in the page, so it cannot turn it on.

**Built (packet L1, 2026-11-10):** `patches/hermes-linux-glass-optin.patch`, against Hermes commit `2bd378ed1b`; work branch `linux-glass`.
- Opt-in per launch: `HERMES_DESKTOP_LINUX_GLASS=1` or `--linux-glass`. Without it nothing changes; `glassSupportedOn('linux')` still returns false.
- With it, the main process reports Glass as supported, Settings shows the Window Translucency row, and a chat window is created `transparent: true` when Glass is active at launch. Turning Glass on in Settings takes effect after a restart.
- The defaults then apply as on Windows and macOS: a fresh profile starts in Glass at 29% tint, sidebar scope.
- Checks run on Windows: Hermes's `electron/translucency.test.ts` 82/82 (4 new tests), strict type-check of `translucency.ts`, `main.ts` parses. Not run: the full type-check of `main.ts`, the app itself on any Linux desktop.
- Plugin side: `isLinuxPlatform()` now means "Linux without host Glass", so on a patched, opted-in Hermes the plugin takes the Glass path (cutouts, no `backdrop-filter`, host translucency sync). Not deployed; no effect on Windows.
- Open: the Settings frost picker shows the Windows material names on Linux, where they do nothing; no restart hint in Settings; a heavier tint for compositors that do not blur.

**Not verified:** nothing here was run on Linux. Hermes ships Electron 44.9.3.

**WSL:** WSLg runs its own compositor (Weston) and remotes each window to Windows as a plain surface. Neither a Linux compositor blur nor DWM acrylic applies behind it, so WSL on this machine cannot be the test bed for path 1. A real Linux desktop with KDE or Hyprland is needed.

## 6. Presets (the "glass family")

Today: Acrylic, Frosted, Sanded, Expressive. They only retune `--acrylic-chrome-keep`, blur and grain.

A preset should own the whole material: tint depth per tier, grain, stroke, highlight, corner radius, shadow. Proposed family:

| Preset | Character | Needs |
|---|---|---|
| Acrylic | Windows 11: tint, luminosity, fine grain | exists |
| Frosted | Heavier tint, soft white veil | exists; add a brighter stroke |
| Sanded | Frosted with visible grain | exists |
| Mica | Opaque-ish, wallpaper-tinted, no live blur | exists as "Smooth Drag" material; promote to a preset |
| Liquid | Apple-style: bright specular edge, inner refraction rim, rounder corners, lighter tint | new: tokens for edge highlight and rim, `--radius` scaling; refraction (`feDisplacementMap`) only works where page pixels are behind, so no-Glass only |
| Clear | Minimal tint, strong stroke | new, token-only |

## 7. How this was measured

A second Hermes window was started from the installed source with its own `HERMES_HOME` and user-data directory and a debugging port, so the running app was not touched. Computed styles, clip paths and the list of elements painting under each open flyout were read over CDP. The same window is used to verify packet A1.

## 8. Packet A1 result (2026-11-10)

Built by agy from `docs/packets/A1_no-bare-transparency.md`, audited and measured in the probe window. `plugin.js` after A1 (see `git diff`). Not deployed to the live plugin folder and not committed.

| Check | Result |
|---|---|
| `node --check plugin.js` | pass |
| Tooltip text | `rgb(230, 237, 243)` on the flyout plate (was `rgb(13, 17, 23)`); hole cut in `[data-contrib-shell]`; 0 elements painting beneath |
| Active pill (`aria-pressed="true"` + `bg-background`) | alpha 0.59 (was 0) |
| Rounded `bg-background` box and `bg-background/55` group | alpha 0.45 (was 0) |
| `fixed inset-0 bg-background/90` scrim | alpha 0.52, no `backdrop-filter` (was 0 with blur) |
| A `<body>`-level layer at z-index 29 under a menu and under the palette | hole cut (was never cut) |
| A `<body>`-level surface at z-index 300 marked `data-acrylic-flyout`, over an open menu | cuts the menu; is not cut by it |
| Idle with a flyout open | 0 style mutations in 1.5 s (no observer loop) |
| After closing the palette | only the composer's permanent hole remains |

Not verified: the old 97-check mock-DOM suite (`verify_terminal_acrylic.mjs` no longer exists at the path the handoff names); Triage's real card in a live session (the probe has no backend, so Triage shows nothing); light mode; the no-Glass branch.

Audit fixes after agy's run, by the orchestrator:
- Two new rules used `:is(a, b)` inside `both()`. `both()` splits its argument on commas, so the selectors were mangled and the rounded-box rule did not apply. Rewritten without `:is()`.
- `layerRank` ran once per layer pair. Now cached per sync.

Found in passing, not changed: `plugin.js` (the `composer-root` rule) passes `[data-slot='composer-dock']:is(:hover, :focus-within) …` through `both()`, which mangles it the same way.

## 9. Goldfish review (agy, `gemini-3.8-flash-high`)

- **egm-design** reviewed this document and A1. Accepted: sticky bars and host blurs rank above the cosmetic gaps (section 4 items 3 and 4 are the next packet); rank caching; the preset list needs pruning before it is built ("Liquid" cannot refract over DWM Glass; "Sanded" is "Frosted" plus grain). Noted, not acted on: holes stay cut while the window is unfocused, so a flyout then sits on the flat fallback tint. Rejected: "z-index ranking is broken because the app root is `z-index: auto`" — the app root is never a body-layer target, and surfaces inside it are meant to rank lowest; "nested flyouts must not cut their parent" — a child flyout is above its parent, so the parent is cut on purpose.
- **egm-codebase-details**: the first run could not read files outside its workspace and returned nothing. The re-run, from inside the Hermes source tree, was cut off by a denied read and resumed once to deliver what it had checked. It could not open `plugin.js`, `translucency.ts` or Triage's markup, so those claims are reviewed by the orchestrator only. Accepted: the active pagination button (`pagination.tsx:39-41`, `aria-current="page"`, `rounded` + `bg-background`) would have been painted as a well; the pill rule now includes `[aria-current='page']` and the well rule excludes `[aria-current]` (applied after the probe window was closed, so checked by `node --check` only). Accepted as a map correction: Hermes menus and popovers paint through `menuSurfaceClass` (`components/ui/menu.ts:9-10`), `bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)]` plus `backdrop-blur-md`, which belongs in the Flyout row of section 2; under Glass the plugin turns that blur off. Confirmed correct: `segmented-control.tsx:53`, `prepared-image-recovery.tsx:40`, `artifacts/index.tsx:366`, `notifications.tsx:43`, `desktop-install-overlay.tsx:533`, `electron/main.ts:1598`. Rejected: a leading-space selector missing first-in-list classes (the rule also has a `[class^='bg-background/']` form).
