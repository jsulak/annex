import { test, expect } from '@playwright/test';

test.describe('Notes API', () => {
  test('GET /api/v1/notes returns all notes', async ({ request }) => {
    const response = await request.get('/api/v1/notes');
    expect(response.ok()).toBe(true);
    const notes = await response.json();

    expect(Array.isArray(notes)).toBe(true);
    expect(notes.length).toBeGreaterThanOrEqual(3);

    // Each note should have required fields
    for (const note of notes) {
      expect(note).toHaveProperty('id');
      expect(note).toHaveProperty('filename');
      expect(note).toHaveProperty('title');
      expect(note).toHaveProperty('tags');
      expect(note).toHaveProperty('modifiedAt');
    }
  });

  test('GET /api/v1/notes/:id returns note with body and etag', async ({ request }) => {
    const response = await request.get('/api/v1/notes/202401151432');
    expect(response.ok()).toBe(true);
    const note = await response.json();

    expect(note.id).toBe('202401151432');
    expect(note.body).toContain('Sample Note');
    expect(note.etag).toBeTruthy();

    // Etag should also be in the response header
    const etag = response.headers()['etag'];
    expect(etag).toBeTruthy();
  });

  test('GET /api/v1/notes/:id returns 404 for nonexistent note', async ({ request }) => {
    const response = await request.get('/api/v1/notes/999999999999');
    expect(response.status()).toBe(404);
  });

  test('PUT /api/v1/notes/:id creates a new note', async ({ request }) => {
    const now = new Date();
    const newId = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');
    const response = await request.put(`/api/v1/notes/${newId}`, {
      data: { body: '# API Test Note\n\nCreated via API.' },
    });
    expect(response.ok()).toBe(true);
    const note = await response.json();

    expect(note.id).toBe(newId);
    expect(note.body).toContain('API Test Note');
    expect(note.etag).toBeTruthy();

    // Clean up
    await request.delete(`/api/v1/notes/${newId}`);
  });

  test('PUT /api/v1/notes/:id updates existing note', async ({ request }) => {
    // Get current etag
    const getRes = await request.get('/api/v1/notes/202401151433');
    const note = await getRes.json();
    const etag = note.etag;

    // Update with correct etag
    const response = await request.put('/api/v1/notes/202401151433', {
      headers: { 'If-Match': etag },
      data: { body: note.body + '\n\nUpdated via API.' },
    });
    expect(response.ok()).toBe(true);

    // Verify update
    const updated = await response.json();
    expect(updated.body).toContain('Updated via API.');

    // Restore original
    await request.put('/api/v1/notes/202401151433', {
      headers: { 'If-Match': updated.etag },
      data: { body: note.body },
    });
  });

  test('PUT /api/v1/notes/:id returns 409 on etag mismatch', async ({ request }) => {
    const response = await request.put('/api/v1/notes/202401151432', {
      headers: { 'If-Match': 'stale-etag' },
      data: { body: 'This should conflict' },
    });
    expect(response.status()).toBe(409);

    const data = await response.json();
    expect(data.error).toContain('Conflict');
    expect(data).toHaveProperty('currentEtag');
  });

  test('PUT /api/v1/notes/:id rejects missing body', async ({ request }) => {
    const response = await request.put('/api/v1/notes/202401151432', {
      data: {},
    });
    expect(response.status()).toBe(400);
  });

  test('DELETE /api/v1/notes/:id moves note to trash', async ({ request }) => {
    // Create a note to delete
    const id = `${Date.now()}`;
    await request.put(`/api/v1/notes/${id}`, {
      data: { body: '# Delete Test\n\nWill be deleted.' },
    });

    const response = await request.delete(`/api/v1/notes/${id}`);
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.ok).toBe(true);

    // Should be gone from notes list
    const getRes = await request.get(`/api/v1/notes/${id}`);
    expect(getRes.status()).toBe(404);
  });

  test('DELETE /api/v1/notes/:id returns 404 for nonexistent', async ({ request }) => {
    const response = await request.delete('/api/v1/notes/999999999999');
    expect(response.status()).toBe(404);
  });
});

test.describe('Search API', () => {
  test('basic search finds matching notes', async ({ request }) => {
    const response = await request.get('/api/v1/search?q=xylophoneUnicorn42');
    expect(response.ok()).toBe(true);
    const results = await response.json();

    expect(results.length).toBeGreaterThanOrEqual(1);
    const match = results.find((r: { id: string }) => r.id === '202401151433');
    expect(match).toBeDefined();
  });

  test('tag search filters by tag', async ({ request }) => {
    const response = await request.get('/api/v1/search?q=%23test');
    expect(response.ok()).toBe(true);
    const results = await response.json();

    // Both Sample Note and Third Note have #test
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  test('search returns empty for no match', async ({ request }) => {
    const response = await request.get('/api/v1/search?q=zzz_absolutely_no_match_zzz');
    expect(response.ok()).toBe(true);
    const results = await response.json();
    expect(results).toEqual([]);
  });

  test('search rejects empty query', async ({ request }) => {
    const response = await request.get('/api/v1/search?q=');
    expect(response.status()).toBe(400);
  });

  test('search rejects missing query', async ({ request }) => {
    const response = await request.get('/api/v1/search');
    expect(response.status()).toBe(400);
  });

  test('search respects limit parameter', async ({ request }) => {
    const response = await request.get('/api/v1/search?q=Note&limit=1');
    expect(response.ok()).toBe(true);
    const results = await response.json();
    expect(results.length).toBeLessThanOrEqual(1);
  });

  test('search results include match offsets', async ({ request }) => {
    const response = await request.get('/api/v1/search?q=xylophoneUnicorn42');
    expect(response.ok()).toBe(true);
    const results = await response.json();

    expect(results.length).toBeGreaterThan(0);
    // At least one result should have match info
    const withMatches = results.find(
      (r: { snippetMatches?: unknown[]; titleMatches?: unknown[] }) =>
        (r.snippetMatches && r.snippetMatches.length > 0) ||
        (r.titleMatches && r.titleMatches.length > 0),
    );
    expect(withMatches).toBeDefined();
  });
});

test.describe('Auth API', () => {
  test('unauthenticated request returns 401', async ({ request }) => {
    // Use a fresh context without stored auth
    const response = await request.fetch('/api/v1/notes', {
      headers: { Cookie: '' },
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/v1/auth/check confirms session', async ({ request }) => {
    const response = await request.get('/api/v1/auth/check');
    expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual({ ok: true });
  });
});

test.describe('Backlinks API', () => {
  test('returns notes linking to target', async ({ request }) => {
    const response = await request.get('/api/v1/notes/202401151432/backlinks');
    expect(response.ok()).toBe(true);
    const backlinks = await response.json();

    expect(Array.isArray(backlinks)).toBe(true);
    // Third Note links to 202401151432
    const linker = backlinks.find((n: { id: string }) => n.id === '202401151434');
    expect(linker).toBeDefined();
  });

  test('returns empty array for note with no backlinks', async ({ request }) => {
    const response = await request.get('/api/v1/notes/202401151434/backlinks');
    expect(response.ok()).toBe(true);
    const backlinks = await response.json();
    expect(Array.isArray(backlinks)).toBe(true);
    // Third note is not linked to by others
  });

  test('returns 404 for nonexistent note', async ({ request }) => {
    const response = await request.get('/api/v1/notes/999999999999/backlinks');
    expect(response.status()).toBe(404);
  });
});
