import fs from 'node:fs/promises';
import path from 'node:path';
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

describe('auth boundary', () => {
  test('all note endpoints reject unauthenticated requests', async () => {
    const endpoints = [
      { method: 'GET', path: '/api/v1/notes' },
      { method: 'GET', path: '/api/v1/notes/202401151432' },
      { method: 'PUT', path: '/api/v1/notes/202401151432' },
      { method: 'DELETE', path: '/api/v1/notes/202401151432' },
      { method: 'GET', path: '/api/v1/search?q=test' },
      { method: 'GET', path: '/api/v1/tags' },
      { method: 'GET', path: '/api/v1/config' },
      { method: 'PUT', path: '/api/v1/config' },
      { method: 'GET', path: '/api/v1/notes/202401151432/backlinks' },
    ];

    for (const ep of endpoints) {
      const res = await http.unauthed(ep.method, ep.path,
        ep.method === 'PUT' ? { body: 'test', settings: {} } : undefined,
      );
      expect(res.status, `${ep.method} ${ep.path} should require auth`).toBe(401);
    }
  });

  test('auth check confirms session', async () => {
    const res = await http.get('/api/v1/auth/check');
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('path traversal prevention', () => {
  test('GET with path traversal in ID returns 404', async () => {
    const res = await http.get('/api/v1/notes/..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(404);
  });

  test('PUT with path traversal in ID does not write outside notes dir', async () => {
    const res = await http.put('/api/v1/notes/..%2F..%2Ftmp%2Fhack', { body: 'malicious content' });
    expect([200, 400, 404, 500]).toContain(res.status);

    const check = await http.get('/api/v1/notes/..%2F..%2Ftmp%2Fhack');
    expect(check.status).toBe(404);
  });

  test('rename with path traversal in new filename is rejected', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Safe Note' });

    const renameRes = await http.post(`/api/v1/notes/${id}/rename`, {
      newFilename: '../../etc/malicious.md',
    });
    expect(renameRes.ok).toBe(false);

    const getRes = await http.get(`/api/v1/notes/${id}`);
    expect(getRes.ok).toBe(true);
    expect((await getRes.json()).body).toBe('# Safe Note');

    await http.delete(`/api/v1/notes/${id}`);
  });
});

describe('config API safety', () => {
  test('GET /config includes hideMarkdownMarkup', async () => {
    const res = await http.get('/api/v1/config');
    expect(res.ok).toBe(true);
    const config = await res.json();

    expect(config.settings.hideMarkdownMarkup).toBe(false);
  });

  test('old config files receive hideMarkdownMarkup default', async () => {
    const configPath = path.join(ctx.notesDir, '_annex.json');
    const original = await fs.readFile(configPath, 'utf-8');
    const originalConfig = JSON.parse(original);

    try {
      await fs.writeFile(configPath, JSON.stringify({
        passwordHash: originalConfig.passwordHash,
        savedSearches: [],
        settings: {
          autoSaveDelay: 750,
          showSnippets: true,
          editorWidth: 720,
          fontSize: 14,
          noteTemplate: '',
          indexExtensions: ['.md'],
          darkMode: 'auto',
        },
      }));

      const res = await http.get('/api/v1/config');
      expect(res.ok).toBe(true);
      const config = await res.json();
      expect(config.settings.hideMarkdownMarkup).toBe(false);
      expect(config.settings.lineHeight).toBe(1.6);
    } finally {
      await fs.writeFile(configPath, original);
    }
  });

  test('GET /config never exposes passwordHash', async () => {
    const res = await http.get('/api/v1/config');
    expect(res.ok).toBe(true);
    const config = await res.json();

    expect(config).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(config)).not.toContain('$2b$');
  });

  test('PUT /config does not allow overwriting passwordHash', async () => {
    const res = await http.put('/api/v1/config', {
      settings: { fontSize: 14 },
      passwordHash: 'injected-hash',
    });
    expect(res.ok).toBe(true);

    const authCheck = await http.get('/api/v1/auth/check');
    expect(authCheck.ok).toBe(true);

    // Restore
    await http.put('/api/v1/config', { settings: { fontSize: 13 } });
  });

  test('PUT /config preserves unmodified settings', async () => {
    const before = await (await http.get('/api/v1/config')).json();

    await http.put('/api/v1/config', { settings: { fontSize: 15, hideMarkdownMarkup: true } });

    const after = await (await http.get('/api/v1/config')).json();
    expect(after.settings.fontSize).toBe(15);
    expect(after.settings.hideMarkdownMarkup).toBe(true);
    expect(after.settings.editorWidth).toBe(before.settings.editorWidth);
    expect(after.settings.autoSaveDelay).toBe(before.settings.autoSaveDelay);
    expect(after.settings.darkMode).toBe(before.settings.darkMode);

    // Restore
    await http.put('/api/v1/config', {
      settings: {
        fontSize: before.settings.fontSize,
        hideMarkdownMarkup: before.settings.hideMarkdownMarkup,
      },
    });
  });
});

describe('delete safety', () => {
  test('deleted note returns 404 on GET', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# To Delete' });
    await http.delete(`/api/v1/notes/${id}`);

    const res = await http.get(`/api/v1/notes/${id}`);
    expect(res.status).toBe(404);
  });

  test('deleted note disappears from list', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# List Delete' });

    const listBefore = await (await http.get('/api/v1/notes')).json();
    expect(listBefore.some((n: { id: string }) => n.id === id)).toBe(true);

    await http.delete(`/api/v1/notes/${id}`);

    const listAfter = await (await http.get('/api/v1/notes')).json();
    expect(listAfter.some((n: { id: string }) => n.id === id)).toBe(false);
  });

  test('deleting nonexistent note returns 404', async () => {
    const res = await http.delete('/api/v1/notes/000000000000');
    expect(res.status).toBe(404);
  });

  test('double delete returns 404 on second attempt', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, { body: '# Double Delete' });

    const del1 = await http.delete(`/api/v1/notes/${id}`);
    expect(del1.ok).toBe(true);

    const del2 = await http.delete(`/api/v1/notes/${id}`);
    expect(del2.status).toBe(404);
  });
});

describe('prefix collision', () => {
  test('12-digit ID does not collide with 14-digit ID sharing same prefix', async () => {
    const shortId = nextId();
    const longId = `${shortId}30`;

    await http.put(`/api/v1/notes/${shortId}`, { body: '# Short ID Note' });
    await http.put(`/api/v1/notes/${longId}`, { body: '# Long ID Note' });

    const note1 = await (await http.get(`/api/v1/notes/${shortId}`)).json();
    expect(note1.body).toBe('# Short ID Note');

    const note2 = await (await http.get(`/api/v1/notes/${longId}`)).json();
    expect(note2.body).toBe('# Long ID Note');

    await http.delete(`/api/v1/notes/${shortId}`);
    await http.delete(`/api/v1/notes/${longId}`);
  });
});
