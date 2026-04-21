/* Freehand draw/annotate using Fabric.js free drawing mode */
const DrawTool = (() => {
  let canvas;
  let active = false;

  function activate(c, color, brushSize) {
    canvas = c;
    active = true;
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush.color = color || '#f5a623';
    canvas.freeDrawingBrush.width = brushSize || 4;
    canvas.freeDrawingBrush.strokeLineCap = 'round';
    canvas.freeDrawingBrush.strokeLineJoin = 'round';
  }

  function deactivate() {
    if (!canvas) return;
    active = false;
    canvas.isDrawingMode = false;
  }

  function setColor(color) {
    if (canvas && canvas.freeDrawingBrush)
      canvas.freeDrawingBrush.color = color;
  }

  function setBrushSize(size) {
    if (canvas && canvas.freeDrawingBrush)
      canvas.freeDrawingBrush.width = size;
  }

  function isActive() { return active; }

  return { activate, deactivate, setColor, setBrushSize, isActive };
})();
