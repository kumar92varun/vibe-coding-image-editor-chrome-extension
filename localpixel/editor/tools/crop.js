/* Crop tool: free-form overlay rect with handles, apply via offscreen canvas */
const CropTool = (() => {
  let canvas, fabricImage, onApply;
  let cropRect = null;
  let active = false;
  let _savedUniformScaling;

  function activate(c, img, applyCallback) {
    canvas = c;
    fabricImage = img;
    onApply = applyCallback;
    active = true;

    _savedUniformScaling = canvas.uniformScaling;
    canvas.uniformScaling = false;

    canvas.discardActiveObject();

    const ib   = _getImageBounds();
    const left = ib.left   + ib.width  * 0.1;
    const top  = ib.top    + ib.height * 0.1;

    cropRect = new fabric.Rect({
      left,
      top,
      width:              ib.width  * 0.8,
      height:             ib.height * 0.8,
      fill:               'transparent',
      stroke:             '#2563EB',
      strokeWidth:        1.5,
      strokeDashArray:    [6, 3],
      cornerColor:        '#2563EB',
      cornerStyle:        'rect',
      cornerSize:         10,
      transparentCorners: false,
      lockRotation:       true,
      lockUniScaling:     false,
      id:                 '__cropRect',
    });

    canvas.on('object:moving', _constrainMove);
    canvas.on('object:scaling', _constrainScale);

    canvas.add(cropRect);
    canvas.setActiveObject(cropRect);
    canvas.renderAll();
  }

  function _constrainMove(e) {
    if (e.target !== cropRect) return;
    const ib  = _getImageBounds();
    const obj = e.target;
    const w   = obj.getScaledWidth();
    const h   = obj.getScaledHeight();

    obj.left = Math.max(ib.left, Math.min(obj.left, ib.left + ib.width  - w));
    obj.top  = Math.max(ib.top,  Math.min(obj.top,  ib.top  + ib.height - h));
    obj.setCoords();
  }

  function _constrainScale(e) {
    if (e.target !== cropRect) return;
    const ib  = _getImageBounds();
    const obj = e.target;

    // Current content edges (no stroke) before clamping
    let left   = obj.left;
    let top    = obj.top;
    let right  = obj.left   + obj.width  * obj.scaleX;
    let bottom = obj.top    + obj.height * obj.scaleY;

    const ibRight  = ib.left + ib.width;
    const ibBottom = ib.top  + ib.height;
    const minPx    = 20;

    // Clamp right edge — preserve left
    if (right > ibRight) {
      obj.scaleX = Math.max(minPx / obj.width, (ibRight - left) / obj.width);
      right = left + obj.width * obj.scaleX;
    }

    // Clamp bottom edge — preserve top
    if (bottom > ibBottom) {
      obj.scaleY = Math.max(minPx / obj.height, (ibBottom - top) / obj.height);
      bottom = top + obj.height * obj.scaleY;
    }

    // Clamp left edge — preserve right edge
    if (left < ib.left) {
      obj.left   = ib.left;
      obj.scaleX = Math.max(minPx / obj.width, (right - ib.left) / obj.width);
    }

    // Clamp top edge — preserve bottom edge
    if (top < ib.top) {
      obj.top    = ib.top;
      obj.scaleY = Math.max(minPx / obj.height, (bottom - ib.top) / obj.height);
    }

    obj.setCoords();
  }

  function applyAndCrop() {
    if (!active || !cropRect || !fabricImage) return;

    cropRect.setCoords();
    const bound = cropRect.getBoundingRect(true);

    const imgEl  = fabricImage.getElement();
    const scaleX = fabricImage.scaleX || 1;
    const scaleY = fabricImage.scaleY || 1;

    const srcX = (bound.left - fabricImage.left) / scaleX;
    const srcY = (bound.top  - fabricImage.top)  / scaleY;
    const srcW = bound.width  / scaleX;
    const srcH = bound.height / scaleY;

    const clampX = Math.max(0, srcX);
    const clampY = Math.max(0, srcY);
    const clampW = Math.min(srcW, imgEl.naturalWidth  - clampX);
    const clampH = Math.min(srcH, imgEl.naturalHeight - clampY);

    const offscreen = document.createElement('canvas');
    offscreen.width  = Math.round(clampW);
    offscreen.height = Math.round(clampH);
    offscreen.getContext('2d').drawImage(imgEl, clampX, clampY, clampW, clampH, 0, 0, clampW, clampH);

    const dataURL = offscreen.toDataURL('image/png');
    _cleanup();
    if (onApply) onApply(dataURL);
  }

  function cancel() {
    _cleanup();
  }

  function _cleanup() {
    canvas.off('object:moving', _constrainMove);
    canvas.off('object:scaling', _constrainScale);
    if (cropRect) {
      canvas.remove(cropRect);
      cropRect = null;
    }
    active = false;
    if (_savedUniformScaling !== undefined) {
      canvas.uniformScaling = _savedUniformScaling;
    }
    canvas.discardActiveObject();
    canvas.renderAll();
  }

  function _getImageBounds() {
    fabricImage.setCoords();
    return fabricImage.getBoundingRect(true);
  }

  function isActive() { return active; }

  return { activate, applyAndCrop, cancel, isActive };
})();
