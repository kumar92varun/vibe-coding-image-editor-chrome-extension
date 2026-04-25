/* Scale tool: dimension-based scaling relative to original image size */
const ScaleTool = (() => {
  let originalWidth  = 0;
  let originalHeight = 0;

  function init(fabricImage) {
    if (!fabricImage) return;
    originalWidth  = fabricImage.width;
    originalHeight = fabricImage.height;
  }

  function applyByDimensions(fabricImage, canvas, width, height, lockAspect) {
    if (!fabricImage || !originalWidth) return;
    const scaleX = width  / originalWidth;
    const scaleY = lockAspect ? scaleX : (height / originalHeight);
    fabricImage.set({ scaleX, scaleY });
    canvas.renderAll();
  }

  function getCurrentState(fabricImage) {
    if (!fabricImage || !originalWidth) return { width: 0, height: 0 };
    const w = Math.round(originalWidth  * (fabricImage.scaleX || 1));
    const h = Math.round(originalHeight * (fabricImage.scaleY || 1));
    return { width: w, height: h };
  }

  function getOriginal() { return { width: originalWidth, height: originalHeight }; }

  function getAspectRatio() {
    return originalHeight > 0 ? originalWidth / originalHeight : 1;
  }

  return { init, applyByDimensions, getCurrentState, getOriginal, getAspectRatio };
})();
