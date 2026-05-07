/* Text overlay tool: click canvas to place IText with padded background */
const TextTool = (() => {
  let canvas;
  let active = false;
  let clickHandler = null;

  const defaults = {
    fontSize:        32,
    fill:            '#1c1917',
    fontWeight:      'normal',
    fontStyle:       'normal',
    bgEnabled:       false,
    backgroundColor: '#f5a623',
    bgPadding:       8,
  };

  function activate(c, onPlaced) {
    canvas = c;
    if (active) return;
    active = true;
    canvas.defaultCursor = 'text';
    canvas.selection = false;

    clickHandler = (opt) => {
      if (opt.target) return;
      const pointer = canvas.getPointer(opt.e);
      const text = new fabric.IText('Your text', {
        left:       pointer.x,
        top:        pointer.y,
        fontSize:   defaults.fontSize,
        fill:       defaults.fill,
        fontWeight: defaults.fontWeight,
        fontStyle:  defaults.fontStyle,
        // padding = bgPadding so Fabric's cache canvas is large enough to show the bg rect
        padding:    defaults.bgEnabled ? defaults.bgPadding : 0,
        selectable: true,
        evented:    true,
      });

      // Store bg state directly on the object so the renderer can read it
      text.customBgEnabled  = defaults.bgEnabled;
      text.customBgColor    = defaults.backgroundColor;
      text.customBgPadding  = defaults.bgPadding;
      _applyBgRenderer(text);

      canvas.add(text);
      canvas.setActiveObject(text);
      text.enterEditing();
      text.selectAll();
      canvas.renderAll();

      deactivate();
      if (onPlaced) onPlaced();
    };

    canvas.on('mouse:down', clickHandler);
  }

  // Override _renderBackground on the object to draw a padded colour rect behind the text
  function _applyBgRenderer(obj) {
    obj._renderBackground = function(ctx) {
      if (!this.customBgEnabled) return;
      const pad = this.customBgPadding || 0;
      ctx.fillStyle = this.customBgColor || 'transparent';
      ctx.fillRect(
        -this.width  / 2 - pad,
        -this.height / 2 - pad,
         this.width  + pad * 2,
         this.height + pad * 2
      );
    };
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
      obj.customBgEnabled = value;
      // Sync Fabric padding so cache stays large enough
      obj.set('padding', value ? (obj.customBgPadding || defaults.bgPadding) : 0);
    } else if (key === 'backgroundColor') {
      obj.customBgColor = value;
    } else if (key === 'bgPadding') {
      obj.customBgPadding = value;
      if (obj.customBgEnabled) obj.set('padding', value);
    } else {
      obj.set(key, value);
    }

    obj.dirty = true;
    obj.setCoords();
    canvas.renderAll();
  }

  function isActive() { return active; }

  return { activate, deactivate, updateDefaults, isActive };
})();
