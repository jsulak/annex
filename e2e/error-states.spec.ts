import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Error states', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
  });

  test('no note selected shows placeholder', async ({ page }) => {
    await expect(page.getByText('Select a note')).toBeVisible();
  });

  test('empty search shows "No results found"', async ({ page }) => {
    await page.locator('#search-input').fill('zzznonexistentnotequeryzzzz');
    // Wait for debounced search
    await expect(page.getByText('No results found.')).toBeVisible({ timeout: 5_000 });
  });

  test('clearing search restores note list', async ({ page }) => {
    await page.locator('#search-input').fill('zzznonexistentnotequeryzzzz');
    await expect(page.getByText('No results found.')).toBeVisible({ timeout: 5_000 });

    await page.locator('#search-input').fill('');
    await expect(page.locator('#note-list').getByText('202401151432 Sample Note')).toBeVisible({ timeout: 5_000 });
  });

  test('save error shows "Save failed" indicator', async ({ page }) => {
    // Select a note
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

    // Intercept the PUT to simulate a server error
    await page.route('**/api/v1/notes/**', (route) => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({ status: 500, body: '{"error":"Internal server error"}' });
      }
      return route.continue();
    });

    // Type to trigger auto-save
    await page.locator('.cm-content').click();
    await page.keyboard.type('trigger save error');

    // Should show error indicator
    await expect(page.getByText('Save failed')).toBeVisible({ timeout: 10_000 });

    // Clean up route interception so subsequent serial tests are not affected
    await page.unroute('**/api/v1/notes/**');
  });

  test('login page shows error for wrong password', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    // Intercept login to simulate wrong password without consuming rate limit
    await page.route('**/api/v1/auth/login', (route) => {
      return route.fulfill({
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: '{"error":"Incorrect password"}',
      });
    });

    await page.goto('/');

    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    // Error message appears
    await expect(page.getByText('Incorrect password')).toBeVisible({ timeout: 5_000 });
    // Still on login page
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await context.close();
  });

  test('login page shows rate limit message', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    // Intercept login to simulate 429
    await page.route('**/api/v1/auth/login', (route) => {
      return route.fulfill({
        status: 429,
        headers: { 'Content-Type': 'application/json' },
        body: '{"error":"Too many requests"}',
      });
    });

    await page.goto('/');
    await page.locator('input[type="password"]').fill('anything');
    await page.locator('button[type="submit"]').click();

    await expect(page.getByText('Too many attempts')).toBeVisible({ timeout: 5_000 });
    await context.close();
  });

  test('delete confirmation dialog prevents accidental deletion', async ({ page, request }) => {
    // Create a temporary note via API to avoid UI state interference
    const id = '209901080000';
    await request.put(`/api/v1/notes/${id}`, {
      data: { body: 'Delete confirm test body' },
    });

    // Fresh navigation to pick up the new note
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#note-list > div').first()).toBeVisible({ timeout: 5_000 });

    const countBefore = await page.locator('#note-list > div').count();

    // Right-click and try to delete, but decline the confirmation
    const noteItem = page.locator('#note-list > div').filter({ hasText: id }).first();
    await expect(noteItem).toBeVisible({ timeout: 5_000 });
    await noteItem.click({ button: 'right' });
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('[data-testid="context-menu"]').getByText('Delete').click();

    // Note should still be there
    await expect(page.locator('#note-list > div')).toHaveCount(countBefore);

    // Cleanup
    await request.delete(`/api/v1/notes/${id}`);
  });
});
