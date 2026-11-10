# A1 — No bare transparency: tooltips, layer cutout, emptied `bg-background` fills

**Status:** brief for agy, go given 2026-11-10 (user: "you send anti-gravity agents to do the stuff").

**User's words:** "UI elements that either don't have acrylic on them, they're just transparent, or our acrylic implementation completely broke it … if something is not just transparent in Hermes, then it shouldn't be just transparent in our thing."

**Only file you edit: `plugin.js`** (repo root). Nothing else.

## Verified causes

Measured on a live Hermes window over CDP on 2026-11-10 (theme `nous`, dark, Glass on).

1. [VERIFIED] **Tooltips are see-through and unreadable.** Hermes tooltips are `class="tooltip-bubble … bg-foreground … text-background"` with `data-slot="tooltip-content"` and a `data-side` attribute, inside `[data-radix-popper-content-wrapper]`.
   - The flyout rule at `plugin.js:360` (`[data-radix-popper-content-wrapper] > [data-side]`) outranks the tooltip rule at `plugin.js:388`, so the tooltip gets the 72%-alpha `--acrylic-flyout` fill and a 48px shadow. Measured background alpha: 0.725.
   - The inverted-control rule at `plugin.js:523` (`[class*='bg-foreground'][class*='text-background']`) sets the text to the dark theme seed. Measured text colour `rgb(13, 17, 23)` on a dark plate.
   - `[data-slot='tooltip-content']` is not in `FLYOUT_CUTOUT_SELECTOR` (`plugin.js:1259`), so nothing is cut out under it and the text below shows through.
