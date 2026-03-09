import { test, expect } from '@playwright/test';

test.describe('URL-based navigation', () => {
  test('selecting a note updates the URL', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    // URL should contain the note ID
    expect(page.url()).toContain('/note/202401151432');
  });

  test('navigating directly to /note/:id opens that note', async ({ page }) => {
    await page.goto('/note/202401151433');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    // Should show the second note's content
    await expect(page.locator('.cm-content')).toContainText('xylophoneUnicorn42', { timeout: 5_000 });
  });

  test('browser back button navigates between notes', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Navigate to first note
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-content')).toContainText('Sample Note', { timeout: 5_000 });

    // Navigate to second note
    await page.locator('#note-list').getByText('202401151433 Second Note').click();
    await expect(page.locator('.cm-content')).toContainText('xylophoneUnicorn42', { timeout: 5_000 });
    expect(page.url()).toContain('/note/202401151433');

    // Go back
    await page.goBack();
    await expect(page.locator('.cm-content')).toContainText('Sample Note', { timeout: 5_000 });
    expect(page.url()).toContain('/note/202401151432');

    // Go forward
    await page.goForward();
    await expect(page.locator('.cm-content')).toContainText('xylophoneUnicorn42', { timeout: 5_000 });
    expect(page.url()).toContain('/note/202401151433');
  });

  test('deselecting note returns URL to /', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
    expect(page.url()).toContain('/note/');

    // Press Escape to deselect
    await page.keyboard.press('Escape');
    await expect(page.getByText('Select a note')).toBeVisible({ timeout: 5_000 });

    // URL should be back to /
    await page.waitForURL('**/');
    expect(page.url()).not.toContain('/note/');
  });
});
