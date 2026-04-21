/* PixelForge — main editor controller */
(function () {
  'use strict';

  // ===== STATE =====
  let canvas = null;
  let fabricImage = null;
  let originalSrc = null;
  let originalFilename = 'image.png';
  let activeTool = null;   // only tracks canvas-interaction tools
  let currentZoom = 1;
  let hasChanges = false;

  // Canvas-mode tools require explicit activate/deactivate
  const CANVAS_TOOLS = new Set(['crop', 'text', 'draw', 'shapes']);

  // ===== DOM REFS =====
  const dropzone        = document.getElementById('dropzone');
  const editorShell     = document.getElementById('editorShell');
  const fileInput       = document.getElementById('fileInput');
  const browseBtn       = document.getElementById('browseBtn');
  const dropzoneInner   = dropzone.querySelector('.dropzone-inner');

  const loadNewBtn      = document.getElementById('loadNewBtn');
  const downloadBtn     = document.getElementById('downloadBtn');
  const formatSelect    = document.getElementById('formatSelect');
  const qualitySlider   = document.getElementById('qualitySlider');
  const qualityVal      = document.getElementById('qualityVal');
  const qualityWrapper  = document.getElementById('qualityWrapper');
  const filenameDisplay = document.getElementById('filenameDisplay');
  const canvasArea      = document.getElementById('canvasArea');
  const canvasWrapper   = document.getElementById('canvasWrapper');

  const undoBtn   = document.getElementById('undoBtn');
  const redoBtn   = document.getElementById('redoBtn');
  const resetBtn  = document.getElementById('resetBtn');

  const confirmModal = document.getElementById('confirmModal');
  const confirmMsg   = document.getElementById('confirmMsg');
  const confirmYes   = document.getElementById('confirmYes');
  const confirmNo    = document.getElementById('confirmNo');

  const statusDimensions = document.getElementById('statusDimensions');
  const statusZoom       = document.getElementById('statusZoom');
  const statusTool       = document.getElementById('statusTool');

  // ===== INIT =====
  function init() {
    _bindDropzone();
    _bindHeader();
    _bindToolButtons();
    _bindTransformTools();
    _bindFilterTools();
    _bindAnnotateTools();
    _bindShapesTool();
    _bindHistory();
    _bindKeyboard();
    _bindFormatSelect();
  }

  // ===== DROPZONE =====
  function _bindDropzone() {
    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) _loadFile(e.target.files[0]);
    });
    dropzoneInner.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzoneInner.classList.add('drag-over');
    });
    dropzoneInner.addEventListener('dragleave', () => dropzoneInner.classList.remove('drag-over'));
    dropzoneInner.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzoneInner.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) _loadFile(file);
    });
  }

  function _loadFile(file) {
    const reader = new FileReader();
    originalFilename = file.name;
    reader.onload = (e) => _initEditor(e.target.result);
    reader.readAsDataURL(file);
  }

  // ===== EDITOR INIT =====
  function _initEditor(src) {
    originalSrc = src;
    hasChanges = false;

    dropzone.classList.add('hidden');
    editorShell.classList.remove('hidden');
    filenameDisplay.textContent = originalFilename;

    if (canvas) canvas.dispose();

    canvas = new fabric.Canvas('mainCanvas', {
      selection: true,
      preserveObjectStacking: true,
      backgroundColor: '#ffffff',
    });

    History.clear();
    Filters.resetAll(null, canvas);
    _resetFilterUI();
    _deactivateCanvasMode();

    fabric.Image.fromURL(src, (img) => {
      fabricImage = img;
      _fitImageToCanvas(img);

      canvas.add(img);
      img.sendToBack();
      canvas.renderAll();

      canvasWrapper.classList.add('loaded');
      History.push(canvas);

      _updateStatus();
      ScaleTool.init(fabricImage);
      _populateScaleInputs();
      Filters.applyAll(fabricImage, canvas);

      canvas.on('object:modified', () => { hasChanges = true; History.push(canvas); });
      canvas.on('path:created',    () => { hasChanges = true; History.push(canvas); });
    }, { crossOrigin: 'anonymous' });
  }

  function _fitImageToCanvas(img) {
    const areaW = canvasArea.clientWidth  - 40;
    const areaH = canvasArea.clientHeight - 40;
    const scaleX = areaW / img.width;
    const scaleY = areaH / img.height;
    const scale  = Math.min(scaleX, scaleY, 1);

    img.set({ scaleX: scale, scaleY: scale, left: 0, top: 0, selectable: false, evented: false });

    const displayW = Math.round(img.width  * scale);
    const displayH = Math.round(img.height * scale);
    canvas.setWidth(displayW);
    canvas.setHeight(displayH);
    canvasWrapper.style.width  = displayW + 'px';
    canvasWrapper.style.height = displayH + 'px';

    currentZoom = scale;
  }

  // ===== TOOL BUTTON WIRING =====
  // All tool buttons send clicks here; only CANVAS_TOOLS have activation logic.
  function _bindToolButtons() {
    document.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const toolName = btn.dataset.tool;
        if (!canvas || !toolName) return;
        if (CANVAS_TOOLS.has(toolName)) _toggleCanvasTool(toolName);
        // Non-canvas tool buttons have no toggle behavior — panels are always visible
      });
    });
  }

  function _toggleCanvasTool(toolName) {
    if (activeTool === toolName) {
      _deactivateCanvasMode();
      return;
    }
    if (activeTool) _deactivateCanvasMode();

    activeTool = toolName;
    document.getElementById(`tool-${toolName}`)?.classList.add('active');
    statusTool.textContent = toolName.charAt(0).toUpperCase() + toolName.slice(1);

    if (toolName === 'crop') {
      if (!fabricImage) { _deactivateCanvasMode(); return; }
      canvasArea.classList.add('crop-mode');
      CropTool.activate(canvas, fabricImage, (croppedDataURL) => {
        _initEditor(croppedDataURL);
        _deactivateCanvasMode();
      });
    } else if (toolName === 'text') {
      if (fabricImage) { fabricImage.selectable = false; fabricImage.evented = false; }
      TextTool.activate(canvas);
    } else if (toolName === 'draw') {
      if (fabricImage) { fabricImage.selectable = false; fabricImage.evented = false; }
      const color = document.getElementById('drawColor').value;
      const size  = parseInt(document.getElementById('brushSizeSlider').value);
      DrawTool.activate(canvas, color, size);
      canvasArea.classList.add('draw-mode');
    } else if (toolName === 'shapes') {
      if (fabricImage) { fabricImage.selectable = false; fabricImage.evented = false; }
      ShapesTool.activate(canvas);
      canvasArea.classList.add('shapes-mode');
    }
  }

  function _deactivateCanvasMode() {
    if (CropTool.isActive())   { CropTool.cancel(); canvasArea.classList.remove('crop-mode'); }
    if (TextTool.isActive())   TextTool.deactivate();
    if (DrawTool.isActive())   { DrawTool.deactivate(); canvasArea.classList.remove('draw-mode'); }
    if (ShapesTool.isActive()) { ShapesTool.deactivate(); canvasArea.classList.remove('shapes-mode'); }

    if (fabricImage) { fabricImage.selectable = false; fabricImage.evented = false; }

    CANVAS_TOOLS.forEach(t => document.getElementById(`tool-${t}`)?.classList.remove('active'));
    activeTool = null;
    statusTool.textContent = 'No tool active';
    if (canvas) canvas.defaultCursor = 'default';
  }

  // ===== TRANSFORM TOOLS =====
  function _bindTransformTools() {
    // Crop
    document.querySelectorAll('[data-ratio]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-ratio]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        CropTool.setRatio(btn.dataset.ratio);
      });
    });
    document.getElementById('applyCropBtn').addEventListener('click', () => CropTool.applyAndCrop());
    document.getElementById('cancelCropBtn').addEventListener('click', () => {
      CropTool.cancel();
      canvasArea.classList.remove('crop-mode');
      document.getElementById('tool-crop')?.classList.remove('active');
      activeTool = null;
      statusTool.textContent = 'No tool active';
    });

    // Rotate
    document.getElementById('rotateLeftBtn').addEventListener('click', () => {
      if (!fabricImage) return;
      RotateTool.rotate90(fabricImage, canvas, -1, () => { hasChanges = true; History.push(canvas); });
    });
    document.getElementById('rotateRightBtn').addEventListener('click', () => {
      if (!fabricImage) return;
      RotateTool.rotate90(fabricImage, canvas, 1, () => { hasChanges = true; History.push(canvas); });
    });
    const rotateSlider   = document.getElementById('rotateSlider');
    const rotateAngleVal = document.getElementById('rotateAngleVal');
    rotateSlider.addEventListener('input', () => {
      if (!fabricImage) return;
      const val = parseInt(rotateSlider.value);
      rotateAngleVal.textContent = val + '°';
      RotateTool.setAngle(fabricImage, canvas, val);
    });
    rotateSlider.addEventListener('change', () => { hasChanges = true; History.push(canvas); });

    // Scale
    const scaleInput       = document.getElementById('scaleInput');
    const scaleVal         = document.getElementById('scaleVal');
    const scaleWidthInput  = document.getElementById('scaleWidthInput');
    const scaleHeightInput = document.getElementById('scaleHeightInput');
    const lockAspect       = document.getElementById('lockAspect');

    document.getElementById('scaleDownBtn').addEventListener('click', () => {
      scaleInput.value = Math.max(10, parseInt(scaleInput.value) - 10);
      scaleVal.textContent = scaleInput.value + '%';
    });
    document.getElementById('scaleUpBtn').addEventListener('click', () => {
      scaleInput.value = Math.min(500, parseInt(scaleInput.value) + 10);
      scaleVal.textContent = scaleInput.value + '%';
    });
    scaleInput.addEventListener('input', () => {
      scaleVal.textContent = scaleInput.value + '%';
    });

    // Width input — when user types width, auto-calc height if aspect locked
    scaleWidthInput.addEventListener('input', () => {
      const w = parseInt(scaleWidthInput.value);
      if (!w || !fabricImage) return;
      if (lockAspect.checked) {
        const ar = ScaleTool.getAspectRatio();
        scaleHeightInput.value = Math.round(w / ar);
      }
    });

    // Height input — when user types height, auto-calc width if aspect locked
    scaleHeightInput.addEventListener('input', () => {
      const h = parseInt(scaleHeightInput.value);
      if (!h || !fabricImage) return;
      if (lockAspect.checked) {
        const ar = ScaleTool.getAspectRatio();
        scaleWidthInput.value = Math.round(h * ar);
      }
    });

    document.getElementById('applyScaleBtn').addEventListener('click', () => {
      if (!fabricImage) return;
      const w = parseInt(scaleWidthInput.value);
      const h = parseInt(scaleHeightInput.value);
      const pct = parseInt(scaleInput.value);
      const lock = lockAspect.checked;

      // Dimension inputs take priority if filled
      if (w > 0 && h > 0) {
        ScaleTool.applyByDimensions(fabricImage, canvas, w, h, lock);
      } else {
        ScaleTool.applyByPercent(fabricImage, canvas, pct, lock);
      }
      hasChanges = true;
      History.push(canvas);
      _populateScaleInputs(); // refresh displayed values
    });

    // Flip
    document.getElementById('flipHBtn').addEventListener('click', () => {
      if (!fabricImage) return;
      FlipTool.flipH(fabricImage, canvas);
      hasChanges = true;
      History.push(canvas);
    });
    document.getElementById('flipVBtn').addEventListener('click', () => {
      if (!fabricImage) return;
      FlipTool.flipV(fabricImage, canvas);
      hasChanges = true;
      History.push(canvas);
    });
  }

  function _populateScaleInputs() {
    if (!fabricImage) return;
    const state = ScaleTool.getCurrentState(fabricImage);
    document.getElementById('scaleInput').value     = state.percent;
    document.getElementById('scaleVal').textContent = state.percent + '%';
    document.getElementById('scaleWidthInput').value  = state.width;
    document.getElementById('scaleHeightInput').value = state.height;
  }

  // ===== FILTER TOOLS =====
  function _bindFilterTools() {
    _bindFilterSlider('brightnessSlider', 'brightnessVal', 'brightness', v => v, '');
    _bindFilterSlider('contrastSlider',   'contrastVal',   'contrast',   v => v, '');
    _bindFilterSlider('saturationSlider', 'saturationVal', 'saturation', v => v, '');
    _bindFilterSlider('blurSlider',       'blurVal',       'blur',       v => v, 'px');

    document.getElementById('sharpenToggle').addEventListener('change', (e) => {
      Filters.set('sharpen', e.target.checked, fabricImage, canvas);
      hasChanges = true;
      History.push(canvas);
    });
  }

  function _bindFilterSlider(sliderId, valId, filterKey, transform, suffix) {
    const slider = document.getElementById(sliderId);
    const valEl  = document.getElementById(valId);
    slider.addEventListener('input', () => {
      const v = parseInt(slider.value);
      valEl.textContent = transform(v) + suffix;
      Filters.set(filterKey, v, fabricImage, canvas);
    });
    slider.addEventListener('change', () => { hasChanges = true; History.push(canvas); });
  }

  // ===== ANNOTATE TOOLS =====
  function _bindAnnotateTools() {
    // Text
    document.getElementById('textFont').addEventListener('change',  (e) => TextTool.updateDefaults('fontFamily', e.target.value));
    document.getElementById('textSize').addEventListener('input',   (e) => TextTool.updateDefaults('fontSize', parseInt(e.target.value)));
    document.getElementById('textColor').addEventListener('input',  (e) => TextTool.updateDefaults('fill', e.target.value));
    document.getElementById('textBold').addEventListener('click',   (e) => {
      const isOn = e.currentTarget.classList.toggle('active');
      TextTool.updateDefaults('fontWeight', isOn ? 'bold' : 'normal');
    });
    document.getElementById('textItalic').addEventListener('click', (e) => {
      const isOn = e.currentTarget.classList.toggle('active');
      TextTool.updateDefaults('fontStyle', isOn ? 'italic' : 'normal');
    });
    document.getElementById('textBgEnabled').addEventListener('change', (e) => {
      TextTool.updateDefaults('bgEnabled', e.target.checked);
    });
    document.getElementById('textBgColor').addEventListener('input',   (e) => {
      TextTool.updateDefaults('backgroundColor', e.target.value);
    });
    document.getElementById('textBgPadding').addEventListener('input', (e) => {
      TextTool.updateDefaults('bgPadding', parseInt(e.target.value) || 0);
    });

    // Draw
    document.getElementById('drawColor').addEventListener('input', (e) => DrawTool.setColor(e.target.value));
    const brushSizeSlider = document.getElementById('brushSizeSlider');
    const brushSizeVal    = document.getElementById('brushSizeVal');
    brushSizeSlider.addEventListener('input', () => {
      const v = parseInt(brushSizeSlider.value);
      brushSizeVal.textContent = v + 'px';
      DrawTool.setBrushSize(v);
    });
  }

  // ===== SHAPES TOOL =====
  function _bindShapesTool() {
    document.querySelectorAll('.shape-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ShapesTool.setConfig('shape', btn.dataset.shape);
      });
    });
    document.getElementById('shapeFill').addEventListener('input', (e) => {
      ShapesTool.setConfig('fill', e.target.value);
    });
    document.getElementById('shapeStroke').addEventListener('input', (e) => {
      ShapesTool.setConfig('stroke', e.target.value);
    });
    document.getElementById('shapeNoFill').addEventListener('change', (e) => {
      ShapesTool.setConfig('noFill', e.target.checked);
    });
    const strokeSlider = document.getElementById('shapeStrokeWidthSlider');
    const strokeVal    = document.getElementById('shapeStrokeWidthVal');
    strokeSlider.addEventListener('input', () => {
      const v = parseInt(strokeSlider.value);
      strokeVal.textContent = v + 'px';
      ShapesTool.setConfig('strokeWidth', v);
    });
  }

  // ===== HEADER =====
  function _bindHeader() {
    loadNewBtn.addEventListener('click', () => {
      if (hasChanges) {
        _confirm('Load a new image? Unsaved changes will be lost.', _resetToDropzone);
      } else {
        _resetToDropzone();
      }
    });
    downloadBtn.addEventListener('click', _downloadImage);
  }

  function _resetToDropzone() {
    if (canvas) canvas.dispose();
    canvas = null; fabricImage = null; originalSrc = null;
    hasChanges = false; activeTool = null;
    editorShell.classList.add('hidden');
    dropzone.classList.remove('hidden');
    fileInput.value = '';
    canvasWrapper.classList.remove('loaded');
    _resetFilterUI();
    History.clear();
  }

  function _downloadImage() {
    if (!canvas) return;
    const format  = formatSelect.value;
    const quality = parseInt(qualitySlider.value) / 100;
    const dataURL = canvas.toDataURL({
      format,
      quality: format === 'png' ? 1 : quality,
      multiplier: 1,
    });
    const ext  = format === 'jpeg' ? 'jpg' : format;
    const base = originalFilename.replace(/\.[^.]+$/, '');
    const a    = document.createElement('a');
    a.href     = dataURL;
    a.download = `pixelforge-${base}.${ext}`;
    a.click();
  }

  function _bindFormatSelect() {
    formatSelect.addEventListener('change', () => {
      const fmt = formatSelect.value;
      qualityWrapper.style.display = (fmt === 'jpeg' || fmt === 'webp') ? 'flex' : 'none';
    });
    qualitySlider.addEventListener('input', () => {
      qualityVal.textContent = qualitySlider.value;
    });
  }

  // ===== HISTORY =====
  function _bindHistory() {
    undoBtn.addEventListener('click', () => {
      History.undo(canvas, () => {
        fabricImage = _findFabricImage();
        Filters.applyAll(fabricImage, canvas);
        ScaleTool.init(fabricImage);
        _populateScaleInputs();
        hasChanges = true;
      });
    });
    redoBtn.addEventListener('click', () => {
      History.redo(canvas, () => {
        fabricImage = _findFabricImage();
        Filters.applyAll(fabricImage, canvas);
        ScaleTool.init(fabricImage);
        _populateScaleInputs();
        hasChanges = true;
      });
    });
    resetBtn.addEventListener('click', () => {
      _confirm('Reset to original image? All edits will be lost.', () => _initEditor(originalSrc));
    });
    document.addEventListener('history:change', (e) => {
      undoBtn.disabled = !e.detail.canUndo;
      redoBtn.disabled = !e.detail.canRedo;
    });
  }

  function _findFabricImage() {
    if (!canvas) return null;
    return canvas.getObjects().find(obj => obj.type === 'image') || null;
  }

  // ===== KEYBOARD =====
  function _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (!canvas) return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;

      if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
        e.preventDefault(); redoBtn.click();
      } else if (e.ctrlKey && e.key === 'z') {
        e.preventDefault(); undoBtn.click();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const obj = canvas.getActiveObject();
        if (obj && obj !== fabricImage && obj.id !== '__cropRect') {
          canvas.remove(obj);
          canvas.renderAll();
          hasChanges = true;
          History.push(canvas);
        }
      } else if (e.key === 'Escape') {
        _deactivateCanvasMode();
      }
    });
  }

  // ===== STATUS =====
  function _updateStatus() {
    if (!fabricImage) return;
    statusDimensions.textContent = `${fabricImage.width} × ${fabricImage.height}px`;
    statusZoom.textContent = Math.round(currentZoom * 100) + '%';
  }

  // ===== FILTER UI RESET =====
  function _resetFilterUI() {
    [['brightnessSlider','brightnessVal','0'],
     ['contrastSlider',  'contrastVal',  '0'],
     ['saturationSlider','saturationVal','0'],
     ['blurSlider',      'blurVal',      '0px']].forEach(([sid, vid, def]) => {
      const s = document.getElementById(sid);
      const v = document.getElementById(vid);
      if (s) s.value = 0;
      if (v) v.textContent = def;
    });
    const sh = document.getElementById('sharpenToggle');
    if (sh) sh.checked = false;
    const rs = document.getElementById('rotateSlider');
    if (rs) rs.value = 0;
    document.getElementById('rotateAngleVal').textContent = '0°';
    document.getElementById('scaleInput').value = '100';
    document.getElementById('scaleVal').textContent = '100%';
    document.getElementById('scaleWidthInput').value  = '';
    document.getElementById('scaleHeightInput').value = '';
  }

  // ===== CONFIRM DIALOG =====
  function _confirm(msg, onYes) {
    confirmMsg.textContent = msg;
    confirmModal.classList.remove('hidden');
    const cleanup = () => {
      confirmYes.removeEventListener('click', yes);
      confirmNo.removeEventListener('click',  no);
    };
    const yes = () => { confirmModal.classList.add('hidden'); cleanup(); onYes(); };
    const no  = () => { confirmModal.classList.add('hidden'); cleanup(); };
    confirmYes.addEventListener('click', yes);
    confirmNo.addEventListener('click',  no);
  }

  init();
})();
