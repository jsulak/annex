import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, stopTestServer, api, type TestContext } from './setup.js';

let ctx: TestContext;
let http: ReturnType<typeof api>;

beforeAll(async () => {
  ctx = await startTestServer();
  http = api(ctx);
});

afterAll(async () => {
  await stopTestServer(ctx);
});

describe('Sync API (Syncthing not configured)', () => {
  test('GET /sync/status returns 503 when no API key', async () => {
    const res = await http.get('/api/v1/sync/status');
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe('Syncthing not configured');
  });

  test('GET /sync/connections returns 503', async () => {
    const res = await http.get('/api/v1/sync/connections');
    expect(res.status).toBe(503);
  });

  test('GET /sync/config/devices returns 503', async () => {
    const res = await http.get('/api/v1/sync/config/devices');
    expect(res.status).toBe(503);
  });

  test('POST /sync/config/devices returns 503', async () => {
    const res = await http.post('/api/v1/sync/config/devices', {
      deviceID: 'AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA',
    });
    expect(res.status).toBe(503);
  });

  test('GET /sync/folder/status returns 503', async () => {
    const res = await http.get('/api/v1/sync/folder/status');
    expect(res.status).toBe(503);
  });
});

describe('Sync API auth', () => {
  test('GET /sync/status returns 401 without auth', async () => {
    const res = await http.unauthed('GET', '/api/v1/sync/status');
    expect(res.status).toBe(401);
  });

  test('POST /sync/config/devices returns 401 without auth', async () => {
    const res = await http.unauthed('POST', '/api/v1/sync/config/devices', {
      deviceID: 'AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA',
    });
    expect(res.status).toBe(401);
  });
});
