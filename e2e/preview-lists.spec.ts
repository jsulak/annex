import { test, expect } from '@playwright/test';

test.describe('Preview list rendering', () => {
  test('unordered lists show bullets', async ({ page, request }) => {
    const id = '209901060000';
    await request.put(`/api/v1/notes/${id}`, {
      data: { body: '# List Test\n\n- Item one\n- Item two\n- Item three\n' },
    });

    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await page.locator('#note-list > div').filter({ hasText: id }).first().click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Preview' }).click();

    const preview = page.locator('.preview-content');
    const ul = preview.locator('ul');
    await expect(ul).toBeVisible();

    // Check that list-style is not "none"
    const listStyle = await ul.evaluate((el) => getComputedStyle(el).listStyleType);
    expect(listStyle).toBe('disc');

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('ordered lists show numbers', async ({ page, request }) => {
    const id = '209901060001';
    await request.put(`/api/v1/notes/${id}`, {
      data: { body: '# Ordered Test\n\n1. First\n2. Second\n3. Third\n' },
    });

    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await page.locator('#note-list > div').filter({ hasText: id }).first().click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Preview' }).click();

    const preview = page.locator('.preview-content');
    const ol = preview.locator('ol');
    await expect(ol).toBeVisible();

    const listStyle = await ol.evaluate((el) => getComputedStyle(el).listStyleType);
    expect(listStyle).toBe('decimal');

    await request.delete(`/api/v1/notes/${id}`);
  });
});
