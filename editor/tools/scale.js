/* Scale tool: percent-based and dimension-based scaling, both relative to original image size */
const ScaleTool = (() => {
  let originalWidth  = 0;
  let originalHeight = 0;

  function init(fabricImage) {
    if (!fabricImage) return;
    // Natural pixel dimensions (unaffected by scaleX/scaleY)
    originalWidth  = fabricImage.width;
    originalHeight = fabricImage.height;
  }

  function applyByPercent(fabricImage, canvas, percent, lockAspect) {
    if (!fabricImage || !originalWidth) return;
    const factor = percent / 100;
    fabricImage.set({ scaleX: factor, scaleY: lockAspect ? factor : factor });
    canvas.renderAll();
  }

  function applyByDimensions(fabricImage, canvas, width, height, lockAspect) {
    if (!fabricImage || !originalWidth) return;
    const scaleX = width  / originalWidth;
    const scaleY = lockAspect ? scaleX : (height / originalHeight);
    fabricImage.set({ scaleX, scaleY });
    canvas.renderAll();
  }

  // Returns current displayed W/H and percent for pre-filling inputs
  function getCurrentState(fabricImage) {
    if (!fabricImage || !originalWidth) return { width: 0, height: 0, percent: 100 };
    const w   = Math.round(originalWidth  * (fabricImage.scaleX || 1));
    const h   = Math.round(originalHeight * (fabricImage.scaleY || 1));
    const pct = Math.round((fabricImage.scaleX || 1) * 100);
    return { width: w, height: h, percent: pct };
  }

  function getOriginal() { return { width: originalWidth, height: originalHeight }; }

  function getAspectRatio() {
    return originalHeight > 0 ? originalWidth / originalHeight : 1;
  }

  return { init, applyByPercent, applyByDimensions, getCurrentState, getOriginal, getAspectRatio };
})();
