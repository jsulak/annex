import { test, expect } from '@playwright/test';

test.describe('Preview heading hierarchy', () => {
  test('h1, h2, h3 render with distinct sizes and proper spacing', async ({ page, request }) => {
    const id = '209901070000';
    await request.put(`/api/v1/notes/${id}`, {
      data: {
        body: '# Heading 1\n\nParagraph.\n\n## Heading 2\n\nParagraph.\n\n### Heading 3\n\nParagraph.\n',
      },
    });

    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await page.locator('#note-list > div').filter({ hasText: id }).first().click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Preview' }).click();

    const preview = page.locator('.preview-content');
    await expect(preview).toBeVisible();

    // All headings should be present
    await expect(preview.locator('h1')).toContainText('Heading 1');
    await expect(preview.locator('h2')).toContainText('Heading 2');
    await expect(preview.locator('h3')).toContainText('Heading 3');

    // h1 should be larger than h2, h2 larger than h3
    const h1Size = await preview.locator('h1').evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    const h2Size = await preview.locator('h2').evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    const h3Size = await preview.locator('h3').evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );

    expect(h1Size).toBeGreaterThan(h2Size);
    expect(h2Size).toBeGreaterThan(h3Size);

    // h1 and h2 should have bottom borders
    const h1Border = await preview.locator('h1').evaluate((el) =>
      getComputedStyle(el).borderBottomStyle,
    );
    const h2Border = await preview.locator('h2').evaluate((el) =>
      getComputedStyle(el).borderBottomStyle,
    );
    expect(h1Border).toBe('solid');
    expect(h2Border).toBe('solid');

    await request.delete(`/api/v1/notes/${id}`);
  });
});
