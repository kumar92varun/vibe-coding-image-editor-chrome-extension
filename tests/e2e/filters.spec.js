const { test, expect } = require('../fixtures');

test.describe('Brightness', () => {
  test('panel opens on click', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="brightness"]');
    await expect(page.locator('#tool-brightness')).toHaveClass(/open/);
  });

  test('positive value updates label', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="brightness"]');
    await page.fill('#brightnessSlider', '60');
    await page.dispatchEvent('#brightnessSlider', 'input');
    await expect(page.locator('#brightnessVal')).toHaveText('60');
  });

  test('negative value updates label', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="brightness"]');
    await page.fill('#brightnessSlider', '-80');
    await page.dispatchEvent('#brightnessSlider', 'input');
    await expect(page.locator('#brightnessVal')).toHaveText('-80');
  });

  test('change event pushes to history', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="brightness"]');
    await page.fill('#brightnessSlider', '50');
    await page.dispatchEvent('#brightnessSlider', 'input');
    await page.dispatchEvent('#brightnessSlider', 'change');
    await expect(page.locator('#undoBtn')).not.toBeDisabled();
  });
});

test.describe('Contrast', () => {
  test('slider updates label', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="contrast"]');
    await page.fill('#contrastSlider', '40');
    await page.dispatchEvent('#contrastSlider', 'input');
    await expect(page.locator('#contrastVal')).toHaveText('40');
  });

  test('negative value updates label', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="contrast"]');
    await page.fill('#contrastSlider', '-40');
    await page.dispatchEvent('#contrastSlider', 'input');
    await expect(page.locator('#contrastVal')).toHaveText('-40');
  });
});

test.describe('Saturation', () => {
  test('slider updates label', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="saturation"]');
    await page.fill('#saturationSlider', '-50');
    await page.dispatchEvent('#saturationSlider', 'input');
    await expect(page.locator('#saturationVal')).toHaveText('-50');
  });

  test('max saturation value updates label', async ({ loadedEditor: page }) => {
    await page.click('[data-tool="saturation"]');
    await page.fill('#saturationSlider', '100');
    await page.dispatchEvent('#saturationSlider', 'input');
    await expect(page.locator('#saturationVal')).toHaveText('100');
  });
});
