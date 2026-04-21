/* Rotate tool: 90° steps and free-angle slider */
const RotateTool = (() => {
  function rotate90(fabricImage, canvas, direction, onDone) {
    if (!fabricImage) return;
    const current = fabricImage.angle || 0;
    fabricImage.rotate((current + direction * 90 + 360) % 360);
    canvas.renderAll();
    if (onDone) onDone();
  }

  function setAngle(fabricImage, canvas, degrees) {
    if (!fabricImage) return;
    fabricImage.rotate(degrees);
    canvas.renderAll();
  }

  return { rotate90, setAngle };
})();
