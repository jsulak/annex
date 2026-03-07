import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Preview mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
  });

  test('starts in edit mode with editor visible', async ({ page }) => {
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(page.locator('.preview-content')).not.toBeVisible();

    // Edit button should appear active (selected background)
    const editBtn = page.getByRole('button', { name: 'Edit' });
    await expect(editBtn).toBeVisible();
  });

  test('clicking Preview shows rendered markdown', async ({ page }) => {
    await page.getByRole('button', { name: 'Preview' }).click();

    // Editor should be hidden, preview visible
    await expect(page.locator('.cm-editor')).not.toBeVisible();
    const preview = page.locator('.preview-content');
    await expect(preview).toBeVisible();

    // Rendered content should have the heading
    await expect(preview.locator('h1')).toContainText('Sample Note');
  });

  test('clicking Split shows both editor and preview', async ({ page }) => {
    await page.getByRole('button', { name: 'Split' }).click();

    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(page.locator('.preview-content')).toBeVisible();
  });

  test('preview renders wiki-links as clickable elements', async ({ page }) => {
    await page.getByRole('button', { name: 'Preview' }).click();
    const preview = page.locator('.preview-content');

    const wikilink = preview.locator('a.preview-wikilink');
    await expect(wikilink).toBeVisible();
    await expect(wikilink).toHaveAttribute('data-wikilink', '202401151433');
  });

  test('preview renders tags as clickable elements', async ({ page }) => {
    await page.getByRole('button', { name: 'Preview' }).click();
    const preview = page.locator('.preview-content');

    const tag = preview.locator('a.preview-tag');
    await expect(tag).toBeVisible();
    await expect(tag).toHaveAttribute('data-tag', 'test');
  });

  test('clicking wiki-link in preview navigates to target note', async ({ page }) => {
    await page.getByRole('button', { name: 'Preview' }).click();
    const preview = page.locator('.preview-content');

    await preview.locator('a.preview-wikilink').click();

    // Should navigate to the target note (may stay in preview mode)
    await expect(page.locator('.preview-content')).toContainText('xylophoneUnicorn42', { timeout: 5_000 });
  });

  test('clicking tag in preview triggers search', async ({ page }) => {
    await page.getByRole('button', { name: 'Preview' }).click();
    const preview = page.locator('.preview-content');

    await preview.locator('a.preview-tag').first().click();

    // Search input should be populated with the tag
    await expect(page.locator('#search-input')).toHaveValue(/#test/);
  });

  test('split mode shows live preview updates', async ({ page }) => {
    await page.getByRole('button', { name: 'Split' }).click();
    const preview = page.locator('.preview-content');

    // Type new content in editor
    await page.locator('.cm-content').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Live preview test content');

    // Preview should reflect the new content
    await expect(preview).toContainText('Live preview test content', { timeout: 5_000 });
  });
});
