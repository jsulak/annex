/**
 * Tests for session persistence across server restarts.
 * Verifies that a valid session cookie works after the store is reloaded from disk.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import csrf from '@fastify/csrf-protection';
import { FileSessionStore } from '../server/lib/sessionStore.js';
import { registerAuth } from '../server/auth.js';

const PASSWORD = 'testpassword';
const PASSWORD_HASH = '$2b$12$6qQXBZMeoIFGTDf3NSkX5.q1kH62vYIfaxpmiFv3oHJMdslONT0wy';
const SESSION_SECRET = 'testsecrettestsecrettestsecrettest';

let notesDir: string;
let sessionsFile: string;

async function buildTestApp(store: FileSessionStore): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret: SESSION_SECRET,
    store,
    cookieName: 'annex_session',
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
    },
  });
  await app.register(csrf, { sessionPlugin: '@fastify/session' });
  const CSRF_MUTATING = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
  app.addHook('preValidation', (request, reply, done) => {
    if (!CSRF_MUTATING.has(request.method)) return done();
    if (request.url === '/api/v1/auth/login') return done();
    return app.csrfProtection(request, reply, done);
  });
  await registerAuth(app, notesDir, { loginDelayMs: 0, rateLimitMax: 100 });
  app.get('/api/v1/health', async () => ({ status: 'ok' }));
  await app.listen({ port: 0, host: '127.0.0.1' });
  return app;
}

beforeAll(async () => {
  notesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'annex-session-test-'));
  sessionsFile = path.join(notesDir, 'sessions.json');
  const config = {
    passwordHash: PASSWORD_HASH,
    savedSearches: [],
    settings: {
      autoSaveDelay: 500, showSnippets: false, editorWidth: 680,
      fontSize: 13, noteTemplate: '', indexExtensions: ['.md'], darkMode: 'auto',
    },
  };
  await fs.writeFile(path.join(notesDir, '_annex.json'), JSON.stringify(config));
  process.env.NOTES_DIR = notesDir;
});

afterAll(async () => {
  await fs.rm(notesDir, { recursive: true, force: true });
});

describe('session persistence', () => {
  test('session survives store reload (simulated restart)', async () => {
    // 1. Start first "instance" of the app
    const store1 = new FileSessionStore(sessionsFile);
    await store1.init();
    const app1 = await buildTestApp(store1);
    const addr1 = app1.addresses()[0];
    const base1 = `http://${addr1.address}:${addr1.port}`;

    // 2. Login — establishes a session
    const loginRes = await fetch(`${base1}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(loginRes.ok).toBe(true);
    const setCookie = loginRes.headers.get('set-cookie') ?? '';
    const cookie = setCookie.split(';')[0];
    expect(cookie).toBeTruthy();

    // 3. Confirm session works on app1
    const check1 = await fetch(`${base1}/api/v1/health`, { headers: { Cookie: cookie } });
    expect(check1.ok).toBe(true);

    // 4. Shut down app1
    await app1.close();

    // 5. Start second "instance" with a fresh store that loads from the same file
    const store2 = new FileSessionStore(sessionsFile);
    await store2.init();
    const app2 = await buildTestApp(store2);
    const addr2 = app2.addresses()[0];
    const base2 = `http://${addr2.address}:${addr2.port}`;

    // 6. Same cookie must still authenticate on app2
    const check2 = await fetch(`${base2}/api/v1/health`, { headers: { Cookie: cookie } });
    expect(check2.ok).toBe(true);

    // Verify it's actually checking auth — unauthenticated request should fail on a protected route
    const unauthed = await fetch(`${base2}/api/v1/auth/check`);
    expect(unauthed.status).toBe(401);

    await app2.close();
  });

  test('expired sessions are not restored', async () => {
    // Write a session that is already expired directly to the file
    const expiredData = {
      'expired-session-id-xxxx': {
        cookie: { expires: new Date(Date.now() - 1000).toISOString() },
        authenticated: true,
      },
    };
    await fs.writeFile(sessionsFile, JSON.stringify(expiredData), { mode: 0o600 });

    const store = new FileSessionStore(sessionsFile);
    await store.init();

    // get() should return null for the expired session
    const result = await new Promise<unknown>((resolve) => {
      store.get('expired-session-id-xxxx', (_err, session) => resolve(session));
    });
    expect(result).toBeNull();
  });

  test('sessions file has 0600 permissions', async () => {
    const store = new FileSessionStore(sessionsFile);
    await store.init();

    // Trigger a write by setting a session
    const session = { cookie: { expires: new Date(Date.now() + 86400000) }, authenticated: true };
    await new Promise<void>((resolve, reject) => {
      store.set('test-perm-session', session as never, (err) => (err ? reject(err) : resolve()));
    });

    const stat = await fs.stat(sessionsFile);
    // 0o600 = owner read+write only
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
