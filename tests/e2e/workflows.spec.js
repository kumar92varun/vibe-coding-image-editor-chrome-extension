/**
 * Workflow tests — chained tool use and download after multiple edits.
 *
 * These complement the unit-level spec files by exercising realistic sequences
 * a user would actually perform: switch between several tools, build up an edit
 * history, partially undo, then export in different formats.
 */
const { test, expect } = require('../fixtures');

// ─── helpers ────────────────────────────────────────────────────────────────

async function canvasBounds(page) {
  return page.locator('#mainCanvas').boundingBox();
}

async function drawStroke(page, box) {
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 90, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

// Ensure the flip panel is open before clicking — the tool button is a toggle, so calling
// it when the panel is already open would close it instead.
async function applyFlip(page) {
  const isOpen = await page.locator('#tool-flip').evaluate(el => el.classList.contains('open'));
  if (!isOpen) await page.click('[data-tool="flip"]');
  await page.click('#flipHBtn');
}

// Use page.evaluate to set the slider value directly — Playwright's fill() dispatches
// both 'input' and 'change' on range inputs, which would push history twice.
async function applyRotate(page, angle) {
  await page.click('[data-tool="rotate"]');
  await page.evaluate(v => { document.getElementById('rotateSlider').value = v; }, angle);
  await page.dispatchEvent('#rotateSlider', 'input');
  await page.dispatchEvent('#rotateSlider', 'change');
  await page.waitForTimeout(100);
}

async function applyBrightness(page, value) {
  await page.click('[data-tool="brightness"]');
  await page.evaluate(v => { document.getElementById('brightnessSlider').value = v; }, value);
  await page.dispatchEvent('#brightnessSlider', 'input');
  await page.dispatchEvent('#brightnessSlider', 'change');
  await page.waitForTimeout(100);
}

// Click undo and wait for fabric's loadFromJSON callback to complete.
// The callback fires _notify() which updates button disabled states synchronously —
// so waiting for the button state is a reliable proxy for "canvas fully reloaded".
async function clickUndo(page, { lastUndo = false } = {}) {
  await page.click('#undoBtn');
  if (lastUndo) {
    await expect(page.locator('#undoBtn')).toBeDisabled({ timeout: 8000 });
  } else {
    await expect(page.locator('#undoBtn')).not.toBeDisabled({ timeout: 8000 });
  }
}

async function clickRedo(page, { lastRedo = false } = {}) {
  await page.click('#redoBtn');
  if (lastRedo) {
    await expect(page.locator('#redoBtn')).toBeDisabled({ timeout: 8000 });
  } else {
    await expect(page.locator('#redoBtn')).not.toBeDisabled({ timeout: 8000 });
  }
}

// ─── Tool switching ──────────────────────────────────────────────────────────

test.describe('Tool switching', () => {
  test('canvas tools are mutually exclusive — switching deactivates the previous one', async ({ loadedEditor: page }) => {
    // Crop on
    await page.click('[data-tool="crop"]');
    await expect(page.locator('#canvasArea')).toHaveClass(/crop-mode/);

    // Switch to draw — crop must be gone
    await page.click('[data-tool="draw"]');
    await expect(page.locator('#canvasArea')).not.toHaveClass(/crop-mode/);
    await expect(page.locator('#canvasArea')).toHaveClass(/draw-mode/);
    await expect(page.locator('#statusTool')).toHaveText('Draw');

    // Switch to shapes — draw must be gone
    await page.click('[data-tool="shapes"]');
    await expect(page.locator('#canvasArea')).not.toHaveClass(/draw-mode/);
    await expect(page.locator('#canvasArea')).toHaveClass(/shapes-mode/);
    await expect(page.locator('#statusTool')).toHaveText('Shapes');

    // Switch to blur — shapes must be gone
    await page.click('[data-tool="blur"]');
    await expect(page.locator('#canvasArea')).not.toHaveClass(/shapes-mode/);
    await expect(page.locator('#canvasArea')).toHaveClass(/blur-mode/);
    await expect(page.locator('#statusTool')).toHaveText('Blur');

    // Switch back to crop
    await page.click('[data-tool="crop"]');
    await expect(page.locator('#canvasArea')).not.toHaveClass(/blur-mode/);
    await expect(page.locator('#canvasArea')).toHaveClass(/crop-mode/);
    await expect(page.locator('#statusTool')).toHaveText('Crop');
  });

  test('Escape resets status to "No tool active" from any canvas tool', async ({ loadedEditor: page }) => {
    for (const tool of ['draw', 'shapes', 'blur', 'crop']) {
      await page.click(`[data-tool="${tool}"]`);
      await page.keyboard.press('Escape');
      await expect(page.locator('#statusTool')).toHaveText('No tool active');
    }
  });

  test('text tool auto-deactivates after clicking canvas to place text', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="text"]');
    await expect(page.locator('#statusTool')).toHaveText('Text');

    const box = await canvasBounds(page);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);

    // Text tool deactivates itself after placement — status goes back to default
    await expect(page.locator('#tool-text')).not.toHaveClass(/active/);
    await expect(page.locator('#statusTool')).toHaveText('No tool active');
  });

  test('switching from text to draw to shapes and back leaves a clean state', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="text"]');
    await page.click('[data-tool="draw"]');
    await expect(page.locator('#canvasArea')).toHaveClass(/draw-mode/);

    await page.click('[data-tool="shapes"]');
    await expect(page.locator('#canvasArea')).not.toHaveClass(/draw-mode/);
    await expect(page.locator('#canvasArea')).toHaveClass(/shapes-mode/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#canvasArea')).not.toHaveClass(/shapes-mode/);
    await expect(page.locator('#statusTool')).toHaveText('No tool active');
    // No lingering active-tool classes on any tool button
    for (const t of ['draw', 'shapes', 'blur', 'crop', 'text']) {
      await expect(page.locator(`#tool-${t}`)).not.toHaveClass(/active/);
    }
  });
});

