import { test, expect } from './fixtures';
import os from 'os';

// CodeMirror's Mod maps to Meta on Mac, Control on Linux/Windows
const mod = os.platform() === 'darwin' ? 'Meta' : 'Control';

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
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.type('hello world');
  });

  test('Cmd+B wraps selection in bold markers', async ({ page }) => {
    // Select "world"
    await page.keyboard.press('Home');
    await page.keyboard.press('End');
    // Select "world" by shift+clicking
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');

    await page.keyboard.press(`${mod}+b`);

    const text = await page.locator('.cm-content').textContent();
    expect(text).toContain('**world**');
  });

  test('Cmd+I wraps selection in italic markers', async ({ page }) => {
    await page.keyboard.press('Home');
    await page.keyboard.press('End');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');

    await page.keyboard.press(`${mod}+i`);

    const text = await page.locator('.cm-content').textContent();
    expect(text).toContain('*world*');
    // Should NOT be bold (no double asterisks)
    expect(text).not.toContain('**world**');
  });

  test('Cmd+B with no selection inserts bold markers and positions cursor', async ({ page }) => {
    await page.keyboard.press('End');
    await page.keyboard.press(`${mod}+b`);

    // Should have inserted **** with cursor between
    const text = await page.locator('.cm-content').textContent();
    expect(text).toContain('****');
  });

  test('Cmd+K inserts link template', async ({ page }) => {
    // Select "world"
    await page.keyboard.press('End');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');

    await page.keyboard.press(`${mod}+k`);

    const text = await page.locator('.cm-content').textContent();
    expect(text).toContain('[world](url)');
  });

  // --- Toggle (unwrap) tests ---

  test('Cmd+B toggles off bold when cursor is inside bold markers', async ({ page }) => {
    // Type bold text directly
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.type('hello **world** end');
    // Place cursor inside "world": go to end, arrow left past " end" (4) + "**" (2) + "d" (1) = 7
    await page.keyboard.press('End');
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowLeft');
    // Cursor should be inside "world" now. Press Cmd+B to toggle off
    await page.keyboard.press(`${mod}+b`);

    const text = await page.locator('.cm-content').textContent();
    expect(text).toBe('hello world end');
  });

  test('Cmd+B toggles off bold when bold text is selected', async ({ page }) => {
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.type('hello **world** end');
    // Select "world" (inside the markers): End, left 6 (past " end" + "**"), then shift+left 5
    await page.keyboard.press('End');
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');

    await page.keyboard.press(`${mod}+b`);

    const text = await page.locator('.cm-content').textContent();
    expect(text).toBe('hello world end');
  });

  test('Cmd+I toggles off italic when cursor is inside italic markers', async ({ page }) => {
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.type('hello *world* end');
    // Place cursor inside "world": end, left past " end" (4) + "*" (1) + "d" (1) = 6
    await page.keyboard.press('End');
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');

    await page.keyboard.press(`${mod}+i`);

    const text = await page.locator('.cm-content').textContent();
    expect(text).toBe('hello world end');
  });

  test('Cmd+I does not toggle bold markers when checking italic', async ({ page }) => {
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.type('hello **bold** end');
    // Place cursor inside "bold": end, left past " end" (4) + "**" (2) + "d" (1) = 7
    await page.keyboard.press('End');
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowLeft');

    await page.keyboard.press(`${mod}+i`);

    // Should add italic markers inside the bold, NOT remove bold
    const text = await page.locator('.cm-content').textContent();
    expect(text).toContain('**');
  });

  test('Cmd+U toggles off underline when cursor is inside underline markers', async ({ page }) => {
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.type('hello <u>world</u> end');
    // Place cursor inside "world": end, left past " end" (4) + "</u>" (4) + "d" (1) = 9
    await page.keyboard.press('End');
    for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowLeft');

    await page.keyboard.press(`${mod}+u`);

    const text = await page.locator('.cm-content').textContent();
    expect(text).toBe('hello world end');
  });

  test('Cmd+K toggles off link when cursor is inside link text', async ({ page }) => {
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.type('hello [world](http://example.com) end');
    // Place cursor inside "world": end, left past " end" (4) + "](http://example.com)" (21) + "d" (1) = 26
    await page.keyboard.press('End');
    for (let i = 0; i < 26; i++) await page.keyboard.press('ArrowLeft');

    await page.keyboard.press(`${mod}+k`);

    const text = await page.locator('.cm-content').textContent();
    expect(text).toBe('hello world end');
  });
});
