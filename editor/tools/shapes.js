/* Shapes tool: click canvas to place Rectangle, Circle, Line, Arrow, Triangle, Star */
const ShapesTool = (() => {
  let canvas = null;
  let active = false;
  let clickHandler = null;

  const config = {
    shape:       'rect',
    fill:        '#f5a623',
    stroke:      '#1c1917',
    strokeWidth: 2,
    noFill:      false,
  };

  // Default sizes for each shape (width × height in canvas pixels)
  const DEFAULTS = {
    rect:     { w: 140, h: 90 },
    circle:   { w: 100, h: 100 },
    line:     { w: 150, h: 0 },
    arrow:    { w: 150, h: 50 },
    triangle: { w: 110, h: 90 },
    star:     { w: 100, h: 100 },
  };

  function activate(c) {
    canvas = c;
    active = true;
    canvas.defaultCursor = 'crosshair';
    canvas.selection = false;

    clickHandler = (opt) => {
      if (opt.target) return;
      const p = canvas.getPointer(opt.e);
      const shape = _build(p.x, p.y);
      if (!shape) return;
      canvas.add(shape);
      canvas.setActiveObject(shape);
      canvas.renderAll();
    };
    canvas.on('mouse:down', clickHandler);
  }

  function deactivate() {
    if (!canvas) return;
    active = false;
    canvas.defaultCursor = 'default';
    canvas.selection = true;
    if (clickHandler) {
      canvas.off('mouse:down', clickHandler);
      clickHandler = null;
    }
  }

  function _fill()   { return config.noFill ? 'transparent' : config.fill; }
  function _stroke() { return config.stroke; }
  function _sw()     { return config.strokeWidth; }

  function _build(cx, cy) {
    const d = DEFAULTS[config.shape];
    const halfW = d.w / 2;
    const halfH = d.h / 2;

    switch (config.shape) {

      case 'rect':
        return new fabric.Rect({
          left:        cx - halfW,
          top:         cy - halfH,
          width:       d.w,
          height:      d.h,
          fill:        _fill(),
          stroke:      _stroke(),
          strokeWidth: _sw(),
          strokeUniform: true,
        });

      case 'circle':
        return new fabric.Ellipse({
          left:        cx - halfW,
          top:         cy - halfH,
          rx:          d.w / 2,
          ry:          d.h / 2,
          fill:        _fill(),
          stroke:      _stroke(),
          strokeWidth: _sw(),
          strokeUniform: true,
        });

      case 'line':
        return new fabric.Line([cx - halfW, cy, cx + halfW, cy], {
          stroke:      config.noFill ? _stroke() : config.fill,
          strokeWidth: Math.max(_sw(), 2),
          strokeLineCap: 'round',
        });

      case 'arrow':
        return _buildArrow(cx, cy, d.w);

      case 'triangle':
        return new fabric.Triangle({
          left:        cx - halfW,
          top:         cy - halfH,
          width:       d.w,
          height:      d.h,
          fill:        _fill(),
          stroke:      _stroke(),
          strokeWidth: _sw(),
          strokeUniform: true,
        });

      case 'star':
        return _buildStar(cx, cy, 50, 22);
    }
    return null;
  }

  function _buildArrow(cx, cy, totalW) {
    const shaftH   = 14;
    const headW    = 40;
    const headH    = 40;
    const shaftLen = totalW - headW;

    // Centered on (0,0), pointing right
    const path = [
      `M 0 ${-shaftH / 2}`,
      `L ${shaftLen} ${-shaftH / 2}`,
      `L ${shaftLen} ${-headH / 2}`,
      `L ${totalW} 0`,
      `L ${shaftLen} ${headH / 2}`,
      `L ${shaftLen} ${shaftH / 2}`,
      `L 0 ${shaftH / 2}`,
      'Z',
    ].join(' ');

    return new fabric.Path(path, {
      left:        cx - totalW / 2,
      top:         cy - headH / 2,
      fill:        _fill(),
      stroke:      _stroke(),
      strokeWidth: _sw(),
      strokeUniform: true,
      strokeLineJoin: 'miter',
    });
  }

  function _buildStar(cx, cy, outerR, innerR) {
    const pts = [];
    const numPoints = 5;
    for (let i = 0; i < numPoints * 2; i++) {
      const angle = (i * Math.PI) / numPoints - Math.PI / 2;
      const r     = i % 2 === 0 ? outerR : innerR;
      pts.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
    }
    return new fabric.Polygon(pts, {
      left:        cx - outerR,
      top:         cy - outerR,
      fill:        _fill(),
      stroke:      _stroke(),
      strokeWidth: _sw(),
      strokeUniform: true,
    });
  }

  function setConfig(key, value) {
    config[key] = value;
  }

  function isActive() { return active; }

  return { activate, deactivate, setConfig, isActive };
})();
