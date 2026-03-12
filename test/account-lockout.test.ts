import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { startTestServer, stopTestServer, api, type TestContext } from './setup.js';

const WRONG = 'wrongpassword';
const RIGHT = 'testpassword';

let ctx: TestContext;
let http: ReturnType<typeof api>;

// Fresh server per test so lockout state never leaks between tests
beforeEach(async () => {
  ctx = await startTestServer();
  http = api(ctx);
});

afterEach(async () => {
  await stopTestServer(ctx);
});

describe('account lockout', () => {
  test('5 failed attempts lock the IP (returns 429)', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await http.unauthed('POST', '/api/v1/auth/login', { password: WRONG });
      expect(r.status).toBe(401);
    }
    const r = await http.unauthed('POST', '/api/v1/auth/login', { password: WRONG });
    expect(r.status).toBe(429);
    const body = await r.json();
    expect(body.error).toMatch(/locked|too many/i);
  });

  test('locked IP returns 429 even with correct password', async () => {
    for (let i = 0; i < 5; i++) {
      await http.unauthed('POST', '/api/v1/auth/login', { password: WRONG });
    }
    const r = await http.unauthed('POST', '/api/v1/auth/login', { password: RIGHT });
    expect(r.status).toBe(429);
  });

  test('successful login resets the failure counter', async () => {
    // 2 failures (not yet locked)
    for (let i = 0; i < 2; i++) {
      await http.unauthed('POST', '/api/v1/auth/login', { password: WRONG });
    }
    // Successful login resets counter
    const good = await http.unauthed('POST', '/api/v1/auth/login', { password: RIGHT });
    expect(good.ok).toBe(true);
    // Next failure should return 401 (counter reset to 0 → now 1, not locked)
    const after = await http.unauthed('POST', '/api/v1/auth/login', { password: WRONG });
    expect(after.status).toBe(401);
  });
});
