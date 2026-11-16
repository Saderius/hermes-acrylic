// Hermes Acrylic — Windows 11 Acrylic look for Hermes Desktop.
// Disk plugin: plain ESM, no build, no JSX. Real acrylic is Hermes' own Glass
// setting (Settings → Appearance → Window Translucency → Glass), which the user
// turns on; this plugin never changes it. The look is CSS: the theme's
// customCSS while Windows Acrylic is selected, or the same CSS for every theme
// when the user turns on "Every theme". Without Glass (and on Linux) the CSS is
// a stand-in over Chat Backdrop.
//
// Theme-agnostic tints: color-mix over the active theme seeds
// --theme-background-seed, --theme-sidebar-seed, --theme-card-seed,
// --theme-elevated-seed, --theme-bubble-seed and --theme-foreground.
import {
  APPEARANCE_AREAS, Button, ListRow, PALETTE_AREA, STATUSBAR_AREAS, SegmentedControl, THEMES_AREA,
  haptic, host, requestTheme, useTheme
} from '@hermes/plugin-sdk'
import { useEffect, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'hermes-acrylic'
const THEME_NAME = 'windows-acrylic'

const ENABLED_KEY = 'hermes-acrylic-enabled'
const ENABLED_ATTR = 'data-hermes-acrylic-enabled'
const ENABLED_EVENT = 'hermes-acrylic-enabled'
const UNFOCUSED_ATTR = 'data-hermes-window-unfocused'
const GLOBAL_STYLE_ID = 'hermes-acrylic-global-css'

// WinUI Acrylic Base: chrome seed #202020 / #FCFCFC.
// Under live Glass, DWM already tints natively, so body paints only the light
// --material-tint-glass sheet (.46 dark / .44 light for the default preset);
// the full --material-tint is the no-Glass fallback. Raised cards
// paint a single --control-fill layer on top; nested inputs stay transparent.
const LIGHT = {
  background: '#FCFCFC', foreground: '#1B1B1B',
  card: '#FBFBFB', cardForeground: '#1B1B1B',
  muted: '#EBEBEB', mutedForeground: '#5F5F5F',
  popover: '#F9F9F9', popoverForeground: '#1B1B1B',
  primary: '#005FB8', primaryForeground: '#FFFFFF',
  secondary: '#E9E9E9', secondaryForeground: '#1B1B1B',
  accent: '#E5E5E5', accentForeground: '#1B1B1B',
  border: '#E0E0E0', input: '#FFFFFF', ring: '#005FB8',
  midground: '#005FB8', composerRing: '#005FB8',
  destructive: '#C42B1C', destructiveForeground: '#FFFFFF',
  sidebarBackground: '#EEEEEE', sidebarBorder: '#E0E0E0',
  userBubble: '#FFFFFF', userBubbleBorder: '#E0E0E0'
}

const DARK = {
  background: '#202020', foreground: '#FFFFFF',
  card: '#2B2B2B', cardForeground: '#FFFFFF',
  muted: '#2D2D2D', mutedForeground: '#C5C5C5',
  popover: '#2C2C2C', popoverForeground: '#FFFFFF',
  primary: '#60CDFF', primaryForeground: '#003A57',
  secondary: '#323232', secondaryForeground: '#FFFFFF',
  accent: '#383838', accentForeground: '#FFFFFF',
  border: '#3A3A3A', input: '#2D2D2D', ring: '#60CDFF',
  midground: '#60CDFF', composerRing: '#60CDFF',
  destructive: '#FF99A4', destructiveForeground: '#3B0A0F',
  sidebarBackground: '#1C1C1C', sidebarBorder: '#333333',
  userBubble: '#2D2D2D', userBubbleBorder: '#3A3A3A'
}

// Prefix every selector so Glass, glass-on, and the no-Glass fallback share
// one rule without letting a comma-list drop the attribute guard.
function both(selectors) {
  return selectors.split(',').map(s => s.trim()).filter(Boolean).flatMap(s => [
    `:root[data-hermes-glass] ${s}`,
    `:root[data-hermes-glass-on] ${s}`,
    `:root:not([data-hermes-glass]):not([data-hermes-glass-on]) ${s}`
  ]).join(',\n')
}

function underGlass(selectors) {
  return selectors.split(',').map(s => s.trim()).filter(Boolean).flatMap(s => [
    `:root[data-hermes-glass] ${s}`,
    `:root[data-hermes-glass-on] ${s}`
  ]).join(',\n')
}

function noGlass(selectors) {
  return selectors.split(',').map(s => s.trim()).filter(Boolean).map(s => (
    `:root:not([data-hermes-glass]):not([data-hermes-glass-on]) ${s}`
  )).join(',\n')
}

// Grain is noise, the way Windows acrylic has it: a 128px tile of random grey
// pixels at one low opacity, drawn once on a canvas (never put in the page)
// and fixed-seeded, so it is the same on every load. Fine has one value per
// pixel, Coarse one per 2×2 block. Strength 100 is 12% opacity; Ctrl+K and
// cards get Windows' own 2%. No feTurbulence, no animation.
const NOISE_TILE = 128
const NOISE_MAX_ALPHA = 0.12
const FLYOUT_NOISE_ALPHA = 0.02
const noiseCache = new Map()

function clampNumber(value, lo, hi, fallback) {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}

function noiseTile(block, alpha) {
  const key = `${block}:${alpha}`
  if (noiseCache.has(key)) return noiseCache.get(key)
  let out = 'none'
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = NOISE_TILE
    const g = canvas.getContext('2d')
    const img = g.createImageData(NOISE_TILE, NOISE_TILE)
    const d = img.data
    const a = Math.round(alpha * 255)
    let seed = 0x2f6b1d
    const rnd = () => { // mulberry32
      seed = (seed + 0x6D2B79F5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    for (let y = 0; y < NOISE_TILE; y += block) {
      for (let x = 0; x < NOISE_TILE; x += block) {
        const v = Math.floor(rnd() * 8) * 36 + 3
        for (let yy = y; yy < y + block; yy++) {
          for (let xx = x; xx < x + block; xx++) {
            const i = (yy * NOISE_TILE + xx) * 4
            d[i] = d[i + 1] = d[i + 2] = v
            d[i + 3] = a
          }
        }
      }
    }
    g.putImageData(img, 0, 0)
    out = `url("${canvas.toDataURL('image/png')}")`
  } catch {
    // No canvas (tests, a locked-down host): no grain rather than a broken one.
  }
  noiseCache.set(key, out)
  return out
}

function grainImage(kind, strength) {
  const s = clampNumber(strength, 0, 100, 0)
  if ((kind !== 'fine' && kind !== 'coarse') || !s) return 'none'
  return noiseTile(kind === 'coarse' ? 2 : 1, +(s / 100 * NOISE_MAX_ALPHA).toFixed(4))
}

// What each preset sets, in the terms of the options page (Settings ▸ Plugins ▸
// Acrylic). Tint is the share of the theme colour over the glass
// (--acrylic-chrome-keep): Acrylic keeps 40% in light mode and 72% in dark
// mode, the others the same in both. Frost haze 100 lays a milky layer at 45%.
const PRESET_OPTIONS = {
  acrylic: { tint: { light: 40, dark: 72 }, haze: 0, grain: 'off', grainStrength: 0 },
  frosted: { tint: 58, haze: 0, grain: 'off', grainStrength: 0 },
  sanded: { tint: 58, haze: 0, grain: 'fine', grainStrength: 40 },
  expressive: { tint: 68, haze: 0, grain: 'off', grainStrength: 0 },
  heavy: { tint: 45, haze: 35, grain: 'fine', grainStrength: 45 }
}
const TINT_MIN = 20
const TINT_MAX = 95
const HAZE_MAX_ALPHA = 0.45

function hazeAlpha(haze) {
  return +(clampNumber(haze, 0, 100, 0) / 100 * HAZE_MAX_ALPHA).toFixed(4)
}



// Body paints the chrome tint on every path — the light --material-tint-glass
// sheet under live Glass, the full --material-tint on no-Glass; shell fills
// clear; holdouts stay solid. Glass blurs the OS. No-Glass blurs Chat Backdrop.
const CSS = `
/* Universal Theme-Agnostic Acrylic Tokens:
   Powered by color-mix(in srgb, ...) over the active theme seeds:
   --theme-background-seed, --theme-sidebar-seed, --theme-card-seed,
   --theme-elevated-seed, --theme-bubble-seed, and --theme-foreground.
   Works seamlessly across all Hermes Desktop themes! */
:root {
  --acrylic-chrome-keep: 40%;
  --acrylic-theme-base: color-mix(in srgb, var(--theme-background-seed, #FCFCFC) 92%, var(--theme-primary, #005FB8));
  --material-tint: color-mix(in srgb, var(--acrylic-theme-base) 65%, transparent);
  --material-tint-glass: color-mix(in srgb, var(--acrylic-theme-base) var(--acrylic-chrome-keep, 40%), transparent);
  --acrylic-sidebar-tint: color-mix(in srgb, var(--theme-sidebar-seed, #F0F0F4) 28%, transparent);
  --acrylic-blur: 14px;
  --acrylic-saturate: 1;
  --acrylic-grain: none;
  /* Frost haze: a milky layer over the glass tint (0 = none). */
  --acrylic-haze: 0;
  --acrylic-haze-rgb: 255 255 255;
  --acrylic-haze-layer: linear-gradient(rgb(var(--acrylic-haze-rgb) / var(--acrylic-haze)), rgb(var(--acrylic-haze-rgb) / var(--acrylic-haze)));
  --acrylic-flyout-grain: var(--acrylic-noise-flyout, none);
  --acrylic-recessed: color-mix(in srgb, var(--theme-sidebar-seed, #F0F0F4) 32%, rgba(0, 0, 0, 0.04));
  --control-fill: color-mix(in srgb, var(--theme-card-seed, #FFFFFF) 52%, rgba(255, 255, 255, 0.18));
  --control-fill-hover: color-mix(in srgb, var(--theme-card-seed, #FFFFFF) 66%, rgba(255, 255, 255, 0.24));
  --bubble-fill: color-mix(in srgb, var(--theme-bubble-seed, var(--theme-card-seed, #FFFFFF)) 56%, rgba(255, 255, 255, 0.18));
  --layer-stroke: color-mix(in srgb, var(--theme-foreground, #1B1B1B) 10%, transparent);
  --layer-hi: inset 0 1px 0 rgba(255, 255, 255, 0.55);
  --acrylic-flyout: color-mix(in srgb, var(--theme-elevated-seed, #F9F9FB) 72%, rgba(255, 255, 255, 0.14));
  --acrylic-popover: var(--acrylic-flyout);
  --acrylic-popover-fg: var(--theme-foreground, #1B1B1B);
  --acrylic-tooltip: color-mix(in srgb, var(--theme-elevated-seed, #F9F9FB) 92%, rgba(255, 255, 255, 0.06));
  /* The normal, solid background for surfaces that cannot be real glass (see THE RULE). */
  --acrylic-solid: var(--theme-elevated-seed, #F9F9FB);
  --command-input-well: color-mix(in srgb, var(--theme-background-seed, #F0F0F4) 45%, rgba(0, 0, 0, 0.04));
  --acrylic-overlay-card: color-mix(in srgb, var(--theme-elevated-seed, #F9F9FB) 48%, transparent);
  --acrylic-scrim: color-mix(in srgb, var(--theme-background-seed, #FCFCFC) 46%, transparent);
}
:root.dark {
  --acrylic-chrome-keep: 72%;
  --acrylic-theme-base: color-mix(in srgb, var(--theme-background-seed, #202020) 92%, var(--theme-primary, #60CDFF));
  --material-tint: color-mix(in srgb, var(--acrylic-theme-base) 65%, transparent);
  --material-tint-glass: color-mix(in srgb, var(--acrylic-theme-base) var(--acrylic-chrome-keep, 72%), transparent);
  --acrylic-sidebar-tint: color-mix(in srgb, var(--theme-sidebar-seed, #141418) 28%, transparent);
  --acrylic-haze-rgb: 228 225 236;
  --acrylic-recessed: color-mix(in srgb, var(--theme-sidebar-seed, #141418) 34%, rgba(0, 0, 0, 0.16));
  --control-fill: color-mix(in srgb, var(--theme-card-seed, #2B2B2B) 44%, rgba(255, 255, 255, 0.05));
  --control-fill-hover: color-mix(in srgb, var(--theme-card-seed, #2B2B2B) 56%, rgba(255, 255, 255, 0.08));
  --bubble-fill: color-mix(in srgb, var(--theme-bubble-seed, var(--theme-card-seed, #2B2B2B)) 50%, rgba(255, 255, 255, 0.06));
  --layer-stroke: color-mix(in srgb, var(--theme-foreground, #FFFFFF) 11%, transparent);
  --layer-hi: inset 0 1px 0 rgba(255, 255, 255, 0.09);
  --acrylic-flyout-grain: var(--acrylic-noise-flyout, none);
  --acrylic-flyout: color-mix(in srgb, var(--theme-elevated-seed, #24262E) 68%, rgba(16, 18, 24, 0.14));
  --acrylic-popover: var(--acrylic-flyout);
  --acrylic-popover-fg: var(--theme-foreground, #FFFFFF);
  --acrylic-tooltip: color-mix(in srgb, var(--theme-elevated-seed, #24262E) 92%, rgba(16, 18, 24, 0.06));
  --acrylic-solid: var(--theme-elevated-seed, #24262E);
  --command-input-well: color-mix(in srgb, var(--theme-background-seed, #141418) 48%, rgba(0, 0, 0, 0.22));
  --acrylic-overlay-card: color-mix(in srgb, var(--theme-elevated-seed, #24262E) 42%, transparent);
  --acrylic-scrim: color-mix(in srgb, var(--theme-background-seed, #202020) 52%, transparent);
}
/* Presets retune tokens while maintaining the active theme seeds */
:root[data-hermes-acrylic-preset='frosted'],
:root[data-hermes-acrylic-preset='sanded'] {
  --acrylic-chrome-keep: 58%;
  --acrylic-blur: 18px;
  --acrylic-saturate: 1.12;
}
:root.dark[data-hermes-acrylic-preset='frosted'],
:root.dark[data-hermes-acrylic-preset='sanded'] {
  --acrylic-chrome-keep: 58%;
}
:root[data-hermes-acrylic-preset='sanded'] {
  --acrylic-grain: var(--acrylic-noise-sanded, none);
}
:root[data-hermes-acrylic-preset='expressive'] {
  --acrylic-chrome-keep: 68%;
  --acrylic-blur: 16px;
  --acrylic-saturate: 1.05;
}
:root.dark[data-hermes-acrylic-preset='expressive'] {
  --acrylic-chrome-keep: 68%;
}
:root[data-hermes-acrylic-preset='heavy'],
:root.dark[data-hermes-acrylic-preset='heavy'] {
  --acrylic-chrome-keep: ${PRESET_OPTIONS.heavy.tint}%;
  --acrylic-haze: ${hazeAlpha(PRESET_OPTIONS.heavy.haze)};
  --acrylic-grain: var(--acrylic-noise-heavy, none);
  --acrylic-blur: 18px;
  --acrylic-saturate: 1.12;
}

/* ===========================================================================
   Global 4-Tier Material Token Architecture
   =========================================================================== */
:root,
:root.dark {
  /* Tier 0 — Base Window Field */
  --ui-surface-background: transparent !important;
  --ui-chat-surface-background: transparent !important;
  --ui-editor-surface-background: transparent !important;
  --ui-sidebar-surface-background: transparent !important;
  --ui-terminal-surface-background: var(--theme-background-seed, #202020) !important;
  --dt-background: transparent !important;
  --background: transparent !important;
  --dt-sidebar-bg: transparent !important;
  --sidebar: transparent !important;

  /* Tier 1 — Recessed / Lane Surfaces */
  --ui-bg-quinary: var(--acrylic-recessed) !important;
  --ui-bg-quaternary: var(--acrylic-recessed) !important;
  --ui-bg-tertiary: var(--acrylic-recessed) !important;
  --dt-muted: var(--acrylic-recessed) !important;

  /* Tier 2 — Raised In-Page Acrylic Cards & Widgets */
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

  /* Tier 3 — Floating Flyouts & Popovers */
  --ui-bg-elevated: var(--acrylic-flyout) !important;
  --dt-popover: var(--acrylic-flyout) !important;
}

/* [data-glass-opaque] is Hermes' "must stay filled" contract (styles.css):
   the connecting and boot screens, onboarding, the update hold, error pages,
   card stacks, the Settings search pill, a floating approval, the diff
   gutter, a dragged sidebar row. They cover the app, so they cannot be real
   glass: THE RULE gives them the theme's solid colours, as Hermes does. */
${both(`[data-glass-opaque]`)} {
  --ui-chat-surface-background: var(--acrylic-solid) !important;
  --ui-editor-surface-background: var(--acrylic-solid) !important;
  --ui-sidebar-surface-background: var(--theme-sidebar-seed, var(--acrylic-solid)) !important;
}

/* Settings & OverlayView Modal Cards ([data-overlay-surface] / [data-glass-raised]):
   1. Override styles.css:730's 94%-opaque --ui-*-surface-background rules on [data-glass-raised].
   2. Give [data-glass-raised] a translucent Acrylic tint (--acrylic-overlay-card) + noise grain. */
${underGlass(`[data-overlay-surface]`)} {
  background: transparent !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
${both(`[data-glass-raised], [data-overlay-surface] [data-glass-raised]`)} {
  --ui-chat-surface-background: transparent !important;
  --ui-sidebar-surface-background: var(--acrylic-sidebar-tint) !important;
  --ui-editor-surface-background: var(--control-fill) !important;
  --dt-card: var(--control-fill) !important;
  --ui-bg-editor: var(--control-fill) !important;
  --ui-bg-card: var(--control-fill) !important;
  --ui-bg-quinary: var(--acrylic-recessed) !important;
  --dt-muted: var(--acrylic-recessed) !important;
  background-color: var(--acrylic-overlay-card, color-mix(in srgb, var(--theme-elevated-seed, #24262E) 42%, transparent)) !important;
  background-image: var(--acrylic-flyout-grain) !important;
  border: 1px solid var(--layer-stroke) !important;
  box-shadow: var(--layer-hi), 0 16px 48px rgba(0, 0, 0, 0.55) !important;
}
${underGlass(`[data-glass-raised], [data-overlay-surface] [data-glass-raised]`)} {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
${noGlass(`[data-glass-raised], [data-overlay-surface] [data-glass-raised]`)} {
  -webkit-backdrop-filter: blur(24px) saturate(1.3) !important;
  backdrop-filter: blur(24px) saturate(1.3) !important;
}
${both(`[data-overlay-surface] [data-tour='overlay-nav'], [data-glass-raised] [data-tour='overlay-nav']`)} {
  background-color: var(--acrylic-sidebar-tint) !important;
  background-image: none !important;
  border-right: 1px solid var(--layer-stroke) !important;
}
${both(`[data-overlay-surface] .grid[class*='grid-cols-'], [data-glass-raised] .grid[class*='grid-cols-'], [data-glass-raised] main`)} {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
}

/* Chrome under Glass: body paints ONLY --material-tint-glass */
:root[data-hermes-glass] body,
:root[data-hermes-glass-on] body {
  background-color: var(--material-tint-glass) !important;
  background-image: var(--acrylic-haze-layer), var(--acrylic-grain, none) !important;
  background-repeat: repeat !important;
  background-size: auto, 128px 128px !important;
  filter: none !important;
  mix-blend-mode: normal !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
:root[data-hermes-glass][data-hermes-glass-scope='sidebar'] body {
  background: linear-gradient(
    to right,
    rgb(var(--acrylic-haze-rgb) / var(--acrylic-haze)) var(--glass-rail-edge, 0px),
    transparent var(--glass-rail-edge, 0px)
  ), linear-gradient(
    to right,
    var(--material-tint-glass) var(--glass-rail-edge, 0px),
    var(--ui-bg-chrome) var(--glass-rail-edge, 0px)
  ) !important;
}
:root[data-hermes-glass][data-hermes-glass-scope='sidebar'][dir='rtl'] body {
  background: linear-gradient(
    to left,
    rgb(var(--acrylic-haze-rgb) / var(--acrylic-haze)) var(--glass-rail-edge, 0px),
    transparent var(--glass-rail-edge, 0px)
  ), linear-gradient(
    to left,
    var(--material-tint-glass) var(--glass-rail-edge, 0px),
    var(--ui-bg-chrome) var(--glass-rail-edge, 0px)
  ) !important;
}

/* No-Glass fallback (Linux; Windows/macOS before Glass is on) */
:root:not([data-hermes-glass]):not([data-hermes-glass-on]) body {
  background-color: var(--material-tint) !important;
  background-image: var(--acrylic-haze-layer), var(--acrylic-grain, none) !important;
  background-repeat: repeat !important;
  background-size: auto, 128px 128px !important;
}
:root:not([data-hermes-glass]):not([data-hermes-glass-on]) {
  --ui-chat-surface-background: transparent;
  --ui-sidebar-surface-background: transparent;
  --ui-editor-surface-background: transparent;
}

/* Sidebar: paint subtle 24% theme sidebar tint on inner rail, keeping containers transparent */
${both(`[data-slot='sidebar-inner']`)} {
  background-color: var(--acrylic-sidebar-tint) !important;
  background-image: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
${both(`[data-sidebar='sidebar'], [data-slot='sidebar-container']`)} {
  background-color: transparent !important;
  background-image: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
:root[data-hermes-glass][data-hermes-glass-scope='window'] [data-slot='sidebar-inset'],
:root[data-hermes-glass-on][data-hermes-glass-scope='window'] [data-slot='sidebar-inset'] {
  background-color: transparent !important;
  background-image: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
:root:not([data-hermes-glass]):not([data-hermes-glass-on]) [data-slot='sidebar-inset'],
:root:not([data-hermes-glass]):not([data-hermes-glass-on]) [data-chat-surface],
:root:not([data-hermes-glass]):not([data-hermes-glass-on]) [data-contrib-shell],
:root:not([data-hermes-glass]):not([data-hermes-glass-on]) [data-slot='sidebar-wrapper'] {
  background-color: transparent !important;
  background-image: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
${both(`[data-contrib-shell], [data-slot='sidebar-wrapper'], [data-chat-surface], [data-slot='sidebar-inset']`)} {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

/* Code cards stay a solid read surface */
${both(`[data-slot='code-card']`)} {
  background-color: var(--acrylic-popover) !important;
  background-image: linear-gradient(var(--control-fill), var(--control-fill)) !important;
  color: var(--acrylic-popover-fg);
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

/* Buttons: only outline/secondary get the acrylic fill */
${both(`[data-slot='button'][data-variant='secondary'], [data-slot='button'][data-variant='outline']`)} {
  background: var(--control-fill) !important;
  border-color: var(--layer-stroke) !important;
}
/* --background is cleared at :root so the window field stays see-through.
   Elements that used it as a FILL get a material back: raised pills (Tier 2),
   boxed wells (Tier 1), full-window scrims. Structural fields stay clear.
   No :is() lists here: both() splits its argument on commas. */
${both(`[aria-pressed='true'][class*='bg-background'], [data-state='active'][class*='bg-background'], [data-state='on'][class*='bg-background'], [aria-selected='true'][class*='bg-background'], [aria-current='page'][class*='bg-background']`)} {
  background-color: var(--control-fill-hover) !important;
  box-shadow: var(--layer-hi), 0 0 0 1px var(--layer-stroke) !important;
}
${both(`[class~='bg-background'][class~='rounded']:not([aria-pressed]):not([aria-selected]):not([aria-current]):not([data-slot^='sidebar']), [class~='bg-background'][class~='rounded-md']:not([aria-pressed]):not([aria-selected]):not([aria-current]):not([data-slot^='sidebar']), [class~='bg-background'][class~='rounded-lg']:not([aria-pressed]):not([aria-selected]):not([aria-current]):not([data-slot^='sidebar']), [class~='bg-background'][class~='rounded-xl']:not([aria-pressed]):not([aria-selected]):not([aria-current]):not([data-slot^='sidebar']), [class~='bg-background'][class~='rounded-2xl']:not([aria-pressed]):not([aria-selected]):not([aria-current]):not([data-slot^='sidebar']), [class~='bg-background'][class~='rounded-full']:not([aria-pressed]):not([aria-selected]):not([aria-current]):not([data-slot^='sidebar']), [class*=' bg-background/']:not(.fixed):not([data-slot^='sidebar']), [class^='bg-background/']:not(.fixed):not([data-slot^='sidebar'])`)} {
  background-color: var(--acrylic-recessed) !important;
}
${both(`.fixed.inset-0[class*='bg-background/']`)} {
  background-color: var(--acrylic-scrim) !important;
}
${underGlass(`.fixed.inset-0[class*='bg-background/'], [data-slot='dialog-overlay']`)} {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

/* Field clears */
${both(`[data-pane-host], [data-tree-group], [data-project-tree]`)} {
  background-color: transparent !important;
  background-image: none !important;
  filter: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

/* Tier 3 — Floating Portal Surfaces & Flyouts:
   Under live Glass and no-Glass, CSS backdrop-filter blurs the surface underneath. */
${both(`[data-slot='popover-content'], [data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='select-content'], [data-slot='hover-card-content'], [role='menu'], [data-slot='dialog-content'], [data-radix-popper-content-wrapper] > [data-side], [data-slot='composer-completion-drawer']`)} {
  background-color: var(--acrylic-flyout) !important;
  background-image: var(--acrylic-flyout-grain) !important;
  color: var(--acrylic-popover-fg);
  border: 1px solid var(--layer-stroke) !important;
  box-shadow: var(--layer-hi), 0 16px 48px rgba(0, 0, 0, 0.55) !important;
  opacity: 1 !important;
  animation: none !important;
  filter: none !important;
}
${underGlass(`[data-slot='popover-content'], [data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='select-content'], [data-slot='hover-card-content'], [role='menu'], [data-slot='dialog-content'], [data-radix-popper-content-wrapper] > [data-side], [data-radix-popper-content-wrapper], [data-slot='composer-completion-drawer'], [data-slot='card-stack-surface']`)} {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
${noGlass(`[data-slot='popover-content'], [data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='select-content'], [data-slot='hover-card-content'], [role='menu'], [data-slot='dialog-content'], [data-radix-popper-content-wrapper] > [data-side], [data-radix-popper-content-wrapper], [data-slot='composer-completion-drawer']`)} {
  -webkit-backdrop-filter: blur(24px) saturate(1.3) !important;
  backdrop-filter: blur(24px) saturate(1.3) !important;
}
${both(`[data-radix-popper-content-wrapper]`)} {
  border-radius: 8px !important;
}
${both(`[data-slot='statusbar'] [data-slot='dropdown-menu-content']`)} {
  background-color: var(--acrylic-flyout) !important;
  background-image: var(--acrylic-flyout-grain) !important;
  color: var(--acrylic-popover-fg);
}
/* Opt-in hook for other plugins: mark a floating surface with data-acrylic-flyout
   and it gets the Tier 3 fill and blurs the page behind it. Triage's detail card is listed by class. */
${both(`[data-acrylic-flyout], .hsj-detail`)} {
  background-color: var(--acrylic-flyout) !important;
  background-image: var(--acrylic-flyout-grain) !important;
}
${noGlass(`[data-acrylic-flyout], .hsj-detail`)} {
  -webkit-backdrop-filter: blur(24px) saturate(1.3) !important;
  backdrop-filter: blur(24px) saturate(1.3) !important;
}

/* Tooltips: a small Tier 3 plate. */
${both(`[data-radix-popper-content-wrapper] > [data-slot='tooltip-content'][data-side]`)} {
  background-color: var(--acrylic-flyout) !important;
  background-image: var(--acrylic-flyout-grain) !important;
  color: var(--acrylic-popover-fg) !important;
  border: 1px solid var(--layer-stroke) !important;
  box-shadow: var(--layer-hi), 0 4px 14px rgba(0, 0, 0, 0.32) !important;
  opacity: 1 !important;
  filter: none !important;
}
${underGlass(`[data-radix-popper-content-wrapper] > [data-slot='tooltip-content'][data-side]`)} {
  background-color: var(--acrylic-tooltip) !important;
}
${both(`[data-slot='tooltip-content'] [data-slot='tooltip-arrow']`)} {
  display: none !important;
}

/* Status-bar chips */
:root[data-hermes-glass] [data-slot='statusbar'] [data-slot='button'],
:root[data-hermes-glass-on] [data-slot='statusbar'] [data-slot='button'],
:root[data-hermes-glass] [data-slot='statusbar'] [role='button'],
:root[data-hermes-glass-on] [data-slot='statusbar'] [role='button'] {
  background-color: color-mix(in srgb, var(--acrylic-flyout) 88%, transparent) !important;
  color: var(--acrylic-popover-fg);
}

/* Tier 2 — Raised In-Page Acrylic Cards:
   Chat bubbles, Kanban cards, inline tool/diff cards, widgets.
   No backdrop-filter under Glass to preserve real DWM translucency. */
${both(`[data-slot='group-chat-message-content'], [data-slot='pet-plugin-bubble'], [data-slot='user-message'], [data-slot='kanban-card'], .cursor-grab[class*='bg-(--ui-bg-elevated)'], [class*='ui-widget-surface-background'], [data-slot='tool-block'][data-tool-open], [data-slot='file-diff-panel'], [class*='bg-card'], [class*='bg-(--dt-card)'], [class*='bg-(--ui-bg-editor)'], [class*='bg-(--ui-bg-card)']`)} {
  background: var(--control-fill) !important;
  border: 1px solid var(--layer-stroke) !important;
  box-shadow: var(--layer-hi) !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
  filter: none !important;
}

/* User message bubbles use dedicated bubble fill */
${both(`[data-slot='user-message']`)} {
  background: var(--bubble-fill) !important;
}
/* Under Glass the pinned prompt can stay light: Hermes clips the text that
   scrolls under it (use-sticky-prompt-clip.ts), so nothing reads through. */
${underGlass(`[data-slot='user-message'], .composer-human-message`)} {
  background: color-mix(in srgb, var(--theme-bubble-seed, var(--theme-card-seed, #2B2B2B)) 34%, transparent) !important;
}

/* Standalone inputs */
${both(`[data-slot='input'], [data-slot='textarea'], [data-slot='command-input'], [data-slot='input-group']`)} {
  background: var(--control-fill) !important;
  border: 1px solid var(--layer-stroke) !important;
  border-radius: 6px;
}

/* Nested inputs stay fully transparent to avoid double-painting */
${both(`[data-slot='composer-rich-input'], [data-slot='composer-surface'] [data-slot='textarea'], [data-slot='composer-surface'] [data-slot='input'], [data-slot='input-group'] [data-slot='input'], [data-slot='input-group-control'], [data-slot='command'] [data-slot='command-input'], [data-slot='command-input-wrapper'] [data-slot='command-input'], [data-slot='command-input']`)} {
  background: transparent !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

:root[data-hermes-glass],
:root[data-hermes-glass-on],
:root:not([data-hermes-glass]):not([data-hermes-glass-on]) {
  --dt-user-bubble: var(--bubble-fill) !important;
  --ui-chat-bubble-background: var(--bubble-fill) !important;
}

/* Search bar and sticky headers */
${both(`div.inline-flex[class*='rounded-full']:has(> input), [data-slot='search-field'], [class*='bg-(--dt-card)']:has(input)`)} {
  background: var(--control-fill) !important;
  background-image: none !important;
  border: 1px solid var(--layer-stroke) !important;
  box-shadow: var(--layer-hi) !important;
  -webkit-backdrop-filter: blur(16px) saturate(1.2) !important;
  backdrop-filter: blur(16px) saturate(1.2) !important;
}
${both(`div.sticky.top-0, [class*='bg-background'].sticky, header.sticky, [class*='bg-(--ui-bg-chrome)']`)} {
  background-color: transparent !important;
  background-image: none !important;
}
${both(`[data-slot='pane-header']`)} {
  background-color: transparent !important;
  background-image: none !important;
}

/* Composer dock, root & surface (Searchbox-grade Tier 3 Acrylic):
   Pure Windows 11 DWM Acrylic shines underneath. */
${both(`[data-slot='composer-root'], [data-slot='composer-dock'], [data-slot='composer-root'][data-thread-scrolled-up], [data-slot='composer-dock']:is(:hover, :focus-within) [data-slot='composer-root'][data-thread-scrolled-up]`)} {
  --composer-fill: var(--acrylic-flyout) !important;
}
${both(`[data-slot='composer-surface'], [data-slot='room-composer-surface'], .group\\/composer-surface`)} {
  background-color: var(--acrylic-flyout) !important;
  background-image: var(--acrylic-flyout-grain) !important;
  border: 1px solid var(--layer-stroke) !important;
  box-shadow: var(--layer-hi), 0 12px 32px rgba(0, 0, 0, 0.28) !important;
  filter: none !important;
}
${underGlass(`[data-slot='composer-surface'], [data-slot='room-composer-surface'], .group\\/composer-surface, [data-slot='composer-dock'] [class*='backdrop-blur']`)} {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
/* Light fill under Glass: the thread is masked out below (next rule), so
   the window's real acrylic shows through the composer like the chat. */
${underGlass(`[data-slot='composer-surface'], [data-slot='room-composer-surface'], .group\\/composer-surface`)} {
  background-color: color-mix(in srgb, var(--theme-elevated-seed, #24262E) 34%, transparent) !important;
}
/* Under Glass the chat fades out before it reaches the composer, so the
   composer shows the window's real acrylic, not text behind it. The height
   is Hermes' own --composer-surface-measured-height: the strip where the
   thread viewport runs under the composer (styles.css --thread-viewport-height). */
${underGlass(`[data-slot='aui_thread-viewport']`)} {
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - var(--composer-surface-measured-height, 2.75rem) - 1.5rem), transparent calc(100% - var(--composer-surface-measured-height, 2.75rem)));
  mask-image: linear-gradient(to bottom, #000 calc(100% - var(--composer-surface-measured-height, 2.75rem) - 1.5rem), transparent calc(100% - var(--composer-surface-measured-height, 2.75rem)));
}
${noGlass(`[data-slot='composer-surface'], [data-slot='room-composer-surface'], .group\\/composer-surface`)} {
  -webkit-backdrop-filter: blur(24px) saturate(1.3) !important;
  backdrop-filter: blur(24px) saturate(1.3) !important;
}
${both(`[data-slot='composer-surface']:has([data-slot='composer-rich-input']:focus-visible), .group\\/composer-surface:has([data-slot='composer-rich-input']:focus-visible)`)} {
  border-color: color-mix(in srgb, var(--dt-composer-ring) 45%, var(--layer-stroke)) !important;
}
${both(`[data-slot='composer-surface'] > [class*='-z-10'], [data-slot='composer-fade']`)} {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
}
${both(`[data-slot='composer-root'] > .pointer-events-none, [data-slot='composer-root'] > .pointer-events-none.absolute.inset-0`)} {
  background: transparent !important;
  background-image: none !important;
  display: none !important;
}
${both(`.coding-status-bar`)} {
  background-color: transparent !important;
  background-image: none !important;
}
${both(`[data-slot='composer-attachments'] [class*='bg-background']`)} {
  background: var(--control-fill) !important;
  background-image: none !important;
  border-color: var(--layer-stroke) !important;
}

/* Primary composer action buttons (Send / Start Voice / Stop):
   Tailwinds bg-foreground text-background uses var(--background) for the icon color.
   Because Acrylic sets --background: transparent !important on the root, restore the
   active theme background color on text-background elements so the icon renders crisp and opaque. */
${both(`[class*='bg-foreground'][class*='text-background'], button.bg-foreground.text-background, [data-slot='composer-dock'] button[class*='text-background']`)} {
  --background: var(--theme-background-seed, #141418) !important;
  --dt-background: var(--theme-background-seed, #141418) !important;
  color: var(--theme-background-seed, #141418) !important;
}
:root:not(.dark) [data-hermes-glass] [class*='bg-foreground'][class*='text-background'],
:root:not(.dark)[data-hermes-glass-on] [class*='bg-foreground'][class*='text-background'] {
  --background: var(--theme-background-seed, #FCFCFC) !important;
  --dt-background: var(--theme-background-seed, #FCFCFC) !important;
  color: var(--theme-background-seed, #FCFCFC) !important;
}

/* ⌘K Command Palette HUD:
   Backdrop Root fix: styled directly on outer <DialogPrimitive.Content> ([role='dialog'][class*='left-1/2'])
   It blurs the page behind it on every path, so chat text never reads through it. */
${both(`[role='dialog'][class*='left-1/2'], [role='dialog'][aria-label='Command palette']`)} {
  background-color: var(--acrylic-flyout) !important;
  background-image: var(--acrylic-flyout-grain) !important;
  color: var(--acrylic-popover-fg) !important;
  border: 1px solid var(--layer-stroke) !important;
  box-shadow: var(--layer-hi), 0 16px 48px rgba(0, 0, 0, 0.55) !important;
  opacity: 1 !important;
  animation: none !important;
  filter: none !important;
}
${noGlass(`[role='dialog'][class*='left-1/2'], [role='dialog'][aria-label='Command palette']`)} {
  -webkit-backdrop-filter: blur(24px) saturate(1.3) !important;
  backdrop-filter: blur(24px) saturate(1.3) !important;
}
/* THE RULE: a surface is glass only where it can be real glass. Under Glass a
   CSS blur only sees the page, never the Windows material, so a floating
   surface the plugin cannot cut the app away under would be a see-through
   tint over the page: broken. Those surfaces get the theme's normal, solid
   background instead: menus, popovers, dialogs, tooltips, toasts, the Layout
   editor, the status-bar menus. Ctrl+K and full-page cards get the real
   material: see the cut-outs below. */
${underGlass(`[data-slot='popover-content'], [data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='select-content'], [data-slot='hover-card-content'], [role='menu'], [data-radix-popper-content-wrapper] > [data-side], [data-radix-popper-content-wrapper] > [data-slot='tooltip-content'][data-side], [data-slot='statusbar'] [data-slot='dropdown-menu-content'], [data-slot='composer-completion-drawer'], [data-acrylic-flyout], .hsj-detail, [role='dialog'][data-slot='dialog-content']:not([aria-label='Command palette']):not([class*='min(34rem']), [data-slot='card-stack-surface'], [class*='w-[26rem]'][class*='bg-popover']`)} {
  background-color: var(--acrylic-solid) !important;
  background-image: none !important;
}
/* Ctrl+K and full-page cards under Glass: the app is cut away exactly under
   them, so they show the window's real acrylic instead of the page.
   Sizes come from Hermes: the palette is floating-hud.ts (top-3, centred,
   min(34rem, 100vw - 2rem)) and gets a fixed height here; a full-page card
   is overlay-view.tsx (inset = 34px titlebar + 0.625rem, 0.875rem from 40rem). */
:root {
  --acrylic-hud-w: min(34rem, calc(100vw - 2rem));
  --acrylic-hud-h: calc(min(20rem, 56vh) + 2.75rem);
  --acrylic-hud-top: 0.75rem;
  --acrylic-card-inset: calc(34px + 0.625rem);
}
@media not all and (min-width: 44rem) {
  :root { --acrylic-hud-top: calc(var(--titlebar-height, 34px) + 0.375rem); }
}
@media (min-width: 40rem) {
  :root { --acrylic-card-inset: calc(34px + 0.875rem); }
}
${underGlass(`[role='dialog'][class*='top-3'][class*='min(34rem']`)} {
  height: var(--acrylic-hud-h) !important;
  max-height: none !important;
  display: flex !important;
  flex-direction: column !important;
}
${underGlass(`[role='dialog'][class*='top-3'][class*='min(34rem'] [data-slot='command']`)} {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
}
${underGlass(`[role='dialog'][class*='top-3'][class*='min(34rem'] [data-slot='command-list']`)} {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  max-height: none !important;
}
:root[data-hermes-glass]:has([role='dialog'][class*='top-3'][class*='min(34rem']) #root,
:root[data-hermes-glass-on]:has([role='dialog'][class*='top-3'][class*='min(34rem']) #root {
  -webkit-mask-image: linear-gradient(#000 0 0), linear-gradient(#000 0 0);
  -webkit-mask-size: var(--acrylic-hud-w) var(--acrylic-hud-h), 100% 100%;
  -webkit-mask-position: 50% var(--acrylic-hud-top), 0 0;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-composite: xor;
  mask-image: linear-gradient(#000 0 0), linear-gradient(#000 0 0);
  mask-size: var(--acrylic-hud-w) var(--acrylic-hud-h), 100% 100%;
  mask-position: 50% var(--acrylic-hud-top), 0 0;
  mask-repeat: no-repeat;
  mask-composite: exclude;
}
:root[data-hermes-glass]:has([data-overlay-surface]) [data-contrib-shell],
:root[data-hermes-glass-on]:has([data-overlay-surface]) [data-contrib-shell] {
  -webkit-mask-image: linear-gradient(#000 0 0), linear-gradient(#000 0 0);
  -webkit-mask-size: calc(100% - 2 * var(--acrylic-card-inset)) calc(100% - 2 * var(--acrylic-card-inset)), 100% 100%;
  -webkit-mask-position: var(--acrylic-card-inset) var(--acrylic-card-inset), 0 0;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-composite: xor;
  mask-image: linear-gradient(#000 0 0), linear-gradient(#000 0 0);
  mask-size: calc(100% - 2 * var(--acrylic-card-inset)) calc(100% - 2 * var(--acrylic-card-inset)), 100% 100%;
  mask-position: var(--acrylic-card-inset) var(--acrylic-card-inset), 0 0;
  mask-repeat: no-repeat;
  mask-composite: exclude;
}
/* The terminal is placed by inline pixel values a stylesheet cannot read, so
   while a full-page card is open it is hidden instead of cut. Opacity as well,
   as Hermes does: Electron can keep the WebGL canvas on screen under visibility. */
:root[data-hermes-glass]:has([data-overlay-surface]) [data-persistent-terminal],
:root[data-hermes-glass-on]:has([data-overlay-surface]) [data-persistent-terminal] {
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
${both(`[role='dialog'][class*='left-1/2'] [data-slot='command'], [role='dialog'][aria-label='Command palette'] [data-slot='command']`)} {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  color: inherit !important;
  border: none !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
${both(`[role='dialog'][class*='left-1/2'] [data-slot='command-list'], [role='dialog'][aria-label='Command palette'] [data-slot='command-list']`)} {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
}
${both(`[data-slot='command-input-wrapper']`)} {
  background-color: var(--command-input-well, color-mix(in srgb, var(--theme-background-seed, #141418) 45%, rgba(0, 0, 0, 0.25))) !important;
  border-bottom: 1px solid color-mix(in srgb, var(--theme-primary, #60CDFF) 55%, var(--layer-stroke)) !important;
}

/* Terminal containers */
${both(`[data-terminal-slot], [data-persistent-terminal]`)} {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  border: none !important;
  margin: 0 !important;
  contain: none !important;
  isolation: auto !important;
  overflow: visible !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
${both(`[data-terminal]`)} {
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  inset: 6px !important;
  /* Hermes pads the terminal 0 on top and 8px elsewhere and keeps ~14px on the
     right for the scrollbar; even padding plus the centred text area below
     gives the outline the same gap on every side. */
  padding: 15px 8px !important;
  contain: none !important;
  isolation: auto !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
:root,
:root.dark {
  --ui-terminal-surface-background: var(--theme-background-seed, #202020) !important;
}
/* Hermes reads this token at <body> level for the terminal's text area (kept
   solid: its fast renderer cannot be see-through) and inside the app shell for
   the pane, frame and tab strip, which keep the window material. The terminal
   pane renders outside the app shell, so it is named too. */
[data-contrib-shell], [data-persistent-terminal] {
  --ui-terminal-surface-background: transparent !important;
}
${both(`[data-terminal] .xterm`)} {
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: center !important;
}
${both(`[data-terminal] .xterm-screen`)} {
  outline: 1px solid var(--layer-stroke) !important;
  outline-offset: 0 !important;
}
${both(`[data-suppress-pane-reveal]`)} {
  background-color: transparent !important;
  background-image: none !important;
}
${both(`.xterm, .xterm-viewport, .xterm-scrollable-element, .xterm-screen, .xterm-rows, .xterm-rows > div`)} {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  filter: none !important;
  mix-blend-mode: normal !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
${both(`.xterm, .xterm-viewport, .xterm-screen, .xterm-rows, .xterm-rows > div, .xterm-rows span, [data-terminal], [data-interactive-terminal]`)} {
  font-family: 'CascadiaCode Nerd Font', 'Cascadia Code Nerd Font', 'CaskaydiaCove Nerd Font', 'Cascadia Code', monospace !important;
}

/* Chat Backdrop under Glass:
   - FOCUSED (:not([data-hermes-window-unfocused])): hide completely (display: none) so live DWM Acrylic shines
     through with zero JPEG compositing cost during window drag.
   - UNFOCUSED ([data-hermes-window-unfocused]): Windows 11 drops DWM Acrylic to a flat solid surface when the
     window loses focus, so we reveal Hermes's crisp filler-bg0.jpg engraving (and any --theme-asset-bg wallpaper)! */
:root[data-hermes-glass]:not([data-hermes-window-unfocused]) img[src*='filler-bg0'],
:root[data-hermes-glass-on]:not([data-hermes-window-unfocused]) img[src*='filler-bg0'],
:root[data-hermes-glass]:not([data-hermes-window-unfocused]) [data-chat-surface] > div:has(> img[src*='filler-bg0']),
:root[data-hermes-glass-on]:not([data-hermes-window-unfocused]) [data-chat-surface] > div:has(> img[src*='filler-bg0']) {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  content-visibility: hidden !important;
  pointer-events: none !important;
  filter: none !important;
  animation: none !important;
  mix-blend-mode: normal !important;
  background-image: none !important;
}

:root[data-hermes-glass][data-hermes-window-unfocused] [data-chat-surface] > div:has(> img[src*='filler-bg0']),
:root[data-hermes-glass-on][data-hermes-window-unfocused] [data-chat-surface] > div:has(> img[src*='filler-bg0']) {
  display: block !important;
  visibility: visible !important;
  content-visibility: visible !important;
  opacity: 0.075 !important;
  mix-blend-mode: difference !important;
  pointer-events: none !important;
}
:root.dark[data-hermes-glass][data-hermes-window-unfocused] [data-chat-surface] > div:has(> img[src*='filler-bg0']),
:root.dark[data-hermes-glass-on][data-hermes-window-unfocused] [data-chat-surface] > div:has(> img[src*='filler-bg0']) {
  opacity: 0.085 !important;
}
:root[data-hermes-glass][data-hermes-window-unfocused] img[src*='filler-bg0'],
:root[data-hermes-glass-on][data-hermes-window-unfocused] img[src*='filler-bg0'] {
  display: block !important;
  visibility: visible !important;
  content-visibility: visible !important;
  opacity: 1 !important;
  filter: invert(var(--backdrop-invert-mul, 1)) !important;
}
:root[data-hermes-glass][data-hermes-window-unfocused] body,
:root[data-hermes-glass-on][data-hermes-window-unfocused] body {
  background-image: var(--theme-asset-bg, none) !important;
  background-size: cover !important;
  background-position: center !important;
}

/* Chat Backdrop under no Glass */
:root:not([data-hermes-glass]):not([data-hermes-glass-on]) [data-chat-surface] > div:has(> img[src*='filler-bg0']) {
  opacity: 1 !important;
  mix-blend-mode: normal !important;
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
:root:not([data-hermes-glass]):not([data-hermes-glass-on]) [data-chat-surface] > div:has(> img[src*='filler-bg0']) img {
  filter: blur(var(--acrylic-blur, 14px)) saturate(var(--acrylic-saturate, 1)) !important;
}
:root:not([data-hermes-glass]):not([data-hermes-glass-on]) [data-chat-surface] > div:has(> img[src*='filler-bg0'])::after {
  content: "";
  position: absolute;
  inset: 0;
  background-color: var(--material-tint);
  background-image: var(--acrylic-haze-layer), var(--acrylic-grain, none);
  background-repeat: repeat;
  background-size: auto, 128px 128px;
  pointer-events: none;
}

/* prefers-reduced-transparency */
@media (prefers-reduced-transparency: reduce) {
  :root {
    --material-tint: #FCFCFC !important;
    --material-tint-glass: #FCFCFC !important;
    --acrylic-blur: 0px !important;
    --acrylic-saturate: 1 !important;
    --acrylic-grain: none !important;
    --acrylic-haze: 0 !important;
    --acrylic-flyout-grain: none !important;
    --acrylic-overlay-card: #FCFCFC !important;
  }
  :root.dark {
    --material-tint: #202020 !important;
    --material-tint-glass: #202020 !important;
    --acrylic-flyout-grain: none !important;
    --acrylic-overlay-card: #202020 !important;
  }
  :root:not([data-hermes-glass]) [data-chat-surface] > div:has(> img[src*='filler-bg0']),
  :root:not([data-hermes-glass]) [data-chat-surface] > div:has(> img[src*='filler-bg0']) img {
    display: none !important;
    filter: none !important;
  }
}
`

const THEME = {
  name: THEME_NAME,
  label: 'Windows Acrylic',
  description: 'Windows materials: Acrylic, Frosted, Sanded (frosted + grain), Expressive, Heavy frost, or your own tint, haze and grain (Settings ▸ Plugins ▸ Acrylic). Real blur is Win11 Glass. Linux / Glass off blurs Chat Backdrop only. Reduced transparency goes solid.',
  colors: LIGHT,
  darkColors: DARK,
  typography: {
    fontSans: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
    fontMono: "'CascadiaCode Nerd Font', 'Cascadia Code Nerd Font', 'Cascadia Code', 'Cascadia Mono', Consolas, ui-monospace, monospace"
  },
  customCSS: CSS
}

const PRESET_IDS = ['acrylic', 'frosted', 'sanded', 'expressive', 'heavy']
const CUSTOM = 'custom'
const PRESET_LABELS = { acrylic: 'Acrylic', frosted: 'Frosted', sanded: 'Sanded', expressive: 'Expressive', heavy: 'Heavy frost', custom: 'Custom' }
const PRESET_KEY = 'hermes-acrylic-preset'
const PRESET_ATTR = 'data-hermes-acrylic-preset'
const PRESET_EVENT = 'hermes-acrylic-preset'
const CUSTOM_KEY = 'hermes-acrylic-custom'
const OPTIONS_STYLE_ID = 'hermes-acrylic-options-css'
const GRAIN_KINDS = ['off', 'fine', 'coarse']
const GRAIN_LABELS = { off: 'Off', fine: 'Fine', coarse: 'Coarse' }

// ---------------------------------------------------------------------------
// Universal Acrylic State & Style Manager
// ---------------------------------------------------------------------------
function readAcrylicEnabled() {
  try {
    const saved = localStorage.getItem(ENABLED_KEY)
    if (saved !== null) return saved !== 'false'
  } catch {
    // localStorage can throw in locked-down webviews.
  }
  if (typeof document !== 'undefined') {
    if (document.documentElement.hasAttribute('data-hermes-acrylic-disabled')) return false
    if (document.documentElement.hasAttribute(ENABLED_ATTR)) return true
  }
  return false
}

function installGlobalAcrylicStyle() {
  if (typeof document === 'undefined') return
  const enabled = readAcrylicEnabled()
  let el = document.getElementById(GLOBAL_STYLE_ID)
  if (enabled) {
    if (!el) {
      el = document.createElement('style')
      el.id = GLOBAL_STYLE_ID
      const head = document.head || document.documentElement
      if (head && head.appendChild) head.appendChild(el)
    }
    if (el) el.textContent = CSS
    document.documentElement.setAttribute(ENABLED_ATTR, '')
    document.documentElement.removeAttribute('data-hermes-acrylic-disabled')
  } else {
    if (el && typeof el.remove === 'function') {
      el.remove()
    } else if (el && el.parentNode) {
      el.parentNode.removeChild(el)
    }
    document.documentElement.removeAttribute(ENABLED_ATTR)
    document.documentElement.setAttribute('data-hermes-acrylic-disabled', '')
  }
}

function applyAcrylicEnabled(next) {
  const enabled = Boolean(next)
  try { localStorage.setItem(ENABLED_KEY, String(enabled)) } catch { /* ignore */ }
  if (typeof document !== 'undefined') {
    if (enabled) {
      document.documentElement.setAttribute(ENABLED_ATTR, '')
      document.documentElement.removeAttribute('data-hermes-acrylic-disabled')
    } else {
      document.documentElement.removeAttribute(ENABLED_ATTR)
      document.documentElement.setAttribute('data-hermes-acrylic-disabled', '')
    }
    document.dispatchEvent(new CustomEvent(ENABLED_EVENT, { detail: enabled }))
  }
  installGlobalAcrylicStyle()
  if (enabled) {
    setBackdropEnabled(true)
  }
  syncWindowFocusState()
  return enabled
}

let pluginCtx = null
let focusTrackerInstalled = false
let windowFocusHandler = null
let windowBlurHandler = null
let visibilityChangeHandler = null

function syncWindowFocusState() {
  if (typeof document === 'undefined' || !document.documentElement) return
  // Tracked always: the flag only matters to Acrylic's own CSS, which is present
  // only while the theme is selected or "Every theme" is on.
  const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true
  if (!hasFocus) {
    document.documentElement.setAttribute(UNFOCUSED_ATTR, '')
  } else {
    document.documentElement.removeAttribute(UNFOCUSED_ATTR)
  }
}

function installWindowFocusTracker() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (focusTrackerInstalled) {
    syncWindowFocusState()
    return
  }
  focusTrackerInstalled = true
  windowFocusHandler = () => {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.removeAttribute(UNFOCUSED_ATTR)
    }
  }
  windowBlurHandler = () => {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute(UNFOCUSED_ATTR, '')
    }
  }
  visibilityChangeHandler = () => syncWindowFocusState()
  window.addEventListener('focus', windowFocusHandler, { passive: true })
  window.addEventListener('blur', windowBlurHandler, { passive: true })
  document.addEventListener('visibilitychange', visibilityChangeHandler, { passive: true })
  syncWindowFocusState()
}

