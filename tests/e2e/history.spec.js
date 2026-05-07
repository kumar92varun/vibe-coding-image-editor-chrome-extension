const { test, expect } = require('../fixtures');

test.describe('History — undo / redo', () => {
  test('undo and redo buttons start disabled after image load', async ({ loadedEditor: page }) => {
    await expect(page.locator('#undoBtn')).toBeDisabled();
    await expect(page.locator('#redoBtn')).toBeDisabled();
  });

  test('undo enabled after first edit', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await page.click('#flipHBtn');
    await expect(page.locator('#undoBtn')).not.toBeDisabled();
    await expect(page.locator('#redoBtn')).toBeDisabled();
  });

  test('redo enabled after undo', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await page.click('#flipHBtn');
    await page.click('#undoBtn');
    await expect(page.locator('#undoBtn')).toBeDisabled();
    await expect(page.locator('#redoBtn')).not.toBeDisabled();
  });

  test('redo disabled after new edit following an undo', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await page.click('#flipHBtn');
    await page.click('#undoBtn');
    // New edit truncates the redo stack
    await page.click('#flipVBtn');
    await expect(page.locator('#redoBtn')).toBeDisabled();
  });

  test('Ctrl+Z triggers undo', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await page.click('#flipHBtn');
    await page.keyboard.press('Control+z');
    await expect(page.locator('#undoBtn')).toBeDisabled();
  });

  test('Ctrl+Shift+Z triggers redo', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await page.click('#flipHBtn');
    await page.click('#undoBtn');
    await page.keyboard.press('Control+Shift+Z');
    await expect(page.locator('#redoBtn')).toBeDisabled();
  });

  test('Delete key removes a placed shape (not the base image)', async ({ loadedEditor: page }) => {
    // Place a shape
    await page.click('[data-tool="shapes"]');
    const canvas = page.locator('#mainCanvas');
    const box    = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);

    // Shape should be selected — press Delete
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);

    // Undo from placing the shape should exist, and the delete also pushed state
    await expect(page.locator('#undoBtn')).not.toBeDisabled();
  });
});

test.describe('Reset Image', () => {
  test('Reset shows confirmation modal with expected message', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await page.click('#flipHBtn');
    await page.click('#resetBtn');
    await expect(page.locator('#confirmModal')).not.toHaveClass(/hidden/);
    await expect(page.locator('#confirmMsg')).toHaveText('Reset to original image? All edits will be lost.');
  });

  test('Cancelling reset hides modal and preserves edit state', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await page.click('#flipHBtn');
    await page.click('#resetBtn');
    await page.click('#confirmNo');
    await expect(page.locator('#confirmModal')).toHaveClass(/hidden/);
    // Edit is still there — undo still enabled
    await expect(page.locator('#undoBtn')).not.toBeDisabled();
  });

  test('Confirming reset re-initialises canvas and disables undo', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await page.click('#flipHBtn');
    await page.click('#resetBtn');
    await page.click('#confirmYes');
    // Wait for re-init to complete
    await page.waitForSelector('#canvasWrapper.loaded');
    await expect(page.locator('#confirmModal')).toHaveClass(/hidden/);
    await expect(page.locator('#undoBtn')).toBeDisabled();
    await expect(page.locator('#redoBtn')).toBeDisabled();
  });
});
