import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Search — filtering and results', () => {
  test('search by unique body text shows matching note only', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.locator('#search-input').fill('xylophoneUnicorn42');

    await expect(page.locator('#note-list').getByText('202401151433 Second Note')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#note-list').getByText('202401151432 Sample Note')).not.toBeVisible();
  });

  test('search by title text finds the note', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.locator('#search-input').fill('Sample Note');

    await expect(page.locator('#note-list').getByText('202401151432 Sample Note')).toBeVisible({ timeout: 5_000 });
  });

  test('search is case-insensitive', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.locator('#search-input').fill('XYLOPHONEUNICORN42');

    await expect(page.locator('#note-list').getByText('202401151433 Second Note')).toBeVisible({ timeout: 5_000 });
  });

  test('search by filename prefix finds non-numeric note', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.locator('#search-input').fill('runx');

    await expect(page.locator('#note-list').getByText('runx Test Note')).toBeVisible({ timeout: 5_000 });
  });

  test('search with no matches shows empty state', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.locator('#search-input').fill('zzNoSuchNoteEver99');

    await expect(page.getByText('No results found.')).toBeVisible({ timeout: 5_000 });
  });

  test('search by tag filters correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // #test tag is on Sample Note and Third Note, but not Second Note
    await page.locator('#search-input').fill('#test');

    await expect(page.locator('#note-list').getByText('202401151432 Sample Note')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#note-list').getByText('202401151434 Third Note')).toBeVisible();
    await expect(page.locator('#note-list').getByText('202401151433 Second Note')).not.toBeVisible();
  });

  test('prefix search matches partial words', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // "xylophone" is a prefix of "xylophoneUnicorn42"
    await page.locator('#search-input').fill('xylophone');

    await expect(page.locator('#note-list').getByText('202401151433 Second Note')).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Search — clearing and navigation', () => {
  test('clearing search with Escape restores full list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Search to filter
    await page.locator('#search-input').fill('xylophoneUnicorn42');
    await expect(page.locator('#note-list').getByText('202401151433 Second Note')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#note-list').getByText('202401151432 Sample Note')).not.toBeVisible();

    // Press Escape to clear
    await page.locator('#search-input').press('Escape');

    // All notes should be visible again
    await expect(page.locator('#note-list').getByText('202401151432 Sample Note')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#note-list').getByText('202401151433 Second Note')).toBeVisible();
    await expect(page.locator('#note-list').getByText('202401151434 Third Note')).toBeVisible();
  });

  test('emptying search input restores full list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.locator('#search-input').fill('xylophoneUnicorn42');
    await expect(page.locator('#note-list').getByText('202401151433 Second Note')).toBeVisible({ timeout: 5_000 });

    // Clear by filling empty string
    await page.locator('#search-input').fill('');

    await expect(page.locator('#note-list').getByText('202401151432 Sample Note')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#note-list').getByText('202401151433 Second Note')).toBeVisible();
  });

  test('clicking a search result opens the note', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.locator('#search-input').fill('xylophoneUnicorn42');
    await expect(page.locator('#note-list').getByText('202401151433 Second Note')).toBeVisible({ timeout: 5_000 });

    await page.locator('#note-list').getByText('202401151433 Second Note').click();

    const editor = page.locator('.cm-content');
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await expect(editor).toContainText('xylophoneUnicorn42');
  });

  test('search persists while navigating notes', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // #test tag matches Sample Note and Third Note
    await page.locator('#search-input').fill('#test');
    await expect(page.locator('#note-list').getByText('202401151432 Sample Note')).toBeVisible({ timeout: 5_000 });

    // Click on a result
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

    // The search input should still have the query
    await expect(page.locator('#search-input')).toHaveValue('#test');

    // Second Note should still not be in the list (search is active)
    await expect(page.locator('#note-list').getByText('202401151433 Second Note')).not.toBeVisible();
  });
});

test.describe('Search — keyboard shortcuts', () => {
  test('Cmd+L focuses the search input', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Click away from search to unfocus
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

    // Cmd+L should focus search
    await page.keyboard.press('Meta+l');
    await expect(page.locator('#search-input')).toBeFocused();
  });

  test('/ key focuses search when not editing', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Click on body to make sure we're not in any input
    await page.locator('body').click();

    // Press / to focus search
    await page.keyboard.press('/');
    await expect(page.locator('#search-input')).toBeFocused();
  });

  test('ArrowDown from search focuses note list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#note-list > div').first()).toBeVisible({ timeout: 5_000 });

    await page.locator('#search-input').focus();
    await page.keyboard.press('ArrowDown');

    await expect(page.locator('#note-list')).toBeFocused();
  });

  test('Enter on empty search results creates a new note with that title', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Wait for notes to load first
    await expect(page.locator('#note-list > div').first()).toBeVisible({ timeout: 5_000 });
    const notesBefore = await page.locator('#note-list > div').count();

    // Type a term that yields no results
    await page.locator('#search-input').fill('zzBrandNewNoteTitle99');
    await expect(page.getByText('No results found.')).toBeVisible({ timeout: 5_000 });

    // Press Enter — should create a note
    await page.locator('#search-input').press('Enter');

    // Editor should open with the new note
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    // Note list should have one more entry (search was cleared)
    await expect(page.locator('#note-list > div')).toHaveCount(notesBefore + 1, { timeout: 5_000 });

    // Cleanup: delete the created note
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('button[title="Delete note"]').click();
    await expect(page.locator('#note-list > div')).toHaveCount(notesBefore, { timeout: 5_000 });
  });
});

test.describe('Search — debounce behavior', () => {
  test('typing triggers search after debounce without pressing Enter', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Type character by character (simulating real typing)
    await page.locator('#search-input').click();
    await page.keyboard.type('xylophoneUnicorn42', { delay: 20 });

    // Should eventually show results without pressing Enter
    await expect(page.locator('#note-list').getByText('202401151433 Second Note')).toBeVisible({ timeout: 5_000 });
  });
});
