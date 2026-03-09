import { test, expect } from '@playwright/test';

test.describe('Preview title from filename', () => {
  test('preview shows formatted title from filename', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // The seed note filename is "202401151432 Sample Note.md"
    // Expected title: "Sample note" (sentence case, timestamp stripped)
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: 'Preview' }).click();
    const preview = page.locator('.preview-content');
    await expect(preview).toBeVisible();

    // The formatted title should appear
    const titleEl = preview.locator('.preview-title');
    await expect(titleEl).toBeVisible();
    await expect(titleEl).toHaveText('Sample note');
  });
});