2. [VERIFIED] **Anything portaled to `<body>` is never cut out.** `FLYOUT_CUTOUT_TARGET_SELECTOR` (`plugin.js:1258`) only lists in-shell containers. Other plugins mount `position: fixed` layers as direct children of `<body>` (measured: Triage's `div.hsj-overlay`, z-index 29), so their chips show through menus, the command palette and tooltips.
3. [VERIFIED] **Other plugins' floating cards are not cutout sources.** Triage's card `.hsj-detail` floats over the chat with a translucent fill and no hole under it, so chat text runs through it. It opens with a 180ms CSS transition and nothing re-syncs the mask when the transition ends.
4. [VERIFIED] **`--background: transparent` (`plugin.js:183`) empties every element that used it as a fill.** `bg-background` resolves to `var(--dt-background)`, which the plugin clears. Example: the active pill of `SegmentedControl` (`aria-pressed="true"`, class token `bg-background`) and the first-run scrim (`fixed inset-0 … bg-background/90 backdrop-blur-md`).

## COST RULES

- No shell commands (a denied command ends the run), no browser, no URL reading, no MCP tools. Never read outside this project folder. Do not edit documentation (no `.md` file).
- Read only these ranges of `plugin.js`, once each: lines 96–130 and 128–150 (tokens), 340–420 (buttons, flyouts, tooltips), 1252–1475 (cutout mask). Do not read the whole file.
- Small find-and-replace edits only. Never re-save or rewrite the whole file. Keep line endings as they are. Delete code you replace: no `_old…` copies, no commented-out code, do not wrap existing functions — edit them.
- Project rules: plain ESM, no JSX, no build step, no new imports, no new dependencies. All helpers at module top level. The CSS lives in the `CSS` template string; use the existing `both()`, `underGlass()`, `noGlass()` helpers for every new rule. Never reference `--ui-bg-*` or `--dt-*` variables inside a material token definition (only `--theme-*-seed`), to avoid a custom-property cycle. No hard-coded `#000000` / `#ffffff` literals.
- Every DOM call you add must be guarded the way the surrounding code is (`typeof x === 'function'`), because a mock DOM without these APIs runs this file in tests.

## CHANGES

### 1. New token `--acrylic-scrim`

In the `:root { … }` token block add, after the `--acrylic-overlay-card` line:

```
  --acrylic-scrim: color-mix(in srgb, var(--theme-background-seed, #FCFCFC) 46%, transparent);
```

In the `:root.dark { … }` token block add, after its `--acrylic-overlay-card` line:

```
  --acrylic-scrim: color-mix(in srgb, var(--theme-background-seed, #202020) 52%, transparent);
```

### 2. Tooltips

Replace the whole block that starts with the comment `/* Tooltips */` and ends with the closing brace of the rule that sets `fill: var(--acrylic-tooltip) !important;` (the rule for `[data-slot='tooltip-arrow']` and `[role='tooltip'] svg`) with exactly:

```
/* Tooltips: a small Tier 3 plate. installFlyoutCutoutMask() cuts the hole under it. */
${both(`[data-radix-popper-content-wrapper] > [data-slot='tooltip-content'][data-side]`)} {
  background-color: var(--acrylic-flyout) !important;
  background-image: var(--acrylic-flyout-grain) !important;
  color: var(--acrylic-popover-fg) !important;
  border: 1px solid var(--layer-stroke) !important;
  box-shadow: var(--layer-hi), 0 4px 14px rgba(0, 0, 0, 0.32) !important;
  opacity: 1 !important;
  filter: none !important;
}
${both(`[data-slot='tooltip-content'] [data-slot='tooltip-arrow']`)} {
  display: none !important;
}
```

Do not add any `backdrop-filter` to this rule: the existing flyout rules already set it for `[data-radix-popper-content-wrapper] > [data-side]`.

### 3. Fills that `--background: transparent` emptied

Directly after the rule under the comment `/* Buttons: only outline/secondary get the acrylic fill */` add exactly:

```
/* --background is cleared at :root so the window field stays see-through.
   Elements that used it as a FILL get a material back: raised pills (Tier 2),
   boxed wells (Tier 1), full-window scrims. Structural fields stay clear. */
${both(`:is([aria-pressed='true'], [data-state='active'], [data-state='on'], [aria-selected='true'])[class*='bg-background']`)} {
  background-color: var(--control-fill-hover) !important;
  box-shadow: var(--layer-hi), 0 0 0 1px var(--layer-stroke) !important;
}
${both(`[class~='bg-background']:is([class~='rounded'], [class~='rounded-md'], [class~='rounded-lg'], [class~='rounded-xl'], [class~='rounded-2xl'], [class~='rounded-full']):not([aria-pressed]):not([aria-selected]):not([data-slot^='sidebar']), [class*=' bg-background/']:not(.fixed):not([data-slot^='sidebar']), [class^='bg-background/']:not(.fixed):not([data-slot^='sidebar'])`)} {
  background-color: var(--acrylic-recessed) !important;
}
${both(`.fixed.inset-0[class*='bg-background/']`)} {
  background-color: var(--acrylic-scrim) !important;
}
${underGlass(`.fixed.inset-0[class*='bg-background/'], [data-slot='dialog-overlay']`)} {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
```

### 4. Public hook and Triage card as flyout surfaces (CSS)

Directly after the rule for `[data-slot='statusbar'] [data-slot='dropdown-menu-content']` add exactly:

```
/* Opt-in hook for other plugins: mark a floating surface with data-acrylic-flyout
   and it gets the Tier 3 fill plus a cutout hole. Triage's detail card is listed by class. */
${both(`[data-acrylic-flyout], .hsj-detail`)} {
  background-color: var(--acrylic-flyout) !important;
  background-image: var(--acrylic-flyout-grain) !important;
}
${underGlass(`[data-acrylic-flyout], .hsj-detail`)} {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
```

### 5. Cutout sources

In the `FLYOUT_CUTOUT_SELECTOR` array add these four entries directly after `"[data-slot='dialog-content']",`:

```
  "[data-slot='hover-card-content']",
  "[data-slot='tooltip-content']",
  "[data-acrylic-flyout]",
  ".hsj-detail",
```

### 6. Body layers become cutout targets, in paint order

Add these three helpers at module top level, directly above `let cutoutSyncing = false`:

```js
// A "body layer" is a direct element child of <body>: the app root, Radix
// portals, toast regions, other plugins' fixed overlays.
function topLayerOf(el) {
  if (typeof document === 'undefined' || !document.body) return null
  let node = el
  while (node && node.parentNode && node.parentNode !== document.body) node = node.parentNode
  return node && node.parentNode === document.body ? node : null
}

function layerRank(layer, win) {
  let z = 0
  const style = layer && win && typeof win.getComputedStyle === 'function' ? win.getComputedStyle(layer) : null
  if (style) {
    const parsed = parseInt(style.zIndex, 10)
    if (!isNaN(parsed)) z = parsed
  }
  const kids = document.body && document.body.children ? Array.from(document.body.children) : []
  return { z, index: kids.indexOf(layer) }
}

// True when layer a paints above layer b.
function layerAbove(a, b) {
  return a.z > b.z || (a.z === b.z && a.index > b.index)
}
```

Then edit `syncFlyoutCutoutMask()`:

a. Replace the two lines

```js
    const rawTargets = document.querySelectorAll(FLYOUT_CUTOUT_TARGET_SELECTOR)
    if (!rawTargets || !rawTargets.length) return
    const targets = Array.from(rawTargets).filter((item, index, self) => self.indexOf(item) === index)
```

with

```js
    const rawTargets = document.querySelectorAll(FLYOUT_CUTOUT_TARGET_SELECTOR)
    const targets = Array.from(rawTargets || []).filter((item, index, self) => self.indexOf(item) === index)
    // Body layers that hold none of the listed targets (the app root holds them
    // and is cut through them) are cut too, so portaled plugin UI never bleeds.
    const bodyLayers = new Set()
    const bodyKids = document.body && document.body.children ? Array.from(document.body.children) : []
    for (const layer of bodyKids) {
      if (!layer || layer.nodeType !== 1) continue
      if (layer.tagName === 'SCRIPT' || layer.tagName === 'STYLE') continue
      if (typeof layer.hasAttribute === 'function' && layer.hasAttribute('data-hermes-acrylic-xray')) continue
      if (targets.indexOf(layer) !== -1) continue
      if (typeof layer.contains === 'function' && targets.some(t => layer.contains(t))) continue
      bodyLayers.add(layer)
      targets.push(layer)
    }
    if (!targets.length) return
```

b. `const win = …` is currently declared after `clearAll`. Leave it where it is.

c. Inside the `for (const target of targets)` loop, replace

```js
      const targetRect = target.getBoundingClientRect()
      if (targetRect.width <= 0 || targetRect.height <= 0) continue
```

with

```js
      const targetRect = target.getBoundingClientRect()
      const isBodyLayer = bodyLayers.has(target)
      if (!isBodyLayer && (targetRect.width <= 0 || targetRect.height <= 0)) continue
      const targetRank = isBodyLayer ? layerRank(target, win) : null
```

d. Inside the inner `for (const el of openFlyouts)` loop, directly after the line `if (typeof el.contains === 'function' && el.contains(target)) continue`, add

```js
        if (isBodyLayer) {
          const elLayer = topLayerOf(el)
          if (!elLayer || !layerAbove(layerRank(elLayer, win), targetRank)) continue
        }
```

e. In the same inner loop, replace

```js
        if (lx + lw <= 0 || ly + lh <= 0 || lx >= targetRect.width || ly >= targetRect.height) {
          continue
        }
```

with

```js
        if (!isBodyLayer && (lx + lw <= 0 || ly + lh <= 0 || lx >= targetRect.width || ly >= targetRect.height)) {
          continue
        }
```

f. Replace

```js
        const outer = `M 0 0 H ${Math.ceil(targetRect.width + 2)} V ${Math.ceil(targetRect.height + 2)} H 0 Z`
        const clip = `path(evenodd, "${outer} ${holes.join(' ')}")`
        if (target.style && typeof target.style.setProperty === 'function') {
          target.style.setProperty('clip-path', clip, 'important')
        }
```

with

```js
        // A body layer is often a zero-size fixed box whose children overflow it,
        // so its outer rectangle is a huge box around its origin, not its own size.
        const outer = isBodyLayer
          ? 'M -20000 -20000 H 20000 V 20000 H -20000 Z'
          : `M 0 0 H ${Math.ceil(targetRect.width + 2)} V ${Math.ceil(targetRect.height + 2)} H 0 Z`
        const clip = `path(evenodd, "${outer} ${holes.join(' ')}")`
        if (target.style && typeof target.style.setProperty === 'function') {
          const current = typeof target.style.getPropertyValue === 'function' ? target.style.getPropertyValue('clip-path') : ''
          if (current !== clip) target.style.setProperty('clip-path', clip, 'important')
        }
```

g. Replace the `finally` block of `syncFlyoutCutoutMask()`

```js
  } finally {
    cutoutSyncing = false
  }
```

with

```js
  } finally {
    // Drop the mutation records our own style writes just queued, so the
    // observer does not call us again for them.
    if (cutoutObserver && typeof cutoutObserver.takeRecords === 'function') cutoutObserver.takeRecords()
    cutoutSyncing = false
  }
```

`cutoutObserver` is declared with `let` below the function. Move the four declarations `let cutoutObserver = null`, `let cutoutResizeHandler = null`, `let cutoutResizeObserver = null`, `const observedComposerNodes = new Set()` so they sit directly above `let cutoutSyncing = false` (above the three new helpers is fine). Do not duplicate them.

### 7. Re-sync when a flyout's own transition or animation ends

a. Next to the moved declarations add:

```js
let cutoutMotionHandler = null
let cutoutMotionFrame = 0
```

b. In `installFlyoutCutoutMask()`, inside `start`, directly after the `window.addEventListener('resize', …)` block, add:

```js
    // A surface that fades or grows in (Triage's card) is skipped while it is
    // still invisible; measure again when its own transition or animation ends.
    if (typeof document.addEventListener === 'function') {
      cutoutMotionHandler = event => {
        const el = event && event.target
        if (!el || typeof el.closest !== 'function' || !el.closest(FLYOUT_CUTOUT_SELECTOR)) return
        if (cutoutMotionFrame) return
        const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : cb => setTimeout(cb, 16)
        cutoutMotionFrame = raf(() => {
          cutoutMotionFrame = 0
          schedule()
        })
      }
      document.addEventListener('transitionend', cutoutMotionHandler, true)
      document.addEventListener('animationend', cutoutMotionHandler, true)
    }
```

c. In `disposeCutoutMask()`, directly before `installFlyoutCutoutMask.done = false`, add:

```js
  if (cutoutMotionHandler && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
    document.removeEventListener('transitionend', cutoutMotionHandler, true)
    document.removeEventListener('animationend', cutoutMotionHandler, true)
  }
  cutoutMotionHandler = null
  cutoutMotionFrame = 0
```

## DO NOT

- Do not touch `FLYOUT_CUTOUT_TARGET_SELECTOR`, the terminal code, the focus tracker, the X-Ray code, the theme objects, the presets, the Appearance card, or `register()`.
- Do not change `--background: transparent !important` or any other line in the "Global 4-Tier Material Token Architecture" block.
- Do not change the rule for `[class*='bg-foreground'][class*='text-background']`.
- Do not add `backdrop-filter: blur(...)` under Glass anywhere.
- Do not edit `README.md`, `SURFACE_TIER_MAP.md` or any other document.

## TESTS (orchestrator runs them)

1. `node --check plugin.js`.
2. `verify_terminal_acrylic.mjs` mock-DOM suite: still 97/97.
3. Live window over CDP: a tooltip has readable text (light on dark), sits over a hole in `[data-contrib-shell]`, and nothing paints beneath it.
4. Live window: a fixed `<body>`-level layer with text, z-index 29, is cut under an open dropdown menu and under the command palette; a tooltip layer above a menu is not cut by the menu.
5. Live window: an element with `aria-pressed="true"` and class `bg-background` has a non-transparent background; `[data-slot='sidebar-inset']` stays transparent.
6. No mutation-observer loop: with a menu open and nothing moving, `syncFlyoutCutoutMask` is not called repeatedly.

Final message: file:line list of the changes.
