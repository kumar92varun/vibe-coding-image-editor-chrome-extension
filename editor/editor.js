/* LocalPixel — main editor controller */
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
  const CANVAS_TOOLS = new Set(['crop', 'text', 'draw', 'shapes', 'blur']);

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
      canvas.on('selection:created', (e) => {
        if (activeTool === 'shapes' && e.selected && e.selected[0]) {
          _syncSidebarToShape(e.selected[0]);
        }
      });
      canvas.on('selection:updated', (e) => {
        if (activeTool === 'shapes' && e.selected && e.selected[0]) {
          _syncSidebarToShape(e.selected[0]);
        }
      });
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

  function _applyCrop(src) {
    fabric.Image.fromURL(src, (img) => {
      canvas.remove(fabricImage);
      _fitImageToCanvas(img);
      img.set({ selectable: false, evented: false });
      canvas.insertAt(img, 0);
      fabricImage = img;
      canvas.renderAll();
      hasChanges = true;
      History.push(canvas);
      ScaleTool.init(fabricImage);
      _populateScaleInputs();
      _updateStatus();
    }, { crossOrigin: 'anonymous' });
  }

  // ===== TOOL BUTTON WIRING =====
  function _bindToolButtons() {
    document.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const toolName = btn.dataset.tool;
        const toolItem = btn.closest('.tool-item');

        if (toolName === 'history') return;

        if (canvas && CANVAS_TOOLS.has(toolName)) {
          // Sync panel open state with activation state
          if (activeTool === toolName) {
            toolItem?.classList.remove('open');
          } else {
            toolItem?.classList.add('open');
          }
          _toggleCanvasTool(toolName);
        } else {
          // All other tools: simple toggle
          toolItem?.classList.toggle('open');
        }
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
        _deactivateCanvasMode();
        _applyCrop(croppedDataURL);
      });
    } else if (toolName === 'text') {
      if (fabricImage) { fabricImage.selectable = false; fabricImage.evented = false; }
      TextTool.activate(canvas, () => _deactivateCanvasMode());
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
    } else if (toolName === 'blur') {
      if (!fabricImage) { _deactivateCanvasMode(); return; }
      fabricImage.selectable = false; fabricImage.evented = false;
      BlurBrushTool.activate(canvas, fabricImage, (newImg) => {
        fabricImage = newImg;
        hasChanges  = true;
        History.push(canvas);
      });
      canvasArea.classList.add('blur-mode');
    }
  }

  function _deactivateCanvasMode() {
    if (CropTool.isActive())   { CropTool.cancel(); canvasArea.classList.remove('crop-mode'); }
    if (TextTool.isActive())   TextTool.deactivate();
    if (DrawTool.isActive())   { DrawTool.deactivate(); canvasArea.classList.remove('draw-mode'); }
    if (ShapesTool.isActive())    { ShapesTool.deactivate();    canvasArea.classList.remove('shapes-mode'); }
    if (BlurBrushTool.isActive()) { BlurBrushTool.deactivate(); canvasArea.classList.remove('blur-mode'); }

    if (fabricImage) { fabricImage.selectable = false; fabricImage.evented = false; }

    CANVAS_TOOLS.forEach(t => document.getElementById(`tool-${t}`)?.classList.remove('active'));
    activeTool = null;
    statusTool.textContent = 'No tool active';
    if (canvas) canvas.defaultCursor = 'default';
  }

  // ===== TRANSFORM TOOLS =====
  function _bindTransformTools() {
    // Crop
    document.getElementById('applyCropBtn').addEventListener('click', () => CropTool.applyAndCrop());
    document.getElementById('cancelCropBtn').addEventListener('click', () => {
      CropTool.cancel();
      canvasArea.classList.remove('crop-mode');
      document.getElementById('tool-crop')?.classList.remove('active');
      activeTool = null;
      statusTool.textContent = 'No tool active';
    });

    // Rotate
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
    const scaleWidthInput  = document.getElementById('scaleWidthInput');
    const scaleHeightInput = document.getElementById('scaleHeightInput');
    const lockAspect       = document.getElementById('lockAspect');

    // Width input — when user types width, auto-calc height if aspect locked + live preview
    scaleWidthInput.addEventListener('input', () => {
      const w = parseInt(scaleWidthInput.value);
      if (!w || w < 1 || !fabricImage) return;
      if (lockAspect.checked) {
        const ar = ScaleTool.getAspectRatio();
        scaleHeightInput.value = Math.round(w / ar);
      }
      const h = parseInt(scaleHeightInput.value);
      if (h > 0) { ScaleTool.applyByDimensions(fabricImage, canvas, w, h, lockAspect.checked); _resizeCanvasToImage(); }
    });

    // Height input — when user types height, auto-calc width if aspect locked + live preview
    scaleHeightInput.addEventListener('input', () => {
      const h = parseInt(scaleHeightInput.value);
      if (!h || h < 1 || !fabricImage) return;
      if (lockAspect.checked) {
        const ar = ScaleTool.getAspectRatio();
        scaleWidthInput.value = Math.round(h * ar);
      }
      const w = parseInt(scaleWidthInput.value);
      if (w > 0) { ScaleTool.applyByDimensions(fabricImage, canvas, w, h, lockAspect.checked); _resizeCanvasToImage(); }
    });

    document.getElementById('applyScaleBtn').addEventListener('click', () => {
      if (!fabricImage) return;
      const w = parseInt(scaleWidthInput.value);
      const h = parseInt(scaleHeightInput.value);
      const lock = lockAspect.checked;

      if (w > 0 && h > 0) {
        ScaleTool.applyByDimensions(fabricImage, canvas, w, h, lock);
        _resizeCanvasToImage();
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
    document.getElementById('scaleWidthInput').value  = state.width;
    document.getElementById('scaleHeightInput').value = state.height;
  }

  function _resizeCanvasToImage() {
    if (!fabricImage) return;
    const newW = Math.round(fabricImage.width  * fabricImage.scaleX);
    const newH = Math.round(fabricImage.height * fabricImage.scaleY);
    canvas.setWidth(newW);
    canvas.setHeight(newH);
    canvasWrapper.style.width  = newW + 'px';
    canvasWrapper.style.height = newH + 'px';
    canvas.renderAll();
  }

  // ===== FILTER TOOLS =====
  function _bindFilterTools() {
    _bindFilterSlider('brightnessSlider', 'brightnessVal', 'brightness', v => v, '');
    _bindFilterSlider('contrastSlider',   'contrastVal',   'contrast',   v => v, '');
    _bindFilterSlider('saturationSlider', 'saturationVal', 'saturation', v => v, '');
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

    // Blur Brush
    const blurBrushSizeSlider = document.getElementById('blurBrushSizeSlider');
    const blurBrushSizeVal    = document.getElementById('blurBrushSizeVal');
    blurBrushSizeSlider.addEventListener('input', () => {
      const v = parseInt(blurBrushSizeSlider.value);
      blurBrushSizeVal.textContent = v + 'px';
      BlurBrushTool.setRadius(v);
    });

    const blurStrengthSlider = document.getElementById('blurStrengthSlider');
    const blurStrengthVal    = document.getElementById('blurStrengthVal');
    blurStrengthSlider.addEventListener('input', () => {
      const v = parseInt(blurStrengthSlider.value);
      blurStrengthVal.textContent = v + 'px';
      BlurBrushTool.setStrength(v);
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

    const fillInput    = document.getElementById('shapeFill');
    const strokeInput  = document.getElementById('shapeStroke');
    const noFillCheck  = document.getElementById('shapeNoFill');
    const strokeSlider = document.getElementById('shapeStrokeWidthSlider');
    const strokeVal    = document.getElementById('shapeStrokeWidthVal');

    fillInput.addEventListener('input', (e) => {
      ShapesTool.setConfig('fill', e.target.value);
      _applyShapePropertyToSelected();
    });
    fillInput.addEventListener('change', () => {
      if (canvas && canvas.getActiveObject()) { hasChanges = true; History.push(canvas); }
    });

    strokeInput.addEventListener('input', (e) => {
      ShapesTool.setConfig('stroke', e.target.value);
      _applyShapePropertyToSelected();
    });
    strokeInput.addEventListener('change', () => {
      if (canvas && canvas.getActiveObject()) { hasChanges = true; History.push(canvas); }
    });

    noFillCheck.addEventListener('change', (e) => {
      ShapesTool.setConfig('noFill', e.target.checked);
      _applyShapePropertyToSelected();
      if (canvas && canvas.getActiveObject()) { hasChanges = true; History.push(canvas); }
    });

    strokeSlider.addEventListener('input', () => {
      const v = parseInt(strokeSlider.value);
      strokeVal.textContent = v + 'px';
      ShapesTool.setConfig('strokeWidth', v);
      _applyShapePropertyToSelected();
    });
    strokeSlider.addEventListener('change', () => {
      if (canvas && canvas.getActiveObject()) { hasChanges = true; History.push(canvas); }
    });
  }

  function _syncSidebarToShape(obj) {
    if (!obj || obj.type === 'image') return;

    const fill   = obj.fill;
    const stroke = obj.stroke;
    const sw     = obj.strokeWidth;

    const isTransparent = !fill || fill === 'transparent';

    if (!isTransparent && typeof fill === 'string' && fill.startsWith('#')) {
      document.getElementById('shapeFill').value = fill;
      ShapesTool.setConfig('fill', fill);
    }
    if (stroke && typeof stroke === 'string' && stroke.startsWith('#')) {
      document.getElementById('shapeStroke').value = stroke;
      ShapesTool.setConfig('stroke', stroke);
    }

    document.getElementById('shapeNoFill').checked = isTransparent;
    ShapesTool.setConfig('noFill', isTransparent);

    if (sw != null) {
      const v = Math.round(sw);
      document.getElementById('shapeStrokeWidthSlider').value = v;
      document.getElementById('shapeStrokeWidthVal').textContent = v + 'px';
      ShapesTool.setConfig('strokeWidth', v);
    }
  }

  function _applyShapePropertyToSelected() {
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj || obj.type === 'image') return;

    const cfg = ShapesTool.getConfig();
    obj.set({
      fill:        cfg.noFill ? 'transparent' : cfg.fill,
      stroke:      cfg.stroke,
      strokeWidth: cfg.strokeWidth,
    });
    canvas.requestRenderAll();
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
    a.download = `localpixel-${base}.${ext}`;
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
      History.undo(canvas, (w, h) => {
        if (w && h) {
          canvasWrapper.style.width  = w + 'px';
          canvasWrapper.style.height = h + 'px';
        }
        fabricImage = _findFabricImage();
        if (fabricImage) currentZoom = fabricImage.scaleX || 1;
        Filters.applyAll(fabricImage, canvas);
        ScaleTool.init(fabricImage);
        _populateScaleInputs();
        _updateStatus();
        hasChanges = true;
      });
    });
    redoBtn.addEventListener('click', () => {
      History.redo(canvas, (w, h) => {
        if (w && h) {
          canvasWrapper.style.width  = w + 'px';
          canvasWrapper.style.height = h + 'px';
        }
        fabricImage = _findFabricImage();
        if (fabricImage) currentZoom = fabricImage.scaleX || 1;
        Filters.applyAll(fabricImage, canvas);
        ScaleTool.init(fabricImage);
        _populateScaleInputs();
        _updateStatus();
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
     ['saturationSlider','saturationVal','0']].forEach(([sid, vid, def]) => {
      const s = document.getElementById(sid);
      const v = document.getElementById(vid);
      if (s) s.value = 0;
      if (v) v.textContent = def;
    });
    const rs = document.getElementById('rotateSlider');
    if (rs) rs.value = 0;
    document.getElementById('rotateAngleVal').textContent = '0°';
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
