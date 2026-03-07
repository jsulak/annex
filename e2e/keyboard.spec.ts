import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
  });

  test('Cmd+L focuses search input', async ({ page }) => {
    // Click somewhere else first to unfocus search
    await page.locator('#note-list').click();

    await page.keyboard.press('Meta+l');

    await expect(page.locator('#search-input')).toBeFocused();
  });

  test('/ focuses search input', async ({ page }) => {
    // Click note list to unfocus
    await page.locator('#note-list').click();

    await page.keyboard.press('/');

    await expect(page.locator('#search-input')).toBeFocused();
  });

  test('Cmd+S saves the current note', async ({ page }) => {
    // Open a note and type
    await page.locator('#note-list').getByText('202401151433 Second Note').click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

    await page.locator('.cm-content').click();
    await page.keyboard.type('cmd-s test');

    // Manually save
    await page.keyboard.press('Meta+s');

    await expect(page.getByText('Saved')).toBeVisible({ timeout: 5_000 });
  });

  test('Cmd+M cycles view modes', async ({ page }) => {
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    // Start in edit mode — Cmd+M → preview
    await page.keyboard.press('Meta+m');
    await expect(page.locator('.preview-content')).toBeVisible();
    await expect(page.locator('.cm-editor')).not.toBeVisible();

    // Cmd+M → split
    await page.keyboard.press('Meta+m');
    await expect(page.locator('.preview-content')).toBeVisible();
    await expect(page.locator('.cm-editor')).toBeVisible();

    // Cmd+M → back to edit
    await page.keyboard.press('Meta+m');
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(page.locator('.preview-content')).not.toBeVisible();
  });

  test('Cmd+[ and Cmd+] navigate back and forward', async ({ page }) => {
    // Visit first note
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-content')).toContainText('Sample Note', { timeout: 5_000 });

    // Visit second note
    await page.locator('#note-list').getByText('202401151433 Second Note').click();
    await expect(page.locator('.cm-content')).toContainText('xylophoneUnicorn42', { timeout: 5_000 });

    // Cmd+[ goes back
    await page.keyboard.press('Meta+[');
    await expect(page.locator('.cm-content')).toContainText('Sample Note', { timeout: 5_000 });

    // Cmd+] goes forward
    await page.keyboard.press('Meta+]');
    await expect(page.locator('.cm-content')).toContainText('xylophoneUnicorn42', { timeout: 5_000 });
  });

  test('Escape deselects note and focuses search', async ({ page }) => {
    // Select a note
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    // Click outside the editor to ensure we're not in CodeMirror
    await page.locator('#note-list').click();

    await page.keyboard.press('Escape');

    // Editor should disappear (no note selected)
    await expect(page.getByText('Select a note')).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('#search-input')).toBeFocused();
  });

  test('Cmd+Backspace deletes current note', async ({ page }) => {
    // Create a throwaway note
    await page.locator('button[title="New note"]').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
    await page.locator('.cm-content').click();
    await page.keyboard.type('Keyboard delete test');
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 10_000 });

    const notesBefore = await page.locator('#note-list > div').count();

    // Cmd+Backspace should trigger delete with confirm
    page.once('dialog', (dialog) => dialog.accept());
    await page.keyboard.press('Meta+Backspace');

    await expect(page.locator('#note-list > div')).toHaveCount(notesBefore - 1, { timeout: 5_000 });
  });
});
