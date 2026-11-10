# Hermes Acrylic: Universal Theme-Agnostic 4-Tier Material Token Architecture (`SURFACE_TIER_MAP.md`)

## 1. Architectural Overview

Prior implementations of acrylic styling relied on an element-by-element "whack-a-mole" approach bound exclusively to a single custom theme (`windows-acrylic`). When a user switched to another theme (e.g. Nous, Tokyo Night, Catppuccin, Dracula, Solarized, or Mono), Hermes Desktop's theme engine unmounted the custom CSS style element, causing all overridden surfaces—the terminal, `Ctrl+K` Command Palette, user chat bubbles, `"1 file changed"` tool cards, and composer—to revert to opaque dark slabs.

The **Theme-Agnostic Universal Acrylic Engine** solves this by:
1. **Decoupling Acrylic Mode from Any Single Theme**:
   Acrylic styling is managed via a global persistent state key (`hermes-acrylic-enabled`, default `true`). The engine dynamically injects and maintains `<style id="hermes-acrylic-global-css">` directly in `document.head`, and tags the document root with `data-hermes-acrylic-enabled`.
2. **Deriving Materials from Active Theme Seeds via `color-mix` (WinUI 3 Tint + Luminosity Formula)**:
   Every theme in Hermes Desktop (`apps/desktop/src/styles.css:297-475` and `src/themes/context.tsx:339-391`) sets root color seeds:
   - `--theme-background-seed` and `--ui-bg-chrome` (main chrome seed)
   - `--theme-sidebar-seed` and `--ui-bg-sidebar` (sidebar seed)
   - `--theme-card-seed` and `--ui-bg-editor` (card & editor seed)
   - `--theme-elevated-seed` and `--ui-bg-elevated` (popover & flyout seed)
   - `--theme-bubble-seed` (user message bubble seed)
   - `--theme-foreground` & `--theme-primary`
   By defining all four acrylic tiers through `color-mix(in srgb, ...)`, the engine mixes the theme's computed background with a 6% harmonic touch of `--theme-primary`. **Any theme the user picks in Hermes Desktop automatically gains authentic Windows 11 Acrylic tinted with that specific theme's signature color palette and brand hue!**
   To strictly prevent W3C CSS Custom Properties §2.3 dependency cycles (`A -> B -> A` resulting in `guaranteed-invalid` at computed-value time), Tier 1-3 token definitions (`--control-fill`, `--control-fill-hover`, `--acrylic-flyout`, `--acrylic-tooltip`) reference **ONLY** the theme seed variables (`--theme-card-seed`, `--theme-elevated-seed`, `--theme-background-seed`, `--theme-sidebar-seed`), never referencing the overridden host alias variables (`--ui-bg-editor`, `--ui-bg-elevated`).
3. **Packshot Studio §5.4 Cutout Mask Architecture (`clip-path: path(evenodd, ...)`)**:
   Under live Glass, stacking CSS `backdrop-filter` over translucent Windows 11 DWM swapchains causes Chromium to composite an opaque dark plate or corrupt translucent blurs. Packshot Studio solved this by cutting a geometric hole in the underlying DOM:
   `installFlyoutCutoutMask()` listens for open flyouts (`Ctrl+K`, popovers, dropdowns, context menus, modal dialogs, Settings modal cards, and Composer Surface) and applies `clip-path: path(evenodd, "<outer rect> <hole rounded-rect>")` to underlying layers (`[data-contrib-shell]`, `[data-persistent-terminal]`, `[data-slot='composer-bounds']`, `[data-slot='composer-surface']`, and `[data-overlay-surface] [data-glass-raised]`).
   - **Directly underneath the open flyout, Settings card, or Composer Surface, the in-page chat text, terminal, and cards are 100% physically clipped out (zero text bleed-through)!**
   - **Exposed underneath that hole is `<body>` and 100% pure, live Windows 11 DWM Desktop Acrylic!**
   - When `Ctrl+K`, Select dropdowns, or top search badges open on top of Settings or the Composer Surface, the underlying surface itself receives a cutout hole directly under them (nested modal and overlay stacking)!
   - Consequently, Tier 3 flyouts, Settings cards, and Composer Surface under Glass use `backdrop-filter: none !important`, completely bypassing Chromium's backdrop-filter dark plate artifact! Under no-Glass fallback, they retain `backdrop-filter: blur(24px) saturate(1.3) !important`.

---

## 2. The 4 Surface Tiers

