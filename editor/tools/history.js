/* Undo/Redo history stack using Fabric.js JSON snapshots */
const History = (() => {
  const MAX = 30;
  let stack = [];
  let pointer = -1;

  function push(canvas) {
    // Discard any redo states ahead of pointer
    stack = stack.slice(0, pointer + 1);
    stack.push(JSON.stringify(canvas.toJSON(['selectable', 'evented', 'id'])));
    if (stack.length > MAX) stack.shift();
    pointer = stack.length - 1;
    _notify();
  }

  function undo(canvas, cb) {
    if (pointer <= 0) return;
    pointer--;
    _restore(canvas, cb);
  }

  function redo(canvas, cb) {
    if (pointer >= stack.length - 1) return;
    pointer++;
    _restore(canvas, cb);
  }

  function _restore(canvas, cb) {
    canvas.loadFromJSON(stack[pointer], () => {
      canvas.renderAll();
      _notify();
      if (cb) cb();
    });
  }

  function _notify() {
    document.dispatchEvent(new CustomEvent('history:change', {
      detail: { canUndo: pointer > 0, canRedo: pointer < stack.length - 1 }
    }));
  }

  function clear() {
    stack = [];
    pointer = -1;
    _notify();
  }

  return { push, undo, redo, clear };
})();
