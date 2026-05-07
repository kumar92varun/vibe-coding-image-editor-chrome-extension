/* Rotate tool: free-angle slider */
const RotateTool = (() => {
  function setAngle(fabricImage, canvas, degrees) {
    if (!fabricImage) return;
    fabricImage.rotate(degrees);
    canvas.renderAll();
  }

  return { setAngle };
})();