```
┌────────────────────────────────────────────────────────────────────────┐
│  Tier 3: Floating Flyouts, Modals, Settings & Composer Surface         │
│          Flyouts:    --acrylic-flyout: color-mix(--theme-elevated 68%) │
│          Settings:   --acrylic-overlay-card: color-mix 42% dark / 48% lt│
│          Composer:   [data-slot='composer-surface'] --acrylic-flyout   │
│          Nav:        [data-tour='overlay-nav'] var(--acrylic-sidebar)  │
│          Texture:    --acrylic-flyout-grain (3.5% Win11 SVG noise)     │
│          Cutout:     clip-path: path(evenodd, ...) on underlying shell │
│                      and [data-slot='composer-bounds']                 │
│          Glass:      backdrop-filter: none !important (pure DWM blur)  │
│          Fallback:   backdrop-filter: blur(24px) saturate(1.3)        │
│          Root Fix:   Styled on outer portal (<DialogPrimitive.Content>)│
│          Header:     [data-slot='command-input-wrapper'] recessed well │
│                      with crisp bottom accent focus stroke             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ floats / cuts out over shell
┌───────────────────────────────────▼────────────────────────────────────┐
│  Tier 2: Raised In-Page Cards & Widgets (Tool blocks, Chat Bubbles)    │
│          --control-fill: color-mix(--theme-card-seed 44%/52%)          │
│          --bubble-fill:  color-mix(--theme-bubble-seed 50%/56%)        │
│          Search Bars:    backdrop-filter: blur(16px) saturate(1.2)    │
│          Cards:          backdrop-filter: none !important (DWM blur)   │
│          Cutout Targets: [data-contrib-shell], [data-persistent-term], │
│                          [data-slot='composer-bounds'], and            │
│                          [data-overlay-surface] [data-glass-raised]    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ sits inside
┌───────────────────────────────────▼────────────────────────────────────┐
│  Tier 1: Recessed / Lane Surfaces (Kanban lanes, pill wells)           │
│          --acrylic-recessed: color-mix(--theme-sidebar-seed 34%/32%)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ sits on
┌───────────────────────────────────▼────────────────────────────────────┐
│  Tier 0: Base Window Field                                             │
│          transparent !important over body { --material-tint-glass }    │
│          --acrylic-chrome-keep: 40%/72% (authentic theme bg tint)      │
│          Sidebar: --acrylic-sidebar-tint: 28% --theme-sidebar-seed tint│
└────────────────────────────────────────────────────────────────────────┘
```

---

### Tier 0 — Base Window Field

- **Purpose**: Clears all intermediate container boxes so Windows 11 DWM native Acrylic compositor blurs the OS desktop directly through `<body>`'s `--material-tint-glass`.
- **`<body>` Chrome Tint (WinUI 3 Tint + Luminosity Formula)**:
  - Derived from `--ui-bg-chrome` and `--theme-background-seed` with harmonic `--theme-primary` touch:
    ```css
    --acrylic-theme-base: color-mix(in srgb, var(--ui-bg-chrome, var(--theme-background-seed, #202020)) 92%, var(--theme-primary, #60CDFF));
    --material-tint-glass: color-mix(in srgb, var(--acrylic-theme-base) var(--acrylic-chrome-keep, 46%), transparent);
    --material-tint: color-mix(in srgb, var(--acrylic-theme-base) 65%, transparent);
    --acrylic-sidebar-tint: color-mix(in srgb, var(--ui-bg-sidebar, var(--theme-sidebar-seed, #141418)) 24%, transparent);
    ```
  - **Chrome Keep Percentage (`--acrylic-chrome-keep`)**:
    - **Acrylic (Default)**: Dark `72%`, Light `40%` (WinUI 3 Tint + Luminosity layer carrying genuine theme background color!)
    - **Frosted / Sanded**: `58%`
    - **Expressive**: `68%`
    - **Non-Glass Fallback**: `65%` (over blurred Chat Backdrop)
- **Sidebar Two-Tone Tint**:
  - `[data-slot='sidebar-inner']` paints `--acrylic-sidebar-tint` (`24%` tint of `--ui-bg-sidebar`) so the sidebar and main canvas preserve the theme's two-tone architecture while both letting DWM acrylic shine through.
  - Outer containers (`[data-sidebar='sidebar']`, `[data-slot='sidebar-container']`) stay `transparent` to avoid double-painting.
- **Mapped Root CSS Variables**:
  ```css
  --ui-surface-background: transparent !important;
  --ui-chat-surface-background: transparent !important;
  --ui-editor-surface-background: transparent !important;
  --ui-sidebar-surface-background: transparent !important;
  --ui-terminal-surface-background: transparent !important;
  --dt-background: transparent !important;
  --background: transparent !important;
  --dt-sidebar-bg: transparent !important;
  --sidebar: transparent !important;
  ```
