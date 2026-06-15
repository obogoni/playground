# Playground — application icons

Branch mark on the violet app tile. Two builds: **Standard** and **Nightly** (same mark + crescent-moon badge).

## Files

| File | Use |
|---|---|
| `playground.ico` / `playground-nightly.ico` | Windows app icon (16–256px, PNG-compressed entries) |
| `playground.icns` / `playground-nightly.icns` | macOS app icon (16–1024px) |
| `playground.svg` / `playground-nightly.svg` | Vector master (1024 viewBox) |
| `png/playground-<size>.png` | Flat PNGs: 16, 32, 48, 64, 128, 256, 512, 1024 (+ `-nightly-`) |

## electron-builder

Point each channel at its icon set. electron-builder picks `.ico` on Windows and `.icns` on macOS automatically:

```jsonc
// package.json → "build"
{
  "win":   { "icon": "icons/playground.ico" },
  "mac":   { "icon": "icons/playground.icns" },
  "linux": { "icon": "icons/png/playground-512.png" }
}
```

For the nightly channel, swap to the `-nightly` files (e.g. a separate build config / electron-builder `--config` override).

## In-app window icon

`new BrowserWindow({ icon: path.join(__dirname, 'icons/playground.png') })` — use a PNG (256 or 512) on Windows/Linux; macOS uses the bundle icon.

## Tile color

- Standard tile: `#7c54e0`
- White glyph: `#ffffff`
- Moon badge: bg `#171036`, moon `#ece8ff`
