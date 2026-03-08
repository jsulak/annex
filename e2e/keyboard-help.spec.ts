import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Keyboard help overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
  });

  test('? button in toolbar opens keyboard help', async ({ page }) => {
    await page.locator('button[title="Keyboard shortcuts (?)"]').click();
    await expect(page.getByTestId('keyboard-help')).toBeVisible();
    await expect(page.getByText('Keyboard shortcuts')).toBeVisible();
  });

  test('keyboard help shows common shortcuts', async ({ page }) => {
    await page.locator('button[title="Keyboard shortcuts (?)"]').click();
    const help = page.getByTestId('keyboard-help');
    await expect(help).toBeVisible();

    // Check that key shortcuts are listed
    await expect(help.getByText('Focus search', { exact: true })).toBeVisible();
    await expect(help.getByText('New note')).toBeVisible();
    await expect(help.getByText('Save now')).toBeVisible();
    await expect(help.getByText('Delete note')).toBeVisible();
    await expect(help.getByText('Quick open')).toBeVisible();
    await expect(help.getByText('Settings')).toBeVisible();
    await expect(help.getByText('This help')).toBeVisible();
  });

  test('Escape closes keyboard help', async ({ page }) => {
    await page.locator('button[title="Keyboard shortcuts (?)"]').click();
    await expect(page.getByTestId('keyboard-help')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('keyboard-help')).not.toBeVisible();
  });

  test('clicking backdrop closes keyboard help', async ({ page }) => {
    await page.locator('button[title="Keyboard shortcuts (?)"]').click();
    await expect(page.getByTestId('keyboard-help')).toBeVisible();

    // Click outside the dialog (on the backdrop)
    await page.mouse.click(10, 10);
    await expect(page.getByTestId('keyboard-help')).not.toBeVisible();
  });

  test('? key opens keyboard help when not in editor', async ({ page }) => {
    // Click on the note list to ensure focus is not in an input
    await page.locator('#note-list').click();
    // Need to ensure we're not in an input — blur any focused input
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());

    await page.keyboard.press('?');
    await expect(page.getByTestId('keyboard-help')).toBeVisible();
  });

  test('? key does not open help when in search input', async ({ page }) => {
    await page.locator('#search-input').click();
    await page.keyboard.press('?');
    // Help should not appear (the ? goes into the input)
    await expect(page.getByTestId('keyboard-help')).not.toBeVisible();
  });
});
