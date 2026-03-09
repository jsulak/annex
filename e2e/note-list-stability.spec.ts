import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Note list stability during arrow-key navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
  });

  test('edited note moves to top of list after auto-save', async ({ page }) => {
    const noteList = page.locator('#note-list');
    const noteItems = noteList.locator('> div');

    // Wait for notes to load
    await expect(noteItems.first()).toBeVisible({ timeout: 5_000 });

    // Capture the initial order of note titles
    const initialOrder = await noteItems.allTextContents();
    expect(initialOrder.length).toBeGreaterThanOrEqual(3);

    // Click the LAST note in the list (least recently modified)
    const lastNoteText = initialOrder[initialOrder.length - 1];
    await noteItems.last().click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

    // Type something to make it dirty
    await page.locator('.cm-content').click();
    await page.keyboard.type(' edited');

    // Wait for auto-save to complete
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 5_000 });

    // The edited note should now be first (sorted by last modified)
    const newFirstText = await noteItems.first().textContent();
    expect(newFirstText).toContain(lastNoteText.trim());
  });

  test('navigating notes without editing does not trigger a save', async ({ page }) => {
    const noteList = page.locator('#note-list');
    const noteItems = noteList.locator('> div');

    // Wait for notes to load
    await expect(noteItems.first()).toBeVisible({ timeout: 5_000 });

    // Click the first note to open it
    await noteItems.first().click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

    // Navigate through notes with arrow keys without editing
    await noteList.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

    // Wait longer than auto-save delay (500ms in test config) to ensure
    // no spurious save fires
    await page.waitForTimeout(1500);

    // "Saved" indicator should never have appeared — no save should have fired
    await expect(page.getByText('Saved')).not.toBeVisible();

    // List order should be unchanged
    const currentOrder = await noteItems.allTextContents();
    const initialOrder = await noteItems.allTextContents();
    expect(currentOrder).toEqual(initialOrder);
  });
});
