# How Acrylic works

Acrylic is a theme plugin. Everything it does is CSS inside the theme (`THEME.customCSS`) plus a small Settings card and a few Ctrl+K commands, all through the Hermes plugin SDK. It does not patch Hermes, override browser APIs, watch the page or write onto Hermes' elements.

## The layers

Windows' acrylic material is a recipe: a blur of what is behind the window, a tint, a little luminosity and a fine grain.

- **The blur** comes from Windows itself. Hermes asks for it when **Settings → Appearance → Window Translucency** is set to **Glass**: the window becomes see-through and Windows draws its acrylic behind it. Acrylic never switches this on for you; the Acrylic card has a button that opens the setting.
- **The tint, haze and grain** come from the theme. `<body>` paints one tint (`--material-tint-glass`) over the whole window, then an optional milky frost haze and grain on top, and the app's own backgrounds are cleared so these are the only things between the content and the Windows material. The presets set them: Acrylic, the default, keeps 40% of the theme colour in light mode and 72% in dark mode; Frosted keeps 58%; Sanded is Frosted with a fine grain; Expressive keeps 68%; Heavy frost keeps 45% under a haze of 35 with a fine grain.
- **Custom.** Settings → Plugins → Acrylic shows the same three values as sliders (Tint 20–95%, Frost haze 0–100, Grain off, fine or coarse with a strength of 0–100). Any change there switches the preset to Custom. Custom's values live in a small stylesheet of the plugin's own that only sets CSS variables, so the theme's rules stay the same.
- **Grain is noise**, as in Windows acrylic: a 128px tile of random grey pixels at one low opacity (Fine: one value per pixel; Coarse: one per 2×2 block), drawn once on a canvas when the plugin loads. Ctrl+K and cards carry the same noise at 2%, the level Windows uses. Tint applies with Glass on; haze and grain show with and without Glass.
- **Without Glass** (Glass off, or Linux), the theme falls back to a CSS stand-in: Hermes' Chat Backdrop picture, blurred, under the same tint. It frosts that picture, not other windows.

## Surfaces

Not every surface should be equally clear. The theme treats them by role:

| Role | Examples | Under Glass |
| --- | --- | --- |
| Window | the chat area, the sidebar, empty space | transparent; the body tint over Windows acrylic |
| Sunken box | code blocks, settings groups, lanes | a light recessed tint |
| Raised card | tool blocks, message bubbles | a control fill |
| Floating surface | menus, popovers, the `/` menu, tooltips, dialogs, toasts, the Layout editor | the theme's solid background (see below) |
| Ctrl+K and full-page cards | the command palette; Settings, Scheduled jobs, Profiles, Agents | real acrylic (see below) |
| Colour that means something | accent buttons, status dots, media | unchanged |

A surface Hermes paints solid is never left empty: it gets a fill from this table.

## Why floating surfaces are hard

A CSS blur (`backdrop-filter`) can only see the page, never what is behind the window. In a see-through window that means a frosted menu over the chat blurs the chat text, and where the page is clear it shows up as a dark plate. Neither looks like acrylic.

So the theme uses two approaches:

- **Ctrl+K and full-page cards get the real material.** Under Glass the app is cut away exactly under them with a CSS mask, so behind them is only the window's own tint over Windows acrylic, the same as an empty part of the window. This works because Hermes gives both a fixed place:
  - The command palette sits 0.75rem from the top (just under the title bar in narrow windows), is centred, and is `min(34rem, 100vw - 2rem)` wide. The theme gives it a fixed height (`min(20rem, 56vh) + 2.75rem`), so the hole always matches it.
  - A full-page card is inset by the title bar height plus 0.875rem on every side (0.625rem in narrow windows).
  - The terminal panel is placed by pixel values a stylesheet cannot read, so while a full-page card is open it is hidden instead of cut.
- **Everything else that floats gets the theme's normal, solid background**: menus, popovers, dialogs (plugin details, Install plugin, New project), tooltips, toasts, the status-bar menus and the Layout editor. They open anywhere, at any size, so a stylesheet cannot cut a hole for them, and Hermes gives plugins no way to learn their size.

**The rule: glass only where it can be real glass.** A surface that is see-through with only a tint (no real acrylic behind it, no blur) is broken: the page behind it reads through. If the theme cannot give a surface real acrylic (a cut-out) or a real blur, that surface gets a solid background instead, never a see-through tint.

Without Glass every floating surface uses a normal CSS blur of the page behind it, which looks right there.

## The terminal

Hermes draws the terminal with WebGL on an opaque surface for sharp text, and a theme cannot change that renderer. Acrylic gives the text area a solid background in the theme colour with a 1px outline and even spacing; the pane frame and tab strip around it keep the window material.

## What would make it better

These need hooks Hermes does not offer to themes yet:

- A see-through terminal for themes: [NousResearch/hermes-agent#154464](https://github.com/NousResearch/hermes-agent/issues/154464).
- A stable signal for "a floating surface is open", so menus can get the same treatment and the palette rules do not depend on its class names: [NousResearch/hermes-agent#154465](https://github.com/NousResearch/hermes-agent/issues/154465).
- The Glass setting on the plugin SDK, so Acrylic could offer a "Use Glass" button: [NousResearch/hermes-agent#121896](https://github.com/NousResearch/hermes-agent/issues/121896).

## Testing it yourself

1. Windows 11 22H2 or newer, Glass on, the Windows Acrylic theme selected, and a colourful wallpaper.
2. Open Ctrl+K, Settings and Scheduled jobs: behind each you should see your blurred wallpaper, not the chat or the terminal.
3. Over chat text, open a menu, a tooltip, a dialog (sidebar → New project), the Layout editor and a toast, and scroll a long reply under the composer: the text behind should not read through any of them.
4. Compare with a native Windows flyout (Start or Quick Settings) next to the window. An unfocused window turns flat; that is Windows, not the theme.
5. `hermes plugins validate` should pass "desktop surface — stays inside the plugin SDK surface".
