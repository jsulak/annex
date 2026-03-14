import { test, expect, type Page } from '@playwright/test';

const THRESHOLD = 60;
const RESISTANCE = 0.5;
// Raw drag needed to exceed threshold: THRESHOLD / RESISTANCE = 120px; use 150 for margin
const FULL_PULL_PX = 150;
const SHORT_PULL_PX = 40; // 40 * 0.5 = 20 < 60 threshold

async function simulatePull(page: Page, pullPx: number) {
  await page.evaluate((dy) => {
    const el = document.querySelector('#note-list') as HTMLElement | null;
    if (!el) throw new Error('#note-list not found');
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const startY = rect.top + 20;

    function makeTouch(y: number): Touch {
      return new Touch({
        identifier: 1,
        target: el!,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        pageX: x,
        pageY: y,
        radiusX: 5,
        radiusY: 5,
        rotationAngle: 0,
        force: 1,
      });
    }

    el.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true, cancelable: true, composed: true,
      touches: [makeTouch(startY)],
      changedTouches: [makeTouch(startY)],
      targetTouches: [makeTouch(startY)],
    }));

    const steps = 15;
    for (let i = 1; i <= steps; i++) {
      const y = startY + (dy * i) / steps;
      el.dispatchEvent(new TouchEvent('touchmove', {
        bubbles: true, cancelable: true, composed: true,
        touches: [makeTouch(y)],
        changedTouches: [makeTouch(y)],
        targetTouches: [makeTouch(y)],
      }));
    }

    el.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true, cancelable: true, composed: true,
      touches: [],
      changedTouches: [makeTouch(startY + dy)],
      targetTouches: [],
    }));
  }, pullPx);
}

test.describe('Pull-to-refresh on note list', () => {
  test('indicator shows "Release to refresh" when pulled past threshold', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#note-list > div').first()).toBeVisible({ timeout: 5_000 });

    // Pull past threshold but do NOT release (no touchend)
    await page.evaluate((dy) => {
      const el = document.querySelector('#note-list') as HTMLElement | null;
      if (!el) throw new Error('#note-list not found');
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const startY = rect.top + 20;

      function makeTouch(y: number): Touch {
        return new Touch({ identifier: 1, target: el!, clientX: x, clientY: y, screenX: x, screenY: y, pageX: x, pageY: y, radiusX: 5, radiusY: 5, rotationAngle: 0, force: 1 });
      }

      el.dispatchEvent(new TouchEvent('touchstart', {
        bubbles: true, cancelable: true, composed: true,
        touches: [makeTouch(startY)], changedTouches: [makeTouch(startY)], targetTouches: [makeTouch(startY)],
      }));

      const steps = 15;
      for (let i = 1; i <= steps; i++) {
        const y = startY + (dy * i) / steps;
        el.dispatchEvent(new TouchEvent('touchmove', {
          bubbles: true, cancelable: true, composed: true,
          touches: [makeTouch(y)], changedTouches: [makeTouch(y)], targetTouches: [makeTouch(y)],
        }));
      }
      // No touchend — keep in pulled state
    }, FULL_PULL_PX);

    await expect(page.locator('[data-testid="pull-refresh-indicator"]')).toContainText('Release to refresh', { timeout: 2_000 });
  });

  test('releasing past threshold calls fetchNotes (shows "Refreshing..." indicator)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#note-list > div').first()).toBeVisible({ timeout: 5_000 });

    // Intercept /api/v1/notes GET calls and count how many happen after page load
    let postLoadFetchCount = 0;
    let trackingEnabled = false;
    await page.route('**/api/v1/notes', async (route) => {
      if (trackingEnabled && route.request().method() === 'GET') {
        postLoadFetchCount++;
      }
      await route.continue();
    });
    // Start tracking after initial load
    trackingEnabled = true;

    await simulatePull(page, FULL_PULL_PX);

    // fetchNotes should have been called during/after the pull
    await expect(async () => {
      expect(postLoadFetchCount).toBeGreaterThan(0);
    }).toPass({ timeout: 5_000 });
  });

  test('short pull (below threshold) does not trigger refresh', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#note-list > div').first()).toBeVisible({ timeout: 5_000 });

    // Track note count and route calls
    let fetchNotesCalls = 0;
    let trackingEnabled = false;
    await page.route('**/api/v1/notes', async (route) => {
      if (trackingEnabled && route.request().method() === 'GET') fetchNotesCalls++;
      await route.continue();
    });
    trackingEnabled = true;

    // Pull only 40px raw → 20px after resistance — well below 60px threshold
    await simulatePull(page, SHORT_PULL_PX);

    await page.waitForTimeout(500);
    expect(fetchNotesCalls).toBe(0);

    // Indicator should have snapped back to empty
    const indicatorText = await page.locator('[data-testid="pull-refresh-indicator"]').textContent();
    expect(indicatorText).toBe('');
  });
});