function disposeFocusTracker() {
  if (typeof window !== 'undefined') {
    if (windowFocusHandler) window.removeEventListener('focus', windowFocusHandler)
    if (windowBlurHandler) window.removeEventListener('blur', windowBlurHandler)
  }
  if (typeof document !== 'undefined') {
    if (visibilityChangeHandler) document.removeEventListener('visibilitychange', visibilityChangeHandler)
    if (document.documentElement) {
      document.documentElement.removeAttribute(UNFOCUSED_ATTR)
    }
  }
  windowFocusHandler = null
  windowBlurHandler = null
  visibilityChangeHandler = null
  focusTrackerInstalled = false
}

function dispose() {
  disposeFocusTracker()
  removeOptionsStyle()
}

function toggleAcrylicEnabled(next) {
  const current = readAcrylicEnabled()
  const target = typeof next === 'boolean' ? next : !current
  applyAcrylicEnabled(target)
  host.notify({
    kind: 'info',
    message: target
      ? 'Acrylic now tints every theme.'
      : 'Acrylic every-theme mode off. The Windows Acrylic theme still works.'
  })
  return target
}

function useAcrylicEnabled() {
  const [enabled, setEnabled] = useState(readAcrylicEnabled)
  useEffect(() => {
    const sync = (event) => setEnabled(typeof event.detail === 'boolean' ? event.detail : readAcrylicEnabled())
    document.addEventListener(ENABLED_EVENT, sync)
    return () => document.removeEventListener(ENABLED_EVENT, sync)
  }, [])
  return enabled
}

