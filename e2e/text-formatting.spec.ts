import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Text formatting shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    // Open an existing seed note for formatting tests
    await page.locator('#note-list').getByText('202401151434').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
    // Clear and type test content
    await page.locator('.cm-content').click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('hello world');
  });

  test('Cmd+B wraps selection in bold markers', async ({ page }) => {
    // Select "world"
    await page.keyboard.press('Home');
    await page.keyboard.press('End');
    // Select "world" by shift+clicking
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');

    await page.keyboard.press('Meta+b');

    const text = await page.locator('.cm-content').textContent();
    expect(text).toContain('**world**');
  });

  test('Cmd+I wraps selection in italic markers', async ({ page }) => {
    await page.keyboard.press('Home');
    await page.keyboard.press('End');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');

    await page.keyboard.press('Meta+i');

    const text = await page.locator('.cm-content').textContent();
    expect(text).toContain('*world*');
    // Should NOT be bold (no double asterisks)
    expect(text).not.toContain('**world**');
  });

  test('Cmd+B with no selection inserts bold markers and positions cursor', async ({ page }) => {
    await page.keyboard.press('End');
    await page.keyboard.press('Meta+b');

    // Should have inserted **** with cursor between
    const text = await page.locator('.cm-content').textContent();
    expect(text).toContain('****');
  });

  test('Cmd+K inserts link template', async ({ page }) => {
    // Select "world"
    await page.keyboard.press('End');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');

    await page.keyboard.press('Meta+k');

    const text = await page.locator('.cm-content').textContent();
    expect(text).toContain('[world](url)');
  });
});
