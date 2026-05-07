/* BlurBrush tool: click-drag to paint blur onto image pixels */
const BlurBrushTool = (() => {
  let canvas     = null;
  let fabricImg  = null;
  let active     = false;
  let isDrawing  = false;
  let committing = false;

  let radius   = 20;  // brush radius in canvas-display px
  let strength = 10;  // blur kernel px in image-pixel space

  let workCanvas = null;
  let workCtx    = null;
  let tmpCanvas  = null;
  let tmpCtx     = null;

  let lastPt         = null;
  let onCommit       = null;
  let _origRenderAll = null;

  const _h = {};

  // ── public ──────────────────────────────────────────────

  function activate(c, img, commitCb) {
    canvas    = c;
    fabricImg = img;
    onCommit  = commitCb;
    active    = true;
    committing = false;
    workCanvas = null;  // lazy-init on first stroke

    canvas.selection      = false;
    canvas.skipTargetFind = true;
    canvas.defaultCursor  = 'crosshair';

    _h.down = (opt) => _onDown(opt);
    _h.move = (opt) => _onMove(opt);
    _h.up   = ()    => _onUp();

    canvas.on('mouse:down', _h.down);
    canvas.on('mouse:move', _h.move);
    canvas.on('mouse:up',   _h.up);
  }

  function deactivate() {
    if (!canvas) return;
    active    = false;
    isDrawing = false;
    _restoreRender();

    canvas.selection      = true;
    canvas.skipTargetFind = false;
    canvas.defaultCursor  = 'default';
    canvas.off('mouse:down', _h.down);
    canvas.off('mouse:move', _h.move);
    canvas.off('mouse:up',   _h.up);
    workCanvas = tmpCanvas = null;
    workCtx = tmpCtx = null;
    canvas = fabricImg = null;
  }

  function setRadius(r)   { radius   = r; }
  function setStrength(s) { strength = s; }
  function isActive()     { return active; }

  // ── private ─────────────────────────────────────────────

  function _initWork() {
    const el = fabricImg._element;
    const w  = el.naturalWidth  || el.width;
    const h  = el.naturalHeight || el.height;
    workCanvas        = document.createElement('canvas');
    workCanvas.width  = w;
    workCanvas.height = h;
    workCtx = workCanvas.getContext('2d');
    workCtx.drawImage(el, 0, 0);

    tmpCanvas = document.createElement('canvas');
    tmpCtx    = tmpCanvas.getContext('2d');
  }

  function _onDown(opt) {
    if (committing) return;
    if (!workCanvas) _initWork();

    isDrawing      = true;
    _origRenderAll = canvas.renderAll.bind(canvas);
    canvas.renderAll = () => {};   // freeze fabric re-renders

    const p = canvas.getPointer(opt.e);
    lastPt = p;
    _blurAt(p.x, p.y);
    _flush();
  }

  function _onMove(opt) {
    if (!isDrawing) return;
    const p = canvas.getPointer(opt.e);

    // Interpolate along the stroke for smooth coverage
    const dx = p.x - lastPt.x;
    const dy = p.y - lastPt.y;
    const dist  = Math.sqrt(dx * dx + dy * dy);
    const step  = Math.max(2, radius * 0.25);
    const steps = Math.max(1, Math.ceil(dist / step));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      _blurAt(lastPt.x + dx * t, lastPt.y + dy * t);
    }

    lastPt = p;
    _flush();
  }

  function _onUp() {
    if (!isDrawing) return;
    isDrawing  = false;
    committing = true;
    _commitToFabric();
  }

  // Convert canvas-display coordinates → image-pixel coordinates
  function _toImgPx(cx, cy) {
    const mtx = fabricImg.calcTransformMatrix();
    const inv = fabric.util.invertTransform(mtx);
    const pt  = fabric.util.transformPoint({ x: cx, y: cy }, inv);
    return {
      x: pt.x + fabricImg.width  / 2,
      y: pt.y + fabricImg.height / 2,
    };
  }

  // Average display-→-image scale factor for radius conversion
  function _imgRadius() {
    return radius / ((fabricImg.scaleX + fabricImg.scaleY) / 2);
  }

  function _blurAt(cx, cy) {
    const img = _toImgPx(cx, cy);
    const r   = _imgRadius();
    const pad = Math.ceil(strength * 2);

    const x0 = Math.max(0, Math.floor(img.x - r - pad));
    const y0 = Math.max(0, Math.floor(img.y - r - pad));
    const x1 = Math.min(workCanvas.width,  Math.ceil(img.x + r + pad));
    const y1 = Math.min(workCanvas.height, Math.ceil(img.y + r + pad));
    const w  = x1 - x0;
    const h  = y1 - y0;
    if (w <= 0 || h <= 0) return;

    // Blur a patch from workCanvas (cumulative: repeated strokes get blurrier)
    tmpCanvas.width  = w;
    tmpCanvas.height = h;
    tmpCtx.filter = `blur(${strength}px)`;
    tmpCtx.clearRect(0, 0, w, h);
    tmpCtx.drawImage(workCanvas, x0, y0, w, h, 0, 0, w, h);
    tmpCtx.filter = 'none';

    // Paste blurred patch back, clipped to circle
    workCtx.save();
    workCtx.beginPath();
    workCtx.arc(img.x, img.y, r, 0, Math.PI * 2);
    workCtx.clip();
    workCtx.drawImage(tmpCanvas, x0, y0);
    workCtx.restore();
  }

  // Directly repaint lower canvas: bg + blurred image + overlay objects
  function _flush() {
    const lCtx = canvas.lowerCanvasEl.getContext('2d');
    lCtx.clearRect(0, 0, canvas.width, canvas.height);

    lCtx.fillStyle = canvas.backgroundColor || '#ffffff';
    lCtx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw workCanvas using fabricImg's full transform (handles scale + rotation)
    const mtx = fabricImg.calcTransformMatrix();
    lCtx.save();
    lCtx.transform(mtx[0], mtx[1], mtx[2], mtx[3], mtx[4], mtx[5]);
    lCtx.drawImage(
      workCanvas,
      -fabricImg.width  / 2,
      -fabricImg.height / 2,
       fabricImg.width,
       fabricImg.height
    );
    lCtx.restore();

    // Re-render all overlay objects on top
    canvas.getObjects().forEach(obj => {
      if (obj !== fabricImg) obj.render(lCtx);
    });
  }

  function _commitToFabric() {
    const dataURL = workCanvas.toDataURL('image/png');
    fabric.Image.fromURL(dataURL, (newImg) => {
      newImg.set({
        left:       fabricImg.left,
        top:        fabricImg.top,
        scaleX:     fabricImg.scaleX,
        scaleY:     fabricImg.scaleY,
        angle:      fabricImg.angle,
        selectable: false,
        evented:    false,
      });
      canvas.remove(fabricImg);
      canvas.insertAt(newImg, 0);
      fabricImg  = newImg;
      committing = false;
      _restoreRender();
      canvas.renderAll();
      if (onCommit) onCommit(newImg);
    });
  }

  function _restoreRender() {
    if (_origRenderAll) {
      canvas.renderAll = _origRenderAll;
      _origRenderAll   = null;
    }
  }

  return { activate, deactivate, setRadius, setStrength, isActive };
})();
