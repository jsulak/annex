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

describe('GET /search', () => {
  test('basic search finds matching notes', async () => {
    const res = await http.get('/api/v1/search?q=xylophoneUnicorn42');
    expect(res.ok).toBe(true);
    const results = await res.json();
    expect(results.length).toBeGreaterThanOrEqual(1);
    const match = results.find((r: { id: string }) => r.id === '202401151433');
    expect(match).toBeDefined();
  });

  test('tag search filters by tag', async () => {
    const res = await http.get('/api/v1/search?q=%23test');
    expect(res.ok).toBe(true);
    const results = await res.json();
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  test('search returns empty for no match', async () => {
    const res = await http.get('/api/v1/search?q=zzz_absolutely_no_match_zzz');
    expect(res.ok).toBe(true);
    const results = await res.json();
    expect(results).toEqual([]);
  });

  test('search rejects empty query', async () => {
    const res = await http.get('/api/v1/search?q=');
    expect(res.status).toBe(400);
  });

  test('search rejects missing query', async () => {
    const res = await http.get('/api/v1/search');
    expect(res.status).toBe(400);
  });

  test('search respects limit parameter', async () => {
    const res = await http.get('/api/v1/search?q=Note&limit=1');
    expect(res.ok).toBe(true);
    const results = await res.json();
    expect(results.length).toBeLessThanOrEqual(1);
  });

  test('search results include match offsets', async () => {
    const res = await http.get('/api/v1/search?q=xylophoneUnicorn42');
    expect(res.ok).toBe(true);
    const results = await res.json();
    expect(results.length).toBeGreaterThan(0);
    const withMatches = results.find(
      (r: { snippetMatches?: unknown[]; titleMatches?: unknown[] }) =>
        (r.snippetMatches && r.snippetMatches.length > 0) ||
        (r.titleMatches && r.titleMatches.length > 0),
    );
    expect(withMatches).toBeDefined();
  });
});

describe('search index consistency', () => {
  test('newly created note is immediately searchable', async () => {
    const id = nextId();
    const marker = 'freshNoteMarkerAbx7';
    await http.put(`/api/v1/notes/${id}`, { body: `# ${marker}\n\nSearchable content.` });

    const results = await (await http.get(`/api/v1/search?q=${marker}`)).json();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(id);

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('updated note content is searchable immediately', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Before Update' });

    const markerAfter = 'updatedMarkerKzp4';
    await http.put(`/api/v1/notes/${id}`, { body: `# ${markerAfter}` });

    const results = await (await http.get(`/api/v1/search?q=${markerAfter}`)).json();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(id);

    const oldResults = await (await http.get('/api/v1/search?q=Before%20Update')).json();
    const hasOldMatch = oldResults.some((r: { id: string }) => r.id === id);
    expect(hasOldMatch).toBe(false);

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('deleted note disappears from search', async () => {
    const id = nextId();
    const marker = 'uniqueDeleteMarkerQzx9';
    await http.put(`/api/v1/notes/${id}`, { body: `# ${marker}` });

    const searchBefore = await (await http.get(`/api/v1/search?q=${marker}`)).json();
    expect(searchBefore.length).toBeGreaterThan(0);

    await http.delete(`/api/v1/notes/${id}`);

    const searchAfter = await (await http.get(`/api/v1/search?q=${marker}`)).json();
    expect(searchAfter.length).toBe(0);
  });

  test('tags are searchable after save', async () => {
    const id = nextId();
    const tag = 'integritytesttag';
    await http.put(`/api/v1/notes/${id}`, { body: `# Tag Test\n\n#${tag}` });

    const results = await (await http.get(`/api/v1/search?q=%23${tag}`)).json();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(id);

    await http.delete(`/api/v1/notes/${id}`);
  });
});
