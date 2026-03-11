import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Settings panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
  });

  test('settings button opens panel', async ({ page }) => {
    await page.locator('button[title="Settings (Cmd+,)"]').click();

    await expect(page.getByText('Settings').first()).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText('Auto-save delay')).toBeVisible();
    await expect(page.getByText('Font size')).toBeVisible();
  });

  test('Cmd+, opens settings panel', async ({ page }) => {
    await page.keyboard.press('Meta+,');

    await expect(page.getByText('Auto-save delay')).toBeVisible({ timeout: 3_000 });
  });

  test('Escape closes settings panel', async ({ page }) => {
    await page.locator('button[title="Settings (Cmd+,)"]').click();
    await expect(page.getByText('Auto-save delay')).toBeVisible({ timeout: 3_000 });

    await page.keyboard.press('Escape');

    await expect(page.getByText('Auto-save delay')).not.toBeVisible();
  });

  test('loads current settings values', async ({ page }) => {
    await page.locator('button[title="Settings (Cmd+,)"]').click();
    await expect(page.getByText('Auto-save delay')).toBeVisible({ timeout: 3_000 });

    // Font size should have a value
    const fontSizeInput = page.locator('input[type="number"][min="10"][max="24"]');
    await expect(fontSizeInput).toHaveValue(/\d+/);
  });

  test('saving settings shows confirmation', async ({ page }) => {
    await page.locator('button[title="Settings (Cmd+,)"]').click();
    await expect(page.getByText('Auto-save delay')).toBeVisible({ timeout: 3_000 });

    await page.getByRole('button', { name: 'Save settings' }).click();

    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5_000 });
  });

  test('shows theme selector', async ({ page }) => {
    await page.locator('button[title="Settings (Cmd+,)"]').click();
    await expect(page.getByText('Theme')).toBeVisible({ timeout: 3_000 });

    const select = page.locator('select');
    await expect(select).toBeVisible();
    // Should have the three options
    await expect(select.locator('option')).toHaveCount(3);
  });

  test('shows show-snippets checkbox', async ({ page }) => {
    await page.locator('button[title="Settings (Cmd+,)"]').click();
    await expect(page.getByText('Show snippets in note list')).toBeVisible({ timeout: 3_000 });

    const checkbox = page.locator('input[type="checkbox"]');
    await expect(checkbox).toBeVisible();
  });

  test('shows change password section', async ({ page }) => {
    await page.locator('button[title="Settings (Cmd+,)"]').click();

    await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText('Current password')).toBeVisible();
    await expect(page.getByText('New password')).toBeVisible();
  });

  test('shows line height setting', async ({ page }) => {
    await page.locator('button[title="Settings (Cmd+,)"]').click();
    await expect(page.getByText('Line height')).toBeVisible({ timeout: 3_000 });

    const lineHeightInput = page.locator('input[type="number"][min="1"][max="3"]');
    await expect(lineHeightInput).toBeVisible();
    await expect(lineHeightInput).toHaveValue(/[\d.]+/);
  });

  test('line height setting applies CSS variable to editor', async ({ page }) => {
    await page.locator('button[title="Settings (Cmd+,)"]').click();
    await expect(page.getByText('Line height')).toBeVisible({ timeout: 3_000 });

    const lineHeightInput = page.locator('input[type="number"][min="1"][max="3"]');
    await lineHeightInput.fill('2');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5_000 });

    // The CSS variable should be set on :root
    const lineHeightVar = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--line-height-editor').trim()
    );
    expect(lineHeightVar).toBe('2');

    // Restore
    await lineHeightInput.fill('1.6');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Settings API', () => {
  test('GET /api/v1/config returns settings', async ({ request }) => {
    const response = await request.get('/api/v1/config');
    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data).toHaveProperty('settings');
    expect(data.settings).toHaveProperty('autoSaveDelay');
    expect(data.settings).toHaveProperty('fontSize');
    expect(data.settings).toHaveProperty('darkMode');
    expect(data.settings).toHaveProperty('lineHeight');
    // passwordHash should NOT be exposed
    expect(data).not.toHaveProperty('passwordHash');
  });

  test('PUT /api/v1/config updates settings', async ({ request }) => {
    const response = await request.put('/api/v1/config', {
      data: {
        settings: { fontSize: 15 },
      },
    });
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.settings.fontSize).toBe(15);

    // Restore original
    await request.put('/api/v1/config', {
      data: { settings: { fontSize: 13 } },
    });
  });

  test('PUT /api/v1/config updates lineHeight', async ({ request }) => {
    const response = await request.put('/api/v1/config', {
      data: { settings: { lineHeight: 2.0 } },
    });
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.settings.lineHeight).toBe(2.0);

    // Restore original
    await request.put('/api/v1/config', {
      data: { settings: { lineHeight: 1.6 } },
    });
  });

  test('PUT /api/v1/config rejects missing settings', async ({ request }) => {
    const response = await request.put('/api/v1/config', {
      data: {},
    });
    expect(response.status()).toBe(400);
  });
});
