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
  APPEARANCE_AREAS, Button, PALETTE_AREA, STATUSBAR_AREAS, THEMES_AREA,
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

/* Override host [data-glass-opaque] descendant variable scopes */
${both(`[data-glass-opaque]`)} {
  --ui-chat-surface-background: var(--acrylic-flyout) !important;
  --ui-editor-surface-background: var(--control-fill) !important;
  --ui-sidebar-surface-background: var(--acrylic-recessed) !important;
}

/* Settings & OverlayView Modal Cards ([data-overlay-surface] / [data-glass-raised]):
   1. Override styles.css:730's 94%-opaque --ui-*-surface-background rules on [data-glass-raised].
   2. Give [data-glass-raised] a translucent Acrylic tint (--acrylic-overlay-card) + noise grain. */
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
${underGlass(`[data-slot='popover-content'], [data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='select-content'], [data-slot='hover-card-content'], [role='menu'], [data-slot='dialog-content'], [data-radix-popper-content-wrapper] > [data-side], [data-radix-popper-content-wrapper], [data-slot='composer-completion-drawer']`)} {
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
/* Under Glass a CSS blur only sees the page, never the Windows material, so
   floating menus carry a denser fill instead, and while Ctrl+K is open the app
   behind it is blurred so Ctrl+K itself stays clear glass. */
${underGlass(`[data-slot='popover-content'], [data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='select-content'], [data-slot='hover-card-content'], [role='menu'], [data-radix-popper-content-wrapper] > [data-side], [data-slot='composer-completion-drawer'], [data-acrylic-flyout], .hsj-detail`)} {
  background-color: color-mix(in srgb, var(--theme-elevated-seed, #24262E) 90%, transparent) !important;
}
${underGlass(`[data-contrib-shell]`)} {
  transition: filter 140ms ease-out;
}
:root[data-hermes-glass]:has([role='dialog'][class*='left-1/2'], [role='dialog'][aria-label='Command palette']) [data-contrib-shell],
:root[data-hermes-glass-on]:has([role='dialog'][class*='left-1/2'], [role='dialog'][aria-label='Command palette']) [data-contrib-shell] {
  filter: blur(16px) saturate(1.1) !important;
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
  background: var(--ui-terminal-surface-background) !important;
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
  --ui-terminal-surface-background: var(--theme-background-seed, #202020) !important;
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
  customCSS: CSS
}

const PRESET_IDS = ['acrylic', 'frosted', 'sanded', 'expressive']
const PRESET_LABELS = { acrylic: 'Acrylic', frosted: 'Frosted', sanded: 'Sanded', expressive: 'Expressive' }
const PRESET_KEY = 'hermes-acrylic-preset'
const PRESET_ATTR = 'data-hermes-acrylic-preset'
const PRESET_EVENT = 'hermes-acrylic-preset'

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

function openAppearanceSettings() {
  const r = pluginCtx && typeof pluginCtx.runAction === 'function' ? pluginCtx.runAction('nav.settings') : null
  if (!r || r.ok === false) host.notify({ kind: 'info', message: 'Open Settings → Appearance → Window Translucency and pick Glass.' })
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
    'This Hermes has no Glass, so you get a CSS stand-in over Chat Backdrop: Acrylic blurs at 14px, Frosted and Sanded at 18px, Expressive at 16px. It does not blur other apps.',
    'Optional, outside this plugin: a KWin or Hyprland blur rule can frost the real desktop.'
  ] : glassOn ? [
    'Glass is on: Windows draws the real acrylic behind the window.',
    'Presets change how deep the tint is: Acrylic, Frosted, Sanded, Expressive.',
    'While Ctrl+K is open the app behind it blurs; menus get a denser glass. The terminal is one solid panel in the theme colour.'
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
        children: PRESET_IDS.map(id => jsx(Button, {
          key: id,
          size: 'sm',
          disabled: preset === id,
          onClick: () => { haptic('tap'); selectPreset(id) },
          children: preset === id ? `${PRESET_LABELS[id]} · on` : PRESET_LABELS[id]
        }))
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
  const { themeName } = useTheme()
  const enabled = useAcrylicEnabled()
  const glassOn = useGlassOn()
  const preset = usePreset()
  const linux = isLinuxPlatform()
  const on = enabled || themeName === THEME_NAME
  const look = preset === 'acrylic' ? 'acrylic' : preset
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
