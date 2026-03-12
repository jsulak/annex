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

describe('CSRF token endpoint', () => {
  test('GET /api/v1/auth/csrf-token returns a token string', async () => {
    const res = await http.get('/api/v1/auth/csrf-token');
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(10);
  });
});

describe('CSRF enforcement', () => {
  test('PUT without CSRF token returns 403', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/notes/209998000000`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ctx.cookie,
        // Intentionally omit x-csrf-token
      },
      body: JSON.stringify({ body: '# test' }),
    });
    expect(res.status).toBe(403);
  });

  test('POST without CSRF token returns 403', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/notes/209998000000/rename`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ctx.cookie,
      },
      body: JSON.stringify({ newFilename: 'test.md' }),
    });
    expect(res.status).toBe(403);
  });

  test('DELETE without CSRF token returns 403', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/notes/209998000000`, {
      method: 'DELETE',
      headers: { Cookie: ctx.cookie },
    });
    expect(res.status).toBe(403);
  });

  test('GET requests do not require CSRF token', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/notes`, {
      headers: { Cookie: ctx.cookie },
    });
    expect(res.ok).toBe(true);
  });

  test('login endpoint is exempt from CSRF', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrongpassword' }),
    });
    // Should get 401 (wrong password) not 403 (CSRF)
    expect(res.status).toBe(401);
  });

  test('PUT with valid CSRF token succeeds', async () => {
    // Use the CSRF token established at server startup (via api helper)
    const res = await http.put('/api/v1/notes/209901010001', { body: '# CSRF Test' });
    expect(res.ok).toBe(true);

    // Cleanup
    await http.delete('/api/v1/notes/209901010001');
  });
});
