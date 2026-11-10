# Acrylic test matrix

Wallpapers: `test-gradients/*.png` (1920×1080). On Windows 11 22H2+: set as desktop
wallpaper → Hermes Settings → Appearance → Window Translucency **Glass**, frost
**under-window**, theme **Windows Acrylic** → compare against a native Win11
flyout (Start / Quick Settings) placed beside the window.

| Wallpaper | Mode | Scope | Tint (keep) | Look for |
|---|---|---|---|---|
| 01-blue-magenta | dark | window | ~55% | blur bleed of saturated hues; tint matches Quick Settings |
| 02-green-teal | dark+light | sidebar | 55% | rail glass vs opaque column seam |
| 03-orange-red | dark | window | ~55% | warm bleed doesn't muddy text; holdouts stay neutral grey |
| 04-pastel-purple-pink | light | window | ~55% | light tint ≈ rgba(252,252,252,.55), controls read as white .7 fill |
| 05-black-cyan | dark | window | ~55% | hard luminance edge → blur smoothness, no banding |
| 06-windows-bloom | dark+light | window | 55% | closest to stock Win11; side-by-side with Start menu |

Every case: composer, user bubble, menus, dialogs, tooltips, code cards and
non-ghost buttons must be fully opaque (no wallpaper through them);
no backdrop-filter dark plate anywhere; unfocused window going flat is expected (OS).

## Linux / no-Glass fallback
Open `smoke/linux-fallback.html`. It paints a wallpaper, blurs that layer with
`blur(30px) saturate(1.25)`, then lays Packshot `--material-tint` at alpha .55
over it. Solid composer, bubble, menu, and code sit on top. The swatches compare
the layered plate with the sRGB composite `tint * 0.55 + wallpaper * 0.45`.
This is the CSS fallback, not DWM acrylic and not a blur of other apps.
