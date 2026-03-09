import { test, expect } from '@playwright/test';

test.describe('Case-insensitive search', () => {
  test('lowercase query finds title-case text', async ({ page, request }) => {
    // Create a note with title-case text
    const id = '209901200000';
    await request.put(`/api/v1/notes/${id}`, {
      data: {
        body: '# Wisdom\n\ntitle: A man needs to be needed\ntags: #wisdom',
        filename: `${id} A man needs to be needed.md`,
      },
    });

    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Search with all-lowercase query
    await page.locator('#search-input').fill('a man needs to be needed');
    await page.locator('#search-input').press('Enter');

    // Should find the note
    await expect(
      page.locator('#note-list').getByText(`${id}`),
    ).toBeVisible({ timeout: 10_000 });

    // Clean up
    await request.delete(`/api/v1/notes/${id}`);
  });
});
