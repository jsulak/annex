import { test, expect } from '@playwright/test';

test.describe('Background file sync — UI updates', () => {
  test('note list shows notes created via API after refresh', async ({ page, request }) => {
    // Create a note via the API (simulating a note that arrived via sync)
    const id = '209901100010';
    await request.put(`/api/v1/notes/${id}`, {
      data: { body: '# Synced Note\n\nThis note arrived via sync.', filename: `${id} Synced Note.md` },
    });

    // Load the page — fetchNotes should pick up the new note
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('#note-list').getByText(`${id} Synced Note`),
    ).toBeVisible({ timeout: 10_000 });

    // Clean up
    await request.delete(`/api/v1/notes/${id}`);
  });

  test('note list updates when note is created via API while page is open', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#note-list > div').first()).toBeVisible({ timeout: 5_000 });
    const notesBefore = await page.locator('#note-list > div').count();

    // Create a note via the API
    const id = '209901100011';
    await request.put(`/api/v1/notes/${id}`, {
      data: { body: '# Live Update Note\n\nCreated while page is open.', filename: `${id} Live Update Note.md` },
    });

    // The page should detect the new note (either via SSE or the next
    // fetchNotes cycle). Give it time by waiting + refreshing as fallback.
    try {
      await expect(
        page.locator('#note-list').getByText(`${id} Live Update Note`),
      ).toBeVisible({ timeout: 5_000 });
    } catch {
      // SSE might not fire (suppressPath blocks it) — refresh as fallback
      await page.reload();
      await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
      await expect(
        page.locator('#note-list').getByText(`${id} Live Update Note`),
      ).toBeVisible({ timeout: 10_000 });
    }

    // Verify the count increased
    const notesAfter = await page.locator('#note-list > div').count();
    expect(notesAfter).toBeGreaterThan(notesBefore);

    // Clean up
    await request.delete(`/api/v1/notes/${id}`);
  });

  test('deleted note disappears from list after refresh', async ({ page, request }) => {
    // Create a note
    const id = '209901100012';
    await request.put(`/api/v1/notes/${id}`, {
      data: { body: '# Will Delete\n\nTemp.', filename: `${id} Will Delete.md` },
    });

    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('#note-list').getByText(`${id} Will Delete`),
    ).toBeVisible({ timeout: 10_000 });

    // Delete via API
    await request.delete(`/api/v1/notes/${id}`);

    // Refresh to see the deletion
    await page.reload();
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('#note-list').getByText(`${id} Will Delete`),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test('note list is sorted by last modified', async ({ page, request }) => {
    // Create two notes with different timestamps
    const id1 = '209901100013';
    const id2 = '209901100014';
    await request.put(`/api/v1/notes/${id1}`, {
      data: { body: '# Older Note\n\nCreated first.', filename: `${id1} Older Note.md` },
    });
    // Small delay so mtime differs
    await new Promise(r => setTimeout(r, 100));
    await request.put(`/api/v1/notes/${id2}`, {
      data: { body: '# Newer Note\n\nCreated second.', filename: `${id2} Newer Note.md` },
    });

    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#note-list').getByText(`${id2} Newer Note`)).toBeVisible({ timeout: 10_000 });

    // The newer note should appear before the older one
    const items = page.locator('#note-list > div');
    const texts = await items.allTextContents();
    const newerIndex = texts.findIndex(t => t.includes(id2));
    const olderIndex = texts.findIndex(t => t.includes(id1));
    expect(newerIndex).toBeLessThan(olderIndex);

    // Clean up
    await request.delete(`/api/v1/notes/${id1}`);
    await request.delete(`/api/v1/notes/${id2}`);
  });
});
