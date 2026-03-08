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

  test('#tags become plain search terms', () => {
    const q = parseQuery('#javascript #react');
    expect(q.tags).toEqual([]);
    expect(q.terms).toEqual(['javascript', 'react']);
  });

  test('#tags are lowercased as search terms', () => {
    const q = parseQuery('#JavaScript');
    expect(q.terms).toEqual(['javascript']);
    expect(q.tags).toEqual([]);
  });

  test('parses NOT negations', () => {
    const q = parseQuery('search NOT excluded');
    expect(q.terms).toEqual(['search']);
    expect(q.negations).toEqual(['excluded']);
  });

  test('parses complex query with all parts', () => {
    const q = parseQuery('hello #tag "exact match" NOT bad');
    expect(q.terms).toEqual(['hello', 'tag']);
    expect(q.tags).toEqual([]);
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

  test('handles multiple NOT terms', () => {
    const q = parseQuery('search NOT bad NOT ugly');
    expect(q.terms).toEqual(['search']);
    expect(q.negations).toEqual(['bad', 'ugly']);
  });

  test('#tag with hyphens and underscores become search terms', () => {
    const q = parseQuery('#my-tag #my_tag');
    expect(q.terms).toEqual(['my-tag', 'my_tag']);
    expect(q.tags).toEqual([]);
  });

  test('whitespace-only query produces empty result', () => {
    const q = parseQuery('   ');
    expect(q.terms).toEqual([]);
    expect(q.phrases).toEqual([]);
    expect(q.tags).toEqual([]);
    expect(q.negations).toEqual([]);
  });

  test('unclosed quote is treated as plain terms', () => {
    const q = parseQuery('"unclosed phrase');
    // The regex requires closing quote, so this becomes a plain term
    expect(q.terms).toContain('"unclosed');
  });

  test('NOT at end of query without following word', () => {
    const q = parseQuery('search NOT');
    // NOT without a following word stays as a plain term
    expect(q.terms).toContain('search');
    expect(q.terms).toContain('NOT');
    expect(q.negations).toEqual([]);
  });

  test('lowercase not is not treated as negation', () => {
    const q = parseQuery('do not worry');
    expect(q.terms).toEqual(['do', 'not', 'worry']);
    expect(q.negations).toEqual([]);
  });

  test('phrase combined with #tag and term', () => {
    const q = parseQuery('#urgent "by tomorrow" meeting');
    expect(q.tags).toEqual([]);
    expect(q.phrases).toEqual(['by tomorrow']);
    expect(q.terms).toEqual(['urgent', 'meeting']);
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

  test('#tag search finds notes by text content', async () => {
    const id1 = nextId();
    const id2 = nextId();
    const id3 = nextId();
    await http.put(`/api/v1/notes/${id1}`, { body: '# With Tag\n\n#uniqueSearchTag99' });
    await http.put(`/api/v1/notes/${id2}`, { body: '# Plain Text\n\nJust text mentioning uniqueSearchTag99' });
    await http.put(`/api/v1/notes/${id3}`, { body: '# Unrelated\n\nNo match here at all.' });

    const results = await (await http.get('/api/v1/search?q=%23uniqueSearchTag99')).json();
    // Both notes with the word should match (tag search is now text-based)
    expect(results.some((r: { id: string }) => r.id === id1)).toBe(true);
    expect(results.some((r: { id: string }) => r.id === id2)).toBe(true);
    // Unrelated note should not match
    expect(results.some((r: { id: string }) => r.id === id3)).toBe(false);

    await http.delete(`/api/v1/notes/${id1}`);
    await http.delete(`/api/v1/notes/${id2}`);
    await http.delete(`/api/v1/notes/${id3}`);
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

  test('search finds notes by filename when term is not in title or body', async () => {
    // The seed note "runx Test Note.md" has title "Unique Seed Heading".
    // Searching "runx" should find it via the indexed filename.
    const results = await (await http.get('/api/v1/search?q=runx')).json();
    expect(results.some((r: { filename: string }) => r.filename === 'runx Test Note.md')).toBe(true);
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

describe('search — hashtag as text search', () => {
  test('#tag search finds notes containing that tag in body text', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Devops Note\n\nThis note is about #devopsUniq99 practices.' });

    const results = await (await http.get('/api/v1/search?q=%23devopsUniq99')).json();
    expect(results.some((r: { id: string }) => r.id === id)).toBe(true);

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('#tag search does not match notes without the tag', async () => {
    const id1 = nextId();
    const id2 = nextId();
    await http.put(`/api/v1/notes/${id1}`, { body: '# Tagged\n\nHas #zTestOnlyTag77 here.' });
    await http.put(`/api/v1/notes/${id2}`, { body: '# Untagged\n\nJust mentions zTestOnlyTag77 without hash.' });

    const results = await (await http.get('/api/v1/search?q=%23zTestOnlyTag77')).json();
    expect(results.some((r: { id: string }) => r.id === id1)).toBe(true);
    // id2 has the word but not the #tag — should still match since we treat as text
    expect(results.some((r: { id: string }) => r.id === id2)).toBe(true);

    await http.delete(`/api/v1/notes/${id1}`);
    await http.delete(`/api/v1/notes/${id2}`);
  });

  test('#tag combined with plain term narrows results', async () => {
    const id1 = nextId();
    const id2 = nextId();
    await http.put(`/api/v1/notes/${id1}`, { body: '# Both\n\n#zComboUniq88 and specialWord88' });
    await http.put(`/api/v1/notes/${id2}`, { body: '# Just Tag\n\n#zComboUniq88 only' });

    const results = await (await http.get('/api/v1/search?q=%23zComboUniq88%20specialWord88')).json();
    expect(results.some((r: { id: string }) => r.id === id1)).toBe(true);
    expect(results.some((r: { id: string }) => r.id === id2)).toBe(false);

    await http.delete(`/api/v1/notes/${id1}`);
    await http.delete(`/api/v1/notes/${id2}`);
  });

  test('seed note with #test tag is found by searching #test', async () => {
    // Sample Note and Third Note both have #test in their body
    const results = await (await http.get('/api/v1/search?q=%23test')).json();
    expect(results.some((r: { filename: string }) => r.filename === '202401151432 Sample Note.md')).toBe(true);
    expect(results.some((r: { filename: string }) => r.filename === '202401151434 Third Note.md')).toBe(true);
  });
});

describe('search — case sensitivity', () => {
  test('search is case-insensitive', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# CamelCase Title\n\nMixedCaseContent99' });

    const lower = await (await http.get('/api/v1/search?q=mixedcasecontent99')).json();
    expect(lower.some((r: { id: string }) => r.id === id)).toBe(true);

    const upper = await (await http.get('/api/v1/search?q=MIXEDCASECONTENT99')).json();
    expect(upper.some((r: { id: string }) => r.id === id)).toBe(true);

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('phrase search is case-insensitive', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Phrase Case\n\nThe Quick Brown Fox 77z' });

    const results = await (await http.get('/api/v1/search?q=%22the%20quick%20brown%22')).json();
    expect(results.some((r: { id: string }) => r.id === id)).toBe(true);

    await http.delete(`/api/v1/notes/${id}`);
  });
});

describe('search — result structure', () => {
  test('results include titleMatches offsets', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# uniqOffsetWord88 Title\n\nBody here.' });

    const results = await (await http.get('/api/v1/search?q=uniqOffsetWord88')).json();
    const match = results.find((r: { id: string }) => r.id === id);
    expect(match).toBeDefined();
    expect(match.titleMatches.length).toBeGreaterThan(0);
    expect(match.titleMatches[0]).toEqual([0, 'uniqOffsetWord88'.length]);

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('results include snippetMatches offsets', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Title\n\nSome text with uniqSnipWord44 embedded.' });

    const results = await (await http.get('/api/v1/search?q=uniqSnipWord44')).json();
    const match = results.find((r: { id: string }) => r.id === id);
    expect(match).toBeDefined();
    expect(match.snippetMatches.length).toBeGreaterThan(0);

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('search results include all expected fields', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# FieldCheck22\n\nContent with #fieldtag and [[link]].' });

    const results = await (await http.get('/api/v1/search?q=FieldCheck22')).json();
    const match = results.find((r: { id: string }) => r.id === id);
    expect(match).toBeDefined();
    expect(match).toHaveProperty('id');
    expect(match).toHaveProperty('filename');
    expect(match).toHaveProperty('title');
    expect(match).toHaveProperty('snippet');
    expect(match).toHaveProperty('tags');
    expect(match).toHaveProperty('links');
    expect(match).toHaveProperty('createdAt');
    expect(match).toHaveProperty('modifiedAt');
    expect(match).toHaveProperty('titleMatches');
    expect(match).toHaveProperty('snippetMatches');
    expect(match.tags).toContain('fieldtag');
    expect(match.links).toContain('link');

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('snippet is generated around match context', async () => {
    const id = nextId();
    const padding = 'x'.repeat(100);
    await http.put(`/api/v1/notes/${id}`, { body: `# Title\n\n${padding} uniqDeepWord33 ${padding}` });

    const results = await (await http.get('/api/v1/search?q=uniqDeepWord33')).json();
    const match = results.find((r: { id: string }) => r.id === id);
    expect(match).toBeDefined();
    expect(match.snippet).toContain('uniqDeepWord33');
    // Snippet should be truncated, not the full body
    expect(match.snippet.length).toBeLessThan(200);

    await http.delete(`/api/v1/notes/${id}`);
  });
});

describe('search — edge cases and validation', () => {
  test('empty query returns 400', async () => {
    const res = await http.get('/api/v1/search?q=');
    expect(res.status).toBe(400);
  });

  test('missing q parameter returns 400', async () => {
    const res = await http.get('/api/v1/search');
    expect(res.status).toBe(400);
  });

  test('whitespace-only query returns 400', async () => {
    const res = await http.get('/api/v1/search?q=%20%20');
    expect(res.status).toBe(400);
  });

  test('no results returns empty array', async () => {
    const results = await (await http.get('/api/v1/search?q=zzNoSuchTermEverExistsQ9x')).json();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  test('limit parameter caps results', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = nextId();
      ids.push(id);
      await http.put(`/api/v1/notes/${id}`, { body: `# Note ${i}\n\nsharedLimitTerm88` });
    }

    const results = await (await http.get('/api/v1/search?q=sharedLimitTerm88&limit=2')).json();
    expect(results.length).toBe(2);

    for (const id of ids) await http.delete(`/api/v1/notes/${id}`);
  });

  test('search requires authentication', async () => {
    const res = await http.unauthed('GET', '/api/v1/search?q=test');
    expect(res.status).toBe(401);
  });
});

describe('search — multiple NOT terms', () => {
  test('multiple NOT terms all exclude', async () => {
    const id1 = nextId();
    const id2 = nextId();
    const id3 = nextId();
    await http.put(`/api/v1/notes/${id1}`, { body: '# Clean\n\nuniqMultiNot44 good' });
    await http.put(`/api/v1/notes/${id2}`, { body: '# HasBad\n\nuniqMultiNot44 bad' });
    await http.put(`/api/v1/notes/${id3}`, { body: '# HasUgly\n\nuniqMultiNot44 ugly' });

    const results = await (await http.get('/api/v1/search?q=uniqMultiNot44%20NOT%20bad%20NOT%20ugly')).json();
    expect(results.some((r: { id: string }) => r.id === id1)).toBe(true);
    expect(results.some((r: { id: string }) => r.id === id2)).toBe(false);
    expect(results.some((r: { id: string }) => r.id === id3)).toBe(false);

    await http.delete(`/api/v1/notes/${id1}`);
    await http.delete(`/api/v1/notes/${id2}`);
    await http.delete(`/api/v1/notes/${id3}`);
  });
});

describe('search — #tag combinations', () => {
  test('multiple #tags require all terms present (AND logic)', async () => {
    const id1 = nextId();
    const id2 = nextId();
    const id3 = nextId();
    await http.put(`/api/v1/notes/${id1}`, { body: '# Both Tags\n\n#zTagAlpha9 #zTagBeta9' });
    await http.put(`/api/v1/notes/${id2}`, { body: '# One Tag\n\n#zTagAlpha9 only' });
    await http.put(`/api/v1/notes/${id3}`, { body: '# Other Tag\n\n#zTagBeta9 only' });

    const results = await (await http.get('/api/v1/search?q=%23zTagAlpha9%20%23zTagBeta9')).json();
    expect(results.some((r: { id: string }) => r.id === id1)).toBe(true);
    expect(results.some((r: { id: string }) => r.id === id2)).toBe(false);
    expect(results.some((r: { id: string }) => r.id === id3)).toBe(false);

    await http.delete(`/api/v1/notes/${id1}`);
    await http.delete(`/api/v1/notes/${id2}`);
    await http.delete(`/api/v1/notes/${id3}`);
  });

  test('#tag combined with text term narrows results', async () => {
    const id1 = nextId();
    const id2 = nextId();
    await http.put(`/api/v1/notes/${id1}`, { body: '# Tagged\n\nuniqCombo55 #zComboTag' });
    await http.put(`/api/v1/notes/${id2}`, { body: '# Untagged\n\nuniqCombo55' });

    const results = await (await http.get('/api/v1/search?q=uniqCombo55%20%23zComboTag')).json();
    expect(results.some((r: { id: string }) => r.id === id1)).toBe(true);
    expect(results.some((r: { id: string }) => r.id === id2)).toBe(false);

    await http.delete(`/api/v1/notes/${id1}`);
    await http.delete(`/api/v1/notes/${id2}`);
  });
});

describe('search — index updates', () => {
  test('deleted note no longer appears in search', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# DeleteSearch77\n\nuniqDeleteTerm77' });

    let results = await (await http.get('/api/v1/search?q=uniqDeleteTerm77')).json();
    expect(results.some((r: { id: string }) => r.id === id)).toBe(true);

    await http.delete(`/api/v1/notes/${id}`);

    results = await (await http.get('/api/v1/search?q=uniqDeleteTerm77')).json();
    expect(results.some((r: { id: string }) => r.id === id)).toBe(false);
  });

  test('updated note content is immediately searchable', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Original\n\norigContent99z' });

    // Original term findable
    let results = await (await http.get('/api/v1/search?q=origContent99z')).json();
    expect(results.some((r: { id: string }) => r.id === id)).toBe(true);

    // Update with new content
    await http.put(`/api/v1/notes/${id}`, { body: '# Updated\n\nnewContent99z' });

    // New term findable
    results = await (await http.get('/api/v1/search?q=newContent99z')).json();
    expect(results.some((r: { id: string }) => r.id === id)).toBe(true);

    // Old term no longer findable
    results = await (await http.get('/api/v1/search?q=origContent99z')).json();
    expect(results.some((r: { id: string }) => r.id === id)).toBe(false);

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('search finds title match in note heading', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# UniqTitleSearch88\n\nPlain body here.' });

    const results = await (await http.get('/api/v1/search?q=UniqTitleSearch88')).json();
    expect(results.some((r: { id: string }) => r.id === id)).toBe(true);

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('search after rename still finds by new filename', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Generic Title\n\nGeneric body.' });

    await http.post(`/api/v1/notes/${id}/rename`, { newFilename: `${id} uniqRenameFind88.md` });

    const results = await (await http.get('/api/v1/search?q=uniqRenameFind88')).json();
    expect(results.some((r: { id: string }) => r.id === id)).toBe(true);

    await http.delete(`/api/v1/notes/${id}`);
  });
});

describe('search — forward matching', () => {
  test('prefix search matches word beginnings', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Forward\n\nantidisestablishment99' });

    // Forward tokenizer should match prefixes
    const results = await (await http.get('/api/v1/search?q=antidis')).json();
    expect(results.some((r: { id: string }) => r.id === id)).toBe(true);

    await http.delete(`/api/v1/notes/${id}`);
  });
});