function isDarkMode() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
}

// A preset's values for one mode (only Acrylic's Tint differs by mode).
function presetOptions(id, dark) {
  const p = PRESET_OPTIONS[id] || PRESET_OPTIONS.acrylic
  const tint = typeof p.tint === 'object' ? (dark ? p.tint.dark : p.tint.light) : p.tint
  return { tint, haze: p.haze, grain: p.grain, grainStrength: p.grainStrength }
}

function cleanOptions(o, fallback) {
  return {
    tint: clampNumber(o && o.tint, TINT_MIN, TINT_MAX, fallback.tint),
    haze: clampNumber(o && o.haze, 0, 100, fallback.haze),
    grain: o && GRAIN_KINDS.includes(o.grain) ? o.grain : fallback.grain,
    grainStrength: clampNumber(o && o.grainStrength, 0, 100, fallback.grainStrength)
  }
}

// Custom values, kept in memory too so they still work where storage throws.
let customMemo = null

function readCustom() {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    if (raw) return cleanOptions(JSON.parse(raw), presetOptions('acrylic', isDarkMode()))
  } catch {
    // Unreadable or blocked storage: fall back to this session's values.
  }
  return customMemo
}

function saveCustom(options) {
  customMemo = cleanOptions(options, presetOptions('acrylic', isDarkMode()))
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customMemo)) } catch { /* ignore */ }
  return customMemo
}

