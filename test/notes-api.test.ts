import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, stopTestServer, api, nextId, type TestContext } from './setup.js';

let ctx: TestContext;
let http: ReturnType<typeof api>;

beforeAll(async () => {
  ctx = await startTestServer();
  http = api(ctx);
});

afterAll(async () => {
  await stopTestServer(ctx);
});

describe('GET /notes', () => {
  test('returns all notes', async () => {
    const res = await http.get('/api/v1/notes');
    expect(res.ok).toBe(true);
    const notes = await res.json();
    expect(Array.isArray(notes)).toBe(true);
    expect(notes.length).toBeGreaterThanOrEqual(3);
    for (const note of notes) {
      expect(note).toHaveProperty('id');
      expect(note).toHaveProperty('filename');
      expect(note).toHaveProperty('title');
      expect(note).toHaveProperty('tags');
      expect(note).toHaveProperty('modifiedAt');
    }
  });

  test('list is sorted by modifiedAt descending', async () => {
    const notes = await (await http.get('/api/v1/notes')).json();
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i - 1].modifiedAt >= notes[i].modifiedAt).toBe(true);
    }
  });

  test('each note has a unique ID', async () => {
    const notes = await (await http.get('/api/v1/notes')).json();
    const ids = notes.map((n: { id: string }) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('GET /notes/:id', () => {
  test('returns note with body and etag', async () => {
    const res = await http.get('/api/v1/notes/202401151432');
    expect(res.ok).toBe(true);
    const note = await res.json();
    expect(note.id).toBe('202401151432');
    expect(note.body).toContain('Sample Note');
    expect(note.etag).toBeTruthy();
    expect(res.headers.get('etag')).toBeTruthy();
  });

  test('returns 404 for nonexistent note', async () => {
    const res = await http.get('/api/v1/notes/999999999999');
    expect(res.status).toBe(404);
  });
});

describe('PUT /notes/:id', () => {
  test('creates a new note', async () => {
    const id = nextId();
    const res = await http.put(`/api/v1/notes/${id}`, { body: '# API Test Note\n\nCreated via API.' });
    expect(res.ok).toBe(true);
    const note = await res.json();
    expect(note.id).toBe(id);
    expect(note.body).toContain('API Test Note');
    expect(note.etag).toBeTruthy();
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('updates existing note with correct etag', async () => {
    const getRes = await http.get('/api/v1/notes/202401151433');
    const note = await getRes.json();

    const res = await http.put('/api/v1/notes/202401151433',
      { body: note.body + '\n\nUpdated via API.' },
      { 'If-Match': note.etag },
    );
    expect(res.ok).toBe(true);
    const updated = await res.json();
    expect(updated.body).toContain('Updated via API.');

    // Restore original
    await http.put('/api/v1/notes/202401151433',
      { body: note.body },
      { 'If-Match': updated.etag },
    );
  });

  test('returns 409 on etag mismatch', async () => {
    const res = await http.put('/api/v1/notes/202401151432',
      { body: 'This should conflict' },
      { 'If-Match': 'stale-etag' },
    );
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain('Conflict');
    expect(data).toHaveProperty('currentEtag');
  });

  test('rejects missing body', async () => {
    const res = await http.put('/api/v1/notes/202401151432', {});
    expect(res.status).toBe(400);
  });
});

describe('DELETE /notes/:id', () => {
  test('moves note to trash', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Delete Test' });

    const res = await http.delete(`/api/v1/notes/${id}`);
    expect(res.ok).toBe(true);
    expect((await res.json()).ok).toBe(true);

    const getRes = await http.get(`/api/v1/notes/${id}`);
    expect(getRes.status).toBe(404);
  });

  test('returns 404 for nonexistent note', async () => {
    const res = await http.delete('/api/v1/notes/999999999999');
    expect(res.status).toBe(404);
  });

  test('double delete returns 404 on second attempt', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Double Delete' });
    await http.delete(`/api/v1/notes/${id}`);
    const res = await http.delete(`/api/v1/notes/${id}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /notes/:id/rename', () => {
  test('preserves note content', async () => {
    const id = nextId();
    const body = '# Rename Content Test\n\nImportant data here.';
    await http.put(`/api/v1/notes/${id}`, { body });

    const res = await http.post(`/api/v1/notes/${id}/rename`, { newFilename: `${id} Renamed.md` });
    expect(res.ok).toBe(true);

    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.body).toBe(body);
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('updates filename in list', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Pre-Rename' });
    await http.post(`/api/v1/notes/${id}/rename`, { newFilename: `${id} New Name.md` });

    const list = await (await http.get('/api/v1/notes')).json();
    const note = list.find((n: { id: string }) => n.id === id);
    expect(note).toBeDefined();
    expect(note.filename).toBe(`${id} New Name.md`);
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('collision returns 409', async () => {
    const id1 = nextId();
    const id2 = nextId();
    await http.put(`/api/v1/notes/${id1}`, { body: '# First' });
    await http.put(`/api/v1/notes/${id2}`, { body: '# Second' });

    const list = await (await http.get('/api/v1/notes')).json();
    const note1 = list.find((n: { id: string }) => n.id === id1);

    const res = await http.post(`/api/v1/notes/${id2}/rename`, { newFilename: note1.filename });
    expect(res.status).toBe(409);

    // Both notes still intact
    expect((await (await http.get(`/api/v1/notes/${id1}`)).json()).body).toBe('# First');
    expect((await (await http.get(`/api/v1/notes/${id2}`)).json()).body).toBe('# Second');
    await http.delete(`/api/v1/notes/${id1}`);
    await http.delete(`/api/v1/notes/${id2}`);
  });

  test('nonexistent note returns 404', async () => {
    const res = await http.post('/api/v1/notes/000000000000/rename', { newFilename: 'anything.md' });
    expect(res.status).toBe(404);
  });

  test('adds .md if missing', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Ext Test' });
    const res = await http.post(`/api/v1/notes/${id}/rename`, { newFilename: `${id} No Extension` });
    expect(res.ok).toBe(true);
    expect((await res.json()).filename).toMatch(/\.md$/);
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('does not double .md extension', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Ext Test' });
    await http.post(`/api/v1/notes/${id}/rename`, { newFilename: `${id} Already.md` });

    const list = await (await http.get('/api/v1/notes')).json();
    const note = list.find((n: { id: string }) => n.id === id);
    expect(note.filename).toBe(`${id} Already.md`);
    expect(note.filename).not.toContain('.md.md');
    await http.delete(`/api/v1/notes/${id}`);
  });
});

describe('note list count consistency', () => {
  test('count correct after create/delete cycle', async () => {
    const before = await (await http.get('/api/v1/notes')).json();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = nextId();
      ids.push(id);
      await http.put(`/api/v1/notes/${id}`, { body: `# Batch ${i}` });
    }
    const after = await (await http.get('/api/v1/notes')).json();
    expect(after.length).toBe(before.length + 5);

    for (const id of ids) await http.delete(`/api/v1/notes/${id}`);

    const final = await (await http.get('/api/v1/notes')).json();
    expect(final.length).toBe(before.length);
  });
});
