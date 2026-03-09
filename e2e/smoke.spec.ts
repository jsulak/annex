import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Smoke tests', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const response = await request.get('/api/v1/health');
    expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('login rejects wrong password', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto('/');

    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    // Should show error, stay on login
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await context.close();
  });

  test('login accepts correct password', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto('/');

    await page.locator('input[type="password"]').fill('testpassword123');
    await page.locator('button[type="submit"]').click();

    // Should reach the app (search input visible means we're past login)
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await context.close();
  });

  test('note list shows seed notes', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    const noteList = page.locator('#note-list');
    await expect(noteList).toBeVisible();
    await expect(noteList.getByText('202401151432 Sample Note')).toBeVisible();
    await expect(noteList.getByText('202401151433 Second Note')).toBeVisible();
  });

  test('clicking a note opens it in editor', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.locator('#note-list').getByText('202401151432 Sample Note').click();

    const editor = page.locator('.cm-content');
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await expect(editor).toContainText('Sample Note');
  });

  test('create new note via + button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Wait for notes to load before counting
    await expect(page.locator('#note-list > div').first()).toBeVisible({ timeout: 5_000 });
    const notesBefore = await page.locator('#note-list > div').count();

    await page.locator('button[title="New note"]').click();

    // Title dialog should appear
    const titleInput = page.locator('input[placeholder="Note title..."]');
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    await titleInput.fill('Test New Note');
    await page.locator('button:has-text("Create")').click();

    // Editor should be visible for the new note
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    // Note list should have one more entry
    await expect(page.locator('#note-list > div')).toHaveCount(notesBefore + 1, { timeout: 5_000 });
  });

  test('typing triggers auto-save', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Click on a seed note
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

    // Type some text
    await page.locator('.cm-content').click();
    await page.keyboard.type('E2E test edit');

    // Wait for "Saved" indicator
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 10_000 });
  });

  test('search filters note list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.locator('#search-input').fill('xylophoneUnicorn42');
    await page.locator('#search-input').press('Enter');

    // Should show only the second note in results
    await expect(page.locator('#note-list').getByText('202401151433 Second Note')).toBeVisible({ timeout: 5_000 });
    // First note should not be visible
    await expect(page.locator('#note-list').getByText('202401151432 Sample Note')).not.toBeVisible();
  });

  test('clearing search restores full list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Search first
    await page.locator('#search-input').fill('xylophoneUnicorn42');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#note-list').getByText('202401151433 Second Note')).toBeVisible({ timeout: 5_000 });

    // Clear search
    await page.locator('#search-input').fill('');
    await page.locator('#search-input').press('Escape');

    // Both notes should be visible again
    await expect(page.locator('#note-list').getByText('202401151432 Sample Note')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#note-list').getByText('202401151433 Second Note')).toBeVisible();
  });

  test('delete note removes it from list', async ({ page, request }) => {
    // Create a throwaway note via API
    const id = '209901050000';
    await request.put(`/api/v1/notes/${id}`, { data: { body: '# Throwaway For Delete' } });

    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    const noteItem = page.locator('#note-list > div').filter({ hasText: id }).first();
    await expect(noteItem).toBeVisible({ timeout: 5_000 });

    const notesBefore = await page.locator('#note-list > div').count();

    // Delete via right-click context menu
    await noteItem.click({ button: 'right' });
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('[data-testid="context-menu"]').getByText('Delete').click();

    // Should have one fewer note
    await expect(page.locator('#note-list > div')).toHaveCount(notesBefore - 1, { timeout: 5_000 });
  });

  test('back/forward navigation works', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Navigate to first note
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-content')).toContainText('Sample Note', { timeout: 5_000 });

    // Navigate to second note
    await page.locator('#note-list').getByText('202401151433 Second Note').click();
    await expect(page.locator('.cm-content')).toContainText('xylophoneUnicorn42', { timeout: 5_000 });

    // Go back
    await page.locator('button[title="Back (Cmd+[)"]').click();
    await expect(page.locator('.cm-content')).toContainText('Sample Note', { timeout: 5_000 });

    // Go forward
    await page.locator('button[title="Forward (Cmd+])"]').click();
    await expect(page.locator('.cm-content')).toContainText('xylophoneUnicorn42', { timeout: 5_000 });
  });
});
