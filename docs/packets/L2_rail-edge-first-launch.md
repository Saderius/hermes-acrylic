# L2 — Sidebar-only Glass paints the whole window opaque until a setting changes

**Status:** brief for agy, go given 2026-11-10 (user: "Yes, trace it").
**Repository:** Hermes Desktop work copy, branch `linux-glass` (on top of commit `9977c44082`). Renderer fix, all platforms.

**Reported by the Linux tester:** "on the very first launch the window was fully opaque white until I changed the settings."

## Verified cause

[VERIFIED] Reproduced on Windows 11 on 2026-11-10 with a fresh profile and no plugins: `data-hermes-glass` set, `data-hermes-glass-scope="sidebar"`, `--translucency-glass-keep: 71%`, the rail `[data-slot="sidebar"]` present with its right edge at 260px, and `--glass-rail-edge` still `0px`. `<body>` therefore painted `linear-gradient(to right, <glass> 0px, <opaque chrome> 0px)`: opaque across the whole window.

Mechanism, `apps/desktop/src/store/translucency.ts`:
- `applyGlassSurfaces` calls `startRailTracking()` when the store first syncs, which is before React has mounted the sidebar.
- `measureRailEdge()` finds no rail, writes `--glass-rail-edge: 0px` and returns. No observer is attached, because there is no element to observe.
- Nothing measures again until the next store sync (a settings change) or a window resize. The comment in `startRailTracking` names this case ("a rail we haven't FOUND yet") but only handles it on the next sync.

## COST RULES

- No shell commands (a denied command ends the run), no browser, no URL reading, no MCP tools. Never open `node_modules`. Never read outside this project folder. Do not edit documentation files (`*.md`).
- Read only: `apps/desktop/src/store/translucency.ts` lines 190–280; `apps/desktop/src/store/translucency.test.ts` lines 1–56 and 224–280. Nothing else.
- Small find-and-replace edits only. Never re-save or rewrite a whole file. Keep line endings. Delete code you replace.
- Follow the file's style: no semicolons, single quotes, 2-space indent, a blank line before `return` and around `if` blocks as the file does, `const` arrow functions for module helpers.

## CHANGES

### 1. `apps/desktop/src/store/translucency.ts`

a. Directly after the line `let railTrackingOn = false` add:

```ts
// Watches for a rail that does not exist yet. Glass is applied on the store's
// first sync, which is before React mounts the sidebar, and a ResizeObserver
// cannot be put on an element that is not there. Without this the seam stays
// at 0px, the whole window paints opaque, and glass only appears after the
// next settings change or window resize.
let railWaiter: MutationObserver | null = null

const stopWaitingForRail = (): void => {
  railWaiter?.disconnect()
  railWaiter = null
}

const waitForRail = (): void => {
  if (railWaiter || typeof MutationObserver === 'undefined' || !document.body) {
    return
  }

  railWaiter = new MutationObserver(records => {
    if (!records.some(record => record.addedNodes.length > 0)) {
      return
    }

    if (document.querySelector('[data-slot="sidebar"]')) {
      stopWaitingForRail()

      if (railTrackingOn) {
        measureRailEdge()
      }
    }
  })
  railWaiter.observe(document.body, { childList: true, subtree: true })
}
```

b. In `measureRailEdge`, replace

```ts
    root.style.setProperty('--glass-rail-edge', '0px')

    return
  }
```

with

```ts
    root.style.setProperty('--glass-rail-edge', '0px')
    waitForRail()

    return
  }

  stopWaitingForRail()
```

c. In `stopRailTracking`, directly after the line `railTrackingOn = false` add:

```ts
  stopWaitingForRail()
```

`measureRailEdge` is a `const` arrow function declared after `waitForRail`. That is fine: `waitForRail` only calls it later, from the observer callback. Do not reorder the existing functions.

### 2. `apps/desktop/src/store/translucency.test.ts`

Inside `describe('frost and area', …)`, directly after the test `'publishes the area as an attribute only while glass is on'` (after its closing `})`), add:

```ts

  // Glass is applied on the store's first sync, before the sidebar mounts. The
  // seam has to follow the rail once it appears, or the window stays opaque
  // until the next settings change.
  it('measures the rail edge when the sidebar mounts after glass is already on', async () => {
    if (!GLASS_SUPPORTED) {
      return
    }

    const edge = () => document.documentElement.style.getPropertyValue('--glass-rail-edge')

    setTranslucency(50)
    setTranslucencyScope('sidebar')
    setTranslucencyMode('glass')
    expect(edge()).toBe('0px')

    const rail = document.createElement('div')

    rail.setAttribute('data-slot', 'sidebar')
    rail.getBoundingClientRect = () => ({ left: 0, right: 260 }) as DOMRect
    document.body.append(rail)

    try {
      await vi.waitFor(() => expect(edge()).toBe('260px'))
    } finally {
      rail.remove()
    }
  })
```

## DO NOT

- Do not change `startRailTracking`'s existing logic, the ResizeObserver, the resize listener, or `applyGlassSurfaces`.
- Do not add polling, timers or `requestAnimationFrame` loops.
- Do not touch `apps/desktop/electron/**`, `apps/shared/**`, `styles.css`, or any other file.
- Do not edit any `*.md` file.

## TESTS (orchestrator runs them)

1. `vitest run src/store/translucency.test.ts`: all pass, including the new test.
2. The new test fails when change 1 is reverted.

Final message: file:line list of the changes.
