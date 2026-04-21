/* Text overlay tool: click canvas to place IText with optional background + padding */
const TextTool = (() => {
  let canvas;
  let active = false;
  let clickHandler = null;

  const defaults = {
    fontFamily:      'DM Mono',
    fontSize:        32,
    fill:            '#1c1917',
    fontWeight:      'normal',
    fontStyle:       'normal',
    bgEnabled:       false,
    backgroundColor: '#f5a623',
    bgPadding:       8,
  };

  function activate(c) {
    canvas = c;
    if (active) return;
    active = true;
    canvas.defaultCursor = 'text';
    canvas.selection = false;

    clickHandler = (opt) => {
      if (opt.target) return;
      const pointer = canvas.getPointer(opt.e);
      const text = new fabric.IText('Your text', {
        left:            pointer.x,
        top:             pointer.y,
        fontFamily:      defaults.fontFamily,
        fontSize:        defaults.fontSize,
        fill:            defaults.fill,
        fontWeight:      defaults.fontWeight,
        fontStyle:       defaults.fontStyle,
        backgroundColor: defaults.bgEnabled ? defaults.backgroundColor : '',
        padding:         defaults.bgEnabled ? defaults.bgPadding : 0,
        selectable:      true,
        evented:         true,
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      text.enterEditing();
      text.selectAll();
      canvas.renderAll();
    };
    canvas.on('mouse:down', clickHandler);
  }

  function deactivate() {
    if (!active) return;
    active = false;
    canvas.defaultCursor = 'default';
    canvas.selection = true;
    if (clickHandler) {
      canvas.off('mouse:down', clickHandler);
      clickHandler = null;
    }
  }

  function updateDefaults(key, value) {
    defaults[key] = value;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj || obj.type !== 'i-text') return;

    if (key === 'bgEnabled') {
      obj.set({
        backgroundColor: value ? defaults.backgroundColor : '',
        padding:         value ? defaults.bgPadding : 0,
      });
    } else if (key === 'backgroundColor') {
      if (defaults.bgEnabled) obj.set('backgroundColor', value);
    } else if (key === 'bgPadding') {
      if (defaults.bgEnabled) obj.set('padding', value);
    } else {
      obj.set(key, value);
    }
    canvas.renderAll();
  }

  function isActive() { return active; }

  return { activate, deactivate, updateDefaults, isActive };
})();
