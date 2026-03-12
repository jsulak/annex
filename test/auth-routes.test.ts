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

describe('login', () => {
  test('correct password returns ok and sets cookie', async () => {
    const res = await http.unauthed('POST', '/api/v1/auth/login', { password: 'testpassword' });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(res.headers.get('set-cookie')).toBeTruthy();
  });

  test('wrong password returns 401', async () => {
    const res = await http.unauthed('POST', '/api/v1/auth/login', { password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('missing password returns 400', async () => {
    const res = await http.unauthed('POST', '/api/v1/auth/login', {});
    expect(res.status).toBe(400);
  });

  test('empty password returns 400', async () => {
    const res = await http.unauthed('POST', '/api/v1/auth/login', { password: '' });
    expect(res.status).toBe(400);
  });
});

describe('change password', () => {
  test('requires authentication', async () => {
    const res = await http.unauthed('POST', '/api/v1/auth/change-password', {
      currentPassword: 'testpassword',
      newPassword: 'newpassword123',
    });
    expect(res.status).toBe(401);
  });

  test('rejects wrong current password', async () => {
    const res = await http.post('/api/v1/auth/change-password', {
      currentPassword: 'wrongpassword',
      newPassword: 'newpassword123',
    });
    expect(res.status).toBe(401);
  });

  test('rejects short new password', async () => {
    const res = await http.post('/api/v1/auth/change-password', {
      currentPassword: 'testpassword',
      newPassword: 'short',
    });
    expect(res.status).toBe(400);
  });

  test('rejects missing fields', async () => {
    const res = await http.post('/api/v1/auth/change-password', {
      currentPassword: 'testpassword',
    });
    expect(res.status).toBe(400);
  });
});

describe('health check', () => {
  test('health endpoint is public', async () => {
    const res = await http.unauthed('GET', '/api/v1/health');
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

// Logout runs last since it destroys the session used by other tests
describe('logout', () => {
  test('logout endpoint returns ok', async () => {
    const res = await http.post('/api/v1/auth/logout', {});
    expect(res.ok).toBe(true);
    expect((await res.json()).ok).toBe(true);
  });
});

describe('session cookie properties', () => {
  test('login cookie is HttpOnly', async () => {
    const res = await http.unauthed('POST', '/api/v1/auth/login', { password: 'testpassword' });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie.toLowerCase()).toContain('httponly');
  });

  test('login cookie has SameSite=Strict', async () => {
    const res = await http.unauthed('POST', '/api/v1/auth/login', { password: 'testpassword' });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie.toLowerCase()).toContain('samesite=strict');
  });
});