- **UI Components Inheriting Tier 0**:
  - Window root & application shell (`[data-contrib-shell]`, `[data-slot='sidebar-wrapper']`)
  - Kanban board background (`[data-slot='kanban-board']`)
  - Sidebar container & inner rail (`[data-slot='sidebar-inner']`, `[data-sidebar='sidebar']`, `[data-slot='sidebar-container']`)
  - Content column (`[data-slot='sidebar-inset']` in window scope)
  - Split panes & project tree hosts (`[data-pane-host]`, `[data-tree-group]`, `[data-project-tree]`)
  - Terminal slot & persistent overlay wrapper (`[data-terminal-slot]`, `[data-persistent-terminal]`)

- **Unfocused Window Backdrop Reveal (`data-hermes-window-unfocused`)**:
  - **The DWM Acrylic Constraint**: On Windows 11, DWM only renders live desktop Acrylic blur while the window is focused. When the window loses focus (`blur` / `!document.hasFocus()`), DWM drops Acrylic and displays a flat solid surface.
  - **Focused Window Drag Optimization (`:not([data-hermes-window-unfocused])`)**: While the window is focused under Glass, `img[src*='filler-bg0']` and its wrapper container are completely unrendered via `display: none !important; opacity: 0 !important; visibility: hidden !important; content-visibility: hidden !important;`. This strips the engraving image from Chromium's layout/paint tree, eliminating 100% of JPEG compositing overhead during window drag and exposing pure live Windows 11 DWM Desktop Acrylic.
  - **Unfocused Window Reveal (`[data-hermes-window-unfocused]`)**: The instant the window loses focus, Universal Acrylic reveals Hermes's classic engraving Chat Backdrop (`filler-bg0.jpg`) with `mix-blend-mode: difference !important`, `filter: invert(var(--backdrop-invert-mul, 1)) !important`, and rich `opacity: 0.075 !important` (Light) / `0.085 !important` (Dark), and enables theme wallpaper images via `background-image: var(--theme-asset-bg, none) !important` on `body`.
  - **Continuous DOM Mounting (`backdrop.v1 = true`)**: `applyAcrylic()`, `useBackdropPolicy()`, and `register()` keep `setBackdropEnabled(true)` active under Acrylic. `<Backdrop />` remains permanently mounted in the React tree so the transition between focused Acrylic and unfocused engraving backdrop occurs in 0ms purely via CSS selector switching.
  - **Event-Driven Focus Tracking (`installWindowFocusTracker`)**: Coordinates `window` `focus` and `blur` events and `document` `visibilitychange` with `document.hasFocus()` to tag `<html>` with `data-hermes-window-unfocused`. Disabling Acrylic immediately clears the attribute.

---

### Tier 1 — Recessed / Lane Surfaces

- **Purpose**: Subtle sunken wells and grouping lanes that differentiate layout structure without blocking the desktop acrylic blur.
- **Tokens**:
  - **Dark**: `--acrylic-recessed: color-mix(in srgb, var(--theme-sidebar-seed, #141418) 34%, rgba(0, 0, 0, 0.16));`
  - **Light**: `--acrylic-recessed: color-mix(in srgb, var(--theme-sidebar-seed, #F0F0F4) 32%, rgba(0, 0, 0, 0.04));`
- **Mapped Root CSS Variables**:
  ```css
  --ui-bg-quinary: var(--acrylic-recessed) !important;
  --ui-bg-quaternary: var(--acrylic-recessed) !important;
  --ui-bg-tertiary: var(--acrylic-recessed) !important;
  --dt-muted: var(--acrylic-recessed) !important;
  ```
- **UI Components Inheriting Tier 1**:
  - Kanban lanes / columns (`board.tsx`)
  - SearchField boxed wells (`div.inline-flex.rounded-full`)
  - Pill wells, muted badge containers, and secondary recess wells

---

### Tier 2 — Raised In-Page Acrylic Cards & Widgets

- **Purpose**: Interactive, elevated content surfaces that sit directly over the window field (tool blocks like `"1 file changed"`, composer dock, chat bubbles, terminal card, Kanban cards).
- **Translucency & Luminance**:
  Tier 2 uses a rich, balanced tint (44% dark / 52% light) that clearly reads the active theme's surface color while transmitting vibrant live DWM acrylic blur from the desktop.
- **Why NO `backdrop-filter` on In-Page Cards under Glass**:
  Tier 2 cards sit directly over the window background where the desktop is already blurred by DWM. Adding `backdrop-filter` inside Chromium here creates redundant composition passes.
- **Standalone Search Bars**:
  Search bars (`div.inline-flex[class*='rounded-full']:has(> input)`, `[data-slot='search-field']`, `[class*='bg-(--dt-card)']:has(input)`) get `backdrop-filter: blur(16px) saturate(1.2) !important` so scrolling content behind sticky search bars is softly blurred and never clashes with search input text.