// The values the options page shows: the preset's own, or the Custom ones.
function currentOptions(preset, dark) {
  if (preset === CUSTOM) return readCustom() || presetOptions('acrylic', dark)
  return presetOptions(preset, dark)
}

// The plugin's own small stylesheet, CSS variables only, read by the theme's
// rules: the grain tiles (drawn at runtime, so they cannot sit in the static
// theme CSS) and, while Custom is on, Custom's values. html:root outranks
// :root.dark, so one Custom value covers both modes.
function optionsCss(custom) {
  const sanded = PRESET_OPTIONS.sanded
  const heavy = PRESET_OPTIONS.heavy
  const tiles = `:root {
  --acrylic-noise-flyout: ${noiseTile(1, FLYOUT_NOISE_ALPHA)};
  --acrylic-noise-sanded: ${grainImage(sanded.grain, sanded.grainStrength)};
  --acrylic-noise-heavy: ${grainImage(heavy.grain, heavy.grainStrength)};
}`
  if (!custom) return tiles
  return `${tiles}
html:root[${PRESET_ATTR}='${CUSTOM}'] {
  --acrylic-chrome-keep: ${custom.tint}%;
  --acrylic-haze: ${hazeAlpha(custom.haze)};
  --acrylic-grain: ${grainImage(custom.grain, custom.grainStrength)};
  --acrylic-blur: 18px;
  --acrylic-saturate: 1.12;
}`
}

