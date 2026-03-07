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

describe('content preservation', () => {
  test('body survives save/load roundtrip exactly', async () => {
    const id = nextId();
    const body = '# Roundtrip Test\n\nLine with **bold** and *italic*.\n\n- list item\n- another\n';
    await http.put(`/api/v1/notes/${id}`, { body });
    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.body).toBe(body);
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('unicode and emoji preserved', async () => {
    const id = nextId();
    const body = '# Unicode Test 🎉\n\nCafé résumé naïve. 日本語テスト。Ñoño. 数学: ∑∏∫\n\nEmoji: 🧠💡🔗📝\n';
    await http.put(`/api/v1/notes/${id}`, { body });
    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.body).toBe(body);
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('CRLF normalized to LF', async () => {
    const id = nextId();
    const input = '# CRLF Test\r\n\r\nLine one.\r\nLine two.\r\n';
    const expected = '# CRLF Test\n\nLine one.\nLine two.\n';
    await http.put(`/api/v1/notes/${id}`, { body: input });
    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.body).toBe(expected);
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('special markdown characters preserved', async () => {
    const id = nextId();
    const body = '# Special Chars\n\nBackslash: \\\nPipe: | col1 | col2 |\nBacktick: `code`\nAngle: <div>not html</div>\nBrackets: [[wikilink]] and [link](url)\n';
    await http.put(`/api/v1/notes/${id}`, { body });
    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.body).toBe(body);
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('empty body preserved', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '' });
    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.body).toBe('');
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('whitespace-only body preserved', async () => {
    const id = nextId();
    const body = '   \n\n  \n';
    await http.put(`/api/v1/notes/${id}`, { body });
    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.body).toBe(body);
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('large note content preserved (~100KB)', async () => {
    const id = nextId();
    const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20) + '\n\n';
    const body = '# Large Note\n\n' + paragraph.repeat(50);
    await http.put(`/api/v1/notes/${id}`, { body });
    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.body).toBe(body);
    expect(note.body.length).toBe(body.length);
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('very long single line preserved', async () => {
    const id = nextId();
    const body = '# Long Line\n\n' + 'x'.repeat(50000);
    await http.put(`/api/v1/notes/${id}`, { body });
    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.body).toBe(body);
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('JSON-special characters in body', async () => {
    const id = nextId();
    const body = '# JSON Edge Cases\n\n"quotes" and \\backslashes\\ and \ttabs\nand null: \0';
    await http.put(`/api/v1/notes/${id}`, { body });
    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.body).toBe(body);
    await http.delete(`/api/v1/notes/${id}`);
  });
});

describe('etag and conflict detection', () => {
  test('etag changes after save', async () => {
    const id = nextId();
    const etag1 = (await (await http.put(`/api/v1/notes/${id}`, { body: 'v1' })).json()).etag;
    await new Promise((r) => setTimeout(r, 50));
    const etag2 = (await (await http.put(`/api/v1/notes/${id}`, { body: 'v2' })).json()).etag;
    expect(etag1).not.toBe(etag2);
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('stale etag returns 409 and preserves content', async () => {
    const id = nextId();
    const staleEtag = (await (await http.put(`/api/v1/notes/${id}`, { body: 'v1' })).json()).etag;
    await new Promise((r) => setTimeout(r, 50));
    await http.put(`/api/v1/notes/${id}`, { body: 'v2' });

    const conflictRes = await http.put(`/api/v1/notes/${id}`, { body: 'v3 - conflict' }, { 'If-Match': staleEtag });
    expect(conflictRes.status).toBe(409);
    const data = await conflictRes.json();
    expect(data.currentEtag).toBeTruthy();
    expect(data.currentEtag).not.toBe(staleEtag);

    // v2 preserved
    const note = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(note.body).toBe('v2');
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('force save without If-Match always succeeds', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: 'v1' });
    await new Promise((r) => setTimeout(r, 50));
    await http.put(`/api/v1/notes/${id}`, { body: 'v2' });

    const res = await http.put(`/api/v1/notes/${id}`, { body: 'v3 - forced' });
    expect(res.ok).toBe(true);
    expect((await (await http.get(`/api/v1/notes/${id}`)).json()).body).toBe('v3 - forced');
    await http.delete(`/api/v1/notes/${id}`);
  });
});

describe('concurrent writes', () => {
  test('last write wins when both skip If-Match', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: 'original' });
    const [res1, res2] = await Promise.all([
      http.put(`/api/v1/notes/${id}`, { body: 'writer A' }),
      http.put(`/api/v1/notes/${id}`, { body: 'writer B' }),
    ]);
    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    const final = await (await http.get(`/api/v1/notes/${id}`)).json();
    expect(['writer A', 'writer B']).toContain(final.body);
    await http.delete(`/api/v1/notes/${id}`);
  });

  test('second writer with same stale etag gets 409', async () => {
    const id = nextId();
    const etag = (await (await http.put(`/api/v1/notes/${id}`, { body: 'v0' })).json()).etag;
    await new Promise((r) => setTimeout(r, 50));

    const res1 = await http.put(`/api/v1/notes/${id}`, { body: 'writer A' }, { 'If-Match': etag });
    expect(res1.ok).toBe(true);

    const res2 = await http.put(`/api/v1/notes/${id}`, { body: 'writer B' }, { 'If-Match': etag });
    expect(res2.status).toBe(409);

    expect((await (await http.get(`/api/v1/notes/${id}`)).json()).body).toBe('writer A');
    await http.delete(`/api/v1/notes/${id}`);
  });
});