// ─── Multi-edit undo / redo depth ───────────────────────────────────────────

test.describe('Multi-edit history', () => {
  test('four sequential edits each push a distinct undo state', async ({ loadedEditor: page }) => {
    const box = await canvasBounds(page);

    await applyFlip(page);
    await applyRotate(page, 45);
    await applyBrightness(page, 60);

    await page.click('[data-tool="draw"]');
    await drawStroke(page, box);
    await page.keyboard.press('Escape');

    // Undo 3 intermediate steps, waiting for each canvas reload before the next click
    await clickUndo(page);           // pointer 4→3, still undoable
    await clickUndo(page);           // pointer 3→2, still undoable
    await clickUndo(page);           // pointer 2→1, still undoable
    await clickUndo(page, { lastUndo: true }); // pointer 1→0, now disabled

    await expect(page.locator('#redoBtn')).not.toBeDisabled();
  });

  test('redo restores the full edit sequence after undoing everything', async ({ loadedEditor: page }) => {
    await applyFlip(page);
    await applyRotate(page, 30);
    await applyBrightness(page, 40);

    await clickUndo(page);           // pointer 3→2
    await clickUndo(page);           // pointer 2→1
    await clickUndo(page, { lastUndo: true }); // pointer 1→0

    await clickRedo(page);           // pointer 0→1
    await clickRedo(page);           // pointer 1→2
    await clickRedo(page, { lastRedo: true }); // pointer 2→3

    await expect(page.locator('#undoBtn')).not.toBeDisabled();
  });

  test('making a new edit after partial undo discards the redo stack', async ({ loadedEditor: page }) => {
    await applyFlip(page);
    await applyRotate(page, 20);
    await applyBrightness(page, 50);

    // Undo twice — redo stack now has 2 entries
    await clickUndo(page);           // pointer 3→2
    await clickUndo(page);           // pointer 2→1
    await expect(page.locator('#redoBtn')).not.toBeDisabled();

    // New edit — redo stack must be cleared
    await applyFlip(page);
    await expect(page.locator('#redoBtn')).toBeDisabled();
  });

  test('crop + draw + shape together push independent history states', async ({ loadedEditor: page }) => {
    // Edit 1: Apply crop — history push is inside fabric.Image.fromURL callback (async).
    // Wait for undoBtn to become enabled as the signal that the async push completed.
    await page.click('[data-tool="crop"]');
    await page.click('#applyCropBtn');
    await expect(page.locator('#undoBtn')).not.toBeDisabled({ timeout: 8000 });

    // Edit 2: Draw stroke — recalculate bounds because crop changes canvas dimensions
    const box = await canvasBounds(page);
    await page.click('[data-tool="draw"]');
    await drawStroke(page, box);
    await page.keyboard.press('Escape');

    // Edit 3: Place and drag a shape (drag triggers object:modified → history push)
    await page.click('[data-tool="shapes"]');
    const box2 = await canvasBounds(page);
    const cx = box2.x + box2.width / 2;
    const cy = box2.y + box2.height / 2;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(200);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy + 30, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    await clickUndo(page);           // shape drag
    await clickUndo(page);           // draw stroke
    await clickUndo(page, { lastUndo: true }); // crop
  });
});

