const { test, expect } = require('../fixtures');

test.describe('Text tool', () => {
  test('activates text mode: tool class + status', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="text"]');
    await expect(page.locator('#tool-text')).toHaveClass(/active/);
    await expect(page.locator('#statusTool')).toHaveText('Text');
  });

  test('Escape deactivates text tool', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="text"]');
    await page.keyboard.press('Escape');
    await expect(page.locator('#tool-text')).not.toHaveClass(/active/);
    await expect(page.locator('#statusTool')).toHaveText('No tool active');
  });

  test('switching to draw tool deactivates text', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="text"]');
    await page.click('[data-tool="draw"]');
    await expect(page.locator('#tool-text')).not.toHaveClass(/active/);
    await expect(page.locator('#tool-draw')).toHaveClass(/active/);
  });

  test('Bold toggle adds/removes active class', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="text"]');
    await page.click('#textBold');
    await expect(page.locator('#textBold')).toHaveClass(/active/);
    await page.click('#textBold');
    await expect(page.locator('#textBold')).not.toHaveClass(/active/);
  });

  test('Italic toggle adds/removes active class', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="text"]');
    await page.click('#textItalic');
    await expect(page.locator('#textItalic')).toHaveClass(/active/);
    await page.click('#textItalic');
    await expect(page.locator('#textItalic')).not.toHaveClass(/active/);
  });

  test('text size input is editable', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="text"]');
    await page.fill('#textSize', '48');
    await expect(page.locator('#textSize')).toHaveValue('48');
  });

  test('background enable toggle works', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="text"]');
    // Checkbox is display:none — click the visible .toggle-track span to toggle it
    await page.locator('#textBgEnabled ~ .toggle-track').click();
    await expect(page.locator('#textBgEnabled')).toBeChecked();
    await page.locator('#textBgEnabled ~ .toggle-track').click();
    await expect(page.locator('#textBgEnabled')).not.toBeChecked();
  });
});

test.describe('Draw tool', () => {
  test('activates draw mode: canvas class + status', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="draw"]');
    await expect(page.locator('#canvasArea')).toHaveClass(/draw-mode/);
    await expect(page.locator('#tool-draw')).toHaveClass(/active/);
    await expect(page.locator('#statusTool')).toHaveText('Draw');
  });

  test('clicking draw button again deactivates it', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="draw"]');
    await page.click('[data-tool="draw"]');
    await expect(page.locator('#canvasArea')).not.toHaveClass(/draw-mode/);
  });

  test('brush size slider updates label', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="draw"]');
    await page.fill('#brushSizeSlider', '25');
    await page.dispatchEvent('#brushSizeSlider', 'input');
    await expect(page.locator('#brushSizeVal')).toHaveText('25px');
  });

  test('freehand stroke creates a canvas path and enables undo', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="draw"]');
    const canvas = page.locator('#mainCanvas');
    const box    = await canvas.boundingBox();
    // Drag across the canvas to draw a stroke
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 80, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(page.locator('#undoBtn')).not.toBeDisabled();
  });
});

test.describe('Shapes tool', () => {
  test('activates shapes mode: canvas class + status', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="shapes"]');
    await expect(page.locator('#canvasArea')).toHaveClass(/shapes-mode/);
    await expect(page.locator('#statusTool')).toHaveText('Shapes');
  });

  test('shape selector buttons toggle active class', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="shapes"]');
    await page.click('[data-shape="circle"]');
    await expect(page.locator('[data-shape="circle"]')).toHaveClass(/active/);
    await expect(page.locator('[data-shape="rect"]')).not.toHaveClass(/active/);
  });

  test('stroke width slider updates label', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="shapes"]');
    await page.fill('#shapeStrokeWidthSlider', '8');
    await page.dispatchEvent('#shapeStrokeWidthSlider', 'input');
    await expect(page.locator('#shapeStrokeWidthVal')).toHaveText('8px');
  });

  test('transparent fill checkbox toggles', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="shapes"]');
    // Checkbox is display:none — click the visible .toggle-track span to toggle it
    await page.locator('#shapeNoFill ~ .toggle-track').click();
    await expect(page.locator('#shapeNoFill')).toBeChecked();
  });

  test('clicking canvas in shapes mode places a shape and enables undo', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="shapes"]');
    const canvas = page.locator('#mainCanvas');
    const box    = await canvas.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // Place shape at canvas centre
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(200);
    // canvas.add() doesn't trigger object:modified, so drag the placed shape to push history
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy + 30, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(page.locator('#undoBtn')).not.toBeDisabled();
  });
});

test.describe('Blur Brush tool', () => {
  test('activates blur mode: canvas class + status', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="blur"]');
    await expect(page.locator('#canvasArea')).toHaveClass(/blur-mode/);
    await expect(page.locator('#tool-blur')).toHaveClass(/active/);
    await expect(page.locator('#statusTool')).toHaveText('Blur');
  });

  test('brush size slider updates label', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="blur"]');
    await page.fill('#blurBrushSizeSlider', '60');
    await page.dispatchEvent('#blurBrushSizeSlider', 'input');
    await expect(page.locator('#blurBrushSizeVal')).toHaveText('60px');
  });

  test('strength slider updates label', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="blur"]');
    await page.fill('#blurStrengthSlider', '20');
    await page.dispatchEvent('#blurStrengthSlider', 'input');
    await expect(page.locator('#blurStrengthVal')).toHaveText('20px');
  });

  test('Escape deactivates blur tool', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="blur"]');
    await page.keyboard.press('Escape');
    await expect(page.locator('#canvasArea')).not.toHaveClass(/blur-mode/);
    await expect(page.locator('#tool-blur')).not.toHaveClass(/active/);
  });
});