- **Tokens**:
  - **Dark**:
    ```css
    --control-fill: color-mix(in srgb, var(--theme-card-seed, #2B2B2B) 44%, rgba(255, 255, 255, 0.05));
    --control-fill-hover: color-mix(in srgb, var(--theme-card-seed, #2B2B2B) 56%, rgba(255, 255, 255, 0.08));
    --bubble-fill: color-mix(in srgb, var(--theme-bubble-seed, var(--theme-card-seed, #2B2B2B)) 50%, rgba(255, 255, 255, 0.06));
    --layer-stroke: color-mix(in srgb, var(--theme-foreground, #FFFFFF) 11%, transparent);
    --layer-hi: inset 0 1px 0 rgba(255, 255, 255, 0.09);
    ```
  - **Light**:
    ```css
    --control-fill: color-mix(in srgb, var(--theme-card-seed, #FFFFFF) 52%, rgba(255, 255, 255, 0.18));
    --control-fill-hover: color-mix(in srgb, var(--theme-card-seed, #FFFFFF) 66%, rgba(255, 255, 255, 0.24));
    --bubble-fill: color-mix(in srgb, var(--theme-bubble-seed, var(--theme-card-seed, #FFFFFF)) 56%, rgba(255, 255, 255, 0.18));
    --layer-stroke: color-mix(in srgb, var(--theme-foreground, #1B1B1B) 10%, transparent);
    --layer-hi: inset 0 1px 0 rgba(255, 255, 255, 0.55);
    ```
- **Mapped Root CSS Variables**:
  ```css
  --ui-bg-editor: var(--control-fill) !important;
  --ui-bg-card: var(--control-fill) !important;
  --dt-card: var(--control-fill) !important;
  --ui-widget-surface-background: var(--control-fill) !important;
  --ui-chat-bubble-background: var(--bubble-fill) !important;
  --ui-chat-bubble-opaque-background: var(--bubble-fill) !important;
  --dt-user-bubble: var(--bubble-fill) !important;
  --dt-secondary: var(--control-fill) !important;
  --dt-accent: var(--control-fill-hover) !important;
  --ui-bg-secondary: var(--control-fill) !important;
  ```
- **UI Components Inheriting Tier 2**:
  - Tool / file diff cards (`[data-slot='tool-block']`, `[data-slot='file-diff-panel']`, `[class*='ui-widget-surface-background']`)
  - User and chat bubbles (`[data-slot='user-message']`, `[data-slot='group-chat-message-content']`)
  - Kanban cards (`[data-slot='kanban-card']`, `.cursor-grab[class*='bg-(--ui-bg-elevated)']`)
  - Capabilities & Skills cards (`[class*='bg-(--dt-card)']`, `[class*='bg-card']`)
  - Composer dock & attachments container (`[data-slot='composer-dock']`, `[data-slot='composer-attachments']`)
  - Terminal card container (`[data-terminal]`)
  - Secondary & outline buttons (`[data-slot='button'][data-variant='secondary']`, `[data-slot='button'][data-variant='outline']`)

---

### Tier 3 — Floating Flyouts, Popovers, Menus & `Ctrl+K` Command Palette

- **Purpose**: Floating overlays that appear in portals or absolute coordinate spaces sitting on top of in-page content (`Ctrl+K` Command Palette, Filters popovers, Dropdown menus, Context menus, Dialogs).
- **Packshot Studio §5.4 Cutout Mask Architecture (`clip-path: path(evenodd, ...)`)**:
  - **The Problem (Chromium Backdrop Filter over Translucent Windows 11 DWM Swapchains)**:
    Stacking CSS `backdrop-filter: blur(...)` over a live DWM Acrylic window in Chromium produces an opaque dark/purple plate artifact (`image_4939ca.png`) or turns the palette into a flat slab. Furthermore, any opacity animation or transform in Radix `<DialogPrimitive.Content>` triggers W3C Filter Effects Level 2 §11.1 Backdrop Root isolation, capturing an empty transparent buffer.
  - **The Solution (Physical Shell Cutout + Zero Backdrop-Filter Conflict)**:
    - Instead of asking Chromium to sample and blur in-page elements, `installFlyoutCutoutMask()` dynamically measures visible open flyouts (`[role='dialog'][class*='left-1/2']`, `[data-slot='popover-content']`, dropdowns, menus, selects, dialogs).
    - It computes the local coordinates of the flyout relative to the underlying layers (`[data-contrib-shell]` and `[data-persistent-terminal]`).
    - It applies `clip-path: path(evenodd, "${outer} ${holes.join(' ')}")`, carving out a rounded-rectangle hole directly under the flyout!
    - **Underneath that cutout hole, all in-page text, cards, and bubbles are 100% physically clipped out (zero bleed-through)!**
    - **Directly exposed through the hole is `<body>` and live Windows 11 DWM Desktop Acrylic!**
    - Because the underlying DOM is physically removed inside the flyout footprint, Tier 3 flyouts under Glass use `backdrop-filter: none !important`, completely avoiding Chromium's dark plate bug. Under no-Glass fallback, they use `backdrop-filter: blur(24px) saturate(1.3) !important`.
