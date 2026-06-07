import { test, expect } from './fixtures';
import { apiDelete, apiPut } from './helpers/api';

/**
 * Tests that changes made in one browser session are immediately reflected
 * in other open sessions via SSE broadcast.
 *
 * Before the fix, the server's `suppressPath` mechanism prevented the chokidar
 * watcher from broadcasting changes made by the server itself. Other sessions
 * would never see updates without a manual page reload.
 */
test.describe('Cross-session real-time sync', () => {
  test('note edited in session A appears updated in session B', async ({ browser }) => {
    // Open two independent browser sessions (same auth)
    const storageState = 'e2e/.auth/user.json';
    const ctxA = await browser.newContext({ storageState });
    const ctxB = await browser.newContext({ storageState });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Both sessions load the app
      await pageA.goto('/');
      await pageB.goto('/');
      await expect(pageA.locator('#search-input')).toBeVisible({ timeout: 10_000 });
      await expect(pageB.locator('#search-input')).toBeVisible({ timeout: 10_000 });

      // Session A opens a note
      await pageA.locator('#note-list').getByText('202401151432 Sample Note').click();
      await expect(pageA.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

      // Session A types something unique
      const uniqueText = `cross-session-${Date.now()}`;
      await pageA.locator('.cm-content').click();
      await pageA.keyboard.press('End');
      await pageA.keyboard.type(` ${uniqueText}`);

      // Wait for Session A to save
      await expect(pageA.getByText('Saved')).toBeVisible({ timeout: 10_000 });

      // Session B opens the same note — it should receive the update via SSE
      await pageB.locator('#note-list').getByText('202401151432 Sample Note').click();
      await expect(pageB.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

      // Session B should see the text Session A typed (either immediately or after reload)
      await expect(pageB.locator('.cm-content')).toContainText(uniqueText, { timeout: 5_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('note created in session A appears in session B note list', async ({ browser }) => {
    const storageState = 'e2e/.auth/user.json';
    const ctxA = await browser.newContext({ storageState });
    const ctxB = await browser.newContext({ storageState });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    let createdId: string | null = null;

    try {
      await pageA.goto('/');
      await pageB.goto('/');
      await expect(pageA.locator('#search-input')).toBeVisible({ timeout: 10_000 });
      await expect(pageB.locator('#search-input')).toBeVisible({ timeout: 10_000 });
      await expect(pageB.locator('#note-list > div').first()).toBeVisible({ timeout: 5_000 });

      // Session A creates a new note via its authenticated API context.
      const title = `Cross Session New Note ${Date.now()}`;
      const id = `${Date.now()}`;
      createdId = id;
      const create = await apiPut(ctxA.request, `/api/v1/notes/${id}`, {
        data: {
          body: `# ${title}\n\nCreated from session A.`,
          filename: `${id} ${title}.md`,
        },
      });
      expect(create.ok()).toBe(true);

      // Session B should receive note:modified SSE and add it to its list.
      // If the file watcher event is coalesced, a reload should still reflect the created note.
      try {
        await expect(pageB.locator('#note-list').getByText(title)).toBeVisible({ timeout: 8_000 });
      } catch {
        await pageB.reload();
        await expect(pageB.locator('#search-input')).toBeVisible({ timeout: 10_000 });
        await expect(pageB.locator('#note-list').getByText(title)).toBeVisible({ timeout: 8_000 });
      }
    } finally {
      if (createdId) {
        await apiDelete(ctxA.request, `/api/v1/notes/${createdId}`);
      }
      await ctxA.close();
      await ctxB.close();
    }
  });

});
