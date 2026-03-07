import { test, expect } from '@playwright/test';

let idCounter = 0;
function nextId(): string {
  idCounter++;
  const hh = String(Math.floor(idCounter / 60)).padStart(2, '0');
  const mm = String(idCounter % 60).padStart(2, '0');
  return `20980101${hh}${mm}`;
}

test.describe('findFileById prefix collision', () => {
  test('12-digit ID does not collide with 14-digit ID sharing same prefix', async ({ request }) => {
    // Real collision scenario: 12-digit YYYYMMDDHHMM vs 14-digit YYYYMMDDHHMMSS
    // where the 14-digit ID starts with the 12-digit ID
    const shortId = nextId(); // e.g. 209801010001 (12 digits)
    const longId = `${shortId}30`; // e.g. 20980101000130 (14 digits, SS=30)

    const res1 = await request.put(`/api/v1/notes/${shortId}`, {
      data: { body: '# Short ID Note' },
    });
    expect(res1.ok()).toBe(true);

    const res2 = await request.put(`/api/v1/notes/${longId}`, {
      data: { body: '# Long ID Note' },
    });
    expect(res2.ok()).toBe(true);

    // GET by short ID — findFileById uses startsWith, so this may
    // incorrectly match the long ID file if it appears first in readdir
    const get1 = await request.get(`/api/v1/notes/${shortId}`);
    expect(get1.ok()).toBe(true);
    const note1 = await get1.json();
    // This assertion documents the expected behavior: short ID returns short note
    expect(note1.body).toBe('# Short ID Note');

    // GET by long ID should return the long note
    const get2 = await request.get(`/api/v1/notes/${longId}`);
    expect(get2.ok()).toBe(true);
    const note2 = await get2.json();
    expect(note2.body).toBe('# Long ID Note');

    await request.delete(`/api/v1/notes/${shortId}`);
    await request.delete(`/api/v1/notes/${longId}`);
  });
});

test.describe('Config API safety', () => {
  test('GET /config never exposes passwordHash', async ({ request }) => {
    const res = await request.get('/api/v1/config');
    expect(res.ok()).toBe(true);
    const config = await res.json();

    expect(config).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(config)).not.toContain('$2b$');
  });

  test('PUT /config does not allow overwriting passwordHash', async ({ request }) => {
    // Try to inject passwordHash through settings
    const res = await request.put('/api/v1/config', {
      data: {
        settings: { fontSize: 14 },
        passwordHash: 'injected-hash',
      },
    });
    expect(res.ok()).toBe(true);

    // Verify passwordHash wasn't changed by checking we can still auth
    const authCheck = await request.get('/api/v1/auth/check');
    expect(authCheck.ok()).toBe(true);

    // Restore font size
    await request.put('/api/v1/config', {
      data: { settings: { fontSize: 13 } },
    });
  });

  test('PUT /config preserves unmodified settings', async ({ request }) => {
    // Get current settings
    const before = await (await request.get('/api/v1/config')).json();

    // Update only fontSize
    await request.put('/api/v1/config', {
      data: { settings: { fontSize: 15 } },
    });

    const after = await (await request.get('/api/v1/config')).json();
    expect(after.settings.fontSize).toBe(15);
    // Other settings should be unchanged
    expect(after.settings.editorWidth).toBe(before.settings.editorWidth);
    expect(after.settings.autoSaveDelay).toBe(before.settings.autoSaveDelay);
    expect(after.settings.darkMode).toBe(before.settings.darkMode);

    // Restore
    await request.put('/api/v1/config', {
      data: { settings: { fontSize: before.settings.fontSize } },
    });
  });
});

test.describe('Rename edge cases', () => {
  test('rename adds .md extension if missing', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, { data: { body: '# Extension Test' } });

    const renameRes = await request.post(`/api/v1/notes/${id}/rename`, {
      data: { newFilename: `${id} No Extension` },
    });
    expect(renameRes.ok()).toBe(true);

    const note = await renameRes.json();
    expect(note.filename).toMatch(/\.md$/);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('rename with .md extension does not double it', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, { data: { body: '# Double Ext' } });

    await request.post(`/api/v1/notes/${id}/rename`, {
      data: { newFilename: `${id} Already Has.md` },
    });

    const list = await (await request.get('/api/v1/notes')).json();
    const note = list.find((n: { id: string }) => n.id === id);
    expect(note.filename).toBe(`${id} Already Has.md`);
    expect(note.filename).not.toContain('.md.md');

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('search index updates after rename', async ({ request }) => {
    const id = nextId();
    const marker = 'renameSearchMarkerYqw3';
    await request.put(`/api/v1/notes/${id}`, {
      data: { body: `# ${marker}\n\nContent to find.` },
    });

    // Searchable before rename
    let results = await (await request.get(`/api/v1/search?q=${marker}`)).json();
    expect(results.length).toBe(1);

    // Rename
    await request.post(`/api/v1/notes/${id}/rename`, {
      data: { newFilename: `${id} Renamed For Search.md` },
    });

    // Should still be searchable after rename
    results = await (await request.get(`/api/v1/search?q=${marker}`)).json();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(id);

    await request.delete(`/api/v1/notes/${id}`);
  });
});

