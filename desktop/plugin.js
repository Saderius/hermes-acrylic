// Hermes Acrylic — Windows 11 Acrylic look for Hermes Desktop.
// Disk plugin: plain ESM, no build, no JSX. Real acrylic is the host Glass
// path (Electron setBackgroundMaterial('acrylic') on Win11 22H2+). Linux has
// no Glass row; the no-Glass branch is a CSS fallback over Chat Backdrop.
// The plugin never calls DWM directly: it syncs the host's own translucency
// store (hermes.desktop.translucency.v2) and toggles Electron's background
// material through window.hermesDesktop.setTranslucency, which is what
// actually drives DWM.
//
// Universal Theme Acrylic Engine:
// Tints Windows 11 DWM Acrylic with the active theme's seed colors via color-mix:
// --theme-background-seed, --theme-sidebar-seed, --theme-card-seed,
// --theme-elevated-seed, --theme-bubble-seed, and --theme-foreground.
import {
  APPEARANCE_AREAS, Button, PALETTE_AREA, STATUSBAR_AREAS, THEMES_AREA,
  haptic, host, requestTheme, useTheme, writeClipboardText
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

// WinUI Acrylic Base / Packshot Studio: chrome seed #202020 / #FCFCFC.
// Under live Glass, DWM already tints natively, so body paints only the light
// --material-tint-glass sheet (.46 dark / .44 light for the default preset);
// the full Packshot --material-tint is the no-Glass fallback. Raised cards
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

// Static sand grain. A few dots in a tiled SVG — no feTurbulence, no animation.
const SAND_GRAIN =
  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'48\' height=\'48\'%3E%3Cg fill=\'%23000\' fill-opacity=\'.22\'%3E%3Ccircle cx=\'4\' cy=\'6\' r=\'.7\'/%3E%3Ccircle cx=\'20\' cy=\'14\' r=\'.55\'/%3E%3Ccircle cx=\'36\' cy=\'8\' r=\'.6\'/%3E%3Ccircle cx=\'12\' cy=\'28\' r=\'.5\'/%3E%3Ccircle cx=\'30\' cy=\'34\' r=\'.65\'/%3E%3Ccircle cx=\'44\' cy=\'26\' r=\'.45\'/%3E%3C/g%3E%3Cg fill=\'%23fff\' fill-opacity=\'.2\'%3E%3Ccircle cx=\'15\' cy=\'4\' r=\'.5\'/%3E%3Ccircle cx=\'8\' cy=\'40\' r=\'.6\'/%3E%3Ccircle cx=\'27\' cy=\'22\' r=\'.5\'/%3E%3Ccircle cx=\'40\' cy=\'42\' r=\'.55\'/%3E%3Ccircle cx=\'22\' cy=\'44\' r=\'.4\'/%3E%3C/g%3E%3C/svg%3E")'

// Subtle Win11 Acrylic Noise Texture: very fine 3.5% opacity grain for flyouts and Ctrl+K.
const FLYOUT_GRAIN =
  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'48\' height=\'48\'%3E%3Cg fill=\'%23000\' fill-opacity=\'.035\'%3E%3Ccircle cx=\'4\' cy=\'6\' r=\'.7\'/%3E%3Ccircle cx=\'20\' cy=\'14\' r=\'.55\'/%3E%3Ccircle cx=\'36\' cy=\'8\' r=\'.6\'/%3E%3Ccircle cx=\'12\' cy=\'28\' r=\'.5\'/%3E%3Ccircle cx=\'30\' cy=\'34\' r=\'.65\'/%3E%3Ccircle cx=\'44\' cy=\'26\' r=\'.45\'/%3E%3C/g%3E%3Cg fill=\'%23fff\' fill-opacity=\'.035\'%3E%3Ccircle cx=\'15\' cy=\'4\' r=\'.5\'/%3E%3Ccircle cx=\'8\' cy=\'40\' r=\'.6\'/%3E%3Ccircle cx=\'27\' cy=\'22\' r=\'.5\'/%3E%3Ccircle cx=\'40\' cy=\'42\' r=\'.55\'/%3E%3Ccircle cx=\'22\' cy=\'44\' r=\'.4\'/%3E%3C/g%3E%3C/svg%3E")'

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
  --acrylic-flyout-grain: ${FLYOUT_GRAIN};
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
  --acrylic-recessed: color-mix(in srgb, var(--theme-sidebar-seed, #141418) 34%, rgba(0, 0, 0, 0.16));
  --control-fill: color-mix(in srgb, var(--theme-card-seed, #2B2B2B) 44%, rgba(255, 255, 255, 0.05));
  --control-fill-hover: color-mix(in srgb, var(--theme-card-seed, #2B2B2B) 56%, rgba(255, 255, 255, 0.08));
  --bubble-fill: color-mix(in srgb, var(--theme-bubble-seed, var(--theme-card-seed, #2B2B2B)) 50%, rgba(255, 255, 255, 0.06));
  --layer-stroke: color-mix(in srgb, var(--theme-foreground, #FFFFFF) 11%, transparent);
  --layer-hi: inset 0 1px 0 rgba(255, 255, 255, 0.09);
  --acrylic-flyout-grain: ${FLYOUT_GRAIN};
  --acrylic-flyout: color-mix(in srgb, var(--theme-elevated-seed, #24262E) 68%, rgba(16, 18, 24, 0.14));
  --acrylic-popover: var(--acrylic-flyout);
  --acrylic-popover-fg: var(--theme-foreground, #FFFFFF);
  --acrylic-tooltip: color-mix(in srgb, var(--theme-elevated-seed, #24262E) 92%, rgba(16, 18, 24, 0.06));
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
  --acrylic-grain: ${SAND_GRAIN};
}
:root[data-hermes-acrylic-preset='expressive'] {
  --acrylic-chrome-keep: 68%;
  --acrylic-blur: 16px;
  --acrylic-saturate: 1.05;
}
:root.dark[data-hermes-acrylic-preset='expressive'] {
  --acrylic-chrome-keep: 68%;
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
  --ui-terminal-surface-background: transparent !important;
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

/* Override host [data-glass-opaque] descendant variable scopes */
${both(`[data-glass-opaque]`)} {
  --ui-chat-surface-background: var(--acrylic-flyout) !important;
  --ui-editor-surface-background: var(--control-fill) !important;
  --ui-sidebar-surface-background: var(--acrylic-recessed) !important;
}

/* Settings & OverlayView Modal Cards ([data-overlay-surface] / [data-glass-raised]):
   1. Clear backdrop-blur-[0.125rem] on [data-overlay-surface] under Glass so DWM Acrylic is unobstructed.
   2. Override styles.css:730's 94%-opaque --ui-*-surface-background rules on [data-glass-raised].
   3. Give [data-glass-raised] a translucent Acrylic tint (--acrylic-overlay-card) + noise grain while
      installFlyoutCutoutMask() cuts out [data-contrib-shell] and [data-persistent-terminal] underneath it! */
${underGlass(`[data-overlay-surface]`)} {
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

/* Packshot chrome under Glass: body paints ONLY --material-tint-glass */
:root[data-hermes-glass] body,
:root[data-hermes-glass-on] body {
  background-color: var(--material-tint-glass) !important;
  background-image: none !important;
  filter: none !important;
  mix-blend-mode: normal !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
:root[data-hermes-glass][data-hermes-glass-scope='sidebar'] body {
  background: linear-gradient(
    to right,
    var(--material-tint-glass) var(--glass-rail-edge, 0px),
    var(--ui-bg-chrome) var(--glass-rail-edge, 0px)
  ) !important;
}
:root[data-hermes-glass][data-hermes-glass-scope='sidebar'][dir='rtl'] body {
  background: linear-gradient(
    to left,
    var(--material-tint-glass) var(--glass-rail-edge, 0px),
    var(--ui-bg-chrome) var(--glass-rail-edge, 0px)
  ) !important;
}

/* No-Glass fallback (Linux; Windows/macOS before Glass is on) */
:root:not([data-hermes-glass]):not([data-hermes-glass-on]) body {
  background-color: var(--material-tint) !important;
  background-image: var(--acrylic-grain, none) !important;
  background-repeat: repeat !important;
  background-size: 48px 48px !important;
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
   Packshot Cutout Architecture: under live Glass, the underlying in-page DOM
   is physically cut out by installFlyoutCutoutMask()'s clip-path: path(evenodd, ...),
   exposing 100% pure Windows 11 DWM Acrylic without any Chromium backdrop-filter conflict!
   Under no-Glass, CSS backdrop-filter blurs the Chat Backdrop fallback. */
${both(`[data-slot='popover-content'], [data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='select-content'], [data-slot='hover-card-content'], [role='menu'], [data-slot='dialog-content'], [data-radix-popper-content-wrapper] > [data-side]`)} {
  background-color: var(--acrylic-flyout) !important;
  background-image: var(--acrylic-flyout-grain) !important;
  color: var(--acrylic-popover-fg);
  border: 1px solid var(--layer-stroke) !important;
  box-shadow: var(--layer-hi), 0 16px 48px rgba(0, 0, 0, 0.55) !important;
  opacity: 1 !important;
  animation: none !important;
  filter: none !important;
}
${underGlass(`[data-slot='popover-content'], [data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='select-content'], [data-slot='hover-card-content'], [role='menu'], [data-slot='dialog-content'], [data-radix-popper-content-wrapper] > [data-side], [data-radix-popper-content-wrapper]`)} {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
${noGlass(`[data-slot='popover-content'], [data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='select-content'], [data-slot='hover-card-content'], [role='menu'], [data-slot='dialog-content'], [data-radix-popper-content-wrapper] > [data-side], [data-radix-popper-content-wrapper]`)} {
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
   and it gets the Tier 3 fill plus a cutout hole. Triage's detail card is listed by class. */
${both(`[data-acrylic-flyout], .hsj-detail`)} {
  background-color: var(--acrylic-flyout) !important;
  background-image: var(--acrylic-flyout-grain) !important;
}
${underGlass(`[data-acrylic-flyout], .hsj-detail`)} {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

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
${both(`[data-slot='group-chat-message-content'], [data-slot='pet-plugin-bubble'], [data-slot='user-message'], [data-slot='kanban-card'], .cursor-grab[class*='bg-(--ui-bg-elevated)'], [class*='ui-widget-surface-background'], [data-slot='tool-block'], [data-slot='file-diff-panel'], [class*='bg-card'], [class*='bg-(--dt-card)'], [class*='bg-(--ui-bg-editor)'], [class*='bg-(--ui-bg-card)']`)} {
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

/* Composer dock, root & surface (Searchbox-grade Tier 3 Acrylic + Cutout Mask):
   [data-slot='composer-surface'] (.group/composer-surface) cuts a rounded-rect hole out of
   [data-slot='composer-bounds'] via installFlyoutCutoutMask() so scrolling chat messages
   never bleed through and pure Windows 11 DWM Acrylic shines underneath. */
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
   Under live Glass, the underlying in-page shell is cut out with clip-path: path(evenodd, ...),
   exposing pure DWM Acrylic, so backdrop-filter is set to none !important to avoid Chromium dark plate artifacts. */
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
${underGlass(`[role='dialog'][class*='left-1/2'], [role='dialog'][aria-label='Command palette']`)} {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
${noGlass(`[role='dialog'][class*='left-1/2'], [role='dialog'][aria-label='Command palette']`)} {
  -webkit-backdrop-filter: blur(24px) saturate(1.3) !important;
  backdrop-filter: blur(24px) saturate(1.3) !important;
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
  background: var(--control-fill) !important;
  border: 1px solid var(--layer-stroke) !important;
  border-radius: 8px !important;
  inset: 4px 6px 6px 6px !important;
  contain: none !important;
  isolation: auto !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
:root,
:root.dark {
  --ui-terminal-surface-background: transparent !important;
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
${both(`.xterm-screen canvas[data-hermes-acrylic-lost], .xterm-screen:has(.xterm-rows) canvas`)} {
  display: none !important;
}
${both(`.xterm-screen canvas`)} {
  display: none !important;
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
  background-image: var(--acrylic-grain, none);
  background-repeat: repeat;
  background-size: 48px 48px;
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
  description: 'Windows materials: Acrylic (.44/.46 / 14px), Frosted (.58 / 18px), Sanded (frosted + static grain), Expressive (.68 / 16px). Real blur is Win11 Glass. Linux / Glass off blurs Chat Backdrop only. Reduced transparency goes solid.',
  colors: LIGHT,
  darkColors: DARK,
  typography: {
    fontSans: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
    fontMono: "'CascadiaCode Nerd Font', 'Cascadia Code Nerd Font', 'Cascadia Code', 'Cascadia Mono', Consolas, ui-monospace, monospace"
  },
  customCSS: '/* Universal Acrylic is active via #hermes-acrylic-global-css */'
}

const PRESET_IDS = ['acrylic', 'frosted', 'sanded', 'expressive']
const PRESET_LABELS = { acrylic: 'Acrylic', frosted: 'Frosted', sanded: 'Sanded', expressive: 'Expressive' }
const PRESET_KEY = 'hermes-acrylic-preset'
const PRESET_ATTR = 'data-hermes-acrylic-preset'
const PRESET_EVENT = 'hermes-acrylic-preset'

// Host translucency store — the same key the desktop app listens on.
const TRANSLUCENCY_KEY = 'hermes.desktop.translucency.v2'
// Backdrop material: under-window = live Acrylic, titlebar = Smooth Mica.
const MATERIAL_KEY = 'hermes-acrylic-material'
const MATERIAL_EVENT = 'hermes-acrylic-material'
const MATERIAL_IDS = ['under-window', 'titlebar']
const MATERIAL_LABELS = { 'under-window': 'Live Acrylic', titlebar: 'Smooth Mica' }

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
  return true
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
    if (!isLinuxPlatform()) {
      syncHostTranslucency({ material: readDragMaterial(), scope: 'window' })
    }
  }
  scanTerminalCanvases()
  syncFlyoutCutoutMask()
  syncWindowFocusState()
  return enabled
}

let focusTrackerInstalled = false
let windowFocusHandler = null
let windowBlurHandler = null
let visibilityChangeHandler = null

function syncWindowFocusState() {
  if (typeof document === 'undefined' || !document.documentElement) return
  if (!readAcrylicEnabled()) {
    document.documentElement.removeAttribute(UNFOCUSED_ATTR)
    return
  }
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
    if (typeof document !== 'undefined' && document.documentElement && readAcrylicEnabled()) {
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
  disposeCutoutMask()
}

function toggleAcrylicEnabled(next) {
  const current = readAcrylicEnabled()
  const target = typeof next === 'boolean' ? next : !current
  applyAcrylicEnabled(target)
  host.notify({
    kind: 'info',
    message: target
      ? 'Universal Acrylic enabled for all themes.'
      : 'Universal Acrylic disabled.'
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

function readPreset() {
  try {
    const saved = localStorage.getItem(PRESET_KEY)
    if (PRESET_IDS.includes(saved)) return saved
  } catch {
    // localStorage can throw in locked-down webviews.
  }
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute(PRESET_ATTR)
    if (PRESET_IDS.includes(attr)) return attr
  }
  return 'acrylic'
}

function applyPreset(name) {
  const preset = PRESET_IDS.includes(name) ? name : 'acrylic'
  try { localStorage.setItem(PRESET_KEY, preset) } catch { /* ignore */ }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute(PRESET_ATTR, preset)
    document.dispatchEvent(new CustomEvent(PRESET_EVENT, { detail: preset }))
  }
  installGlobalAcrylicStyle()
  return preset
}

function selectPreset(name) {
  applyPreset(name)
  // Keep the host sync in lockstep with the preset.
  if (!isLinuxPlatform()) syncHostTranslucency({ material: readDragMaterial(), scope: 'window' })
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

// "Linux" here means Linux WITHOUT host Glass: the CSS-fallback path. A Hermes
// launched with opt-in Linux Glass (HERMES_DESKTOP_LINUX_GLASS=1, see
// patches/hermes-linux-glass-optin.patch) reports glassSupported and takes the
// same Glass path as Windows, with the compositor supplying the blur.
function isLinuxPlatform() {
  const ua = typeof navigator === 'undefined' ? '' : (navigator.userAgent || '')
  if (!/Linux/i.test(ua) || /Android/i.test(ua)) return false
  const hostGlass = typeof window !== 'undefined' && window.hermesDesktop && window.hermesDesktop.glassSupported === true
  return !hostGlass
}

function readGlassOn() {
  if (typeof document === 'undefined') return false
  const root = document.documentElement
  return root.hasAttribute('data-hermes-glass') || root.hasAttribute('data-hermes-glass-on')
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

// ---------------------------------------------------------------------------
// Host translucency sync (DWM material). Hermes stores its TranslucencyBook in
// localStorage under 'hermes.desktop.translucency.v2' and listens for a
// 'storage' event on that key (apps/desktop/src/store/translucency.ts). Writing
// BOTH light and dark slots stops the "tuned Dark, Light falls back to
// scope:'sidebar' / intensity 0 and paints solid white" bug.
// ---------------------------------------------------------------------------

function readDragMaterial() {
  try {
    const saved = localStorage.getItem(MATERIAL_KEY)
    if (MATERIAL_IDS.includes(saved)) return saved
  } catch { /* ignore */ }
  return 'under-window'
}

function writeDragMaterial(material) {
  const m = MATERIAL_IDS.includes(material) ? material : 'under-window'
  try { localStorage.setItem(MATERIAL_KEY, m) } catch { /* ignore */ }
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent(MATERIAL_EVENT, { detail: m }))
  }
  return m
}

// Preserve a user-tuned non-zero Glass intensity if the caller didn't set one
// (upgrade legacy default 29 or old Packshot 45 to 85 so native Win11 acrylic shines through).
function pickHostIntensity(book, fallback) {
  const slots = [book && book.base, book && book.light, book && book.dark]
  for (const slot of slots) {
    if (slot && typeof slot.intensity === 'number' && slot.intensity > 0 && slot.intensity !== 29 && slot.intensity !== 45) {
      return slot.intensity
    }
  }
  return fallback
}

// Default Glass intensity 85 (keep 85%). Native Win11 acrylic already blurs +
// tints the window via DWM; a high host keep% lets Hermes's live acrylic match
// native Windows 11 acrylic swatches 1:1. An explicit user-tuned value wins.
function syncHostTranslucency({ material = 'under-window', scope = 'window', intensity, fade = 0 } = {}) {
  if (isLinuxPlatform()) return false
  const mat = MATERIAL_IDS.includes(material) ? material : 'under-window'
  const sc = scope === 'sidebar' ? 'sidebar' : 'window'

  let book = {}
  try {
    const raw = localStorage.getItem(TRANSLUCENCY_KEY)
    if (raw) book = JSON.parse(raw) || {}
  } catch { book = {} }

  const resolved = (typeof intensity === 'number' && intensity > 0) ? intensity : pickHostIntensity(book, 85)
  const slot = { intensity: resolved, fade, material: mat, scope: sc }
  const nextBook = { ...book, mode: 'glass', base: { ...slot }, light: { ...slot }, dark: { ...slot } }

  let json = ''
  try {
    json = JSON.stringify(nextBook)
    localStorage.setItem(TRANSLUCENCY_KEY, json)
  } catch { /* ignore */ }

  try {
    window.dispatchEvent(new StorageEvent('storage', {
      key: TRANSLUCENCY_KEY,
      newValue: json
    }))
  } catch { /* ignore */ }

  // Fire the same IPC the host store fires so Electron main applies DWM
  // material in THIS window without waiting for the event round-trip.
  try {
    window.hermesDesktop?.setTranslucency?.({ mode: 'glass', intensity: resolved, fade, material: mat, scope: sc })
  } catch { /* ignore */ }

  return true
}

function setDragMaterial(material) {
  const m = writeDragMaterial(material)
  syncHostTranslucency({ material: m, scope: 'window' })
  host.notify({
    kind: 'info',
    message: m === 'titlebar'
      ? 'Backdrop: Smooth Mica (titlebar). DWM stops re-blurring while you drag the window.'
      : 'Backdrop: Live Acrylic (under-window). Live desktop blur, higher drag cost.'
  })
  return m
}

// Windows 11 DWM quirk: setBackgroundMaterial('acrylic') sometimes drops on
// first paint until toggled off→on. Bounce to 'clear' then re-apply.
function wakeWindowsAcrylic() {
  if (isLinuxPlatform()) {
    host.notify({ kind: 'info', message: 'Windows DWM re-sync is Windows-only. Linux uses the CSS fallback.' })
    return
  }
  try {
    window.hermesDesktop?.setTranslucency?.({ mode: 'clear', intensity: 0, fade: 0, material: 'under-window', scope: 'window' })
  } catch { /* ignore */ }
  if (typeof setTimeout !== 'function') return
  setTimeout(() => {
    syncHostTranslucency({ material: readDragMaterial(), scope: 'window' })
    host.notify({ kind: 'info', message: 'Windows Acrylic re-synced with DWM.' })
  }, 60)
}

// Glass often lands after the theme. Don't mount filler-bg0 during that gap
// on Windows — the blur runs until the attribute appears, which was the spike.
let fallbackTimer = 0
function cancelFallbackBackdrop() {
  if (!fallbackTimer) return
  clearTimeout(fallbackTimer)
  fallbackTimer = 0
}
function scheduleFallbackBackdrop() {
  cancelFallbackBackdrop()
  fallbackTimer = setTimeout(() => {
    fallbackTimer = 0
    if (!readGlassOn()) setBackdropEnabled(true)
  }, 800)
}

// One-shot and ongoing: under Acrylic, backdrop.v1 is kept mounted so the
// unfocused reveal can paint instantly (while focused under Glass it is
// completely hidden with display: none !important). If Acrylic is disabled
// and Glass is on, keep backdrop.v1 false.
function installGlassBackdropLock() {
  if (installGlassBackdropLock.done || typeof document === 'undefined') return
  installGlassBackdropLock.done = true
  const lock = () => {
    if (readAcrylicEnabled()) {
      setBackdropEnabled(true)
      return
    }
    if (!readGlassOn()) return
    cancelFallbackBackdrop()
    setBackdropEnabled(false)
  }
  lock()
  const mo = new MutationObserver(lock)
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-hermes-glass', 'data-hermes-glass-on']
  })
}

// ---------------------------------------------------------------------------
// True transparent terminal: force xterm off its opaque WebGL <canvas> renderer
// and onto the native HTML DOM renderer (.xterm-rows, default cell alpha = 0).
//
// WebGL canvas fails in 0ms on new terminals (HTMLCanvasElement.prototype.getContext
// returns null for WebGL in .xterm-screen), and existing terminals lose context
// in 0ms via setTimeout interception in loseTerminalCanvasContext.
// Runs across ALL themes whenever Universal Acrylic is enabled!
// ---------------------------------------------------------------------------
function installTerminalCanvasInterceptor() {
  if (typeof HTMLCanvasElement === 'undefined') return
  if (HTMLCanvasElement.prototype._hermesAcrylicPatched) return

  const origGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype._origGetContext = origGetContext
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    if (
      (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') &&
      readAcrylicEnabled() &&
      (this.classList?.contains('xterm-screen-canvas') || this.closest?.('.xterm-screen') || this._inXtermScreen)
    ) {
      // Disallow WebGL for xterm canvases so @xterm/addon-webgl throws immediately on new WebglAddon()
      // and xterm falls back to the native transparent DOM renderer (.xterm-rows) in 0ms!
      return null
    }
    return origGetContext.call(this, type, ...args)
  }
  HTMLCanvasElement.prototype._hermesAcrylicPatched = true
}

function loseTerminalCanvasContext(canvas) {
  for (const type of ['webgl2', 'webgl', 'experimental-webgl']) {
    try {
      const origFn = (typeof HTMLCanvasElement !== 'undefined' && HTMLCanvasElement.prototype._origGetContext) || canvas.getContext
      const ctx = origFn.call(canvas, type)
      const ext = ctx && typeof ctx.getExtension === 'function' ? ctx.getExtension('WEBGL_lose_context') : null
      if (ext && typeof ext.loseContext === 'function') {
        ext.loseContext()
        break
      }
    } catch {
      // getContext throws when the canvas is already bound to another type.
    }
  }

  // Intercept setTimeout(..., 3000) inside webglcontextlost event listener
  // so WebglRenderer.ts:116 fires onContextLoss in 0ms instead of waiting 3000ms!
  const win = (canvas.ownerDocument && canvas.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null)
  const origSetTimeout = (win && typeof win.setTimeout === 'function') ? win.setTimeout : (typeof setTimeout === 'function' ? setTimeout : null)
  let patched = false
  if (win && origSetTimeout) {
    win.setTimeout = function (fn, delay, ...args) {
      if (delay === 3000 || delay >= 1000) {
        return origSetTimeout(fn, 0, ...args)
      }
      return origSetTimeout(fn, delay, ...args)
    }
    patched = true
  }

  try {
    canvas.dispatchEvent(new Event('webglcontextlost', { bubbles: false, cancelable: true }))
  } catch {
    // Some locked-down webviews reject synthetic events
  } finally {
    if (patched && win) {
      win.setTimeout = origSetTimeout
    }
  }
}

function scanTerminalCanvases() {
  if (typeof document === 'undefined') return 0
  if (!readAcrylicEnabled()) return 0
  const canvases = document.querySelectorAll('.xterm-screen canvas:not([data-hermes-acrylic-lost])')
  let lost = 0
  canvases.forEach(canvas => {
    canvas.setAttribute('data-hermes-acrylic-lost', '')
    loseTerminalCanvasContext(canvas)
    lost += 1
  })
  return lost
}

function subtreeHasCanvas(node) {
  if (!node || node.nodeType !== 1) return false
  if (node.tagName === 'CANVAS') return true
  return typeof node.querySelector === 'function' && node.querySelector('canvas') !== null
}

function installTerminalAcrylicDomRenderer() {
  if (typeof document === 'undefined') return
  if (installTerminalAcrylicDomRenderer.done) return
  installTerminalAcrylicDomRenderer.done = true

  installTerminalCanvasInterceptor()

  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : cb => setTimeout(cb, 16)
  let frame = 0
  const schedule = () => {
    if (frame) return
    frame = raf(() => {
      frame = 0
      scanTerminalCanvases()
    })
  }

  const mo = new MutationObserver(records => {
    for (const record of records) {
      // Theme flip, Acrylic toggle, or Glass flip: rescan.
      if (record.type === 'attributes') {
        schedule()
        return
      }
      // A new canvas is the only childList signal we care about.
      for (const node of record.addedNodes || []) {
        if (subtreeHasCanvas(node)) {
          schedule()
          return
        }
      }
    }
  })

  const start = () => {
    installTerminalCanvasInterceptor()
    mo.observe(document.body, { childList: true, subtree: true })
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-hermes-theme', 'data-hermes-acrylic-enabled', 'data-hermes-glass', 'data-hermes-glass-on']
    })
    schedule()
  }

  if (document.body) start()
  else if (typeof document.addEventListener === 'function') document.addEventListener('DOMContentLoaded', start, { once: true })
}

// ---------------------------------------------------------------------------
// Packshot Studio §5.4: clip-path: path(evenodd, ...) Flyout Cutout Mask
// Cuts a rounded-rectangle hole in in-page DOM layers ([data-contrib-shell]
// and [data-persistent-terminal]) directly underneath open flyouts and Ctrl+K,
// exposing 100% pure live Windows 11 DWM Acrylic with zero text bleed-through!
// ---------------------------------------------------------------------------
const FLYOUT_CUTOUT_TARGET_SELECTOR = "[data-contrib-shell], [data-persistent-terminal], [data-slot='composer-bounds'], [data-slot='composer-surface'], [data-overlay-surface], [data-overlay-surface] [data-glass-raised], [data-glass-raised]"
const FLYOUT_CUTOUT_SELECTOR = [
  "[role='dialog'][class*='left-1/2']",
  "[role='dialog'][aria-label='Command palette']",
  "[data-slot='popover-content']",
  "[data-slot='dropdown-menu-content']",
  "[data-slot='dropdown-menu-sub-content']",
  "[data-slot='context-menu-content']",
  "[data-slot='context-menu-sub-content']",
  "[data-slot='select-content']",
  "[data-slot='dialog-content']",
  "[data-slot='hover-card-content']",
  "[data-slot='tooltip-content']",
  "[data-acrylic-flyout]",
  ".hsj-detail",
  "[data-overlay-surface] [data-glass-raised]",
  "[data-overlay-surface] > div > .absolute[class*='left-1/2'].top-0",
  "[data-slot='composer-surface']",
  "[data-slot='room-composer-surface']",
  "[data-slot='composer-status-stack']"
].join(', ')

function roundedRectSubpath(x, y, w, h, r) {
  const rx = Math.max(0, Math.min(r || 0, w / 2, h / 2))
  const x0 = Math.round(x * 10) / 10
  const y0 = Math.round(y * 10) / 10
  const x1 = Math.round((x + w) * 10) / 10
  const y1 = Math.round((y + h) * 10) / 10
  if (rx <= 0.5) {
    return `M ${x0} ${y0} H ${x1} V ${y1} H ${x0} Z`
  }
  return `M ${x0 + rx} ${y0} H ${x1 - rx} A ${rx} ${rx} 0 0 1 ${x1} ${y0 + rx} V ${y1 - rx} A ${rx} ${rx} 0 0 1 ${x1 - rx} ${y1} H ${x0 + rx} A ${rx} ${rx} 0 0 1 ${x0} ${y1 - rx} V ${y0 + rx} A ${rx} ${rx} 0 0 1 ${x0 + rx} ${y0} Z`
}

function isFlyoutVisible(el, win) {
  if (!el || el.nodeType !== 1) return false
  if (el.hidden || (typeof el.hasAttribute === 'function' && el.hasAttribute('hidden'))) return false
  if (typeof el.getAttribute === 'function' && el.getAttribute('data-state') === 'closed') return false
  const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null
  if (!rect || rect.width < 16 || rect.height < 16) return false
  const style = win && typeof win.getComputedStyle === 'function' ? win.getComputedStyle(el) : (typeof getComputedStyle === 'function' ? getComputedStyle(el) : null)
  if (style) {
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const op = Number(style.opacity)
    if (!isNaN(op) && op <= 0.05) return false
  }
  return true
}

let cutoutObserver = null
let cutoutResizeHandler = null
let cutoutResizeObserver = null
const observedComposerNodes = new Set()
let cutoutMotionHandler = null
let cutoutMotionFrame = 0

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

let cutoutSyncing = false
function syncFlyoutCutoutMask() {
  if (typeof document === 'undefined') return
  if (cutoutSyncing) return
  cutoutSyncing = true
  try {
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
    // One getComputedStyle per body layer per sync, not per layer pair.
    const rankCache = new Map()
    const rankOf = layer => {
      if (!rankCache.has(layer)) rankCache.set(layer, layerRank(layer, win))
      return rankCache.get(layer)
    }

    const clearAll = () => {
      for (const target of targets) {
        if (target.style && typeof target.style.removeProperty === 'function') {
          target.style.removeProperty('clip-path')
        }
      }
    }

    if (!readAcrylicEnabled()) {
      clearAll()
      return
    }

    const candidates = document.querySelectorAll(FLYOUT_CUTOUT_SELECTOR)
    const win = (typeof window !== 'undefined' ? window : null) || document.defaultView
    const openFlyouts = []
    for (const el of candidates) {
      if (isFlyoutVisible(el, win)) {
        openFlyouts.push(el)
      }
    }

    if (!openFlyouts.length) {
      clearAll()
      return
    }

    for (const target of targets) {
      if (!target || typeof target.getBoundingClientRect !== 'function') continue
      const targetRect = target.getBoundingClientRect()
      const isBodyLayer = bodyLayers.has(target)
      if (!isBodyLayer && (targetRect.width <= 0 || targetRect.height <= 0)) continue
      const targetRank = isBodyLayer ? rankOf(target) : null

      const holes = []
      for (const el of openFlyouts) {
        if (el === target) continue
        if (typeof target.contains === 'function' && target.contains(el)) continue
        if (typeof el.contains === 'function' && el.contains(target)) continue
        if (isBodyLayer) {
          const elLayer = topLayerOf(el)
          if (!elLayer || !layerAbove(rankOf(elLayer), targetRank)) continue
        }

        const isComposerEl = typeof el.matches === 'function' && el.matches("[data-slot='composer-surface'], [data-slot='room-composer-surface'], [data-slot='composer-status-stack']")
        if (isComposerEl) {
          const targetIsOverlay = typeof target.matches === 'function' && target.matches("[data-overlay-surface], [data-glass-raised]")
          const targetInOverlay = typeof target.closest === 'function' && target.closest('[data-overlay-surface], [data-glass-raised]') !== null
          if (targetIsOverlay || targetInOverlay) continue
        }

        const rect = el.getBoundingClientRect()
        const lx = rect.left - targetRect.left
        const ly = rect.top - targetRect.top
        const lw = rect.width
        const lh = rect.height

        if (!isBodyLayer && (lx + lw <= 0 || ly + lh <= 0 || lx >= targetRect.width || ly >= targetRect.height)) {
          continue
        }

        const style = win && typeof win.getComputedStyle === 'function' ? win.getComputedStyle(el) : (typeof getComputedStyle === 'function' ? getComputedStyle(el) : null)
        const r = style ? (parseFloat(style.borderTopLeftRadius) || 12) : 12
        holes.push(roundedRectSubpath(lx, ly, lw, lh, r))
      }

      if (!holes.length) {
        if (target.style && typeof target.style.removeProperty === 'function') {
          target.style.removeProperty('clip-path')
        }
      } else {
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
      }
    }
  } finally {
    // Drop the mutation records our own style writes just queued, so the
    // observer does not call us again for them.
    if (cutoutObserver && typeof cutoutObserver.takeRecords === 'function') cutoutObserver.takeRecords()
    cutoutSyncing = false
  }
}

function syncComposerResizeObserver(schedule) {
  if (typeof ResizeObserver !== 'function' || typeof document === 'undefined') return
  if (!cutoutResizeObserver) {
    cutoutResizeObserver = new ResizeObserver(() => schedule())
  }
  const composerNodes = document.querySelectorAll("[data-slot='composer-surface'], [data-slot='composer-dock']")
  for (const node of composerNodes) {
    if (!observedComposerNodes.has(node)) {
      cutoutResizeObserver.observe(node)
      observedComposerNodes.add(node)
    }
  }
}

function disposeCutoutMask() {
  if (cutoutObserver) {
    cutoutObserver.disconnect()
    cutoutObserver = null
  }
  if (cutoutResizeObserver) {
    cutoutResizeObserver.disconnect()
    cutoutResizeObserver = null
  }
  observedComposerNodes.clear()
  if (cutoutResizeHandler && typeof window !== 'undefined') {
    window.removeEventListener('resize', cutoutResizeHandler)
    cutoutResizeHandler = null
  }
  if (cutoutMotionHandler && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
    document.removeEventListener('transitionend', cutoutMotionHandler, true)
    document.removeEventListener('animationend', cutoutMotionHandler, true)
  }
  cutoutMotionHandler = null
  cutoutMotionFrame = 0
  installFlyoutCutoutMask.done = false
}

function installFlyoutCutoutMask() {
  if (typeof document === 'undefined') return
  if (installFlyoutCutoutMask.done) return
  installFlyoutCutoutMask.done = true

  const schedule = () => {
    syncFlyoutCutoutMask()
  }

  const start = () => {
    if (typeof window !== 'undefined') {
      cutoutResizeHandler = schedule
      window.addEventListener('resize', cutoutResizeHandler, { passive: true })
    }

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

    syncComposerResizeObserver(schedule)

    if (typeof MutationObserver === 'function' && document.body) {
      cutoutObserver = new MutationObserver(records => {
        let relevant = false
        for (const r of records) {
          if (r.type === 'attributes' && r.attributeName === 'style') {
            const el = r.target
            if (el && typeof el.matches === 'function' && el.matches(FLYOUT_CUTOUT_TARGET_SELECTOR)) {
              continue
            }
          }
          relevant = true
          break
        }
        if (relevant) {
          syncComposerResizeObserver(schedule)
          schedule()
        }
      })
      cutoutObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-state', 'style', 'class', 'hidden']
      })
    }

    schedule()
  }

  if (document.body) start()
  else if (typeof document.addEventListener === 'function') document.addEventListener('DOMContentLoaded', start, { once: true })
}

function clearChatBackdrop() {
  cancelFallbackBackdrop()
  setBackdropEnabled(false)
  host.notify({ kind: 'info', message: 'Chat Backdrop cleared. Under Glass it stays off so dragging does not composite the filler JPEG.' })
}

function applyNotice(glassOn) {
  if (isLinuxPlatform()) {
    return 'Universal Acrylic active. Linux has no Glass — light CSS fallback over Chat Backdrop (14px blur). It does not blur other apps.'
  }
  if (glassOn) {
    return 'Universal Acrylic active. Glass is on — Chat Backdrop stays mounted in DOM (hidden while focused for zero drag overhead, revealing crisp when unfocused). Frost under-window, scope window — tinted with active theme seeds.'
  }
  return 'Universal Acrylic active. Real acrylic needs Glass, frost under-window, scope window (sidebar = rail only). Chat Backdrop active.'
}

function applyAcrylic() {
  applyAcrylicEnabled(true)
  if (!requestTheme(THEME_NAME)) {
    host.notifyError('Windows Acrylic theme is not available yet — try ⌘K → Reload desktop plugins.')
    return false
  }
  const glassOn = readGlassOn()
  setBackdropEnabled(true)
  cancelFallbackBackdrop()
  if (!isLinuxPlatform()) syncHostTranslucency({ material: readDragMaterial(), scope: 'window' })
  host.notify({ kind: 'info', message: applyNotice(glassOn) })
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

function useBackdropPolicy() {
  const enabled = useAcrylicEnabled()
  const glassOn = useGlassOn()
  useEffect(() => {
    if (!enabled) return undefined
    if (!isLinuxPlatform() && (!readHostScopeSynced() || !readGlassOn())) {
      syncHostTranslucency({ material: readDragMaterial(), scope: 'window' })
    }
    setBackdropEnabled(true)
    cancelFallbackBackdrop()
    return undefined
  }, [enabled, glassOn])
  return glassOn
}

function useMaterial() {
  const [material, setMaterial] = useState(readDragMaterial)
  useEffect(() => {
    const sync = (event) => setMaterial(event.detail || readDragMaterial())
    const onStorage = (event) => { if (event.key === MATERIAL_KEY) setMaterial(readDragMaterial()) }
    document.addEventListener(MATERIAL_EVENT, sync)
    window.addEventListener('storage', onStorage)
    return () => {
      document.removeEventListener(MATERIAL_EVENT, sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return material
}

// True only when BOTH Light and Dark Glass scopes are pinned to 'window'.
function readHostScopeSynced() {
  try {
    const raw = localStorage.getItem(TRANSLUCENCY_KEY)
    if (!raw) return false
    const book = JSON.parse(raw) || {}
    const ok = (slot) => !!slot && slot.scope === 'window'
    return ok(book.light) && ok(book.dark)
  } catch {
    return false
  }
}

function AppearanceCard() {
  const { themeName } = useTheme()
  const enabled = useAcrylicEnabled()
  const glassOn = useGlassOn()
  const preset = usePreset()
  const material = useMaterial()
  const linux = isLinuxPlatform()
  const active = themeName === THEME_NAME
  const scopeSynced = !linux && readHostScopeSynced()
  const step = text => jsx('li', { children: text })
  const steps = linux ? [
    'Enable Universal Acrylic or the Windows Acrylic theme. Chat Backdrop turns on as the stand-in wallpaper.',
    'Linux has no Glass row. Hermes only offers Glass on Windows and macOS.',
    'You get a cheaper CSS fallback over Chat Backdrop. Acrylic blurs at 14px, Frosted and Sanded at 18px, Expressive at 16px. It does not blur other apps.',
    'Optional, and outside this plugin: a Hyprland window rule or KWin’s Blur effect can frost the real desktop. This plugin cannot set that.',
    'Composer, bubbles, menus, terminal, and code stay translucent.'
  ] : glassOn ? [
    'Universal Acrylic is active across all themes! Windows 11 DWM tints with the active theme colors.',
    'Glass is on. Keep frost on under-window and scope on window. Sidebar scope is the rail only — the chat stays opaque.',
    'Leave Chat Backdrop off. Apply will not turn it on while Glass is on — the filler JPEG was the CPU spike while dragging.',
    'Under Glass the preset changes tint depth (Acrylic 40%/72%, Frosted/Sanded 58%, Expressive 68%). For less drag lag pick Smooth Drag Mica (titlebar).',
    'If acrylic ever drops after a resize or monitor change, hit Wake / Re-sync DWM.'
  ] : [
    'Enable Universal Acrylic or switch to the Windows Acrylic theme.',
    'Real acrylic: Settings → Appearance → Window Translucency → Glass (not Clear). Frost under-window. Scope window — sidebar scope is the rail only, and the chat stays opaque.',
    'Until Glass is on, a CSS fallback may load Chat Backdrop after a short wait and blur it at 14px. Turn Chat Backdrop off again once Glass is live.',
    'Composer, bubbles, menus, terminal, and code stay translucent.'
  ]
  const status = linux
    ? `Universal Acrylic: ${enabled ? 'on' : 'off'} · Active Theme: ${themeName || 'default'} · ${PRESET_LABELS[preset]} · CSS fallback (no Glass on Linux)`
    : `Universal Acrylic: ${enabled ? 'on' : 'off'} · Theme: ${themeName || 'default'} · ${PRESET_LABELS[preset]} · Glass: ${glassOn ? 'on' : 'off'} · Scope: ${scopeSynced ? 'window ✓' : 'default'} · Backdrop: ${MATERIAL_LABELS[material]}`
  const footnote = linux
    ? 'Real acrylic is Windows 11 22H2+, Glass, frost under-window, scope window. This fallback never blurs other windows.'
    : 'Real acrylic needs Windows 11 22H2+ with Glass on. Clear is not acrylic. Under live Glass, Chat Backdrop stays off. Universal Acrylic automatically tints with whatever theme is active.'

  const materialRow = !linux && jsxs('div', {
    className: 'flex flex-wrap gap-1',
    children: [
      jsx(Button, {
        size: 'sm',
        variant: material === 'under-window' ? 'secondary' : 'ghost',
        disabled: material === 'under-window',
        onClick: () => { haptic('tap'); setDragMaterial('under-window') },
        children: material === 'under-window' ? 'Live Acrylic · on' : 'Live Acrylic (under-window)'
      }),
      jsx(Button, {
        size: 'sm',
        variant: material === 'titlebar' ? 'secondary' : 'ghost',
        disabled: material === 'titlebar',
        onClick: () => { haptic('tap'); setDragMaterial('titlebar') },
        children: material === 'titlebar' ? 'Smooth Mica · on' : 'Smooth Drag Mica (titlebar)'
      }),
      jsx(Button, {
        size: 'sm',
        variant: 'ghost',
        onClick: () => { haptic('tap'); wakeWindowsAcrylic() },
        children: 'Wake / Re-sync DWM'
      })
    ]
  })

  return jsxs('section', {
    className: 'flex flex-col gap-2 rounded-lg border border-(--ui-stroke-tertiary) p-3 text-sm',
    children: [
      jsxs('div', {
        className: 'flex items-center justify-between gap-2',
        children: [
          jsxs('div', { children: [
            jsx('div', { className: 'font-medium', children: 'Universal Windows Acrylic' }),
            jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: status })
          ] }),
          jsxs('div', {
            className: 'flex items-center gap-1',
            children: [
              jsx(Button, {
                size: 'sm',
                variant: enabled ? 'secondary' : 'outline',
                onClick: () => { haptic('tap'); toggleAcrylicEnabled() },
                children: enabled ? 'Universal Acrylic · on' : 'Universal Acrylic · off'
              }),
              jsx(Button, {
                size: 'sm',
                disabled: active,
                onClick: () => { haptic('tap'); applyAcrylic() },
                children: active ? 'Acrylic Theme' : 'Set Acrylic Theme'
              })
            ]
          })
        ]
      }),
      jsxs('div', {
        className: 'flex flex-wrap gap-1',
        children: PRESET_IDS.map(id => jsx(Button, {
          key: id,
          size: 'sm',
          disabled: preset === id,
          onClick: () => { haptic('tap'); selectPreset(id) },
          children: preset === id ? `${PRESET_LABELS[id]} · on` : PRESET_LABELS[id]
        }))
      }),
      materialRow,
      jsxs('div', {
        className: 'flex flex-wrap items-center gap-2',
        children: [
          jsx(Button, {
            size: 'sm',
            variant: 'outline',
            onClick: () => { haptic('tap'); toggleOpaqueSurfaceXRay() },
            children: 'Audit opaque elements (X-Ray)'
          }),
          jsx('span', {
            className: 'text-xs text-(--ui-text-tertiary)',
            children: 'Outlines every surface still painting an opaque background and copies the list.'
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

function StatusChip() {
  const enabled = useAcrylicEnabled()
  const glassOn = useBackdropPolicy()
  const preset = usePreset()
  const linux = isLinuxPlatform()
  const look = preset === 'acrylic' ? 'acrylic' : preset
  const label = !enabled ? '◇ acrylic off'
    : glassOn ? `◇ ${look}`
    : linux ? `◇ ${look} (css)`
    : `◇ ${look} (no glass)`
  const title = !enabled ? 'Enable Universal Acrylic'
    : glassOn ? 'Universal Acrylic live (Glass). Windows 11 DWM tints with active theme.'
    : linux ? 'CSS acrylic fallback — Linux has no Glass, other apps are not blurred'
    : 'Universal Acrylic on — enable Glass for live acrylic, or keep the CSS fallback'
  return jsx('button', {
    type: 'button',
    title,
    className: 'px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)',
    onClick: () => { haptic('tap'); toggleAcrylicEnabled() },
    children: label
  })
}

// ---------------------------------------------------------------------------
// Opaque Surface X-Ray — audit which surfaces still paint an OPAQUE background
// (alpha > 0.80) instead of letting Windows 11 Acrylic through.
// ---------------------------------------------------------------------------
const XRAY_ATTR = 'data-hermes-acrylic-xray'
const XRAY_TAG_ATTR = 'data-hermes-acrylic-xray-tag'
const XRAY_EXCLUDE =
  "[data-slot='tooltip-content'], [data-slot='tooltip'], [role='tooltip'], [data-slot='tooltip-arrow'], " +
  "[data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], " +
  "[data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='select-content'], " +
  "[data-slot='hover-card-content'], [data-slot='code-card'], [data-slot='command-item'], " +
  ".xterm, .xterm-screen, .xterm-viewport, .xterm-rows, " +
  `[${XRAY_ATTR}], [${XRAY_TAG_ATTR}]`
const XRAY_TAG_CAP = 120

let xrayOn = false
let xrayMarks = []
let xrayTagLayer = null
let xrayScrollHandler = null
let xrayScrollTimer = 0
let xrayObserver = null
const xrayCumulative = new Map()

function colorAlpha(color) {
  if (!color || color === 'transparent') return 0
  const rgba = color.match(/rgba?\(([^)]+)\)/i)
  if (rgba) {
    const parts = rgba[1].split(/[,\s/]+/).filter(Boolean)
    return parts.length >= 4 ? Number(parts[3]) : 1
  }
  const modern = color.match(/\/\s*([\d.]+)\s*\)/)
  if (modern) return Number(modern[1])
  return /^color\(/i.test(color) ? 1 : 1
}

function describeSurface(el) {
  const tag = el.tagName ? el.tagName.toLowerCase() : '?'
  const slot = el.getAttribute ? el.getAttribute('data-slot') : null
  if (slot) return `${tag}[data-slot=${slot}]`
  if (el.id) return `${tag}#${el.id}`
  const cls = typeof el.className === 'string' ? el.className : ''
  const first = cls.split(/\s+/).filter(Boolean).slice(0, 3).join('.')
  return first ? `${tag}.${first}` : tag
}

function selectorFor(el) {
  const slot = el.getAttribute ? el.getAttribute('data-slot') : null
  return slot ? `[data-slot='${slot}']` : describeSurface(el)
}

function clearXrayMarks() {
  for (const el of xrayMarks) {
    if (el.style) {
      el.style.removeProperty('outline')
      el.style.removeProperty('outline-offset')
    }
  }
  xrayMarks = []
  if (xrayTagLayer && xrayTagLayer.remove) xrayTagLayer.remove()
  xrayTagLayer = null
}

function scanOpaqueSurfaces() {
  const found = []
  const nodes = document.querySelectorAll('*')
  for (const el of nodes) {
    if (typeof el.matches === 'function' && el.matches(XRAY_EXCLUDE)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 24 || rect.height < 18) continue
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue
    const alpha = colorAlpha(style.backgroundColor)
    if (alpha <= 0.8) continue
    found.push({ el, alpha })
  }
  return found
}

function paintXrayMarks(found) {
  xrayTagLayer = document.createElement('div')
  xrayTagLayer.setAttribute(XRAY_ATTR, '')
  xrayTagLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483600'
  document.body.append(xrayTagLayer)

  let tagged = 0
  for (const { el, alpha } of found) {
    el.style.setProperty('outline', '2px dashed #ff00aa', 'important')
    el.style.setProperty('outline-offset', '-1px', 'important')
    xrayMarks.push(el)
    if (tagged >= XRAY_TAG_CAP) continue
    const rect = el.getBoundingClientRect()
    const tag = document.createElement('span')
    tag.setAttribute(XRAY_TAG_ATTR, '')
    tag.textContent = `${describeSurface(el)} (${alpha.toFixed(2)})`
    tag.style.cssText =
      `position:fixed;left:${Math.max(2, rect.left + 2)}px;top:${Math.max(2, rect.top + 2)}px;` +
      'background:#ff00aa;color:#FFFFFF;font:600 10px/1.4 ui-monospace,Consolas,monospace;' +
      'padding:1px 4px;border-radius:3px;white-space:nowrap;max-width:70ch;overflow:hidden;' +
      'text-overflow:ellipsis;z-index:2147483601'
    xrayTagLayer.append(tag)
    tagged += 1
  }
}

function xrayMarkdown(found) {
  for (const entry of found) {
    const sel = selectorFor(entry.el)
    const desc = describeSurface(entry.el)
    const prev = xrayCumulative.get(sel)
    if (!prev || entry.alpha > prev.alpha) {
      xrayCumulative.set(sel, { selector: sel, desc, alpha: entry.alpha })
    }
  }
  const all = [...xrayCumulative.values()]
  const rows = all.map((entry, i) => `| ${i + 1} | \`${entry.selector}\` | \`${entry.desc}\` | ${entry.alpha.toFixed(2)} |`)
  return [
    '# Opaque Surface X-Ray (Cumulative Session Audit)',
    '',
    `${all.length} unique selector(s) (${found.length} currently visible) paint an opaque background (alpha > 0.80) — these block Windows 11 Acrylic.`,
    '',
    '| # | Target Selector | Element | Background alpha |',
    '|---|-----------------|---------|------------------|',
    ...rows,
    ''
  ].join('\n')
}

function refreshXray() {
  if (!xrayOn || typeof document === 'undefined') return
  clearXrayMarks()
  const found = scanOpaqueSurfaces()
  paintXrayMarks(found)
  const markdown = xrayMarkdown(found)
  try {
    Promise.resolve(writeClipboardText(markdown)).catch(() => {})
  } catch { /* ignore */ }
}

function toggleOpaqueSurfaceXRay() {
  if (typeof document === 'undefined') return false

  if (xrayOn) {
    xrayOn = false
    clearXrayMarks()
    if (xrayScrollHandler) {
      window.removeEventListener('scroll', xrayScrollHandler, true)
      window.removeEventListener('resize', xrayScrollHandler)
      xrayScrollHandler = null
    }
    if (xrayObserver) {
      xrayObserver.disconnect()
      xrayObserver = null
    }
    host.notify({ kind: 'info', message: `Opaque Surface X-Ray off — marks cleared (${xrayCumulative.size} total unique selector(s) copied in clipboard).` })
    return false
  }

  xrayCumulative.clear()
  xrayOn = true

  const scheduleRefresh = () => {
    if (xrayScrollTimer) clearTimeout(xrayScrollTimer)
    xrayScrollTimer = setTimeout(refreshXray, 160)
  }
  xrayScrollHandler = scheduleRefresh
  window.addEventListener('scroll', xrayScrollHandler, true)
  window.addEventListener('resize', xrayScrollHandler)

  if (typeof MutationObserver === 'function' && document.body) {
    xrayObserver = new MutationObserver(records => {
      for (const r of records) {
        let own = false
        for (const n of r.addedNodes || []) {
          if (n && n.nodeType === 1 && (n.hasAttribute?.(XRAY_ATTR) || n.hasAttribute?.(XRAY_TAG_ATTR))) own = true
        }
        for (const n of r.removedNodes || []) {
          if (n && n.nodeType === 1 && (n.hasAttribute?.(XRAY_ATTR) || n.hasAttribute?.(XRAY_TAG_ATTR))) own = true
        }
        if (!own) {
          scheduleRefresh()
          return
        }
      }
    })
    xrayObserver.observe(document.body, { childList: true, subtree: true })
  }

  setTimeout(() => {
    if (!xrayOn) return
    const found = scanOpaqueSurfaces()
    clearXrayMarks()
    paintXrayMarks(found)
    const markdown = xrayMarkdown(found)
    try {
      Promise.resolve(writeClipboardText(markdown)).catch(() => {})
    } catch { /* ignore */ }
    host.notify({
      kind: 'info',
      message: found.length
        ? `Opaque Surface X-Ray ON — ${found.length} opaque element(s) marked magenta. Navigate around; clipboard auto-updates with every opaque selector!`
        : 'Opaque Surface X-Ray ON — 0 opaque surfaces on this screen! Navigate to other views to scan them live.'
    })
  }, 160)
  return true
}

export default {
  id: ID,
  name: 'Hermes Acrylic',
  register(ctx) {
    const acrylicOn = readAcrylicEnabled()
    applyAcrylicEnabled(acrylicOn)
    applyPreset(readPreset())
    if (acrylicOn) {
      setBackdropEnabled(true)
    }
    installGlassBackdropLock()
    installTerminalCanvasInterceptor()
    installTerminalAcrylicDomRenderer()
    installFlyoutCutoutMask()
    installWindowFocusTracker()
    installGlobalAcrylicStyle()
    if (!isLinuxPlatform() && typeof document !== 'undefined' && acrylicOn) {
      syncHostTranslucency({ material: readDragMaterial(), scope: 'window' })
    }
    ctx.registerMany([
      { id: 'theme', area: THEMES_AREA, data: THEME },
      {
        id: 'toggle-acrylic',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.toggle`,
          label: 'Acrylic: Toggle Universal Acrylic On/Off',
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
        id: 'wake-dwm',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.wake-dwm`,
          label: 'Acrylic: Wake / Re-sync Windows DWM',
          keywords: ['acrylic', 'dwm', 'wake', 'resync', 'material', 'stuck', 'glitch'],
          run: () => { wakeWindowsAcrylic(); haptic('tap') }
        }
      },
      {
        id: 'drag-mica',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.drag-mica`,
          label: 'Acrylic: Smooth Drag mode (Mica)',
          keywords: ['acrylic', 'mica', 'titlebar', 'drag', 'smooth', 'performance'],
          run: () => { setDragMaterial('titlebar'); haptic('tap') }
        }
      },
      {
        id: 'drag-acrylic',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.drag-acrylic`,
          label: 'Acrylic: Live Blur mode (Acrylic)',
          keywords: ['acrylic', 'under-window', 'drag', 'live', 'blur', 'performance'],
          run: () => { setDragMaterial('under-window'); haptic('tap') }
        }
      },
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
          label: 'Acrylic: open Settings',
          keywords: ['acrylic', 'glass', 'appearance', 'linux', 'fallback'],
          run: () => { const r = ctx.runAction?.('nav.settings'); if (r && r.ok === false) host.notifyError('Open Settings → Appearance manually.') }
        }
      },
      {
        id: 'xray',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.xray`,
          label: 'Acrylic: Toggle Opaque Surface X-Ray (Audit)',
          keywords: ['acrylic', 'xray', 'x-ray', 'audit', 'opaque', 'surface', 'scanner', 'scan', 'transparency', 'debug'],
          run: () => { toggleOpaqueSurfaceXRay(); haptic('tap') }
        }
      },
      { id: 'appearance', area: APPEARANCE_AREAS.extra, render: () => jsx(AppearanceCard, {}) },
      { id: 'chip', area: STATUSBAR_AREAS.right, order: 140, render: () => jsx(StatusChip, {}) }
    ])
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
