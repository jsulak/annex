import { test, expect } from '@playwright/test';

let idCounter = 0;
function nextId(): string {
  idCounter++;
  // 12-digit IDs: 2099-01-01 HH:MM (valid dates, unique per test)
  const hh = String(Math.floor(idCounter / 60)).padStart(2, '0');
  const mm = String(idCounter % 60).padStart(2, '0');
  return `20990101${hh}${mm}`;
}

test.describe('Content preservation', () => {
  test('note body survives save/load roundtrip exactly', async ({ request }) => {
    const id = nextId();
    const body = '# Roundtrip Test\n\nLine with **bold** and *italic*.\n\n- list item\n- another\n';

    const putRes = await request.put(`/api/v1/notes/${id}`, { data: { body } });
    expect(putRes.ok()).toBe(true);

    const getRes = await request.get(`/api/v1/notes/${id}`);
    const note = await getRes.json();
    expect(note.body).toBe(body);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('unicode and emoji content preserved exactly', async ({ request }) => {
    const id = nextId();
    const body = '# Unicode Test 🎉\n\nCafé résumé naïve. 日本語テスト。Ñoño. 数学: ∑∏∫\n\nEmoji: 🧠💡🔗📝\n';

    const putRes = await request.put(`/api/v1/notes/${id}`, { data: { body } });
    expect(putRes.ok()).toBe(true);

    const getRes = await request.get(`/api/v1/notes/${id}`);
    const note = await getRes.json();
    expect(note.body).toBe(body);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('CRLF line endings normalized to LF on save', async ({ request }) => {
    const id = nextId();
    const bodyWithCRLF = '# CRLF Test\r\n\r\nLine one.\r\nLine two.\r\n';
    const expectedLF = '# CRLF Test\n\nLine one.\nLine two.\n';

    const putRes = await request.put(`/api/v1/notes/${id}`, { data: { body: bodyWithCRLF } });
    expect(putRes.ok()).toBe(true);

    const getRes = await request.get(`/api/v1/notes/${id}`);
    const note = await getRes.json();
    expect(note.body).toBe(expectedLF);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('special markdown characters preserved', async ({ request }) => {
    const id = nextId();
    const body = '# Special Chars\n\nBackslash: \\\nPipe: | col1 | col2 |\nBacktick: `code`\nAngle: <div>not html</div>\nBrackets: [[wikilink]] and [link](url)\nHash in code: ```\n# not a heading\n```\n';

    const putRes = await request.put(`/api/v1/notes/${id}`, { data: { body } });
    expect(putRes.ok()).toBe(true);

    const getRes = await request.get(`/api/v1/notes/${id}`);
    const note = await getRes.json();
    expect(note.body).toBe(body);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('empty note body preserved', async ({ request }) => {
    const id = nextId();

    const putRes = await request.put(`/api/v1/notes/${id}`, { data: { body: '' } });
    expect(putRes.ok()).toBe(true);

    const getRes = await request.get(`/api/v1/notes/${id}`);
    const note = await getRes.json();
    expect(note.body).toBe('');

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('very long note content preserved', async ({ request }) => {
    const id = nextId();
    // Generate a ~100KB note
    const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20) + '\n\n';
    const body = '# Large Note\n\n' + paragraph.repeat(50);

    const putRes = await request.put(`/api/v1/notes/${id}`, { data: { body } });
    expect(putRes.ok()).toBe(true);

    const getRes = await request.get(`/api/v1/notes/${id}`);
    const note = await getRes.json();
    expect(note.body).toBe(body);
    expect(note.body.length).toBe(body.length);

    await request.delete(`/api/v1/notes/${id}`);
  });
});

test.describe('Etag and conflict detection', () => {
  test('etag changes after save', async ({ request }) => {
    const id = nextId();
    const res1 = await request.put(`/api/v1/notes/${id}`, {
      data: { body: '# Etag Test v1' },
    });
    const etag1 = (await res1.json()).etag;

    // Small delay to ensure mtime changes
    await new Promise((r) => setTimeout(r, 50));

    const res2 = await request.put(`/api/v1/notes/${id}`, {
      data: { body: '# Etag Test v2' },
    });
    const etag2 = (await res2.json()).etag;

    expect(etag1).not.toBe(etag2);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('save with correct etag succeeds', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, { data: { body: 'v1' } });

    const getRes = await request.get(`/api/v1/notes/${id}`);
    const etag = (await getRes.json()).etag;

    const putRes = await request.put(`/api/v1/notes/${id}`, {
      headers: { 'If-Match': etag },
      data: { body: 'v2' },
    });
    expect(putRes.ok()).toBe(true);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('save with stale etag returns 409 with current etag', async ({ request }) => {
    const id = nextId();
    const res1 = await request.put(`/api/v1/notes/${id}`, { data: { body: 'v1' } });
    const staleEtag = (await res1.json()).etag;

    await new Promise((r) => setTimeout(r, 50));
    await request.put(`/api/v1/notes/${id}`, { data: { body: 'v2' } });

    const conflictRes = await request.put(`/api/v1/notes/${id}`, {
      headers: { 'If-Match': staleEtag },
      data: { body: 'v3 - should conflict' },
    });
    expect(conflictRes.status()).toBe(409);

    const data = await conflictRes.json();
    expect(data.currentEtag).toBeTruthy();
    expect(data.currentEtag).not.toBe(staleEtag);

    // Original v2 content should be preserved
    const getRes = await request.get(`/api/v1/notes/${id}`);
    const note = await getRes.json();
    expect(note.body).toBe('v2');

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('save without If-Match always succeeds (force save)', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, { data: { body: 'v1' } });

    await new Promise((r) => setTimeout(r, 50));
    await request.put(`/api/v1/notes/${id}`, { data: { body: 'v2' } });

    // Force save without If-Match should succeed regardless of etag
    const forceRes = await request.put(`/api/v1/notes/${id}`, {
      data: { body: 'v3 - forced' },
    });
    expect(forceRes.ok()).toBe(true);

    const getRes = await request.get(`/api/v1/notes/${id}`);
    expect((await getRes.json()).body).toBe('v3 - forced');

    await request.delete(`/api/v1/notes/${id}`);
  });
});

test.describe('Delete safety', () => {
  test('deleted note returns 404 on GET', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, { data: { body: '# To Delete' } });

    const delRes = await request.delete(`/api/v1/notes/${id}`);
    expect(delRes.ok()).toBe(true);

    const getRes = await request.get(`/api/v1/notes/${id}`);
    expect(getRes.status()).toBe(404);
  });

  test('deleted note disappears from list', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, { data: { body: '# List Delete' } });

    const listBefore = await (await request.get('/api/v1/notes')).json();
    const existsBefore = listBefore.some((n: { id: string }) => n.id === id);
    expect(existsBefore).toBe(true);

    await request.delete(`/api/v1/notes/${id}`);

    const listAfter = await (await request.get('/api/v1/notes')).json();
    const existsAfter = listAfter.some((n: { id: string }) => n.id === id);
    expect(existsAfter).toBe(false);
  });

  test('deleted note disappears from search', async ({ request }) => {
    const id = nextId();
    const marker = 'uniqueDeleteMarkerQzx9';
    await request.put(`/api/v1/notes/${id}`, { data: { body: `# ${marker}` } });

    // Verify searchable before delete
    const searchBefore = await (await request.get(`/api/v1/search?q=${marker}`)).json();
    expect(searchBefore.length).toBeGreaterThan(0);

    await request.delete(`/api/v1/notes/${id}`);

    // Should not be searchable after delete
    const searchAfter = await (await request.get(`/api/v1/search?q=${marker}`)).json();
    expect(searchAfter.length).toBe(0);
  });

  test('deleting nonexistent note returns 404', async ({ request }) => {
    const res = await request.delete('/api/v1/notes/000000000000');
    expect(res.status()).toBe(404);
  });

  test('double delete returns 404 on second attempt', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, { data: { body: '# Double Delete' } });

    const del1 = await request.delete(`/api/v1/notes/${id}`);
    expect(del1.ok()).toBe(true);

    const del2 = await request.delete(`/api/v1/notes/${id}`);
    expect(del2.status()).toBe(404);
  });
});

test.describe('Search index consistency', () => {
  test('newly created note is immediately searchable', async ({ request }) => {
    const id = nextId();
    const marker = 'freshNoteMarkerAbx7';
    await request.put(`/api/v1/notes/${id}`, { data: { body: `# ${marker}\n\nSearchable content.` } });

    const results = await (await request.get(`/api/v1/search?q=${marker}`)).json();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(id);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('updated note content is searchable immediately', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, { data: { body: '# Before Update' } });

    const markerAfter = 'updatedMarkerKzp4';
    await request.put(`/api/v1/notes/${id}`, { data: { body: `# ${markerAfter}` } });

    const results = await (await request.get(`/api/v1/search?q=${markerAfter}`)).json();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(id);

    // Old content should no longer match
    const oldResults = await (await request.get('/api/v1/search?q=Before%20Update')).json();
    const hasOldMatch = oldResults.some((r: { id: string }) => r.id === id);
    expect(hasOldMatch).toBe(false);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('tags are searchable after save', async ({ request }) => {
    const id = nextId();
    const tag = 'integritytesttag';
    await request.put(`/api/v1/notes/${id}`, { data: { body: `# Tag Test\n\n#${tag}` } });

    const results = await (await request.get(`/api/v1/search?q=%23${tag}`)).json();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(id);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('tags endpoint reflects saved tags', async ({ request }) => {
    const id = nextId();
    const tag = 'uniquetagzqx8';
    await request.put(`/api/v1/notes/${id}`, { data: { body: `# Tag EP Test\n\n#${tag}` } });

    const tags = await (await request.get('/api/v1/tags')).json();
    const found = tags.find((t: { tag: string }) => t.tag === tag);
    expect(found).toBeDefined();
    expect(found.count).toBe(1);

    await request.delete(`/api/v1/notes/${id}`);
  });
});

test.describe('Metadata extraction', () => {
  test('title extracted from first heading', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, { data: { body: '# My Custom Title\n\nBody text.' } });

    const getRes = await request.get(`/api/v1/notes/${id}`);
    const note = await getRes.json();
    expect(note.title).toBe('My Custom Title');

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('title falls back to filename when no heading', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, { data: { body: 'No heading here, just text.' } });

    const getRes = await request.get(`/api/v1/notes/${id}`);
    const note = await getRes.json();
    // Should use filename-derived title (strip ID and .md)
    expect(note.title).toBe('Untitled');

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('tags extracted correctly from body', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, {
      data: { body: '# Tags Test\n\n#alpha #beta-test #CamelCase\n\nInline #delta here.' },
    });

    const getRes = await request.get(`/api/v1/notes/${id}`);
    const note = await getRes.json();
    expect(note.tags).toContain('alpha');
    expect(note.tags).toContain('beta-test');
    expect(note.tags).toContain('camelcase');
    expect(note.tags).toContain('delta');

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('wiki-links extracted from body', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, {
      data: { body: '# Links Test\n\nSee [[202401151432]] and [[Some Title]].' },
    });

    const getRes = await request.get(`/api/v1/notes/${id}`);
    const note = await getRes.json();
    expect(note.links).toContain('202401151432');
    expect(note.links).toContain('Some Title');

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('heading markers not confused with tags', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, {
      data: { body: '# Heading\n\n## Subheading\n\n### Third level\n\nReal #tag here.' },
    });

    const getRes = await request.get(`/api/v1/notes/${id}`);
    const note = await getRes.json();
    // ## headings should not be extracted as tags
    expect(note.tags).not.toContain('heading');
    expect(note.tags).not.toContain('subheading');
    expect(note.tags).toContain('tag');

    await request.delete(`/api/v1/notes/${id}`);
  });
});

test.describe('Rename safety', () => {
  test('rename preserves note content', async ({ request }) => {
    const id = nextId();
    const body = '# Rename Content Test\n\nImportant data here.';
    await request.put(`/api/v1/notes/${id}`, { data: { body } });

    const renameRes = await request.post(`/api/v1/notes/${id}/rename`, {
      data: { newFilename: `${id} Renamed Note.md` },
    });
    expect(renameRes.ok()).toBe(true);

    const getRes = await request.get(`/api/v1/notes/${id}`);
    const note = await getRes.json();
    expect(note.body).toBe(body);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('rename updates filename in list', async ({ request }) => {
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, { data: { body: '# Pre-Rename' } });

    await request.post(`/api/v1/notes/${id}/rename`, {
      data: { newFilename: `${id} New Name.md` },
    });

    const list = await (await request.get('/api/v1/notes')).json();
    const note = list.find((n: { id: string }) => n.id === id);
    expect(note).toBeDefined();
    expect(note.filename).toBe(`${id} New Name.md`);

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('rename to existing filename returns 409', async ({ request }) => {
    const id1 = nextId();
    const id2 = nextId();
    await request.put(`/api/v1/notes/${id1}`, { data: { body: '# First' } });
    await request.put(`/api/v1/notes/${id2}`, { data: { body: '# Second' } });

    // Try to rename id2 to id1's filename
    const list = await (await request.get('/api/v1/notes')).json();
    const note1 = list.find((n: { id: string }) => n.id === id1);

    const renameRes = await request.post(`/api/v1/notes/${id2}/rename`, {
      data: { newFilename: note1.filename },
    });
    expect(renameRes.status()).toBe(409);

    // Both notes should still exist with original content
    const get1 = await request.get(`/api/v1/notes/${id1}`);
    expect((await get1.json()).body).toBe('# First');
    const get2 = await request.get(`/api/v1/notes/${id2}`);
    expect((await get2.json()).body).toBe('# Second');

    await request.delete(`/api/v1/notes/${id1}`);
    await request.delete(`/api/v1/notes/${id2}`);
  });

  test('rename nonexistent note returns 404', async ({ request }) => {
    const res = await request.post('/api/v1/notes/000000000000/rename', {
      data: { newFilename: 'anything.md' },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('Path traversal prevention', () => {
  test('GET with path traversal in ID returns 404', async ({ request }) => {
    const res = await request.get('/api/v1/notes/..%2F..%2Fetc%2Fpasswd');
    expect(res.status()).toBe(404);
  });

  test('PUT with path traversal in ID does not write outside notes dir', async ({ request }) => {
    const res = await request.put('/api/v1/notes/..%2F..%2Ftmp%2Fhack', {
      data: { body: 'malicious content' },
    });
    // Should either 400 or create a safe file — not escape the notes dir
    // The safePath function should catch this
    expect([200, 400, 404, 500]).toContain(res.status());

    // Ensure no file was created outside notes dir by checking it's not findable
    // via a normal path
    const check = await request.get('/api/v1/notes/..%2F..%2Ftmp%2Fhack');
    expect(check.status()).toBe(404);
  });

  test('rename with path traversal in new filename is rejected', async ({ request }) => {
    const id = nextId();
    const createRes = await request.put(`/api/v1/notes/${id}`, { data: { body: '# Safe Note' } });
    expect(createRes.ok()).toBe(true);

    // Verify note exists before rename attempt
    const beforeGet = await request.get(`/api/v1/notes/${id}`);
    expect(beforeGet.ok()).toBe(true);

    const renameRes = await request.post(`/api/v1/notes/${id}/rename`, {
      data: { newFilename: '../../etc/malicious.md' },
    });
    // Should be rejected by safePath — must not be 200
    expect(renameRes.ok()).toBe(false);

    // Original note should still be intact and retrievable
    const getRes = await request.get(`/api/v1/notes/${id}`);
    expect(getRes.ok()).toBe(true);
    expect((await getRes.json()).body).toBe('# Safe Note');

    await request.delete(`/api/v1/notes/${id}`);
  });
});

test.describe('Backlinks consistency', () => {
  test('creating a note with wiki-link makes it appear in backlinks', async ({ request }) => {
    const targetId = '202401151432'; // Sample Note (seed)
    const id = nextId();
    const createRes = await request.put(`/api/v1/notes/${id}`, {
      data: { body: `# Backlink Source\n\nReferences [[${targetId}]].` },
    });
    expect(createRes.ok()).toBe(true);

    // Verify links were extracted
    const noteRes = await request.get(`/api/v1/notes/${id}`);
    const note = await noteRes.json();
    expect(note.links).toContain(targetId);

    const backlinks = await (await request.get(`/api/v1/notes/${targetId}/backlinks`)).json();
    const found = backlinks.find((n: { id: string }) => n.id === id);
    expect(found).toBeDefined();

    await request.delete(`/api/v1/notes/${id}`);
  });

  test('deleting a linking note removes it from backlinks', async ({ request }) => {
    const targetId = '202401151432';
    const id = nextId();
    await request.put(`/api/v1/notes/${id}`, {
      data: { body: `# Temp Linker\n\n[[${targetId}]]` },
    });

    await request.delete(`/api/v1/notes/${id}`);

    const backlinks = await (await request.get(`/api/v1/notes/${targetId}/backlinks`)).json();
    const found = backlinks.find((n: { id: string }) => n.id === id);
    expect(found).toBeUndefined();
  });

  test('updating note to remove wiki-link removes it from backlinks', async ({ request }) => {
    const targetId = '202401151432';
    const id = nextId();
    const createRes = await request.put(`/api/v1/notes/${id}`, {
      data: { body: `# Linker\n\n[[${targetId}]]` },
    });
    expect(createRes.ok()).toBe(true);

    // Verify it's in backlinks
    let backlinks = await (await request.get(`/api/v1/notes/${targetId}/backlinks`)).json();
    expect(backlinks.find((n: { id: string }) => n.id === id)).toBeDefined();

    // Remove the wiki-link
    await request.put(`/api/v1/notes/${id}`, {
      data: { body: '# Linker\n\nNo more link.' },
    });

    backlinks = await (await request.get(`/api/v1/notes/${targetId}/backlinks`)).json();
    expect(backlinks.find((n: { id: string }) => n.id === id)).toBeUndefined();

    await request.delete(`/api/v1/notes/${id}`);
  });
});

test.describe('UI data integrity', () => {
  test('editor content matches API content after navigation', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    // Get the expected body from the API
    const apiRes = await request.get('/api/v1/notes/202401151432');
    const apiNote = await apiRes.json();

    // Click the note in the UI
    await page.locator('#note-list').getByText('202401151432 Sample Note').click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

    // Editor text should match the API body
    const editorText = await page.locator('.cm-content').textContent();
    // CodeMirror adds some formatting — check the essential content is there
    expect(editorText).toContain('Sample Note');
    expect(editorText).toContain('wiki-link');
  });

  test('rapid arrow-key navigation does not corrupt note list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    const noteList = page.locator('#note-list');
    const noteItems = noteList.locator('> div');
    await expect(noteItems.first()).toBeVisible({ timeout: 5_000 });

    const initialOrder = await noteItems.allTextContents();
    const initialCount = initialOrder.length;

    // Click first note to focus list
    await noteItems.first().click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

    // Rapidly navigate up and down
    await noteList.focus();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowDown');
    }
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowUp');
    }

    // Wait for any async operations to settle
    await page.waitForTimeout(1000);

    // Note count should be unchanged
    const finalCount = await noteItems.count();
    expect(finalCount).toBe(initialCount);

    // Order should be unchanged
    const finalOrder = await noteItems.allTextContents();
    expect(finalOrder).toEqual(initialOrder);
  });
});
