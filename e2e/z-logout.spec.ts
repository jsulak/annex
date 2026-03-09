import { test, expect } from '@playwright/test';
import path from 'path';

const tmpAuth = path.join(import.meta.dirname, '.auth', 'logout-test.json');

test.describe('Logout', () => {
  test('clicking Log out returns to login page', async ({ browser, baseURL }) => {
    // Create independent context and login via API to get our own session
    const context = await browser.newContext({ baseURL });
    const loginRes = await context.request.post('/api/v1/auth/login', {
      data: { password: 'testpassword123' },
    });
    expect(loginRes.ok()).toBe(true);

    // Save session state and reopen with it (so page has the cookie)
    await context.storageState({ path: tmpAuth });
    await context.close();

    const authContext = await browser.newContext({ baseURL, storageState: tmpAuth });
    const page = await authContext.newPage();

    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Log out' }).click();

    // Should see the login form
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 5_000 });
    await authContext.close();
  });

  test('after logout, API calls are rejected', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });

    // Login to get our own session (retry once if rate-limited)
    let loginRes = await context.request.post('/api/v1/auth/login', {
      data: { password: 'testpassword123' },
    });
    if (loginRes.status() === 429) {
      // Wait briefly and retry if rate-limited by prior tests
      await new Promise((r) => setTimeout(r, 2000));
      loginRes = await context.request.post('/api/v1/auth/login', {
        data: { password: 'testpassword123' },
      });
    }
    expect(loginRes.ok()).toBe(true);

    // Logout
    const logoutRes = await context.request.post('/api/v1/auth/logout');
    expect(logoutRes.ok()).toBe(true);

    // Subsequent API call should fail
    const notesRes = await context.request.get('/api/v1/notes');
    expect(notesRes.status()).toBe(401);
    await context.close();
  });
});
