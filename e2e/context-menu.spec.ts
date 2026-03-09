import { test, expect } from '@playwright/test';

test.describe('Note list context menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
  });

  test('right-click shows context menu with Rename and Delete', async ({ page }) => {
    const noteItem = page.locator('#note-list').getByText('202401151432 Sample Note');
    await noteItem.click({ button: 'right' });

    const menu = page.locator('[data-testid="context-menu"]');
    await expect(menu).toBeVisible({ timeout: 5_000 });
    await expect(menu).toContainText('Rename');
    await expect(menu).toContainText('Delete');
  });

  test('clicking outside closes context menu', async ({ page }) => {
    const noteItem = page.locator('#note-list').getByText('202401151432 Sample Note');
    await noteItem.click({ button: 'right' });

    const menu = page.locator('[data-testid="context-menu"]');
    await expect(menu).toBeVisible();

    // Click elsewhere to close
    await page.locator('#search-input').click();
    await expect(menu).not.toBeVisible();
  });

  test('Rename shows inline edit field', async ({ page }) => {
    const noteItem = page.locator('#note-list').getByText('202401151432 Sample Note');
    await noteItem.click({ button: 'right' });

    await page.locator('[data-testid="context-menu"]').getByText('Rename').click();

    // Inline rename input should be visible
    const renameInput = page.locator('#note-list input[type="text"]');
    await expect(renameInput).toBeVisible({ timeout: 5_000 });
    await expect(renameInput).toHaveValue('202401151432 Sample Note');
  });

  test('Delete from context menu removes note', async ({ page, request }) => {
    // Create a throwaway note via API
    const id = '209901030000';
    await request.put(`/api/v1/notes/${id}`, { data: { body: '# Throwaway' } });
    await page.reload();
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    const noteItem = page.locator('#note-list').getByText(id);
    await expect(noteItem).toBeVisible({ timeout: 5_000 });

    // Right-click and delete
    await noteItem.click({ button: 'right' });
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('[data-testid="context-menu"]').getByText('Delete').click();

    // Note should be removed
    await expect(noteItem).not.toBeVisible({ timeout: 5_000 });
  });
});