function installOptionsStyle() {
  if (typeof document === 'undefined') return
  const custom = readCustom()
  let el = document.getElementById(OPTIONS_STYLE_ID)
  if (!el) {
    el = document.createElement('style')
    el.id = OPTIONS_STYLE_ID
    const head = document.head || document.documentElement
    if (head && head.appendChild) head.appendChild(el)
  }
  const css = optionsCss(custom)
  if (el.textContent !== css) el.textContent = css
}

function removeOptionsStyle() {
  if (typeof document === 'undefined') return
  const el = document.getElementById(OPTIONS_STYLE_ID)
  if (el) el.remove()
}

function isPreset(name) {
  return PRESET_IDS.includes(name) || (name === CUSTOM && Boolean(readCustom()))
}

function readPreset() {
  try {
    const saved = localStorage.getItem(PRESET_KEY)
    if (isPreset(saved)) return saved
  } catch {
    // localStorage can throw in locked-down webviews.
  }
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute(PRESET_ATTR)
    if (isPreset(attr)) return attr
  }
  return 'acrylic'
}

function applyPreset(name) {
  const preset = isPreset(name) ? name : 'acrylic'
  try { localStorage.setItem(PRESET_KEY, preset) } catch { /* ignore */ }
  installOptionsStyle()
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute(PRESET_ATTR, preset)
    document.dispatchEvent(new CustomEvent(PRESET_EVENT, { detail: preset }))
  }
  installGlobalAcrylicStyle()
  return preset
}

