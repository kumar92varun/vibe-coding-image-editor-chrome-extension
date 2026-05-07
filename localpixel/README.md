# LocalPixel

A powerful in-browser image editor Chrome extension. No uploads, no backend — everything runs locally using the Canvas API and Fabric.js.

## Loading the Extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `localpixel/` folder
5. Click the LocalPixel icon in the toolbar — the editor opens in a new tab

## Features

| Category | Tools |
|----------|-------|
| Transform | Crop (free + aspect ratio), Rotate (90° + free angle), Scale, Flip H/V |
| Shapes | Rectangle, Circle, Line, Arrow, Triangle, Star — with fill, stroke, and stroke-width controls |
| Filters | Brightness, Contrast, Saturation, Blur |
| Annotate | Text overlay (bold/italic, optional background + padding), Freehand draw, Blur Brush (paint-to-blur) |
| History | Undo (Ctrl+Z), Redo (Ctrl+Shift+Z), Reset to original |
| Export | PNG, JPG, WebP with quality control |

Accepted input formats: JPG · PNG · WebP · GIF

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Delete` / `Backspace` | Remove selected object (text/shape/drawing) |
| `Escape` | Cancel active tool / deselect |

## File Structure

```
localpixel/
├── manifest.json
├── background.js
├── editor/
│   ├── index.html
│   ├── editor.css
│   ├── editor.js
│   └── tools/
│       ├── crop.js
│       ├── rotate.js
│       ├── scale.js
│       ├── flip.js
│       ├── shapes.js
│       ├── filters.js
│       ├── text.js
│       ├── draw.js
│       ├── blur-brush.js
│       └── history.js
├── vendor/
│   └── fabric.min.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
