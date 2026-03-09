import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Backlinks panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
  });

  test('shows backlinks count when note is selected', async ({ page }) => {
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    await expect(page.getByText(/Backlinks \(\d+\)/)).toBeVisible({ timeout: 5_000 });
  });

  test('clicking backlinks header expands and collapses', async ({ page }) => {
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    const header = page.getByText(/Backlinks \(\d+\)/);
    await expect(header).toBeVisible({ timeout: 5_000 });

    // Click to expand
    await header.click();
    await expect(page.getByText('Third Note', { exact: true })).toBeVisible({ timeout: 3_000 });

    // Click to collapse
    await header.click();
    await expect(page.getByText('Third Note', { exact: true })).not.toBeVisible({ timeout: 3_000 });
  });

  test('clicking a backlink navigates to that note', async ({ page }) => {
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    // Expand backlinks
    await page.getByText(/Backlinks \(\d+\)/).click();
    await expect(page.getByText('Third Note', { exact: true })).toBeVisible({ timeout: 3_000 });

    // Click the backlink
    await page.getByText('Third Note', { exact: true }).click();

    // Editor should now show the Third Note content
    await expect(page.locator('.cm-content')).toContainText('backlink testing', { timeout: 5_000 });
  });

  test('backlinks API returns linking notes', async ({ request }) => {
    const response = await request.get('/api/v1/notes/202401151432/backlinks');
    expect(response.ok()).toBe(true);
    const backlinks = await response.json();

    expect(Array.isArray(backlinks)).toBe(true);
    const thirdNote = backlinks.find((n: { id: string }) => n.id === '202401151434');
    expect(thirdNote).toBeDefined();
    expect(thirdNote.title).toBe('Third Note');
  });

  test('note with no backlinks shows empty state', async ({ page }) => {
    await page.locator('button[title="New note"]').click();
    const titleInput = page.locator('input[placeholder="Note title..."]');
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    await titleInput.fill('Isolated orphan note');
    await page.locator('button:has-text("Create")').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    const header = page.getByText(/Backlinks \(.*\)/);
    await expect(header).toBeVisible({ timeout: 5_000 });
    await header.click();

    await expect(page.getByText('No backlinks')).toBeVisible({ timeout: 3_000 });
  });
});