function selectPreset(name) {
  applyPreset(name)
}

// Picking Custom brings back the last Custom values; the first time, it starts
// from what is on screen now.
function selectCustom() {
  if (!readCustom()) saveCustom(currentOptions(readPreset(), isDarkMode()))
  applyPreset(CUSTOM)
}

// Any change on the options page makes the look Custom, starting from the
// values on screen (the preset's, or the earlier Custom ones).
function setOption(key, value) {
  const base = currentOptions(readPreset(), isDarkMode())
  const next = { ...base, [key]: value }
  if (key === 'grain' && value !== 'off' && !next.grainStrength) next.grainStrength = PRESET_OPTIONS.sanded.grainStrength
  saveCustom(next)
  applyPreset(CUSTOM)
}

function usePreset() {
  const [preset, setPreset] = useState(readPreset)
  useEffect(() => {
    const sync = (event) => setPreset(event.detail || readPreset())
    document.addEventListener(PRESET_EVENT, sync)
    applyPreset(readPreset())
    return () => document.removeEventListener(PRESET_EVENT, sync)
  }, [])
  return preset
}

// Preset plus the values behind it; a fresh object on every change, so a
// Custom edit re-renders even though the preset name stays 'custom'.
function useAcrylicOptions() {
  const read = () => ({ preset: readPreset(), custom: readCustom() })
  const [state, setState] = useState(read)
  useEffect(() => {
    const sync = () => setState(read())
    document.addEventListener(PRESET_EVENT, sync)
    return () => document.removeEventListener(PRESET_EVENT, sync)
  }, [])
  return state
}

