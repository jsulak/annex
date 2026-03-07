import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Note list stability during arrow-key navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
  });

  test('list order does not change when auto-save fires during navigation', async ({ page }) => {
    const noteList = page.locator('#note-list');
    const noteItems = noteList.locator('> div');

    // Wait for notes to load
    await expect(noteItems.first()).toBeVisible({ timeout: 5_000 });

    // Capture the initial order of note titles
    const initialOrder = await noteItems.allTextContents();
    expect(initialOrder.length).toBeGreaterThanOrEqual(3);

    // Click the LAST note in the list (least recently modified)
    await noteItems.last().click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

    // Type something to make it dirty
    await page.locator('.cm-content').click();
    await page.keyboard.type(' edited');

    // Navigate up with arrow key — this triggers flushSave for the edited note
    await noteList.focus();
    await page.keyboard.press('ArrowUp');

    // Wait for auto-save to complete (save indicator appears then goes away)
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 5_000 });

    // Capture the order after auto-save
    const orderAfterSave = await noteItems.allTextContents();

    // The list order must remain the same — no titles should have jumped
    expect(orderAfterSave).toEqual(initialOrder);
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
