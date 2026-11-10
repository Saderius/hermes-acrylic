# L1 — Opt-in Glass on Linux: a transparent chat window the compositor can blur

**Status:** brief for agy, go given 2026-11-10 (user: "Yes, write patch").
**Repository:** Hermes Desktop (`NousResearch/hermes-agent`), work copy at commit `2bd378ed1b`, branch `linux-glass`. This is a patch to Hermes core, not to the acrylic plugin.

**User's words:** "There is possibility to have WinUI acrylic on Linux."

## Verified causes

1. [VERIFIED] `apps/shared/src/translucency.ts:202` `translucencySupportedOn()` and `:211` `glassSupportedOn()` return `false` for `linux`, so Settings hides the Window Translucency row and `data-hermes-glass` is never set on Linux.
2. [VERIFIED] `apps/desktop/electron/main.ts`, `chatWindowSurfaceOptions()` (about line 1588) never passes `transparent: true`. On Linux a window is transparent only if it is created that way; it cannot be switched later.
3. [VERIFIED] The defaults make Glass active on a fresh profile wherever it is supported (`normalizeMode` returns `'glass'`, default intensity 29). Turning Linux support on unconditionally would make every Linux window see-through by default, including on desktops whose compositor does not blur.
4. [UNVERIFIED] That a transparent Electron 44 window with `titleBarStyle: 'hidden'` and `titleBarOverlay` behaves on KWin, Hyprland, GNOME and X11. Nothing here has been run on Linux. This is why the feature is behind an explicit opt-in.

## Design

Glass on Linux is **opt-in per launch**: environment variable `HERMES_DESKTOP_LINUX_GLASS=1` or the argument `--linux-glass`. Without the opt-in, nothing changes for anyone.

With the opt-in, the main process reports Glass and translucency as supported, and a chat window is born transparent when Glass is active **at launch**. The compositor supplies the blur. A window that was not born transparent keeps its opaque backing, so switching Glass on in Settings takes effect after a restart.

## COST RULES

- No shell commands (a denied command ends the run), no browser, no URL reading, no MCP tools. Never open `node_modules`. Never read outside this project folder. Do not edit documentation files (`*.md`).
- Read only these, once each:
  - `apps/desktop/electron/translucency.ts` (whole file, about 175 lines)
  - `apps/desktop/electron/translucency.test.ts`: search for `describe('windowBackingOptions'` and read 20 lines from there; read lines 1–60 for the import list
  - `apps/desktop/electron/main.ts`: lines 776–790, 584–602, 1496–1620. This file is over 18,000 lines: never read it whole.
- Small find-and-replace edits only. Never re-save or rewrite a whole file. Keep line endings. Delete code you replace: no `_old…` copies, no commented-out code.
- Follow the file's style: no semicolons, single quotes, 2-space indent, a blank line before `return` when the function body has other statements, JSDoc comments on exported functions.

## CHANGES

### 1. `apps/desktop/electron/translucency.ts` — two new exports

Add at the end of the file:

```ts
/**
 * Whether this launch opted into Glass on Linux.
 *
 * Linux has no first-party Electron material, but a compositor (KWin,
 * Hyprland, Mutter with ext-background-effect-v1, picom) blurs whatever lies
 * behind a transparent window. That needs the window to be transparent, and
 * what is behind it is outside the app's control: on a desktop that does not
 * blur, the window is plainly see-through. So it is never a default. The user
 * asks for it per launch, by environment or by flag.
 */
export function linuxGlassOptIn(
  platform: string,
  env: Record<string, string | undefined>,
  argv: readonly string[]
): boolean {
  return platform === 'linux' && (env.HERMES_DESKTOP_LINUX_GLASS === '1' || argv.includes('--linux-glass'))
}

/**
 * BrowserWindow constructor options that make a Linux chat window transparent
 * for compositor blur. Empty unless this process launched with Linux Glass
 * active: transparency is fixed when a window is created, so a window born
 * opaque stays opaque until the app restarts.
 */
export function windowTransparencyOptions(
  state: TranslucencyState,
  linuxGlassAtLaunch: boolean
): { backgroundColor?: string; transparent?: true } {
  return linuxGlassAtLaunch && glassActive(state) ? { transparent: true, backgroundColor: '#00000000' } : {}
}
```

### 2. `apps/desktop/electron/main.ts`

a. In the import from `'./translucency'` (about lines 587–601) add `linuxGlassOptIn,` directly after `glassSupportedOn,` and add `windowTransparencyOptions` after `windowOpacityOptions` (put a comma after `windowOpacityOptions`).

b. Replace

```ts
const GLASS_SUPPORTED = glassSupportedOn(process.platform, os.release())
// Settings drops the row on Linux, so nativeOpacityFor keeps the fade off there.
const TRANSLUCENCY_SUPPORTED = translucencySupportedOn(process.platform)
```

with

