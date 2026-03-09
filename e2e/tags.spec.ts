import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Tags modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
  });

  test('Cmd+Shift+K opens tags modal', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+k');

    const input = page.getByPlaceholder('Filter tags...');
    await expect(input).toBeVisible({ timeout: 3_000 });
    await expect(input).toBeFocused();
  });

  test('shows tags with counts', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+k');
    await expect(page.getByPlaceholder('Filter tags...')).toBeVisible();

    // #test tag should appear (present in Sample Note and Third Note)
    await expect(page.getByText('#test')).toBeVisible();
    // #second-tag should appear (present in Third Note)
    await expect(page.getByText('#second-tag')).toBeVisible();
  });

  test('filters tags by typing', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+k');
    const input = page.getByPlaceholder('Filter tags...');

    await input.fill('second');

    await expect(page.getByText('#second-tag')).toBeVisible();
  });

  test('selecting a tag triggers search', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+k');
    const input = page.getByPlaceholder('Filter tags...');

    // Wait for tags to load before filtering
    await expect(page.getByText('#test')).toBeVisible({ timeout: 5_000 });

    await input.fill('test');
    // Wait for filtered results to appear
    await expect(page.getByText('#test')).toBeVisible({ timeout: 3_000 });
    await page.keyboard.press('Enter');

    // Modal should close
    await expect(input).not.toBeVisible();
    // Search input should have the tag query
    await expect(page.locator('#search-input')).toHaveValue('#test');
  });

  test('Escape closes tags modal', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+k');
    const input = page.getByPlaceholder('Filter tags...');
    await expect(input).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(input).not.toBeVisible();
  });

  test('clicking outside closes tags modal', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+k');
    const input = page.getByPlaceholder('Filter tags...');
    await expect(input).toBeVisible();

    // Click the overlay backdrop
    await page.mouse.click(10, 10);

    await expect(input).not.toBeVisible();
  });
});

test.describe('Tags API', () => {
  test('GET /api/v1/tags returns tags with counts', async ({ request }) => {
    const response = await request.get('/api/v1/tags');
    expect(response.ok()).toBe(true);
    const tags = await response.json();

    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length).toBeGreaterThan(0);

    // Find the "test" tag
    const testTag = tags.find((t: { tag: string }) => t.tag === 'test');
    expect(testTag).toBeDefined();
    expect(testTag.count).toBeGreaterThanOrEqual(2); // Sample Note + Third Note

    // Each tag should have tag and count fields
    for (const t of tags) {
      expect(t).toHaveProperty('tag');
      expect(t).toHaveProperty('count');
      expect(typeof t.tag).toBe('string');
      expect(typeof t.count).toBe('number');
    }
  });
});
