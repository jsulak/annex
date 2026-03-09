import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startTestServer, stopTestServer, api, type TestContext } from './setup.js';

let ctx: TestContext;
let http: ReturnType<typeof api>;

beforeAll(async () => {
  ctx = await startTestServer();
  http = api(ctx);
});

afterAll(async () => {
  await stopTestServer(ctx);
});

/** Wait for a condition to become true, polling at interval. */
async function waitFor(
  fn: () => Promise<boolean>,
  { timeout = 5000, interval = 200 } = {},
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`waitFor timed out after ${timeout}ms`);
}

describe('file watcher — background file changes', () => {
  test('new file on disk appears in note list via watcher', async () => {
    const id = '209801200000';
    const filename = `${id} Watcher New Note.md`;
    const filePath = path.join(ctx.notesDir, filename);

    // Verify note doesn't exist yet
    const beforeRes = await http.get(`/api/v1/notes/${id}`);
    expect(beforeRes.status).toBe(404);

    // Write file directly to disk (simulating Syncthing)
    fs.writeFileSync(filePath, '# Watcher New Note\n\nCreated externally.', 'utf-8');

    // Wait for watcher to detect and index the file
    await waitFor(async () => {
      const res = await http.get(`/api/v1/notes/${id}`);
      return res.status === 200;
    });

    // Verify it's in the notes list
    const listRes = await http.get('/api/v1/notes');
    const notes = await listRes.json();
    expect(notes.some((n: { id: string }) => n.id === id)).toBe(true);

    // Verify it's searchable (watcher must have updated the index)
    await waitFor(async () => {
      const searchRes = await http.get('/api/v1/search?q=Watcher%20New%20Note');
      const results = await searchRes.json();
      return results.some((r: { id: string }) => r.id === id);
    });

    // Clean up
    fs.unlinkSync(filePath);
  });

  test('modified file on disk updates note content', async () => {
    const id = '209801200001';
    const filename = `${id} Watcher Modify Test.md`;
    const filePath = path.join(ctx.notesDir, filename);

    // Create file directly on disk (no API suppression)
    fs.writeFileSync(filePath, '# Watcher Modify Test\n\nOriginal content.', 'utf-8');

    // Wait for watcher to detect initial creation
    await waitFor(async () => {
      const res = await http.get(`/api/v1/notes/${id}`);
      return res.status === 200;
    });

    // Now modify the file directly on disk (simulating Syncthing)
    await new Promise((r) => setTimeout(r, 500));
    fs.writeFileSync(filePath, '# Watcher Modify Test\n\nUpdated externally via sync.', 'utf-8');

    // Wait for watcher to detect the change and update the search index
    await waitFor(async () => {
      const searchRes = await http.get('/api/v1/search?q=%22Updated%20externally%20via%20sync%22');
      const results = await searchRes.json();
      return results.some((r: { id: string }) => r.id === id);
    });

    // Clean up
    fs.unlinkSync(filePath);
  });

  test('deleted file on disk is removed from note list', async () => {
    const id = '209801200002';
    const filename = `${id} Watcher Delete Test.md`;
    const filePath = path.join(ctx.notesDir, filename);

    // Create file directly on disk (no API suppression)
    fs.writeFileSync(filePath, '# Watcher Delete Test\n\nWill be deleted.', 'utf-8');

    // Wait for watcher to detect creation
    await waitFor(async () => {
      const res = await http.get(`/api/v1/notes/${id}`);
      return res.status === 200;
    });

    // Delete file directly on disk (simulating external deletion)
    fs.unlinkSync(filePath);

    // Wait for watcher to detect the deletion
    await waitFor(async () => {
      const res = await http.get(`/api/v1/notes/${id}`);
      return res.status === 404;
    });

    // Verify it's gone from the notes list
    const listRes = await http.get('/api/v1/notes');
    const notes = await listRes.json();
    expect(notes.some((n: { id: string }) => n.id === id)).toBe(false);
  });
});