- **WinUI 3 In-App Acrylic Luminosity + Tint + Subtle Noise Grain (Matching Windows 11 Settings)**:
  - **Luminosity & Tint Opacity (68% Dark / 72% Light)**:
    - Balanced tint allowing live desktop Acrylic blur to shine through vibrantly while maintaining crisp text contrast.
  - **Subtle Win11 Acrylic Noise Texture (`--acrylic-flyout-grain`)**:
    - Adds a static tiled SVG noise grain (`fill-opacity='.035'`) via `background-image: var(--acrylic-flyout-grain)` on Tier 3 flyouts and `Ctrl+K`, reproducing the authentic frosted tactile surface of Windows 11 Settings.
  - **Recessed Search Input Well (`[data-slot='command-input-wrapper']`)**:
    - Sits in a recessed well (`--command-input-well`) with a crisp bottom accent focus stroke (`border-bottom: 1px solid color-mix(in srgb, var(--theme-primary, #60CDFF) 55%, var(--layer-stroke))`).
- **Tokens**:
  - **Dark**:
    - `--acrylic-flyout-grain: ${FLYOUT_GRAIN};` (subtle 3.5% opacity noise grain)
    - `--acrylic-flyout: color-mix(in srgb, var(--theme-elevated-seed, #24262E) 68%, rgba(16, 18, 24, 0.14));`
    - `--acrylic-popover: var(--acrylic-flyout);`
    - `--acrylic-popover-fg: var(--theme-foreground, #FFFFFF);`
    - `--acrylic-tooltip: color-mix(in srgb, var(--theme-elevated-seed, #24262E) 92%, rgba(16, 18, 24, 0.06));`
    - `--command-input-well: color-mix(in srgb, var(--theme-background-seed, #141418) 48%, rgba(0, 0, 0, 0.22));`
  - **Light**:
    - `--acrylic-flyout-grain: ${FLYOUT_GRAIN};`
    - `--acrylic-flyout: color-mix(in srgb, var(--theme-elevated-seed, #F9F9FB) 72%, rgba(255, 255, 255, 0.14));`
    - `--acrylic-popover: var(--acrylic-flyout);`
    - `--acrylic-popover-fg: var(--theme-foreground, #1B1B1B);`
    - `--acrylic-tooltip: color-mix(in srgb, var(--theme-elevated-seed, #F9F9FB) 92%, rgba(255, 255, 255, 0.06));`
    - `--command-input-well: color-mix(in srgb, var(--theme-background-seed, #F0F0F4) 45%, rgba(0, 0, 0, 0.04));`
- **Mapped Root CSS Variables**:
  ```css
  --ui-bg-elevated: var(--acrylic-flyout) !important;
  --dt-popover: var(--acrylic-flyout) !important;
  ```
- **UI Components Inheriting Tier 3**:
  - `Ctrl+K` Command Palette HUD (`[role='dialog'][class*='left-1/2']`, `[role='dialog'][aria-label='Command palette']`)
  - `Filters` popover flyout (`[data-slot='popover-content']`)
  - Dropdown & Sub-dropdown menus (`[data-slot='dropdown-menu-content']`, `[data-slot='dropdown-menu-sub-content']`)
  - Context menus (`[data-slot='context-menu-content']`, `[data-slot='context-menu-sub-content']`)
  - Select popovers (`[data-slot='select-content']`)
  - Radix Popper containers (`[data-radix-popper-content-wrapper] > [data-side]`, `[data-radix-popper-content-wrapper]`)
  - Modal dialog content (`[data-slot='dialog-content']`)
  - Hover cards (`[data-slot='hover-card-content']`)
  - Settings & Full-Screen OverlayView Modal Cards (`[data-overlay-surface] [data-glass-raised]`)
  - Composer Surface & Room Composer (`[data-slot='composer-surface']`, `[data-slot='room-composer-surface']`, `.group/composer-surface`)

---

### Settings & Full-Screen OverlayView Acrylic + Packshot Cutout Architecture

1. **Root Cause of Opaque Settings in Native Desktop**:
   In `apps/desktop/src/app/overlays/overlay-view.tsx` and `apps/desktop/src/styles.css:730-742`, Hermes Desktop declared:
   ```css
   :root[data-hermes-glass] [data-glass-raised] {
     --ui-chat-surface-background: color-mix(in srgb, var(--ui-bg-chrome) max(94%, var(--translucency-glass-keep, 100%)), transparent);
     --ui-sidebar-surface-background: color-mix(in srgb, var(--ui-bg-sidebar) max(94%, var(--translucency-glass-keep, 100%)), transparent);
     --ui-editor-surface-background: var(--ui-bg-chrome);
   }
   ```
   Because custom properties set on a descendant (`[data-glass-raised]`) override custom properties set on `:root`, `[data-glass-raised]` overrode `--ui-chat-surface-background` to **94% opaque**, `--ui-sidebar-surface-background` on `aside[data-tour='overlay-nav']` to **94% opaque**, and `--ui-editor-surface-background` on Settings cards/inputs to **100% opaque (`var(--ui-bg-chrome)`)**! Additionally, `[data-overlay-surface]` had `backdrop-blur-[0.125rem]` (`2px` blur) which conflicted with live DWM Acrylic.
