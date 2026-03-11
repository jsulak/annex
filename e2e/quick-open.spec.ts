import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Quick Open dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
  });

  test('Cmd+O opens Quick Open dialog', async ({ page }) => {
    await page.keyboard.press('Meta+o');

    const input = page.getByPlaceholder('Quick open... type to filter');
    await expect(input).toBeVisible({ timeout: 3_000 });
    await expect(input).toBeFocused();
  });

  test('shows all notes when no filter', async ({ page }) => {
    await page.keyboard.press('Meta+o');
    await expect(page.getByPlaceholder('Quick open... type to filter')).toBeVisible();

    // All seed notes should be listed in the quick open dialog
    const input = page.getByPlaceholder('Quick open... type to filter');
    const dialog = input.locator('..');  // parent container
    await expect(dialog.getByText('Sample Note')).toBeVisible();
    await expect(dialog.getByText('Second Note')).toBeVisible();
    await expect(dialog.getByText('Third Note')).toBeVisible();
  });

  test('filters notes by typing', async ({ page }) => {
    await page.keyboard.press('Meta+o');
    const input = page.getByPlaceholder('Quick open... type to filter');
    const dialog = input.locator('..');

    await input.fill('Second');

    await expect(dialog.getByText('Second Note')).toBeVisible();
    // Other notes should be filtered out
    await expect(dialog.getByText('Third Note')).not.toBeVisible();
  });

  test('selecting a note navigates to it', async ({ page }) => {
    await page.keyboard.press('Meta+o');
    const input = page.getByPlaceholder('Quick open... type to filter');

    await input.fill('Second');
    await page.keyboard.press('Enter');

    // Dialog should close and editor should show the note
    await expect(input).not.toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('xylophoneUnicorn42', { timeout: 5_000 });
  });

  test('Escape closes the dialog', async ({ page }) => {
    await page.keyboard.press('Meta+o');
    const input = page.getByPlaceholder('Quick open... type to filter');
    await expect(input).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(input).not.toBeVisible();
  });

  test('filters by note ID', async ({ page }) => {
    await page.keyboard.press('Meta+o');
    const input = page.getByPlaceholder('Quick open... type to filter');

    await input.fill('202401151433');

    await expect(input.locator('..').getByText('Second Note')).toBeVisible();
  });

  test('shows "No matching notes" for bad query', async ({ page }) => {
    await page.keyboard.press('Meta+o');
    const input = page.getByPlaceholder('Quick open... type to filter');

    await input.fill('zzz_no_match_zzz');

    await expect(page.getByText('No matching notes')).toBeVisible();
  });

  test('arrow keys navigate the list', async ({ page }) => {
    await page.keyboard.press('Meta+o');
    const input = page.getByPlaceholder('Quick open... type to filter');
    await expect(input).toBeVisible();

    // Wait for list to populate before navigating
    await expect(input.locator('..').locator('..').getByText('Sample Note')).toBeVisible({ timeout: 5_000 });

    // Arrow down moves to second item, Enter selects it
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // Dialog should close and editor should be visible
    await expect(input).not.toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
  });
});