// "Linux" here means Linux WITHOUT host Glass: the CSS-fallback path. A Hermes with Glass on (Windows, or opt-in Linux Glass) takes the Glass path.
function isLinuxPlatform() {
  const ua = typeof navigator === 'undefined' ? '' : (navigator.userAgent || '')
  return /Linux/i.test(ua) && !/Android/i.test(ua) && !readGlassOn()
}

function readGlassOn() {
  if (typeof document === 'undefined') return false
  const root = document.documentElement
  return root.hasAttribute('data-hermes-glass') || root.hasAttribute('data-hermes-glass-on')
}

// Hermes' own deep link to Settings ▸ Appearance ▸ Window & layout, where
// Window Translucency lives (appearance-subpages.ts 'window-layout'). The
// nav.settings action alone lands on Settings' first page, so once it has
// opened Settings (hash route), step on to that page.
const GLASS_SETTINGS_HASH = '#/settings?tab=config:appearance&page=window-layout'

function openAppearanceSettings() {
  const r = pluginCtx && typeof pluginCtx.runAction === 'function' ? pluginCtx.runAction('nav.settings') : null
  if (!r || r.ok === false) {
    host.notify({ kind: 'info', message: 'Open Settings → Appearance → Window & layout → Window Translucency and pick Glass.' })
    return
  }
  setTimeout(() => {
    if (typeof location !== 'undefined' && location.hash.startsWith('#/settings')) location.hash = GLASS_SETTINGS_HASH
  }, 60)
}

function setBackdropEnabled(on) {
  try {
    if (!host.settings) return
    if ((host.settings.get('backdrop.v1') === true) === on) return
    host.settings.set('backdrop.v1', on)
  } catch {
    // Older Desktop without host.settings.
  }
}

function clearChatBackdrop() {
  setBackdropEnabled(false)
  host.notify({ kind: 'info', message: 'Chat Backdrop cleared. Under Glass it stays off so dragging does not composite the filler JPEG.' })
}

function applyNotice(glassOn) {
  if (isLinuxPlatform()) {
    return 'Windows Acrylic theme on. This Hermes has no Glass — a CSS stand-in over Chat Backdrop (14px blur). It does not blur other apps.'
  }
  if (glassOn) {
    return 'Windows Acrylic theme on. Glass is on, so Windows draws the real acrylic behind the window.'
  }
  return 'Windows Acrylic theme on. For real acrylic turn on Glass: Settings → Appearance → Window Translucency → Glass.'
}

function applyAcrylic() {
  if (!requestTheme(THEME_NAME)) {
    host.notifyError('Windows Acrylic theme is not available yet — try ⌘K → Reload desktop plugins.')
    return false
  }
  host.notify({ kind: 'info', message: applyNotice(readGlassOn()) })
  return true
}

// Read-only observation of the host's own <html> flags; observer is torn down with the component.
function useGlassOn() {
  const [on, setOn] = useState(readGlassOn)
  useEffect(() => {
    const mo = new MutationObserver(() => setOn(readGlassOn()))
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-hermes-glass', 'data-hermes-glass-on']
    })
    return () => mo.disconnect()
  }, [])
  return on
}

function AppearanceCard() {
  const { themeName } = useTheme()
  const enabled = useAcrylicEnabled()
  const glassOn = useGlassOn()
  const preset = usePreset()
  const linux = isLinuxPlatform()
  const active = themeName === THEME_NAME
  const step = text => jsx('li', { children: text })
  const steps = linux ? [
    'Pick the Windows Acrylic theme (or turn on Every theme to tint any theme).',
    'This Hermes has no Glass, so you get a CSS stand-in over Chat Backdrop: Acrylic blurs at 14px, Expressive at 16px, the others at 18px. It does not blur other apps.',
    'Optional, outside this plugin: a KWin or Hyprland blur rule can frost the real desktop.'
  ] : glassOn ? [
    'Glass is on: Windows draws the real acrylic behind the window.',
    'Presets set the tint, haze and grain: Acrylic, Frosted, Sanded, Expressive, Heavy frost. Change any of them in Tint, haze & grain and the look becomes Custom.',
    'Ctrl+K and full-page cards (Settings, Scheduled jobs) show the real acrylic; menus and dialogs get the theme\'s solid background. The terminal is one solid panel in the theme colour.'
  ] : [
    'Pick the Windows Acrylic theme (or turn on Every theme to tint any theme).',
    'For real acrylic: Settings → Appearance → Window Translucency → Glass (the Glass settings button opens Settings). Acrylic never changes that setting for you.',
    'Until Glass is on you see a CSS stand-in over Chat Backdrop.'
  ]
  const status = linux
    ? `Theme: ${themeName || 'default'} · ${PRESET_LABELS[preset]} · Every theme: ${enabled ? 'on' : 'off'} · CSS stand-in (no Glass)`
    : `Theme: ${themeName || 'default'} · ${PRESET_LABELS[preset]} · Every theme: ${enabled ? 'on' : 'off'} · Glass: ${glassOn ? 'on' : 'off'}`
  const footnote = linux
    ? 'Real acrylic needs Windows 11 22H2+ with Glass on. This stand-in never blurs other windows.'
    : 'Real acrylic needs Windows 11 22H2+ with Glass on. Clear is not acrylic.'

  return jsxs('section', {
    className: 'flex flex-col gap-2 rounded-lg border border-(--ui-stroke-tertiary) p-3 text-sm',
    children: [
      jsxs('div', {
        className: 'flex items-center justify-between gap-2',
        children: [
          jsxs('div', { children: [
            jsx('div', { className: 'font-medium', children: 'Windows Acrylic' }),
            jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: status })
          ] }),
          jsxs('div', {
            className: 'flex items-center gap-1',
            children: [
              jsx(Button, {
                size: 'sm',
                disabled: active,
                onClick: () => { haptic('tap'); applyAcrylic() },
                children: active ? 'Acrylic Theme' : 'Set Acrylic Theme'
              }),
              jsx(Button, {
                size: 'sm',
                variant: enabled ? 'secondary' : 'outline',
                onClick: () => { haptic('tap'); toggleAcrylicEnabled() },
                children: enabled ? 'Every theme · on' : 'Every theme · off'
              }),
              jsx(Button, {
                size: 'sm',
                variant: 'ghost',
                onClick: () => { haptic('tap'); openAppearanceSettings() },
                children: 'Glass settings'
              })
            ]
          })
        ]
      }),
      jsxs('div', {
        className: 'flex flex-wrap gap-1',
        children: [
          ...[...PRESET_IDS, CUSTOM].map(id => jsx(Button, {
            key: id,
            size: 'sm',
            disabled: preset === id,
            onClick: () => { haptic('tap'); if (id === CUSTOM) selectCustom(); else selectPreset(id) },
            children: preset === id ? `${PRESET_LABELS[id]} · on` : PRESET_LABELS[id]
          })),
          jsx(Button, {
            key: 'options',
            size: 'sm',
            variant: 'ghost',
            onClick: () => { haptic('tap'); openOptions() },
            children: 'Tint, haze & grain…'
          })
        ]
      }),
      jsx('ol', {
        className: 'list-decimal pl-5 text-xs text-(--ui-text-secondary) space-y-0.5',
        children: steps.map(step)
      }),
      jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: footnote })
    ]
  })
}

