import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startTestServer, stopTestServer, api, type TestContext } from './setup.js';

let ctx: TestContext;
let http: ReturnType<typeof api>;

beforeAll(async () => {
  ctx = await startTestServer();
  http = api(ctx);

  // Create a media subdirectory with a test image
  const mediaDir = path.join(ctx.notesDir, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  // 1x1 red PNG (minimal valid PNG bytes)
  const pngBytes = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
    '2e00000000c4944415478016360f8cfc00000000200013e51b9200000000049454e44ae426082',
    'hex',
  );
  fs.writeFileSync(path.join(mediaDir, 'test.png'), pngBytes);
  fs.writeFileSync(path.join(ctx.notesDir, 'plain.txt'), 'hello text');
});

afterAll(async () => {
  await stopTestServer(ctx);
});

describe('GET /api/v1/assets/*', () => {
  test('serves a file from a subdirectory', async () => {
    const res = await http.get('/api/v1/assets/media/test.png');
    expect(res.ok).toBe(true);
    expect(res.headers.get('content-type')).toContain('image/png');
  });

  test('serves a file from the notes root', async () => {
    const res = await http.get('/api/v1/assets/plain.txt');
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toBe('hello text');
  });

  test('returns 404 for nonexistent asset', async () => {
    const res = await http.get('/api/v1/assets/media/nonexistent.png');
    expect(res.status).toBe(404);
  });

  test('rejects path traversal attempts', async () => {
    // Fastify normalizes the URL before routing so traversal is blocked at the framework
    // level (404) or by our explicit check (403) — either way the file is not served
    const res = await http.get('/api/v1/assets/../../etc/passwd');
    expect(res.ok).toBe(false);
    expect([403, 404]).toContain(res.status);
  });

  test('returns 401 without auth', async () => {
    const res = await http.unauthed('GET', '/api/v1/assets/media/test.png');
    expect(res.status).toBe(401);
  });
});
