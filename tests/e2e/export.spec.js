const { test, expect } = require('../fixtures');

test.describe('Format selector', () => {
  test('quality slider hidden for PNG (default)', async ({ loadedEditor: page }) => {
    await expect(page.locator('#formatSelect')).toHaveValue('png');
    const display = await page.locator('#qualityWrapper').evaluate(el => el.style.display);
    expect(display).toBe('none');
  });

  test('quality slider appears when JPG selected', async ({ loadedEditor: page }) => {
    await page.selectOption('#formatSelect', 'jpeg');
    await expect(page.locator('#qualityWrapper')).toBeVisible();
  });

  test('quality slider appears when WebP selected', async ({ loadedEditor: page }) => {
    await page.selectOption('#formatSelect', 'webp');
    await expect(page.locator('#qualityWrapper')).toBeVisible();
  });

  test('quality slider hidden again after switching back to PNG', async ({ loadedEditor: page }) => {
    await page.selectOption('#formatSelect', 'jpeg');
    await page.selectOption('#formatSelect', 'png');
    const display = await page.locator('#qualityWrapper').evaluate(el => el.style.display);
    expect(display).toBe('none');
  });

  test('quality slider value reflects in the label', async ({ loadedEditor: page }) => {
    await page.selectOption('#formatSelect', 'jpeg');
    await page.fill('#qualitySlider', '70');
    await page.dispatchEvent('#qualitySlider', 'input');
    await expect(page.locator('#qualityVal')).toHaveText('70');
  });
});

test.describe('Download', () => {
  test('downloads PNG with correct filename pattern', async ({ loadedEditor: page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#downloadBtn'),
    ]);
    expect(download.suggestedFilename()).toMatch(/^localpixel-test\.png$/);
  });

  test('downloads JPG with correct filename pattern', async ({ loadedEditor: page }) => {
    await page.selectOption('#formatSelect', 'jpeg');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#downloadBtn'),
    ]);
    expect(download.suggestedFilename()).toMatch(/^localpixel-test\.jpg$/);
  });

  test('downloads WebP with correct filename pattern', async ({ loadedEditor: page }) => {
    await page.selectOption('#formatSelect', 'webp');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#downloadBtn'),
    ]);
    expect(download.suggestedFilename()).toMatch(/^localpixel-test\.webp$/);
  });
});

test.describe('Load New Image', () => {
  test('Load New with no changes goes straight to dropzone', async ({ loadedEditor: page }) => {
    await page.click('#loadNewBtn');
    await expect(page.locator('#dropzone')).not.toHaveClass(/hidden/);
    await expect(page.locator('#editorShell')).toHaveClass(/hidden/);
  });

  test('Load New with unsaved changes shows confirmation modal', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await page.click('#flipHBtn');
    await page.click('#loadNewBtn');
    await expect(page.locator('#confirmModal')).not.toHaveClass(/hidden/);
    await expect(page.locator('#confirmMsg')).toHaveText('Load a new image? Unsaved changes will be lost.');
  });

  test('Cancelling Load New keeps the editor open', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await page.click('#flipHBtn');
    await page.click('#loadNewBtn');
    await page.click('#confirmNo');
    await expect(page.locator('#editorShell')).not.toHaveClass(/hidden/);
    await expect(page.locator('#confirmModal')).toHaveClass(/hidden/);
  });

  test('Confirming Load New returns to dropzone', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="flip"]');
    await page.click('#flipHBtn');
    await page.click('#loadNewBtn');
    await page.click('#confirmYes');
    await expect(page.locator('#dropzone')).not.toHaveClass(/hidden/);
    await expect(page.locator('#editorShell')).toHaveClass(/hidden/);
  });
});