2. **Defeating the Descendant Scope with Tier 3 Acrylic Tokens**:
   Universal Acrylic injects specific overrides with `!important` on `[data-glass-raised], [data-overlay-surface] [data-glass-raised]`:
   - `--ui-chat-surface-background: transparent !important;` (removes the 94% opaque backdrop)
   - `--ui-sidebar-surface-background: var(--acrylic-sidebar-tint) !important;` (restores theme sidebar tint)
   - `--ui-editor-surface-background: var(--control-fill) !important;` (Tier 2 card fill for inner cards)
   - `background-color: var(--acrylic-overlay-card, color-mix(in srgb, var(--theme-elevated-seed, #24262E) 42%, transparent)) !important;`
   - `background-image: var(--acrylic-flyout-grain) !important;` (subtle 3.5% Win11 noise texture)
   - Under Glass: `backdrop-filter: none !important;` on both `[data-overlay-surface]` and `[data-glass-raised]`.
   - Under no-Glass: `backdrop-filter: blur(24px) saturate(1.3) !important;`.
   - Left Navigation: `aside[data-tour='overlay-nav']` paints `var(--acrylic-sidebar-tint) !important` with a hairline right border.
   - Main & Grid Layouts: `OverlaySplitLayout .grid[class*='grid-cols-']` and `main` paint `transparent !important`.
3. **Packshot Studio Cutout Mask & Nested Stacking**:
   - `[data-overlay-surface] [data-glass-raised]` is registered in both `FLYOUT_CUTOUT_SELECTOR` and `FLYOUT_CUTOUT_TARGET_SELECTOR`:
     - When Settings opens, `installFlyoutCutoutMask()` cuts a rounded-rectangle hole in `[data-contrib-shell]` and `[data-persistent-terminal]` directly under the Settings card. **Zero chat or terminal text bleeds behind Settings—only `<body>` and 100% pure live Windows 11 DWM Acrylic!**
     - When `Ctrl+K` or a Select/Dropdown menu opens **on top of Settings**, `[data-overlay-surface] [data-glass-raised]` itself receives a cutout hole directly underneath that flyout!
     - Top search badge (`edgeBadge`: `[data-overlay-surface] > div > .absolute.left-1/2.top-0`): Deliberately straddles the top border of `[data-glass-raised]`. Because it is registered in `FLYOUT_CUTOUT_SELECTOR`, `[data-glass-raised]` carves out a capsule hole directly under `edgeBadge`, ensuring the top border line never cuts through the middle of the search box!

---

### Composer Surface Acrylic + Packshot Cutout Architecture

1. **Root Cause of Lack of Acrylic on Composer Surface**:
   Previously, `plugin.js` reset `[data-slot='composer-surface']` to `transparent !important` and relied on its inner `<div class="... -z-10 bg-(--composer-fill)" />` child (`composerInputBacking`). In `styles.css:2192-2198`, when the chat thread was scrolled up and hovered/focused, `--composer-fill` was overridden to `color-mix(in srgb, var(--dt-card) 88%, transparent)`.
   Furthermore, in `apps/desktop/src/app/chat/index.tsx`, `<div data-slot="composer-bounds">` (which wraps the scrolling chat messages / `<Thread />`) is a sibling of `<FloatingComposerSurface>` (`[data-slot='composer-dock']` -> `[data-slot='composer-surface']`). Because `composer-bounds` had no cutout mask, chat messages scrolling behind the composer bled directly through the translucent input well!

2. **Searchbox-Grade Acrylic Treatment for `[data-slot='composer-surface']` (`.group/composer-surface`)**:
   Universal Acrylic elevates the composer surface to authentic Searchbox-grade Tier 3 Acrylic:
   - `--composer-fill: var(--acrylic-flyout) !important;` (on `[data-slot='composer-root']` and `[data-slot='composer-dock']`).
   - `background-color: var(--acrylic-flyout) !important;`
   - `background-image: var(--acrylic-flyout-grain) !important;` (3.5% Win11 SVG tactile noise grain).
   - `border: 1px solid var(--layer-stroke) !important;`
   - `box-shadow: var(--layer-hi), 0 12px 32px rgba(0, 0, 0, 0.28) !important;`
   - Focus ring: `border-color: color-mix(in srgb, var(--dt-composer-ring) 45%, var(--layer-stroke)) !important;` on focus-visible.
   - Clears inner `-z-10` backing layers and fade gradients to `transparent !important`.
   - Under Glass: `backdrop-filter: none !important;` (avoids Chromium dark plate artifacts).
   - Under no-Glass: `backdrop-filter: blur(24px) saturate(1.3) !important;`.

