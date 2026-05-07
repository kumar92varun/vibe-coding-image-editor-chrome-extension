/* Fabric.js filter application — brightness, contrast, saturation, blur */
const Filters = (() => {
  const state = {
    brightness: 0,
    contrast:   0,
    saturation: 0,
    blur:       0,
  };

  function applyAll(fabricImage, canvas) {
    if (!fabricImage) return;

    const filters = [];

    if (state.brightness !== 0)
      filters.push(new fabric.Image.filters.Brightness({ brightness: state.brightness / 100 }));

    if (state.contrast !== 0)
      filters.push(new fabric.Image.filters.Contrast({ contrast: state.contrast / 100 }));

    if (state.saturation !== 0)
      filters.push(new fabric.Image.filters.Saturation({ saturation: state.saturation / 100 }));

    if (state.blur > 0)
      filters.push(new fabric.Image.filters.Blur({ blur: state.blur / 100 }));

    fabricImage.filters = filters;
    fabricImage.applyFilters();
    canvas.renderAll();
  }

  function set(key, value, fabricImage, canvas) {
    state[key] = value;
    applyAll(fabricImage, canvas);
  }

  function resetAll(fabricImage, canvas) {
    state.brightness = 0;
    state.contrast   = 0;
    state.saturation = 0;
    state.blur       = 0;
    applyAll(fabricImage, canvas);
  }

  function getState() { return { ...state }; }

  return { set, resetAll, getState, applyAll };
})();
