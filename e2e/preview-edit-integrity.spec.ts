import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Preview/Edit content integrity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
  });

  test('edit → preview shows edited content, not original', async ({ page }) => {
    const marker = 'UNIQUE_PREVIEW_MARKER_' + Date.now();

    // Type new content in editor
    await page.locator('.cm-content').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(marker);

    // Switch to preview WITHOUT waiting for auto-save
    await page.getByRole('button', { name: 'Preview' }).click();

    // Preview should contain the new content
    const preview = page.locator('.preview-content');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(marker, { timeout: 5_000 });
  });

  test('edit → preview → edit preserves edits', async ({ page }) => {
    const marker = 'ROUNDTRIP_MARKER_' + Date.now();

    // Type new content
    await page.locator('.cm-content').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(marker);

    // Switch to preview
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.locator('.preview-content')).toBeVisible();

    // Switch back to edit
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('.cm-editor')).toBeVisible();

    // Editor should still contain the edited content
    await expect(page.locator('.cm-content')).toContainText(marker, { timeout: 5_000 });
  });

  test('edit → preview → edit → auto-save preserves all edits', async ({ page }) => {
    const marker1 = 'FIRST_EDIT_' + Date.now();
    const marker2 = 'SECOND_EDIT_' + Date.now();

    // First edit
    await page.locator('.cm-content').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(marker1);

    // Switch to preview and back
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.locator('.preview-content')).toBeVisible();
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('.cm-editor')).toBeVisible();

    // Second edit
    await page.locator('.cm-content').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(marker2);

    // Wait for auto-save
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 10_000 });

    // Both edits should be present
    await expect(page.locator('.cm-content')).toContainText(marker1);
    await expect(page.locator('.cm-content')).toContainText(marker2);

    // Verify via API that both edits were saved
    const res = await page.request.get('/api/v1/notes/202401151432');
    const note = await res.json();
    expect(note.body).toContain(marker1);
    expect(note.body).toContain(marker2);
  });

  test('edits survive auto-save etag update without reset', async ({ page }) => {
    const marker1 = 'BEFORE_SAVE_' + Date.now();
    const marker2 = 'AFTER_SAVE_' + Date.now();

    // Type first content
    await page.locator('.cm-content').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(marker1);

    // Wait for auto-save to complete
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 10_000 });

    // Type more content immediately after save
    await page.locator('.cm-content').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(marker2);

    // Wait a moment for any state sync effects
    await page.waitForTimeout(500);

    // Both markers should still be in the editor (not reset by etag update)
    await expect(page.locator('.cm-content')).toContainText(marker1);
    await expect(page.locator('.cm-content')).toContainText(marker2);
  });
});