// Settings ▸ Plugins ▸ Acrylic (contribution id `hermes-acrylic:options`).
const OPTIONS_HASH = '#/settings?tab=plugins&plugin=hermes-acrylic'

function openOptions() {
  if (typeof location !== 'undefined') location.hash = OPTIONS_HASH
}

// Hermes' Slider is not on the plugin SDK, so this is the same control by hand:
// its hairline track and primary-accent thumb, with the value beside it.
function OptionSlider({ id, label, value, min, max, unit = '', disabled = false, onChange }) {
  return jsxs('div', {
    className: 'flex items-center gap-3',
    children: [
      jsx('input', {
        id,
        type: 'range',
        min,
        max,
        step: 1,
        value,
        disabled,
        'aria-label': label,
        className: 'h-1 w-40 cursor-pointer appearance-none rounded-full bg-(--ui-stroke-tertiary) disabled:cursor-default disabled:opacity-50',
        style: { accentColor: 'var(--dt-primary)' },
        onChange: e => onChange(Number(e.currentTarget.value))
      }),
      jsx('span', {
        className: 'w-10 text-right text-xs tabular-nums text-(--ui-text-secondary)',
        children: `${value}${unit}`
      })
    ]
  })
}

function OptionsPage() {
  const { themeName, resolvedMode } = useTheme()
  const { preset } = useAcrylicOptions()
  const enabled = useAcrylicEnabled()
  const glassOn = useGlassOn()
  const dark = resolvedMode ? resolvedMode === 'dark' : isDarkMode()
  const o = currentOptions(preset, dark)
  const active = enabled || themeName === THEME_NAME
  const grainOff = o.grain === 'off'
  const rows = [
    jsx(ListRow, {
      key: 'preset',
      title: 'Preset',
      description: 'A preset fills in the settings below. Change any of them and the preset becomes Custom.',
      action: jsx(SegmentedControl, {
        sizing: 'content',
        value: preset,
        options: [...PRESET_IDS, CUSTOM].map(id => ({ id, label: PRESET_LABELS[id] })),
        onChange: id => { haptic('tap'); if (id === CUSTOM) selectCustom(); else selectPreset(id) }
      })
    }),
    jsx(ListRow, {
      key: 'tint',
      title: 'Tint',
      description: glassOn
        ? 'How much of the theme colour lies over the glass. Lower shows more of your desktop.'
        : 'How much of the theme colour lies over the glass. Lower shows more of your desktop. Takes effect with Glass on.',
      action: jsx(OptionSlider, { id: 'hermes-acrylic-tint', label: 'Tint', value: o.tint, min: TINT_MIN, max: TINT_MAX, unit: '%', onChange: v => setOption('tint', v) })
    }),
    jsx(ListRow, {
      key: 'haze',
      title: 'Frost haze',
      description: 'A milky layer over the glass. Raise it for heavy frosted glass.',
      action: jsx(OptionSlider, { id: 'hermes-acrylic-haze', label: 'Frost haze', value: o.haze, min: 0, max: 100, onChange: v => setOption('haze', v) })
    }),
    jsx(ListRow, {
      key: 'grain',
      title: 'Grain',
      description: 'A fine sand texture on the glass.',
      action: jsx(SegmentedControl, {
        value: o.grain,
        options: GRAIN_KINDS.map(id => ({ id, label: GRAIN_LABELS[id] })),
        onChange: id => { haptic('tap'); setOption('grain', id) }
      })
    }),
    jsx(ListRow, {
      key: 'grain-strength',
      title: 'Grain strength',
      description: grainOff ? 'Pick Fine or Coarse grain first.' : 'How visible the grain is.',
      action: jsx(OptionSlider, { id: 'hermes-acrylic-grain-strength', label: 'Grain strength', value: o.grainStrength, min: 0, max: 100, disabled: grainOff, onChange: v => setOption('grainStrength', v) })
    }),
    jsx(ListRow, {
      key: 'blur',
      title: 'Blur',
      description: 'Windows draws the blur behind the window, and no app can make it stronger. Glass itself is in Settings → Appearance → Window & layout.',
      action: jsx(Button, { size: 'sm', variant: 'outline', onClick: () => { haptic('tap'); openAppearanceSettings() }, children: 'Glass settings' })
    })
  ]
  return jsxs('div', {
    className: 'flex flex-col',
    children: [
      active ? null : jsx('div', {
        key: 'inactive',
        className: 'mb-2 rounded-md border border-(--ui-stroke-tertiary) p-3 text-xs text-(--ui-text-secondary)',
        children: 'These settings show while the Windows Acrylic theme is selected or Every theme is on.'
      }),
      ...rows
    ]
  })
}

function StatusChip() {
  const { themeName } = useTheme()
  const enabled = useAcrylicEnabled()
  const glassOn = useGlassOn()
  const preset = usePreset()
  const linux = isLinuxPlatform()
  const on = enabled || themeName === THEME_NAME
  const look = (PRESET_LABELS[preset] || 'acrylic').toLowerCase()
  const label = !on ? '◇ acrylic off'
    : glassOn ? `◇ ${look}`
    : linux ? `◇ ${look} (css)`
    : `◇ ${look} (no glass)`
  const title = !on ? 'Acrylic off. Click to tint every theme.'
    : glassOn ? 'Acrylic on Glass: Windows draws the real acrylic.'
    : linux ? 'CSS acrylic stand-in — no Glass here, other apps are not blurred.'
    : 'Acrylic on. Turn on Glass in Settings → Appearance for real acrylic.'
  return jsx('button', {
    type: 'button',
    title,
    className: 'px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)',
    onClick: () => { haptic('tap'); toggleAcrylicEnabled() },
    children: label
  })
}

export default {
  id: ID,
  name: 'Hermes Acrylic',
  register(ctx) {
    pluginCtx = ctx
    applyPreset(readPreset())
    installWindowFocusTracker()
    installGlobalAcrylicStyle()
    ctx.registerMany([
      { id: 'theme', area: THEMES_AREA, data: THEME },
      {
        id: 'toggle-acrylic',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.toggle`,
          label: 'Acrylic: tint every theme (on/off)',
          keywords: ['acrylic', 'toggle', 'universal', 'enable', 'disable', 'glass', 'translucent'],
          run: () => { toggleAcrylicEnabled(); haptic('tap') }
        }
      },
      {
        id: 'apply',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.apply`,
          label: 'Apply Windows Acrylic Theme',
          keywords: ['acrylic', 'glass', 'windows', 'theme', 'mica', 'translucent'],
          run: () => void applyAcrylic()
        }
      },
      ...PRESET_IDS.map(id => ({
        id: `preset-${id}`,
        area: PALETTE_AREA,
        data: {
          id: `${ID}.preset.${id}`,
          label: `Acrylic preset: ${PRESET_LABELS[id]}`,
          keywords: ['acrylic', 'preset', 'material', id, PRESET_LABELS[id].toLowerCase()],
          run: () => { selectPreset(id); haptic('tap') }
        }
      })),
      {
        id: 'clear-backdrop',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.clear-backdrop`,
          label: 'Acrylic: clear Chat Backdrop',
          keywords: ['acrylic', 'backdrop', 'cpu', 'glass', 'jpeg', 'drag'],
          run: () => { clearChatBackdrop(); haptic('tap') }
        }
      },
      {
        id: 'open-appearance',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.glass-help`,
          label: 'Acrylic: open Settings → Appearance (Glass)',
          keywords: ['acrylic', 'glass', 'appearance', 'linux', 'fallback'],
          run: () => openAppearanceSettings()
        }
      },
      { id: 'appearance', area: APPEARANCE_AREAS.extra, render: () => jsx(AppearanceCard, {}) },
      { id: 'chip', area: STATUSBAR_AREAS.right, order: 140, render: () => jsx(StatusChip, {}) }
    ])
    // Settings ▸ Plugins ▸ Acrylic. Feature-detected: older Hermes builds
    // without plugin settings pages still get the card and the presets.
    ctx.registerSettingsPage?.({
      id: 'options',
      title: 'Acrylic',
      icon: 'paintcan',
      render: () => jsx(OptionsPage, {})
    })
  },
  dispose() {
    dispose()
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  installWindowFocusTracker()
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    UNFOCUSED_ATTR,
    installWindowFocusTracker,
    syncWindowFocusState,
    disposeFocusTracker,
    dispose
  }
}
