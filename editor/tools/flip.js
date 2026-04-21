/* Flip tool: horizontal and vertical */
const FlipTool = (() => {
  function flipH(fabricImage, canvas) {
    if (!fabricImage) return;
    fabricImage.set('flipX', !fabricImage.flipX);
    canvas.renderAll();
  }

  function flipV(fabricImage, canvas) {
    if (!fabricImage) return;
    fabricImage.set('flipY', !fabricImage.flipY);
    canvas.renderAll();
  }

  return { flipH, flipV };
})();