```ts
// Linux joins only when the launch opted in (see linuxGlassOptIn): there the
// material is the compositor's blur behind a transparent window.
const LINUX_GLASS = linuxGlassOptIn(process.platform, process.env, process.argv)
const GLASS_SUPPORTED = glassSupportedOn(process.platform, os.release()) || LINUX_GLASS
// Settings drops the row on Linux, so nativeOpacityFor keeps the fade off there
// unless the launch opted into Linux Glass.
const TRANSLUCENCY_SUPPORTED = translucencySupportedOn(process.platform) || LINUX_GLASS
```

c. Directly after the line `let translucencyState = readPersistedTranslucency()` add

```ts

// Linux Glass is decided once per process: a window is transparent only if it
// is created that way, so the state at launch is the one that counts.
const LINUX_GLASS_AT_LAUNCH = LINUX_GLASS && glassActive(translucencyState)
```

d. In `applyWindowTranslucency`, replace

```ts
          win.setBackgroundColor(glassActive(translucencyState) ? '#00000000' : getWindowBackgroundColor())
```

with

```ts
          // On Linux only a window born transparent may drop its backing; an
          // opaque one handed a clear colour paints black.
          const clearBacking = glassActive(translucencyState) && (!LINUX_GLASS || LINUX_GLASS_AT_LAUNCH)

          win.setBackgroundColor(clearBacking ? '#00000000' : getWindowBackgroundColor())
```

e. In `chatWindowSurfaceOptions()`, replace

```ts
    ...windowBackingOptions(translucencyState, getWindowBackgroundColor())
  }
```

with

```ts
    ...windowBackingOptions(translucencyState, getWindowBackgroundColor()),
    // Linux Glass: transparent from birth so the compositor can blur behind it.
    // After the backing so an opaque-at-launch process keeps its themed colour
    // even while Glass is selected (see LINUX_GLASS_AT_LAUNCH).
    ...windowTransparencyOptions(translucencyState, LINUX_GLASS_AT_LAUNCH),
    ...(LINUX_GLASS && !LINUX_GLASS_AT_LAUNCH ? { backgroundColor: getWindowBackgroundColor() } : {})
  }
```

### 3. `apps/desktop/electron/translucency.test.ts`

a. In the import list from `'./translucency'` (the block that already imports `windowBackingOptions` and `windowOpacityOptions`) add `linuxGlassOptIn` and `windowTransparencyOptions`, keeping the list alphabetical the way the file has it.

b. Directly after the closing `})` of `describe('windowBackingOptions', …)` add:

```ts

describe('linuxGlassOptIn', () => {
  it('is off unless the launch asks for it', () => {
    expect(linuxGlassOptIn('linux', {}, ['hermes'])).toBe(false)
    expect(linuxGlassOptIn('linux', { HERMES_DESKTOP_LINUX_GLASS: '0' }, ['hermes'])).toBe(false)
  })

  it('is on by environment or by flag, on Linux only', () => {
    expect(linuxGlassOptIn('linux', { HERMES_DESKTOP_LINUX_GLASS: '1' }, ['hermes'])).toBe(true)
    expect(linuxGlassOptIn('linux', {}, ['hermes', '--linux-glass'])).toBe(true)
    expect(linuxGlassOptIn('win32', { HERMES_DESKTOP_LINUX_GLASS: '1' }, ['hermes', '--linux-glass'])).toBe(false)
    expect(linuxGlassOptIn('darwin', { HERMES_DESKTOP_LINUX_GLASS: '1' }, ['hermes'])).toBe(false)
  })
})

describe('windowTransparencyOptions', () => {
  it('makes the window transparent only when Linux Glass was active at launch', () => {
    expect(windowTransparencyOptions(glass(60), true)).toEqual({ transparent: true, backgroundColor: '#00000000' })
    expect(windowTransparencyOptions(glass(60), false)).toEqual({})
  })

  it('stays opaque while glass is off, even on an opted-in launch', () => {
    expect(windowTransparencyOptions(glass(0), true)).toEqual({})
    expect(windowTransparencyOptions(clear(60), true)).toEqual({})
  })
})
```

`glass(...)` and `clear(...)` are helpers that already exist in this test file. Do not redefine them.

## DO NOT

- Do not change `apps/shared/src/translucency.ts`: `glassSupportedOn('linux')` and `translucencySupportedOn('linux')` must keep returning `false`, and their existing tests must keep passing unchanged.
- Do not touch the renderer (`apps/desktop/src/**`), the preload, the HUD, pet overlay or quick-entry windows, `applyWindowsBackdrop`, or anything about macOS vibrancy.
- Do not add a Settings control, i18n strings, or a restart prompt.
- Do not add `transparent: true` on Windows or macOS under any condition.
- Do not edit any `*.md` file.

## TESTS (orchestrator runs them)

1. TypeScript: `tsc --build tsconfig.electron.json` has no new errors in the touched files.
2. `vitest run electron/translucency.test.ts` passes, including the unchanged "is off on Linux" tests.
3. Diff review: `LINUX_GLASS` false leaves every expression equal to what it was.

Final message: file:line list of the changes.
