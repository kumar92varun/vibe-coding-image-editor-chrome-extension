const { test, expect } = require('../fixtures');

test.describe('Crop', () => {
  test('activates crop mode: canvas class + status text + tool active class', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="crop"]');
    await expect(page.locator('#canvasArea')).toHaveClass(/crop-mode/);
    await expect(page.locator('#tool-crop')).toHaveClass(/active/);
    await expect(page.locator('#statusTool')).toHaveText('Crop');
  });

  test('Cancel button deactivates crop mode', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="crop"]');
    await page.click('#cancelCropBtn');
    await expect(page.locator('#canvasArea')).not.toHaveClass(/crop-mode/);
    await expect(page.locator('#tool-crop')).not.toHaveClass(/active/);
    await expect(page.locator('#statusTool')).toHaveText('No tool active');
  });

  test('clicking the crop button again toggles it off', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="crop"]');
    await page.click('[data-tool="crop"]');
    await expect(page.locator('#canvasArea')).not.toHaveClass(/crop-mode/);
  });

  test('Escape key cancels crop mode', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="crop"]');
    await page.keyboard.press('Escape');
    await expect(page.locator('#canvasArea')).not.toHaveClass(/crop-mode/);
    await expect(page.locator('#statusTool')).toHaveText('No tool active');
  });

  test('switching to another canvas tool deactivates crop', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="crop"]');
    await page.click('[data-tool="draw"]');
    await expect(page.locator('#canvasArea')).not.toHaveClass(/crop-mode/);
    await expect(page.locator('#canvasArea')).toHaveClass(/draw-mode/);
  });

  test('Apply Crop button produces a new image state and enables undo', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="crop"]');
    await page.click('#applyCropBtn');
    // crop deactivates itself after apply
    await expect(page.locator('#canvasArea')).not.toHaveClass(/crop-mode/);
    await expect(page.locator('#undoBtn')).not.toBeDisabled();
  });
});

test.describe('Rotate', () => {
  test('panel opens on button click', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="rotate"]');
    await expect(page.locator('#tool-rotate')).toHaveClass(/open/);
  });

  test('slider updates angle label', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="rotate"]');
    await page.fill('#rotateSlider', '45');
    await page.dispatchEvent('#rotateSlider', 'input');
    await expect(page.locator('#rotateAngleVal')).toHaveText('45°');
  });

  test('negative angle updates label', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="rotate"]');
    await page.fill('#rotateSlider', '-90');
    await page.dispatchEvent('#rotateSlider', 'input');
    await expect(page.locator('#rotateAngleVal')).toHaveText('-90°');
  });

  test('rotate change pushes to history', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="rotate"]');
    await page.fill('#rotateSlider', '30');
    await page.dispatchEvent('#rotateSlider', 'input');
    await page.dispatchEvent('#rotateSlider', 'change');
    await expect(page.locator('#undoBtn')).not.toBeDisabled();
  });
});

test.describe('Scale', () => {
  test('panel opens on button click', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="scale"]');
    await expect(page.locator('#tool-scale')).toHaveClass(/open/);
  });

  test('width and height inputs are pre-filled with image dimensions', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="scale"]');
    const w = await page.locator('#scaleWidthInput').inputValue();
    const h = await page.locator('#scaleHeightInput').inputValue();
    expect(parseInt(w)).toBeGreaterThan(0);
    expect(parseInt(h)).toBeGreaterThan(0);
  });

  test('aspect lock: typing width auto-calculates height', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="scale"]');
    // Ensure lock is on
    if (!await page.locator('#lockAspect').isChecked()) {
      await page.click('#lockAspect');
    }
    const origW = parseInt(await page.locator('#scaleWidthInput').inputValue());
    const origH = parseInt(await page.locator('#scaleHeightInput').inputValue());
    const ratio  = origW / origH;

    await page.fill('#scaleWidthInput', '600');
    await page.dispatchEvent('#scaleWidthInput', 'input');

    const newH = parseInt(await page.locator('#scaleHeightInput').inputValue());
    expect(Math.abs(newH - Math.round(600 / ratio))).toBeLessThanOrEqual(1);
  });

  test('aspect lock: typing height auto-calculates width', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="scale"]');
    if (!await page.locator('#lockAspect').isChecked()) {
      await page.click('#lockAspect');
    }
    const origW = parseInt(await page.locator('#scaleWidthInput').inputValue());
    const origH = parseInt(await page.locator('#scaleHeightInput').inputValue());
    const ratio  = origW / origH;

    await page.fill('#scaleHeightInput', '100');
    await page.dispatchEvent('#scaleHeightInput', 'input');

    const newW = parseInt(await page.locator('#scaleWidthInput').inputValue());
    expect(Math.abs(newW - Math.round(100 * ratio))).toBeLessThanOrEqual(1);
  });

  test('Apply Scale enables undo', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="scale"]');
    await page.fill('#scaleWidthInput', '200');
    await page.fill('#scaleHeightInput', '150');
    await page.click('#applyScaleBtn');
    await expect(page.locator('#undoBtn')).not.toBeDisabled();
  });
});

test.describe('Flip', () => {
  test('panel opens on button click', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await expect(page.locator('#tool-flip')).toHaveClass(/open/);
  });

  test('Flip Horizontal enables undo', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await page.click('#flipHBtn');
    await expect(page.locator('#undoBtn')).not.toBeDisabled();
  });

  test('Flip Vertical enables undo', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await page.click('#flipVBtn');
    await expect(page.locator('#undoBtn')).not.toBeDisabled();
  });

  test('flipping twice re-enables redo after undo', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await page.click('#flipHBtn');
    await page.click('#undoBtn');
    await expect(page.locator('#redoBtn')).not.toBeDisabled();
  });
});