test.describe('Concurrent writes', () => {
  test('last write wins when both skip If-Match', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, { data: { body: 'original' } });

    // Two concurrent writes without etag — both should succeed
    const [res1, res2] = await Promise.all([
      request.put(`/api/v1/notes/${id}`, { data: { body: 'writer A' } }),
      request.put(`/api/v1/notes/${id}`, { data: { body: 'writer B' } }),
    ]);
    expect(res1.ok()).toBe(true);
    expect(res2.ok()).toBe(true);

    // One of them should have won
    const final = await (await request.get(`/api/v1/notes/${id}`)).json();
    expect(['writer A', 'writer B']).toContain(final.body);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('concurrent writes with etag: second writer gets 409', async ({ request }) => {
    const id = nextId();
    const createRes = await request.put(`/api/v1/notes/${id}`, { data: { body: 'v0' } });
    const etag = (await createRes.json()).etag;

    // Small delay so mtime changes on first write
    await new Promise((r) => setTimeout(r, 50));

    // First writer succeeds with correct etag
    const res1 = await request.put(`/api/v1/notes/${id}`, {
      headers: { 'If-Match': etag },
      data: { body: 'writer A' },
    });
    expect(res1.ok()).toBe(true);

    // Second writer with same (now stale) etag should get 409
    const res2 = await request.put(`/api/v1/notes/${id}`, {
      headers: { 'If-Match': etag },
      data: { body: 'writer B' },
    });
    expect(res2.status()).toBe(409);

    // Only writer A's content should persist
    const final = await (await request.get(`/api/v1/notes/${id}`)).json();
    expect(final.body).toBe('writer A');

    await request.delete(`/api/v1/notes/${id}`);
  });
});

test.describe('Body edge cases', () => {
  test('note with only whitespace is preserved', async ({ request }) => {
    const id = nextId();
    const body = '   \n\n  \n';
    await request.put(`/api/v1/notes/${id}`, { data: { body } });

    const note = await (await request.get(`/api/v1/notes/${id}`)).json();
    expect(note.body).toBe(body);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('note with very long single line is preserved', async ({ request }) => {
    const id = nextId();
    const body = '# Long Line\n\n' + 'x'.repeat(50000);
    await request.put(`/api/v1/notes/${id}`, { data: { body } });

    const note = await (await request.get(`/api/v1/notes/${id}`)).json();
    expect(note.body).toBe(body);
    expect(note.body.length).toBe(body.length);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('note with many tags extracts all of them', async ({ request }) => {
    const id = nextId();
    const tags = Array.from({ length: 50 }, (_, i) => `#tag${i}`);
    const body = `# Many Tags\n\n${tags.join(' ')}`;
    await request.put(`/api/v1/notes/${id}`, { data: { body } });

    const note = await (await request.get(`/api/v1/notes/${id}`)).json();
    expect(note.tags.length).toBe(50);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('note with many wiki-links extracts all of them', async ({ request }) => {
    const id = nextId();
    const links = Array.from({ length: 30 }, (_, i) => `[[link${i}]]`);
    const body = `# Many Links\n\n${links.join(' ')}`;
    await request.put(`/api/v1/notes/${id}`, { data: { body } });

    const note = await (await request.get(`/api/v1/notes/${id}`)).json();
    expect(note.links.length).toBe(30);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('JSON-special characters in body do not corrupt response', async ({ request }) => {
    const id = nextId();
    const body = '# JSON Edge Cases\n\n"quotes" and \\backslashes\\ and \ttabs\nand null: \0';
    await request.put(`/api/v1/notes/${id}`, { data: { body } });

    const getRes = await request.get(`/api/v1/notes/${id}`);
    expect(getRes.ok()).toBe(true);
    const note = await getRes.json();
    expect(note.body).toBe(body);

    await request.delete(`/api/v1/notes/${id}`);
  });
});

test.describe('Note list consistency', () => {
  test('note list count matches after create and delete cycle', async ({ request }) => {
    const listBefore = await (await request.get('/api/v1/notes')).json();
    const countBefore = listBefore.length;

    // Create 5 notes
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = nextId();
      ids.push(id);
      await request.put(`/api/v1/notes/${id}`, { data: { body: `# Batch ${i}` } });
    }

    const listAfter = await (await request.get('/api/v1/notes')).json();
    expect(listAfter.length).toBe(countBefore + 5);

    // Delete them all
    for (const id of ids) {
      await request.delete(`/api/v1/notes/${id}`);
    }

    const listFinal = await (await request.get('/api/v1/notes')).json();
    expect(listFinal.length).toBe(countBefore);
  });

  test('note list is sorted by modifiedAt descending', async ({ request }) => {
    const list = await (await request.get('/api/v1/notes')).json();
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].modifiedAt >= list[i].modifiedAt).toBe(true);
    }
  });

  test('each note in list has a unique ID', async ({ request }) => {
    const list = await (await request.get('/api/v1/notes')).json();
    const ids = list.map((n: { id: string }) => n.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

test.describe('Auth boundary', () => {
  test('all note endpoints reject unauthenticated requests', async ({ request }) => {
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
      const res = await request.fetch(ep.path, {
        method: ep.method,
        headers: { Cookie: '' },
        data: ep.method === 'PUT' ? { body: 'test', settings: {} } : undefined,
      });
      expect(res.status(), `${ep.method} ${ep.path} should require auth`).toBe(401);
    }
  });
});
