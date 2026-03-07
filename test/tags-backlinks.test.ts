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

describe('tags API', () => {
  test('tags endpoint reflects saved tags', async () => {
    const id = nextId();
    const tag = 'uniquetagzqx8';
    await http.put(`/api/v1/notes/${id}`, { body: `# Tag EP Test\n\n#${tag}` });

    const tags = await (await http.get('/api/v1/tags')).json();
    const found = tags.find((t: { tag: string }) => t.tag === tag);
    expect(found).toBeDefined();
    expect(found.count).toBe(1);

    await http.delete(`/api/v1/notes/${id}`);
  });
});

describe('metadata extraction', () => {
  test('title extracted from first heading', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# My Custom Title\n\nBody text.' });

    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.title).toBe('My Custom Title');

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('title falls back to Untitled when no heading', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: 'No heading here, just text.' });

    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.title).toBe('Untitled');

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('tags extracted correctly from body', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, {
      body: '# Tags Test\n\n#alpha #beta-test #CamelCase\n\nInline #delta here.',
    });

    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.tags).toContain('alpha');
    expect(note.tags).toContain('beta-test');
    expect(note.tags).toContain('camelcase');
    expect(note.tags).toContain('delta');

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('wiki-links extracted from body', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, {
      body: '# Links Test\n\nSee [[202401151432]] and [[Some Title]].',
    });

    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.links).toContain('202401151432');
    expect(note.links).toContain('Some Title');

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('heading markers not confused with tags', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, {
      body: '# Heading\n\n## Subheading\n\n### Third level\n\nReal #tag here.',
    });

    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.tags).not.toContain('heading');
    expect(note.tags).not.toContain('subheading');
    expect(note.tags).toContain('tag');

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('note with many tags extracts all of them', async () => {
    const id = nextId();
    const tags = Array.from({ length: 50 }, (_, i) => `#tag${i}`);
    const body = `# Many Tags\n\n${tags.join(' ')}`;
    await http.put(`/api/v1/notes/${id}`, { body });

    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.tags.length).toBe(50);

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('note with many wiki-links extracts all of them', async () => {
    const id = nextId();
    const links = Array.from({ length: 30 }, (_, i) => `[[link${i}]]`);
    const body = `# Many Links\n\n${links.join(' ')}`;
    await http.put(`/api/v1/notes/${id}`, { body });

    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.links.length).toBe(30);

    await http.delete(`/api/v1/notes/${id}`);
  });
});

describe('backlinks API', () => {
  test('returns notes linking to target', async () => {
    const res = await http.get('/api/v1/notes/202401151432/backlinks');
    expect(res.ok).toBe(true);
    const backlinks = await res.json();
    expect(Array.isArray(backlinks)).toBe(true);
    const linker = backlinks.find((n: { id: string }) => n.id === '202401151434');
    expect(linker).toBeDefined();
  });

  test('returns empty array for note with no backlinks', async () => {
    const res = await http.get('/api/v1/notes/202401151434/backlinks');
    expect(res.ok).toBe(true);
    const backlinks = await res.json();
    expect(Array.isArray(backlinks)).toBe(true);
  });

  test('returns 404 for nonexistent note', async () => {
    const res = await http.get('/api/v1/notes/999999999999/backlinks');
    expect(res.status).toBe(404);
  });

  test('creating a note with wiki-link makes it appear in backlinks', async () => {
    const targetId = '202401151432';
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, {
      body: `# Backlink Source\n\nReferences [[${targetId}]].`,
    });

    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.links).toContain(targetId);

    const backlinks = await (await http.get(`/api/v1/notes/${targetId}/backlinks`)).json();
    const found = backlinks.find((n: { id: string }) => n.id === id);
    expect(found).toBeDefined();

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('deleting a linking note removes it from backlinks', async () => {
    const targetId = '202401151432';
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, {
      body: `# Temp Linker\n\n[[${targetId}]]`,
    });

    await http.delete(`/api/v1/notes/${id}`);

    const backlinks = await (await http.get(`/api/v1/notes/${targetId}/backlinks`)).json();
    const found = backlinks.find((n: { id: string }) => n.id === id);
    expect(found).toBeUndefined();
  });

  test('updating note to remove wiki-link removes it from backlinks', async () => {
    const targetId = '202401151432';
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, {
      body: `# Linker\n\n[[${targetId}]]`,
    });

    let backlinks = await (await http.get(`/api/v1/notes/${targetId}/backlinks`)).json();
    expect(backlinks.find((n: { id: string }) => n.id === id)).toBeDefined();

    await http.put(`/api/v1/notes/${id}`, { body: '# Linker\n\nNo more link.' });

    backlinks = await (await http.get(`/api/v1/notes/${targetId}/backlinks`)).json();
    expect(backlinks.find((n: { id: string }) => n.id === id)).toBeUndefined();

    await http.delete(`/api/v1/notes/${id}`);
  });
});