// ─── Download after multi-edit ───────────────────────────────────────────────

test.describe('Download after multi-edit', () => {
  test('download PNG after flip + rotate + scale', async ({ loadedEditor: page }) => {
    await applyFlip(page);
    await applyRotate(page, 15);

    await page.click('[data-tool="scale"]');
    await page.fill('#scaleWidthInput', '250');
    await page.fill('#scaleHeightInput', '150');
    await page.click('#applyScaleBtn');
    await page.waitForTimeout(150);

    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#downloadBtn'),
    ]);
    expect(dl.suggestedFilename()).toBe('localpixel-test.png');
  });

  test('download JPG after brightness + contrast + draw stroke', async ({ loadedEditor: page }) => {
    await applyBrightness(page, 30);

    await page.click('[data-tool="contrast"]');
    await page.fill('#contrastSlider', '-20');
    await page.dispatchEvent('#contrastSlider', 'input');
    await page.dispatchEvent('#contrastSlider', 'change');
    await page.waitForTimeout(100);

    const box = await canvasBounds(page);
    await page.click('[data-tool="draw"]');
    await drawStroke(page, box);
    await page.keyboard.press('Escape');

    await page.selectOption('#formatSelect', 'jpeg');
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#downloadBtn'),
    ]);
    expect(dl.suggestedFilename()).toBe('localpixel-test.jpg');
  });

  test('download WebP after placing a shape and text annotation', async ({ loadedEditor: page }) => {
    const box = await canvasBounds(page);

    // Place a shape
    await page.click('[data-tool="shapes"]');
    await page.mouse.click(box.x + box.width / 3, box.y + box.height / 3);
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');

    // Place text — text tool auto-deactivates after canvas click
    await page.click('[data-tool="text"]');
    await page.mouse.click(box.x + box.width * 2 / 3, box.y + box.height * 2 / 3);
    await page.waitForTimeout(200);
    // Exit text editing mode before export
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    await page.selectOption('#formatSelect', 'webp');
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#downloadBtn'),
    ]);
    expect(dl.suggestedFilename()).toBe('localpixel-test.webp');
  });

  test('download from a partially-undone state exports the in-between canvas', async ({ loadedEditor: page }) => {
    await applyFlip(page);           // first flip
    await applyRotate(page, 10);     // rotate (avoids the toggle-panel problem of calling applyFlip twice)
    await applyBrightness(page, 70);

    // Undo the brightness, waiting for canvas reload before download
    await clickUndo(page);  // pointer 3→2, still undoable (flip + rotate remain)

    await expect(page.locator('#undoBtn')).not.toBeDisabled();   // flip + rotate remain
    await expect(page.locator('#redoBtn')).not.toBeDisabled();   // brightness is redoable

    // Download should still succeed from this intermediate state
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#downloadBtn'),
    ]);
    expect(dl.suggestedFilename()).toBe('localpixel-test.png');
  });

  test('download after full reset exports original (undo/redo both disabled)', async ({ loadedEditor: page }) => {
    await applyFlip(page);
    await applyBrightness(page, 50);

    await page.click('#resetBtn');
    await page.click('#confirmYes');
    await page.waitForSelector('#canvasWrapper.loaded');

    await expect(page.locator('#undoBtn')).toBeDisabled();
    await expect(page.locator('#redoBtn')).toBeDisabled();

    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#downloadBtn'),
    ]);
    expect(dl.suggestedFilename()).toBe('localpixel-test.png');
  });

  test('same session: export PNG then switch to JPG and export again', async ({ loadedEditor: page }) => {
    const box = await canvasBounds(page);

    await page.click('[data-tool="draw"]');
    await drawStroke(page, box);
    await page.keyboard.press('Escape');

    // First export: PNG
    const [dl1] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#downloadBtn'),
    ]);
    expect(dl1.suggestedFilename()).toMatch(/\.png$/);

    // Second export: JPG — switch format and download again without reloading
    await page.selectOption('#formatSelect', 'jpeg');
    const [dl2] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#downloadBtn'),
    ]);
    expect(dl2.suggestedFilename()).toMatch(/\.jpg$/);

    // Both downloads completed — canvas is still intact
    await expect(page.locator('#editorShell')).not.toHaveClass(/hidden/);
  });
});
