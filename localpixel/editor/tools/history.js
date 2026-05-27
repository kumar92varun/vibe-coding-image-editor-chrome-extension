/* Undo/Redo history stack using Fabric.js JSON snapshots */
const History = (() => {
  const MAX = 30;
  let stack = [];
  let pointer = -1;
  let _dimsGetter = null;

  function setDimsGetter(fn) { _dimsGetter = fn; }

  function push(canvas) {
    // Discard any redo states ahead of pointer
    stack = stack.slice(0, pointer + 1);
    const state = canvas.toJSON(['selectable', 'evented', 'id']);
    const dims  = _dimsGetter ? _dimsGetter() : { w: canvas.width, h: canvas.height };
    state.__w = dims.w;
    state.__h = dims.h;
    state.__exportW = dims.exportW || dims.w;
    state.__exportH = dims.exportH || dims.h;
    stack.push(JSON.stringify(state));
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
    const state = JSON.parse(stack[pointer]);
    if (state.__w && state.__h) {
      canvas.setWidth(state.__w);
      canvas.setHeight(state.__h);
    }
    canvas.loadFromJSON(state, () => {
      canvas.renderAll();
      _notify();
      if (cb) cb(state.__w, state.__h, state.__exportW, state.__exportH);
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

  return { push, undo, redo, clear, setDimsGetter };
})();
