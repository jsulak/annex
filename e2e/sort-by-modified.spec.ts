import { test, expect } from '@playwright/test';

test.describe('Note list sorting by last modified', () => {
  test('editing a note moves it to the top of the list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Get the initial order
    const noteItems = page.locator('#note-list > div');
    await expect(noteItems.first()).toBeVisible({ timeout: 5_000 });
    const initialOrder = await noteItems.allTextContents();

    // Click the LAST note in the list
    const lastNoteText = initialOrder[initialOrder.length - 1];
    await noteItems.last().click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    // Type to trigger auto-save
    await page.locator('.cm-content').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('sort test edit');

    // Wait for save
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 10_000 });

    // The edited note should now be first in the list
    const newFirstText = await noteItems.first().textContent();
    expect(newFirstText).toContain(lastNoteText.trim());
  });
});
