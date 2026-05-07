# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

From the repo root (`/var/www/html/others/ChromeExtensions/ImageEditor`):

```bash
npm install              # install Playwright
npm test                 # run all e2e tests
npm run test:ui          # Playwright UI mode
npm run test:debug       # step-through debugger

# Run a single spec file
npx playwright test tests/e2e/export.spec.js

# Run a single test by title
npx playwright test -g "downloads PNG with correct filename pattern"
```

Tests require a display (Chrome extensions can't run headless). In a headless CI environment prefix with `xvfb-run`.

## Architecture

### Extension structure
`localpixel/` is the Chrome Manifest V3 extension. `background.js` only opens `editor/index.html` in a new tab on click. All logic lives in the editor tab — no content scripts, no messaging.

### Editor data flow
Images are loaded via `FileReader` (or `showOpenFilePicker` for "Overwrite Original") → base64 Data URL → `fabric.Image.fromURL` → Fabric.js Canvas. Edits live on the canvas in-memory. Export calls `canvas.toDataURL()` to flatten everything to a single image.

Two key globals in `editor.js`:
- `fabricImage` — the base image layer (Fabric.js Image object). Most tools operate on this.
- `canvas` — the Fabric.js Canvas instance. Shapes, text, and draw paths are added as additional objects on top of `fabricImage`.

### Tool module pattern
Each file in `editor/tools/` exports a plain object with at minimum `activate()` and `deactivate()`. Canvas-interaction tools (crop, text, draw, shapes, blur) are tracked in `CANVAS_TOOLS`; `editor.js` calls `_toggleCanvasTool()` which enforces mutual exclusion. Non-canvas tools (rotate, scale, flip, filters) operate directly on `fabricImage` and have no activate/deactivate cycle.

### History
`history.js` snapshots canvas state as `canvas.toJSON()` strings (max 30 entries). Undo/redo restore from these snapshots, then re-find `fabricImage` via `_findFabricImage()` since the object reference changes after restore.

### Filters
Applied via Fabric.js filter pipeline directly to `fabricImage`. `Filters.set()` updates internal state and immediately calls `fabricImage.applyFilters()`. Filter state is reset when a new image loads (`Filters.resetAll()`).

### Crop / Blur special cases
Both tools produce a new Data URL and replace `fabricImage` entirely rather than mutating it in place (crop uses an offscreen canvas for pixel-accurate extraction; blur uses `getImageData`/`putImageData`).

### File System Access API
"Overwrite Original" uses `showOpenFilePicker()` to get a `FileSystemFileHandle`. The handle is stored in `originalFileHandle` and used by `_overwriteOriginal()`. The button is hidden when no handle is available (drag-and-drop loads do not yield a handle).

## Tests

`tests/fixtures.js` sets up three Playwright fixtures:
- `extensionContext` — a persistent Chrome context with the extension loaded (worker scope, shared across a spec file)
- `editorPage` — a fresh tab at the dropzone (per-test)
- `loadedEditor` — a fresh tab with a 300×200 programmatically-generated PNG already on the canvas

No fixture image files on disk — the test image is generated in-browser via `<canvas>` and injected via `page.setInputFiles('#fileInput', ...)`.
