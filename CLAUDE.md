# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

From the repo root (`/var/www/html/others/ChromeExtensions/ImageEditor`):

```bash
npm install              # install Playwright (test tooling only — does NOT touch extension files)
npm test                 # run all e2e tests
npm run test:ui          # Playwright UI mode
npm run test:debug       # step-through debugger

# Run a single spec file
npx playwright test tests/e2e/export.spec.js

# Run a single test by title
npx playwright test -g "downloads PNG with correct filename pattern"
```

Tests require a display (Chrome extensions can't run headless). In a headless CI environment prefix with `xvfb-run`.

`package.json` only manages Playwright. There is no build step and no script that regenerates or overwrites the extension's `vendor/` files. All vendor files are static committed files.

---

## Extension structure

`localpixel/` is the Chrome Manifest V3 extension. Load it as an unpacked extension from `localpixel/`. `background.js` only opens `editor/index.html` in a new tab on click. All logic lives in the editor tab — no content scripts, no messaging.

```
localpixel/
  manifest.json
  background.js
  editor/
    index.html          ← single-page app; dropzone + all tool UIs
    editor.css
    editor.js           ← orchestrator; tool lifecycle, history, export
    tools/
      bg-model.js       ← AI model cache manager + fetch interceptor
      bg-model-ui.js    ← status dot / download button wiring
      blur-brush.js
      crop.js
      doc-scanner.js
      draw.js
      filters.js
      flip.js
      history.js
      images-to-pdf.js
      remove-bg.js      ← background removal modal
      rotate.js
      scale.js
      shapes.js
      text.js
  vendor/
    bg-removal.mjs      ← @imgly/background-removal@1.7.0 — PATCHED (see below)
    fabric.min.js
    jspdf.umd.min.js
    ort.min.mjs         ← onnxruntime-web@1.21.0
    pdf-lib.min.js
    pdf.min.js
    pdf.worker.min.js
    wasm/
      ort-wasm-simd-threaded.mjs    ← ORT WASM JS glue (~26 KB)
      ort-wasm-simd-threaded.wasm   ← ORT WASM binary (~13 MB)
```

### Content Security Policy

`manifest.json` CSP for extension pages:
```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self'
```

Chrome MV3 permanently forbids adding `'unsafe-eval'` or `blob:` to extension page CSP — the Chrome Web Store rejects them and Chrome itself ignores them. Every piece of dynamic code execution must work within these constraints.

---

## Core editor architecture

### Data flow
Images load via `FileReader` (or `showOpenFilePicker` for Overwrite Original) → base64 Data URL → `fabric.Image.fromURL` → Fabric.js Canvas. Edits live on the canvas in-memory. Export calls `canvas.toDataURL()` (the Fabric.js method, not the native HTML canvas one) to flatten everything into a single image.

Two key globals in `editor.js`:
- `fabricImage` — the base image layer (Fabric.js Image object). Most tools operate on this.
- `canvas` — the Fabric.js Canvas instance. Shapes, text, and draw paths sit on top of `fabricImage`.

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

### Copy Image to clipboard
`editor.js` uses `canvas.toDataURL({ format: 'png', multiplier: 1 })` (the Fabric.js method) — **not** the native `canvas.toBlob()` — to capture all edits including shapes, text, and draw paths layered on top of the base image. The data URL is converted to a Blob via `fetch(dataURL).blob()` then written with `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`.

### Paste from clipboard
In `editor.js`'s `_bindDropzone()`, a `document.addEventListener('paste', ...)` handler checks `e.clipboardData.items` for image files and calls `_loadFile()` directly. Only fires when the editor shell is hidden (i.e., on the dropzone, not while editing).

---

## Background Removal feature

This is the most complex part of the codebase due to Chrome MV3 CSP constraints. Read this section in full before touching any of the involved files.

### Overview

The feature uses `@imgly/background-removal@1.7.0` which internally uses ONNX Runtime Web (`onnxruntime-web@1.21.0`) for CPU inference. The AI model (`isnet_quint8`, ~44 MB) is cached in the browser's Cache API so it only downloads once. The ORT WASM runtime (~13 MB) is bundled directly in the extension under `vendor/wasm/`.

### Files involved

| File | Role |
|------|------|
| `editor/tools/remove-bg.js` | Modal UI + triggers `removeBackground()` |
| `editor/tools/bg-model.js` | Cache API manager + fetch interceptor |
| `editor/tools/bg-model-ui.js` | Status indicator + Download button on index page |
| `vendor/bg-removal.mjs` | **PATCHED** library — see critical section below |
| `vendor/ort.min.mjs` | ORT runtime (unmodified) |
| `vendor/wasm/ort-wasm-simd-threaded.mjs` | ORT WASM JS glue (unmodified) |
| `vendor/wasm/ort-wasm-simd-threaded.wasm` | ORT WASM binary (unmodified) |

### Model caching (`bg-model.js`)

- **Cache name**: `localpixel-bg-model-v1` (Cache API)
- **CDN**: `https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/`
- **Model key**: `/models/isnet_quint8`
- A monkey-patched `window.fetch` intercepts all requests to the CDN URL. If the file is in the cache it is served without hitting the network. All other fetches pass through unchanged.
- `isModelCached()` spot-checks `resources.json` + first and last chunks (avoids 11 cache lookups on every page load).
- `downloadModel(onProgress)` fetches `resources.json`, then downloads model chunks sequentially and stores each in Cache API.

### Status UI (`bg-model-ui.js`)

Loaded as `<script type="module" src="tools/bg-model-ui.js">` — must be a separate file with a `src` attribute because Chrome MV3 blocks inline `<script type="module">` tags. Wires up the status dot, text label, progress bar, Download button, and Browse button on the index page.

### ORT configuration (`remove-bg.js`)

```js
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths  = {
  mjs:  chrome.runtime.getURL('vendor/wasm/ort-wasm-simd-threaded.mjs'),
  wasm: chrome.runtime.getURL('vendor/wasm/ort-wasm-simd-threaded.wasm'),
};
```

**Why `numThreads = 1`**: Multi-threading triggers ORT to create blob: URLs for Worker module imports, which Chrome MV3 CSP blocks.

**Why `wasmPaths` is an object (not a string)**: ORT reads `.mjs` and `.wasm` as separate properties. Passing extension `chrome-extension://` URLs means ORT calls `import(chrome-extension://…/ort-wasm-simd-threaded.mjs)` — a same-origin URL that passes `script-src 'self'`. A plain string path would cause ORT to resolve a JSEP module URL that doesn't exist.

**Import order matters**: `remove-bg.js` imports `./bg-model.js` first (installs the fetch interceptor), then ORT, then bg-removal. The fetch interceptor must be active before anything fetches from the CDN.

---

## ⚠️ CRITICAL: Patched vendor file — `vendor/bg-removal.mjs`

`vendor/bg-removal.mjs` has been **surgically patched** in two places to work within Chrome MV3 CSP. These patches are not upstream. If you replace this file with a fresh download, the extension will break with CSP errors and you must reapply both patches manually.

The patches are documented in a comment block at the very top of the file. Always check that comment before distributing or upgrading.

---

### Patch 1 — Remove blob: URL creation for ORT WASM files

**Location**: The `Fe()` function (ORT session creation) inside `bg-removal.mjs`.

**What the original code did**:
```js
// ORIGINAL (broken in MV3):
s.env.wasm.numThreads = navigator.hardwareConcurrency ?? 4;
s.env.wasm.proxy = r;
const i = a ? "/onnxruntime-web/ort-wasm-simd-threaded.jsep"
             : "/onnxruntime-web/ort-wasm-simd-threaded";
const o = await Ee(`${i}.wasm`, t);   // fetches from CDN → returns blob: URL
const d = await Ee(`${i}.mjs`,  t);   // fetches from CDN → returns blob: URL
s.env.wasm.wasmPaths = { mjs: d, wasm: o };  // passes blob: URLs to ORT
```

The `Ee()` helper fetches files from the CDN and wraps them in `URL.createObjectURL()`. ORT then tries to `import(blobUrl)` the `.mjs` file. Chrome MV3 `script-src 'self'` blocks `import()` of `blob:` URLs.

Additionally, `navigator.hardwareConcurrency` (e.g. 8 on a modern CPU) overrides the `numThreads = 1` set in `remove-bg.js`. With `numThreads > 1`, ORT creates extra blob: URLs for threading, compounding the problem.

**What the patched code does**:
```js
// PATCHED:
s.env.wasm.numThreads = 1;
s.env.wasm.proxy = r;
// Ee() calls removed entirely — no blob: URLs created.
// ORT uses the wasmPaths object set in remove-bg.js (extension URLs).
```

ORT reads `ort.env.wasm.wasmPaths` (set by `remove-bg.js` before `removeBackground()` is called) and calls `import(chrome-extension://…/ort-wasm-simd-threaded.mjs)` directly — same-origin, passes CSP.

**How to reapply after upgrading `bg-removal.mjs`**:

Find the `Fe()` function. Search for:
```
s.env.wasm.numThreads=navigator.hardwareConcurrency
```
That line starts the section. The section ends after `s.env.wasm.wasmPaths={mjs:d,wasm:o},` (note trailing comma — it's part of a comma-expression before the next debug log statement).

Replace the entire section from `s.env.wasm.numThreads=navigator.hardwareConcurrency...` up to and including the `s.env.wasm.wasmPaths={mjs:d,wasm:o},` with:
```js
s.env.wasm.numThreads=1,s.env.wasm.proxy=r;
```

The `t.debug&&console.debug(...)` line that follows stays unchanged.

---

### Patch 2 — Replace `new Function()` in ndarray with a CSP-safe implementation

**Location**: The `o()` function inside the bundled `ndarray@1.0.19` module, near the top of `bg-removal.mjs`.

**What the original code did**:

`ndarray` generates optimized typed-array view constructors at runtime using `new Function(codeString)()`. This is equivalent to `eval()` and is blocked by `script-src 'self'` (Chrome MV3 permanently forbids `'unsafe-eval'` in extension page CSP).

There were three `new Function()` calls:
```js
// -1 dim (nil view):
return new Function(s)()

// 0 dim (scalar view):
return new Function("TrivialArray", s)(d[e][0])

// N dim (general view):
return new Function("CTOR_LIST", "ORDER", s.join("\n"))(d[e], i)
```

There was also one additional call unrelated to ndarray:
```js
f = p || h || Function("return this")()  // global-this accessor
```

**What the patched code does**:

The entire `o(dtype, ndim)` function body was replaced with a generic ES5-class implementation that pre-builds view prototypes using normal JavaScript without any code generation. It is functionally equivalent but uses loop-based array indexing instead of inlined integer expressions (a negligible performance difference for image processing).

The `Function("return this")()` call was replaced with `globalThis`.

**How to reapply after upgrading `bg-removal.mjs`**:

1. Find the `o()` function — search for:
   ```
   function o(e,t){var r=["View",t,"d",e]
   ```
   This is the ndarray constructor generator inside the bundled ndarray module.

2. Find the end of that function — search for the next occurrence of:
   ```
   )(d[e],i)}
   ```
   after the start. Everything from `function o(e,t){var r=["View"...` through `)(d[e],i)}` is the old function body.

3. Replace the entire `o()` function with the generic implementation. The canonical source for the replacement is the comment block at the top of `bg-removal.mjs` and this CLAUDE.md. The replacement can also be derived from the Python patch script below.

4. Find and replace `Function("return this")()` with `globalThis`.

**Python script to reapply both patches** (run from repo root after dropping in a fresh `bg-removal.mjs`):

```python
#!/usr/bin/env python3
"""
Reapply MV3 CSP patches to a freshly downloaded bg-removal.mjs.
Run from the repo root: python3 scripts/patch-bg-removal.py
Adjust OLD_* strings if the upstream library version changes its minification.
"""
import sys

path = 'localpixel/vendor/bg-removal.mjs'
content = open(path).read()

# ── Patch 1: Remove Ee() blob URL calls in Fe() ──────────────────────────────
OLD_FE = (
    's.env.wasm.numThreads=navigator.hardwareConcurrency??4,'
    's.env.wasm.proxy=r;const i=a?"/onnxruntime-web/ort-wasm-simd-threaded.jsep"'
    ':"onnxruntime-web/ort-wasm-simd-threaded"'
    # NOTE: the exact string depends on the minifier output of the new version.
    # Search for 's.env.wasm.numThreads=navigator.hardwareConcurrency' to find it.
)
NEW_FE = 's.env.wasm.numThreads=1,s.env.wasm.proxy=r;'

# ── Patch 2: Replace ndarray new Function() calls ────────────────────────────
OLD_O_START = 'function o(e,t){var r=["View",t,"d",e]'
OLD_O_END   = ')(d[e],i)}'

NEW_O = r'''function o(e,t){
  var n="generic"===e;
  function C(a,sh,st,off){this.data=a;this.shape=sh;this.stride=st;this.offset=off|0}
  var proto=C.prototype;
  proto.dtype=e;
  if(t<0){
    proto.dimension=-1;proto.size=0;proto.shape=proto.stride=proto.order=[];
    proto.lo=proto.hi=proto.transpose=proto.step=function(){return new C(this.data,[],[],0)};
    proto.get=proto.set=function(){};proto.pick=function(){return null};
    proto.index=function(){return -1};
    return function(a){return new C(a,[],[],0)};
  }
  if(t===0){
    proto.dimension=0;proto.size=1;proto.shape=proto.stride=proto.order=[];
    proto.index=function(){return this.offset};
    proto.lo=proto.hi=proto.transpose=proto.step=function(){return new C(this.data,[],[],this.offset)};
    proto.pick=function(){return d[e][0](this.data,[],[],0)};
    if(n){proto.get=function(){return this.data.get(this.offset)};proto.set=function(v){return this.data.set(this.offset,v)}}
    else{proto.get=function(){return this.data[this.offset]};proto.set=function(v){this.data[this.offset]=v}}
    proto.valueOf=proto.get;
    return function(a,b,c,off){return new C(a,[],[],off)};
  }
  proto.dimension=t;
  Object.defineProperty(proto,"size",{get:function(){var s=1;for(var k=0;k<this.shape.length;k++)s*=this.shape[k];return s}});
  if(t===1)proto.order=[0];
  else if(t===2)Object.defineProperty(proto,"order",{get:function(){return Math.abs(this.stride[0])>Math.abs(this.stride[1])?[1,0]:[0,1]}});
  else if(t===3)Object.defineProperty(proto,"order",{get:function(){var s0=Math.abs(this.stride[0]),s1=Math.abs(this.stride[1]),s2=Math.abs(this.stride[2]);if(s0>s1){if(s1>s2)return[2,1,0];if(s0>s2)return[1,2,0];return[1,0,2]}if(s0>s2)return[2,0,1];if(s2>s1)return[0,1,2];return[0,2,1]}});
  else Object.defineProperty(proto,"order",{get:function(){var e=this.stride,t=e.map(function(v,i){return[Math.abs(v),i]});t.sort(function(a,b){return a[0]-b[0]});return t.map(function(v){return v[1]})}});
  proto.index=function(){var idx=this.offset;for(var k=0;k<arguments.length;k++)idx+=this.stride[k]*arguments[k];return idx};
  if(n){
    proto.get=function(){var idx=this.offset;for(var k=0;k<arguments.length;k++)idx+=this.stride[k]*arguments[k];return this.data.get(idx)};
    proto.set=function(){var idx=this.offset;for(var k=0;k<arguments.length-1;k++)idx+=this.stride[k]*arguments[k];return this.data.set(idx,arguments[arguments.length-1])};
  }else{
    proto.get=function(){var idx=this.offset;for(var k=0;k<arguments.length;k++)idx+=this.stride[k]*arguments[k];return this.data[idx]};
    proto.set=function(){var idx=this.offset;for(var k=0;k<arguments.length-1;k++)idx+=this.stride[k]*arguments[k];return this.data[idx]=arguments[arguments.length-1]};
  }
  proto.hi=function(){var sh=new Array(t),st=new Array(t);for(var k=0;k<t;k++){var v=arguments[k];sh[k]=(typeof v!=="number"||v<0)?this.shape[k]:v|0;st[k]=this.stride[k]}return new C(this.data,sh,st,this.offset)};
  proto.lo=function(){var sh=new Array(t),st=new Array(t),off=this.offset;for(var k=0;k<t;k++){var a=this.shape[k],c=this.stride[k],v=arguments[k];if(typeof v==="number"&&v>=0){var dd=v|0;off+=c*dd;a-=dd}sh[k]=a;st[k]=c}return new C(this.data,sh,st,off)};
  proto.step=function(){var sh=new Array(t),st=new Array(t),off=this.offset;for(var k=0;k<t;k++){var a=this.shape[k],b=this.stride[k],v=arguments[k];if(typeof v==="number"){var dd=v|0;if(dd<0){off+=b*(a-1);a=Math.ceil(-a/dd)}else a=Math.ceil(a/dd);b*=dd}sh[k]=a;st[k]=b}return new C(this.data,sh,st,off)};
  proto.transpose=function(){var args=new Array(t);for(var k=0;k<t;k++)args[k]=(arguments[k]===undefined?k:arguments[k]|0);var a=this.shape,b=this.stride,sh=new Array(t),st=new Array(t);for(k=0;k<t;k++){sh[k]=a[args[k]];st[k]=b[args[k]]}return new C(this.data,sh,st,this.offset)};
  proto.pick=function(){var a=[],b=[],c=this.offset;for(var k=0;k<t;k++){var v=arguments[k];if(typeof v==="number"&&v>=0){c=(c+this.stride[k]*v)|0}else{a.push(this.shape[k]);b.push(this.stride[k])}}var ndm=a.length;if(!d[e][ndm+1])d[e][ndm+1]=o(e,ndm);return d[e][ndm+1](this.data,a,b,c)};
  return function(data,shape,stride,offset){return new C(data,shape.slice(),stride.slice(),offset)};
}'''

# Apply patch 2
start = content.find(OLD_O_START)
end   = content.find(OLD_O_END, start) + len(OLD_O_END)
if start == -1 or end == len(OLD_O_END) - 1:
    print('ERROR: Could not find ndarray o() function. Minification may have changed.')
    sys.exit(1)
content = content[:start] + NEW_O + content[end:]
print('Patch 2 (ndarray) applied.')

# Apply patch 1
fe_start = content.find('s.env.wasm.numThreads=navigator.hardwareConcurrency')
if fe_start == -1:
    print('ERROR: Could not find Fe() ORT section. Minification may have changed.')
    sys.exit(1)
# Find the end: s.env.wasm.wasmPaths={mjs:d,wasm:o}, (trailing comma is part of expression)
fe_end_marker = 's.env.wasm.wasmPaths={mjs:d,wasm:o},'
fe_end = content.find(fe_end_marker, fe_start) + len(fe_end_marker)
old_fe_section = content[fe_start:fe_end]
content = content[:fe_start] + 's.env.wasm.numThreads=1,s.env.wasm.proxy=r;' + content[fe_end:]
print('Patch 1 (blob URL removal) applied.')

# Apply patch 3: global this
content = content.replace('Function("return this")()', 'globalThis', 1)
print('Patch 3 (globalThis) applied.')

# Verify
assert 'new Function' not in content, 'FAIL: new Function still present'
assert 'Function("return this")' not in content, 'FAIL: Function("return this") still present'
print(f'All checks passed. Writing {path}')
open(path, 'w').write(content)
```

**After running the script, verify**:
```bash
grep -c 'new Function' localpixel/vendor/bg-removal.mjs   # must print 0
grep -c 'Function("return this")' localpixel/vendor/bg-removal.mjs   # must print 0
```

---

### Why these specific CSP rules can never be relaxed

| What you might try | Why it is permanently blocked |
|--------------------|-------------------------------|
| Add `'unsafe-eval'` to CSP | Chrome MV3 rejects extensions with `'unsafe-eval'` at install time; Chrome Web Store also rejects them |
| Add `blob:` to `script-src` | Chrome MV3 rejects `blob:` in `script-src` as an insecure value at install time |
| Add `data:` to `script-src` | Same — rejected at install time |
| Use inline `<script type="module">` | Blocked by `script-src 'self'` (no `'unsafe-inline'`) |

The only allowed dynamic script execution is `WebAssembly.instantiate()` (covered by `'wasm-unsafe-eval'`).

---

## Tests

`tests/fixtures.js` sets up three Playwright fixtures:
- `extensionContext` — a persistent Chrome context with the extension loaded (worker scope, shared across a spec file)
- `editorPage` — a fresh tab at the dropzone (per-test)
- `loadedEditor` — a fresh tab with a 300×200 programmatically-generated PNG already on the canvas

No fixture image files on disk — the test image is generated in-browser via `<canvas>` and injected via `page.setInputFiles('#fileInput', ...)`.
