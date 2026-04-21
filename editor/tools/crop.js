/* Crop tool: overlay rect with handles, apply via offscreen canvas */
const CropTool = (() => {
  let canvas, fabricImage, onApply;
  let cropRect = null;
  let active = false;
  let ratio = 'free'; // 'free' | '1:1' | '4:3' | '16:9'

  const RATIO_MAP = { 'free': null, '1:1': 1, '4:3': 4/3, '16:9': 16/9 };

  function activate(c, img, applyCallback) {
    canvas = c;
    fabricImage = img;
    onApply = applyCallback;
    active = true;

    // Deselect everything
    canvas.discardActiveObject();

    // Position initial crop rect over the image bounding box
    const imgBounds = _getImageBounds();
    const w = imgBounds.width * 0.8;
    const h = ratio === 'free' ? imgBounds.height * 0.8 : w / RATIO_MAP[ratio];

    cropRect = new fabric.Rect({
      left:           imgBounds.left + imgBounds.width * 0.1,
      top:            imgBounds.top + imgBounds.height * 0.1,
      width:          w,
      height:         h,
      fill:           'transparent',
      stroke:         '#f5a623',
      strokeWidth:    1.5,
      strokeDashArray:[6, 3],
      cornerColor:    '#f5a623',
      cornerStyle:    'rect',
      cornerSize:     10,
      transparentCorners: false,
      lockRotation:   true,
      id:             '__cropRect',
    });

    if (ratio !== 'free') {
      cropRect.lockUniScaling = false;
      cropRect.on('scaling', _enforceRatio);
    }

    canvas.add(cropRect);
    canvas.setActiveObject(cropRect);
    canvas.renderAll();
  }

  function _enforceRatio() {
    if (!cropRect || ratio === 'free') return;
    const r = RATIO_MAP[ratio];
    if (!r) return;
    cropRect.set({ height: cropRect.width / r });
  }

  function setRatio(r) {
    ratio = r;
    if (cropRect && r !== 'free') {
      const rVal = RATIO_MAP[r];
      cropRect.set({ height: cropRect.width / rVal });
      cropRect.off('scaling', _enforceRatio);
      cropRect.on('scaling', _enforceRatio);
      canvas.renderAll();
    }
  }

  function applyAndCrop() {
    if (!active || !cropRect || !fabricImage) return;

    // Get crop rect in canvas (absolute) coordinates
    cropRect.setCoords();
    const bound = cropRect.getBoundingRect(true);

    // Image's transform (position/scale/angle relative to canvas)
    const imgEl = fabricImage.getElement();

    // Draw original image onto a temp canvas clipped to crop rect
    const scaleX = fabricImage.scaleX || 1;
    const scaleY = fabricImage.scaleY || 1;
    const angle  = (fabricImage.angle || 0) * Math.PI / 180;

    // Convert canvas coordinates to image-local coordinates
    const imgLeft   = fabricImage.left;
    const imgTop    = fabricImage.top;

    // Crop rect center in canvas space
    const crLeft = bound.left - imgLeft;
    const crTop  = bound.top  - imgTop;

    // Account for image scale
    const srcX = crLeft / scaleX;
    const srcY = crTop  / scaleY;
    const srcW = bound.width  / scaleX;
    const srcH = bound.height / scaleY;

    // Clamp to image bounds
    const clampX = Math.max(0, srcX);
    const clampY = Math.max(0, srcY);
    const clampW = Math.min(srcW, imgEl.naturalWidth  - clampX);
    const clampH = Math.min(srcH, imgEl.naturalHeight - clampY);

    const offscreen = document.createElement('canvas');
    offscreen.width  = Math.round(clampW);
    offscreen.height = Math.round(clampH);
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(imgEl, clampX, clampY, clampW, clampH, 0, 0, clampW, clampH);

    // Hand cropped dataURL back to editor
    const dataURL = offscreen.toDataURL('image/png');
    _cleanup();
    if (onApply) onApply(dataURL);
  }

  function cancel() {
    _cleanup();
  }

  function _cleanup() {
    if (cropRect) {
      canvas.remove(cropRect);
      cropRect = null;
    }
    active = false;
    canvas.discardActiveObject();
    canvas.renderAll();
  }

  function _getImageBounds() {
    fabricImage.setCoords();
    const br = fabricImage.getBoundingRect(true);
    return br;
  }

  function isActive() { return active; }

  return { activate, applyAndCrop, cancel, setRatio, isActive };
})();