3. **Packshot Studio Sibling Cutout Mask & Z-Order Guard**:
   - `[data-slot='composer-bounds']` and `[data-slot='composer-surface']` are registered in `FLYOUT_CUTOUT_TARGET_SELECTOR`, and `[data-slot='composer-surface']`, `[data-slot='room-composer-surface']`, and `[data-slot='composer-status-stack']` are registered in `FLYOUT_CUTOUT_SELECTOR`.
   - **Sibling Chat Stream Cutout**: When docked, `[data-slot='composer-surface']` cuts a rounded-rectangle hole directly out of its sibling `[data-slot='composer-bounds']`. Chat messages scrolling under the composer are 100% physically clipped out (zero text bleed-through), revealing pure Windows 11 DWM Desktop Acrylic underneath!
   - **Descendant Containment Guard**: Because `composerSurface` is inside `[data-contrib-shell]`, `contribShell.contains(composerSurface)` prevents the main application shell from cutting a hole in itself.
   - **Popped-out Floating Composer**: When popped out into `document.body > [data-composer-owner]`, `composerSurface` is outside `[data-contrib-shell]` and cuts a hole out of `[data-contrib-shell]`, `[data-persistent-terminal]`, and `[data-slot='composer-bounds']` wherever it floats!
   - **Z-Order Overlay Guard**: An explicit guard ensures in-page composer elements never cut holes out of higher-z-index overlays (`[data-overlay-surface]` or `[data-glass-raised]`).
   - **Nested Flyout Overlays**: When a popover, dropdown, or `Ctrl+K` opens over `[data-slot='composer-surface']`, the menu cuts a hole out of `[data-slot='composer-surface']` so composer text and borders never bleed through.
   - **Dynamic ResizeObserver**: `installFlyoutCutoutMask()` attaches a `ResizeObserver` observing `[data-slot='composer-surface']` and `[data-slot='composer-dock']`, automatically updating the cutout geometry in real time as multi-line typing expands the composer height.

---

### Terminal DOM Renderer & Instant 0ms Conversion

1. **Why xterm WebGL was Opaque**:
   xterm runs `allowTransparency: false` by default, so its WebGL `<canvas>` paints an opaque backing pixel. In W3C src-over, alpha = 1.0 emits opaque output to Chromium, and DWM paints zero desktop blur behind opaque pixels.
2. **Instant Fallback on New Terminals (0ms via `getContext`)**:
   `HTMLCanvasElement.prototype.getContext` is patched so that when called for `'webgl2'` or `'webgl'` on an xterm canvas (`.xterm-screen`), it returns `null` when Acrylic is enabled. `WebglAddon` throws immediately at construction (`use-terminal-session.ts:450`), causing xterm to fall back to the native HTML DOM renderer (`.xterm-rows`, default alpha = 0) in **0 milliseconds from frame 0**.
3. **Instant Switch on Existing Terminals (0ms via `setTimeout` Interception)**:
   For existing terminals, `loseTerminalCanvasContext` dispatches `webglcontextlost` while temporarily wrapping `window.setTimeout`. The 3000ms delay in `WebglRenderer.ts:116` is intercepted to **0ms**, firing `onContextLoss` and refreshing the DOM renderer instantaneously.
4. **Universal Scope**:
   `scanTerminalCanvases()` runs whenever `readAcrylicEnabled()` is `true`, operating across all themes!

---

## 3. Comparison Matrix: Tier 2 vs. Tier 3 vs. Settings Modal Card

