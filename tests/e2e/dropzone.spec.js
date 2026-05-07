const { test, expect, loadTestImage } = require('../fixtures');

test.describe('Dropzone', () => {
  test('shows dropzone and hides editor shell on load', async ({ editorPage: page }) => {
    await expect(page.locator('#dropzone')).not.toHaveClass(/hidden/);
    await expect(page.locator('#editorShell')).toHaveClass(/hidden/);
  });

  test('loads image via file input and shows editor', async ({ editorPage: page }) => {
    await loadTestImage(page);
    await expect(page.locator('#editorShell')).not.toHaveClass(/hidden/);
    await expect(page.locator('#dropzone')).toHaveClass(/hidden/);
  });

  test('filename is displayed in the header', async ({ loadedEditor: page }) => {
    await expect(page.locator('#filenameDisplay')).toHaveText('test.png');
  });

  test('status bar shows image dimensions after load', async ({ loadedEditor: page }) => {
    const text = await page.locator('#statusDimensions').textContent();
    expect(text).toMatch(/\d+ × \d+px/);
  });

  test('non-image file dropped is ignored — dropzone stays visible', async ({ editorPage: page }) => {
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['hello'], 'document.txt', { type: 'text/plain' }));
      const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
      document.querySelector('.dropzone-inner').dispatchEvent(ev);
    });
    await expect(page.locator('#editorShell')).toHaveClass(/hidden/);
  });
});
