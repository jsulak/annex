import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Responsive layout', () => {
  test('desktop shows both panels side by side', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    const noteList = page.locator('.app-panel-list');
    const editor = page.locator('.app-panel-editor');
    await expect(noteList).toBeVisible();
    await expect(editor).toBeVisible();

    // Panels should be side-by-side (flex row)
    const listBox = await noteList.boundingBox();
    const editorBox = await editor.boundingBox();
    expect(listBox).toBeTruthy();
    expect(editorBox).toBeTruthy();
    // Editor should be to the right of the list
    expect(editorBox!.x).toBeGreaterThan(listBox!.x);
  });

  test('desktop shows nav buttons', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('button[title="Back (Cmd+[)"]')).toBeVisible();
    await expect(page.locator('button[title="Forward (Cmd+])"]')).toBeVisible();
  });

  test('mobile hides nav buttons', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('button[title="Back (Cmd+[)"]')).not.toBeVisible();
    await expect(page.locator('button[title="Forward (Cmd+])"]')).not.toBeVisible();
  });

  test('mobile shows note list initially', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('#note-list')).toBeVisible();
    await expect(page.locator('#note-list').getByText('202401151432 Sample Note')).toBeVisible();
  });

  test('mobile hides note list when note selected', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Click a note
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    // Note list should be hidden
    await expect(page.locator('.app-panel-list')).not.toBeVisible();
  });

  test('mobile back button returns to note list', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Select a note
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    // Back button should be visible on mobile
    const backBtn = page.locator('.mobile-back-btn');
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // Note list should reappear
    await expect(page.locator('#note-list')).toBeVisible();
    await expect(page.locator('#note-list').getByText('202401151432 Sample Note')).toBeVisible();
  });

  test('mobile divider is hidden', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('.app-divider')).not.toBeVisible();
  });

  test('desktop divider is visible', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('.app-divider')).toBeVisible();
  });
});
