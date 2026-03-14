import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startTestServer, stopTestServer, api, type TestContext } from './setup.js';

// Minimal valid 1x1 PNG
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080200000090' +
  '01' +
  '2e00000000c4944415478016360f8cfc0000000020001' +
  '3e51b9200000000049454e44ae426082',
  'hex',
);

function makePngForm(name = 'test.png'): FormData {
  const form = new FormData();
  form.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), name);
  return form;
}

let ctx: TestContext;
let http: ReturnType<typeof api>;

beforeAll(async () => {
  ctx = await startTestServer();
  http = api(ctx);
});

afterAll(async () => {
  await stopTestServer(ctx);
});

describe('POST /api/v1/media', () => {
  test('uploads a PNG and returns a path', async () => {
    const res = await http.postMultipart('/api/v1/media', makePngForm());
    expect(res.status).toBe(201);
    const data = await res.json() as { path: string };
    expect(data.path).toMatch(/^media\/.+\.png$/);
  });

  test('saved file exists on disk', async () => {
    const res = await http.postMultipart('/api/v1/media', makePngForm());
    const { path: relativePath } = await res.json() as { path: string };
    expect(fs.existsSync(path.join(ctx.notesDir, relativePath))).toBe(true);
  });

  test('uploaded file is servable via assets endpoint', async () => {
    const uploadRes = await http.postMultipart('/api/v1/media', makePngForm());
    const { path: relativePath } = await uploadRes.json() as { path: string };
    const serveRes = await http.get(`/api/v1/assets/${relativePath}`);
    expect(serveRes.ok).toBe(true);
    expect(serveRes.headers.get('content-type')).toContain('image/png');
  });

  test('accepts jpg extension', async () => {
    const form = new FormData();
    form.append('file', new Blob([PNG_BYTES], { type: 'image/jpeg' }), 'photo.jpg');
    const res = await http.postMultipart('/api/v1/media', form);
    expect(res.status).toBe(201);
    const data = await res.json() as { path: string };
    expect(data.path).toMatch(/\.jpg$/);
  });

  test('rejects disallowed extension', async () => {
    const form = new FormData();
    form.append('file', new Blob(['evil'], { type: 'application/octet-stream' }), 'evil.exe');
    const res = await http.postMultipart('/api/v1/media', form);
    expect(res.status).toBe(400);
  });

  test('rejects missing file part', async () => {
    const res = await http.postMultipart('/api/v1/media', new FormData());
    expect(res.status).toBe(400);
  });

  test('returns 401 without auth', async () => {
    const form = makePngForm();
    const res = await fetch(`${ctx.baseUrl}/api/v1/media`, { method: 'POST', body: form });
    expect(res.status).toBe(401);
  });

  test('path traversal in filename is safe', async () => {
    const form = new FormData();
    form.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), '../../evil.png');
    const res = await http.postMultipart('/api/v1/media', form);
    // Either rejected or saved safely inside media/
    if (res.ok) {
      const { path: relativePath } = await res.json() as { path: string };
      expect(relativePath).toMatch(/^media\//);
      expect(relativePath).not.toContain('..');
    } else {
      expect([400, 403]).toContain(res.status);
    }
  });

  test('two uploads with identical names get distinct paths', async () => {
    const [r1, r2] = await Promise.all([
      http.postMultipart('/api/v1/media', makePngForm('same.png')),
      http.postMultipart('/api/v1/media', makePngForm('same.png')),
    ]);
    const d1 = await r1.json() as { path: string };
    const d2 = await r2.json() as { path: string };
    expect(d1.path).not.toBe(d2.path);
  });
});