| Property | Tier 2: Raised In-Page Cards | Tier 3: Floating Flyouts & Portals | Settings & OverlayView Modal Card |
| :--- | :--- | :--- | :--- |
| **Primary Token** | `--control-fill` / `--bubble-fill` | `--acrylic-flyout` | `--acrylic-overlay-card` |
| **Dark Value** | `color-mix(--theme-card-seed 44%)` | `color-mix(--theme-elevated-seed 68%, rgba(16, 18, 24, 0.14))` | `color-mix(--theme-elevated-seed 42%, transparent)` |
| **Light Value** | `color-mix(--theme-card-seed 52%)` | `color-mix(--theme-elevated-seed 72%, rgba(255, 255, 255, 0.14))` | `color-mix(--theme-elevated-seed 48%, transparent)` |
| **Surface Texture** | `none` (or preset sand grain) | `var(--acrylic-flyout-grain)` (3.5% Win11 SVG noise) | `var(--acrylic-flyout-grain)` (3.5% Win11 SVG noise) |
| **Underlying Substrate** | Window Field (DWM OS Desktop) | Cutout hole in in-page DOM elements (pure DWM OS Desktop) | Cutout hole in shell & terminal (pure DWM OS Desktop) |
| **Glass Backdrop Filter**| `none !important` (Search bars: `blur(16px)`) | `none !important` (hole cut out in shell via `clip-path`) | `none !important` (both card & `[data-overlay-surface]`) |
| **Fallback Backdrop Filter** | `none !important` (Search bars: `blur(16px)`) | `blur(24px) saturate(1.3) !important` | `blur(24px) saturate(1.3) !important` |
| **Backdrop Root Anchor** | In-flow card element | Outermost portal container (`<DialogPrimitive.Content>`) | Modal Card (`[data-glass-raised]`) |
| **Animation Policy** | Native | `animation: none !important` (prevents filter cutoff) | Native layout / scroll |
| **Border & Elevation** | Hairline `var(--layer-stroke)`, `var(--layer-hi)` | Hairline `var(--layer-stroke)`, `0 16px 48px rgba(0, 0, 0, 0.55)` | Hairline `var(--layer-stroke)`, `0 16px 48px rgba(0, 0, 0, 0.55)` |
| **Key Targets** | Tool blocks (`"1 file changed"`), Bubbles, Kanban cards, Terminal card | `Ctrl+K` Command Palette, Filters, Menus, Selects, Dialogs, Composer Surface | Settings (`[data-overlay-surface] [data-glass-raised]`) |

---

## 4. Verification and Audit Tooling

1. **Syntax & AST Validation**:
   ```bash
   node --check plugin.js
   ```
2. **Terminal & Composer Acrylic Verification**:
   ```bash
   node verify_terminal_acrylic.mjs plugin.js   # mock-DOM suite, not included in this repository
   ```
   Validates:
   - Zero opaque `--ui-terminal-surface-background` tokens.
   - Zero `#000000` / `#ffffff` hardcoded literals.
   - 0ms `setTimeout` interception in `webglcontextlost`.
   - `HTMLCanvasElement.prototype.getContext` hook.
   - Universal theme coverage across arbitrary themes (`everforest`, `tokyo-night`).
   - Dynamic disable/re-enable state handling.
   - Packshot Studio §5.4 `clip-path: path(evenodd, ...)` cutout mask on `[data-contrib-shell]`, `[data-persistent-terminal]`, `[data-slot='composer-bounds']`, `[data-slot='composer-surface']`, and `[data-overlay-surface] [data-glass-raised]`.
   - Composer surface sibling cutout: `[data-slot='composer-bounds']` cuts out `[data-slot='composer-surface']` while `[data-contrib-shell]` does not cut out its own descendant.
   - Z-order overlay guard: in-page composer elements never cut holes in `[data-overlay-surface]` or `[data-glass-raised]`.
   - Flyout stacking over composer: popovers opening over composer carve out holes in `[data-slot='composer-surface']`.
   - Dynamic ResizeObserver tracking on composer nodes for real-time multiline resize updates.
   - Zero CSS Custom Property cycles (`--control-fill` and `--acrylic-flyout` direct seed binding).
   - `backdrop-filter: none !important` under live Glass and `blur(24px)` under fallback for all Tier 3 elements.
   - Overriding of `[data-glass-raised]` descendant variables (`--ui-chat-surface-background: transparent !important`, `--ui-sidebar-surface-background: var(--acrylic-sidebar-tint) !important`, `--ui-editor-surface-background: var(--control-fill) !important`).
   - Settings cutout stacking: `[data-contrib-shell]` cutout when Settings is open, `[data-glass-raised]` cutout when `Ctrl+K` or Select/Dropdown is open over Settings, and top `edgeBadge` capsule cutout.
   - Settings nav (`[data-tour='overlay-nav']`) and split layout (`.grid[class*='grid-cols-']`) styling.
   - Window focus tracking (`installWindowFocusTracker`, `data-hermes-window-unfocused` on blur / visibilitychange, removal on focus / acrylic disable).
   - Unfocused window backdrop reveal: `display: none !important` on `img[src*='filler-bg0']` while focused under Glass; `display: block !important`, `mix-blend-mode: difference`, `filter: invert(...)`, and opacity `0.075` (light) / `0.085` (dark) when unfocused.
   - Theme wallpaper restore (`--theme-asset-bg` on `body`) when unfocused under Glass.
3. **Runtime Surface Audit (X-Ray)**:
   Triggerable via `Acrylic: Toggle Opaque Surface X-Ray (Audit)` in `Ctrl+K` or Appearance Card.
   Traverses the live DOM, flags any remaining elements with background alpha `> 0.80`, outlines them in dashed magenta, and copies a markdown audit table to the clipboard.
