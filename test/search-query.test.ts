import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { parseQuery } from '../server/lib/searchIndex.js';
import { startTestServer, stopTestServer, api, nextId, type TestContext } from './setup.js';

describe('parseQuery', () => {
  test('parses plain terms', () => {
    const q = parseQuery('hello world');
    expect(q.terms).toEqual(['hello', 'world']);
    expect(q.phrases).toEqual([]);
    expect(q.tags).toEqual([]);
    expect(q.negations).toEqual([]);
  });

  test('parses quoted phrases', () => {
    const q = parseQuery('"exact phrase" other');
    expect(q.phrases).toEqual(['exact phrase']);
    expect(q.terms).toEqual(['other']);
  });

  test('parses multiple quoted phrases', () => {
    const q = parseQuery('"first phrase" "second phrase"');
    expect(q.phrases).toEqual(['first phrase', 'second phrase']);
  });

  test('parses #tags', () => {
    const q = parseQuery('#javascript #react');
    expect(q.tags).toEqual(['javascript', 'react']);
    expect(q.terms).toEqual([]);
  });

  test('tags are lowercased', () => {
    const q = parseQuery('#JavaScript');
    expect(q.tags).toEqual(['javascript']);
  });

  test('parses NOT negations', () => {
    const q = parseQuery('search NOT excluded');
    expect(q.terms).toEqual(['search']);
    expect(q.negations).toEqual(['excluded']);
  });

  test('parses complex query with all parts', () => {
    const q = parseQuery('hello #tag "exact match" NOT bad');
    expect(q.terms).toEqual(['hello']);
    expect(q.tags).toEqual(['tag']);
    expect(q.phrases).toEqual(['exact match']);
    expect(q.negations).toEqual(['bad']);
  });

  test('handles empty query', () => {
    const q = parseQuery('');
    expect(q.terms).toEqual([]);
    expect(q.phrases).toEqual([]);
    expect(q.tags).toEqual([]);
    expect(q.negations).toEqual([]);
  });
});

// Integration tests for search behavior
let ctx: TestContext;
let http: ReturnType<typeof api>;

beforeAll(async () => {
  ctx = await startTestServer();
  http = api(ctx);
});

afterAll(async () => {
  await stopTestServer(ctx);
});

describe('search behavior', () => {
  test('phrase search returns exact matches', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Phrase Test\n\nThe quick brown fox jumps over.' });

    const exact = await (await http.get('/api/v1/search?q=%22quick%20brown%22')).json();
    expect(exact.some((r: { id: string }) => r.id === id)).toBe(true);

    const noMatch = await (await http.get('/api/v1/search?q=%22quick%20fox%22')).json();
    expect(noMatch.some((r: { id: string }) => r.id === id)).toBe(false);

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('NOT excludes matching notes', async () => {
    const id1 = nextId();
    const id2 = nextId();
    await http.put(`/api/v1/notes/${id1}`, { body: '# Alpha\n\nuniqSearchTermAlpha good content' });
    await http.put(`/api/v1/notes/${id2}`, { body: '# Beta\n\nuniqSearchTermAlpha bad content' });

    const results = await (await http.get('/api/v1/search?q=uniqSearchTermAlpha%20NOT%20bad')).json();
    expect(results.some((r: { id: string }) => r.id === id1)).toBe(true);
    expect(results.some((r: { id: string }) => r.id === id2)).toBe(false);

    await http.delete(`/api/v1/notes/${id1}`);
    await http.delete(`/api/v1/notes/${id2}`);
  });

  test('tag search filters by tag only', async () => {
    const id1 = nextId();
    const id2 = nextId();
    await http.put(`/api/v1/notes/${id1}`, { body: '# With Tag\n\n#uniqueSearchTag99' });
    await http.put(`/api/v1/notes/${id2}`, { body: '# Without Tag\n\nJust text mentioning uniqueSearchTag99' });

    const results = await (await http.get('/api/v1/search?q=%23uniqueSearchTag99')).json();
    expect(results.some((r: { id: string }) => r.id === id1)).toBe(true);
    // id2 doesn't have the tag — only mentions it as plain text
    expect(results.some((r: { id: string }) => r.id === id2)).toBe(false);

    await http.delete(`/api/v1/notes/${id1}`);
    await http.delete(`/api/v1/notes/${id2}`);
  });

  test('AND logic: all terms must match', async () => {
    const id1 = nextId();
    const id2 = nextId();
    await http.put(`/api/v1/notes/${id1}`, { body: '# Both\n\nuniqTermAlpha7 uniqTermBeta7' });
    await http.put(`/api/v1/notes/${id2}`, { body: '# One\n\nuniqTermAlpha7 only' });

    const results = await (await http.get('/api/v1/search?q=uniqTermAlpha7%20uniqTermBeta7')).json();
    expect(results.some((r: { id: string }) => r.id === id1)).toBe(true);
    expect(results.some((r: { id: string }) => r.id === id2)).toBe(false);

    await http.delete(`/api/v1/notes/${id1}`);
    await http.delete(`/api/v1/notes/${id2}`);
  });

  test('search after rename still finds note', async () => {
    const id = nextId();
    const marker = 'renameSearchUniq3';
    await http.put(`/api/v1/notes/${id}`, { body: `# ${marker}\n\nContent.` });

    await http.post(`/api/v1/notes/${id}/rename`, { newFilename: `${id} Renamed Search.md` });

    const results = await (await http.get(`/api/v1/search?q=${marker}`)).json();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(id);

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('search results sorted by modifiedAt descending', async () => {
    const id1 = nextId();
    const id2 = nextId();
    await http.put(`/api/v1/notes/${id1}`, { body: '# SortTestUniq1\n\nsharedSortTerm77' });
    await new Promise((r) => setTimeout(r, 50));
    await http.put(`/api/v1/notes/${id2}`, { body: '# SortTestUniq2\n\nsharedSortTerm77' });

    const results = await (await http.get('/api/v1/search?q=sharedSortTerm77')).json();
    expect(results.length).toBe(2);
    expect(results[0].id).toBe(id2); // newer first

    await http.delete(`/api/v1/notes/${id1}`);
    await http.delete(`/api/v1/notes/${id2}`);
  });
});
