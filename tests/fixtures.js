const { test: base, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../localpixel');

const test = base.extend({
  // One Chrome instance per worker file — shared across all tests in the same spec
  extensionContext: [async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-localpixel-'));
    const ctx = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // Chrome extensions require a display; use `xvfb-run npm test` in headless CI
      args: [
        '--no-sandbox',
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(ctx);
    await ctx.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }, { scope: 'worker' }],

  extensionId: [async ({ extensionContext }, use) => {
    let [bg] = extensionContext.serviceWorkers();
    if (!bg) bg = await extensionContext.waitForEvent('serviceworker');
    const extensionId = bg.url().split('/')[2];
    await use(extensionId);
  }, { scope: 'worker' }],

  // Fresh editor tab at the dropzone screen — created per test
  editorPage: async ({ extensionContext, extensionId }, use) => {
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/editor/index.html`);
    await page.waitForSelector('#dropzone:not(.hidden)');
    await use(page);
    await page.close();
  },

  // Editor tab with a test image already loaded onto the canvas
  loadedEditor: async ({ editorPage }, use) => {
    await loadTestImage(editorPage);
    await use(editorPage);
  },
});

async function loadTestImage(page) {
  // Generate a 300×200 test image entirely inside the browser — no fixture file needed
  const base64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 200;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#4a90e2';
    ctx.fillRect(0, 0, 300, 200);
    ctx.fillStyle = '#e24a4a';
    ctx.fillRect(75, 50, 150, 100);
    return c.toDataURL('image/png').split(',')[1];
  });

  await page.setInputFiles('#fileInput', {
    name: 'test.png',
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  });

  await page.waitForSelector('#editorShell:not(.hidden)');
  // #canvasWrapper.loaded is added inside fabric.Image.fromURL callback — confirms canvas is ready
  await page.waitForSelector('#canvasWrapper.loaded');
}

module.exports = { test, expect: base.expect, loadTestImage };
