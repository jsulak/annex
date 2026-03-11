import { test, expect } from '@playwright/test';

test.describe('New note dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
  });

  test('+ button shows title dialog', async ({ page }) => {
    await page.locator('button[title="New note"]').click();
    await expect(page.locator('input[placeholder="Note title..."]')).toBeVisible({ timeout: 5_000 });
  });

  test('submitting title creates note with correct filename and template', async ({ page, request }) => {
    await page.locator('button[title="New note"]').click();
    const titleInput = page.locator('input[placeholder="Note title..."]');
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    await titleInput.fill('My Test Note');
    await page.locator('button:has-text("Create")').click();

    // Editor should open with the template content
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
    const editorText = await page.locator('.cm-content').textContent();
    expect(editorText).toContain('Title:');
    expect(editorText).toContain('My Test Note');
    expect(editorText).toContain('Date:');
    expect(editorText).toContain('Keywords:');
    // Backlinks line with note ID wikilink
    expect(editorText).toMatch(/Backlinks: \[\[\d{12}\]\]/);
    // No H1 heading
    expect(editorText).not.toMatch(/^# /m);

    // Verify the filename includes the title (check note list)
    await expect(page.locator('#note-list')).toContainText('My Test Note');
  });

  test('Escape closes the dialog without creating', async ({ page }) => {
    await page.locator('button[title="New note"]').click();
    await expect(page.locator('input[placeholder="Note title..."]')).toBeVisible();
    const notesBefore = await page.locator('#note-list > div').count();
    await page.keyboard.press('Escape');
    await expect(page.locator('input[placeholder="Note title..."]')).not.toBeVisible();
    // No new note created
    const notesAfter = await page.locator('#note-list > div').count();
    expect(notesAfter).toBe(notesBefore);
  });

  test('Cancel button closes dialog without creating', async ({ page }) => {
    await page.locator('button[title="New note"]').click();
    await expect(page.locator('input[placeholder="Note title..."]')).toBeVisible();
    const notesBefore = await page.locator('#note-list > div').count();
    await page.locator('button:has-text("Cancel")').click();
    await expect(page.locator('input[placeholder="Note title..."]')).not.toBeVisible();
    const notesAfter = await page.locator('#note-list > div').count();
    expect(notesAfter).toBe(notesBefore);
  });

  test('Cmd+N opens the new note dialog', async ({ page }) => {
    await page.keyboard.press('Meta+n');
    await expect(page.locator('input[placeholder="Note title..."]')).toBeVisible({ timeout: 5_000 });
  });
});
