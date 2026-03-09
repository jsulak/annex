import { test, expect } from '@playwright/test';

test.describe('Wiki-link autocomplete shows filename', () => {
  const testNoteId = '209901020000';
  const testFilename = `${testNoteId} My File Title.md`;
  const testH1 = 'Completely Different H1';

  test.beforeAll(async ({ request }) => {
    // Create a note where filename title and H1 differ
    await request.put(`/api/v1/notes/${testNoteId}`, {
      data: { body: `# ${testH1}\n\nBody text.` },
    });
    // Rename to set the filename explicitly
    await request.post(`/api/v1/notes/${testNoteId}/rename`, {
      data: { newFilename: testFilename },
    });
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/v1/notes/${testNoteId}`);
  });

  test('autocomplete dropdown shows filename, not H1 title', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Open any note to get an editor
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    // Type [[ to trigger autocomplete, then part of the filename
    await page.locator('.cm-content').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('[[My File');

    // Wait for autocomplete dropdown
    const autocomplete = page.locator('.cm-tooltip-autocomplete');
    await expect(autocomplete).toBeVisible({ timeout: 5_000 });

    // The dropdown should show the filename (minus .md), NOT the H1
    await expect(autocomplete).toContainText('My File Title');
    // It should NOT show "Completely Different H1" as the primary label
    const options = await autocomplete.locator('.cm-completionLabel').allTextContents();
    const matchingOption = options.find(o => o.includes('My File Title'));
    expect(matchingOption).toBeTruthy();
    // Ensure the H1 is not being used as the label
    const h1Option = options.find(o => o.includes('Completely Different H1'));
    expect(h1Option).toBeUndefined();
  });
});
