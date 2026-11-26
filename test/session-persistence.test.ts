/**
 * Tests for session persistence across server restarts.
 * Verifies that a valid session cookie works after the store is reloaded from disk.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import csrf from '@fastify/csrf-protection';
import bcrypt from 'bcrypt';
import { FileSessionStore } from '../server/lib/sessionStore.js';
import { registerAuth, sessionCookieOptions, sessionPersistence } from '../server/auth.js';
import { writePasswordHash } from '../server/lib/config.js';

const PASSWORD = 'testpassword';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const SESSION_SECRET = 'testsecrettestsecrettestsecrettest';

let tempDir: string;
let notesDir: string;
let sessionsFile: string;

async function buildTestApp(store: FileSessionStore, secure = false): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: secure });
  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    ...sessionPersistence,
    ...sessionCookieOptions(secure, 24 * 60 * 60 * 1000),
    secret: SESSION_SECRET,
    store,
  });
  await app.register(csrf, { sessionPlugin: '@fastify/session' });
  await registerAuth(app, notesDir, {
    loginDelayMs: 0,
    rateLimitMax: 100,
    invalidateAllSessions: () => store.destroyAll(),
  });
  app.get('/api/v1/health', { config: { publicApi: true } }, async () => ({ status: 'ok' }));
  app.get('/api/v1/auth/csrf-token', async (_request, reply) => {
    const token = await reply.generateCsrf();
    return reply.send({ token });
  });
  await app.ready();
  return app;
}

async function login(app: FastifyInstance, password = PASSWORD): Promise<{ cookie: string; csrfToken: string }> {
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { password },
  });
  expect(loginRes.statusCode).toBe(200);
  const setCookie = loginRes.headers['set-cookie'];
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? '';
  expect(cookie).toBeTruthy();

  const csrfRes = await app.inject({
    url: '/api/v1/auth/csrf-token',
    headers: { cookie },
  });
  expect(csrfRes.statusCode).toBe(200);
  const { token: csrfToken } = csrfRes.json<{ token: string }>();
  expect(csrfToken).toBeTruthy();
  return { cookie, csrfToken };
}

function changePassword(app: FastifyInstance, { cookie, csrfToken }: Awaited<ReturnType<typeof login>>, newPassword: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/change-password',
    headers: { cookie, 'x-csrf-token': csrfToken },
    payload: { currentPassword: PASSWORD, newPassword },
  });
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'annex-session-test-'));
  notesDir = path.join(tempDir, 'notes');
  sessionsFile = path.join(tempDir, 'private', 'sessions.json');
  await Promise.all([fs.mkdir(notesDir), fs.mkdir(path.dirname(sessionsFile), { mode: 0o700 })]);
  vi.stubEnv('NOTES_DIR', notesDir);
  vi.stubEnv('CONFIG_DIR', path.dirname(sessionsFile));
  await writePasswordHash(PASSWORD_HASH);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('session persistence', () => {
  test('production login issues a host-prefixed cookie over HTTPS', async () => {
    const app = await buildTestApp(new FileSessionStore(sessionsFile), true);
    const request = {
      method: 'POST' as const,
      url: '/api/v1/auth/login',
      payload: { password: PASSWORD },
    };

    try {
      const insecure = await app.inject(request);
      expect(insecure.headers['set-cookie']).toBeUndefined();

      const secure = await app.inject({ ...request, headers: { 'x-forwarded-proto': 'https' } });
      expect(secure.statusCode).toBe(200);
      expect(secure.cookies).toHaveLength(1);
      expect(secure.cookies[0]).toMatchObject({
        name: '__Host-annex_session', path: '/', secure: true, httpOnly: true, sameSite: 'Strict',
      });
      expect(secure.cookies[0].domain).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  test('session survives store reload (simulated restart)', async () => {
    const app = await buildTestApp(new FileSessionStore(sessionsFile));
    const { cookie } = await login(app).finally(() => app.close());

    const reloaded = new FileSessionStore(sessionsFile);
    await reloaded.init();
    const restartedApp = await buildTestApp(reloaded);
    try {
      const check = await restartedApp.inject({ url: '/api/v1/auth/check', headers: { cookie } });
      expect(check.statusCode).toBe(200);
      expect((await restartedApp.inject('/api/v1/auth/check')).statusCode).toBe(401);
    } finally {
      await restartedApp.close();
    }
  });

  test('password change invalidates all active sessions', async () => {
    const app = await buildTestApp(new FileSessionStore(sessionsFile));

    try {
      const sessionA = await login(app);
      const sessionB = await login(app);

      const changeRes = await changePassword(app, sessionA, 'newpassword123');
      expect(changeRes.statusCode).toBe(200);
      expect(JSON.parse(await fs.readFile(sessionsFile, 'utf-8'))).toEqual({});

      for (const { cookie } of [sessionA, sessionB]) {
        const check = await app.inject({ url: '/api/v1/auth/check', headers: { cookie } });
        expect(check.statusCode).toBe(401);
      }

      const oldLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { password: PASSWORD },
      });
      expect(oldLogin.statusCode).toBe(401);

      await login(app, 'newpassword123');
    } finally {
      await app.close();
    }
  });

  test('a login checks the current credential after a concurrent password change', async () => {
    const app = await buildTestApp(new FileSessionStore(sessionsFile));
    const comparisonStarted = Promise.withResolvers<void>();
    const finishComparison = Promise.withResolvers<void>();

    try {
      const session = await login(app);
      const compare = bcrypt.compare;
      vi.spyOn(bcrypt, 'compare').mockImplementationOnce(async (password, hash) => {
        comparisonStarted.resolve();
        await finishComparison.promise;
        return compare(password, hash);
      });
      const pendingLogin = app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { password: PASSWORD },
      });
      await comparisonStarted.promise;
      const change = await changePassword(app, session, 'newpassword123');
      finishComparison.resolve();
      const completedLogin = await pendingLogin;

      expect(change.statusCode).toBe(200);
      expect(completedLogin.statusCode).toBe(401);
      expect(completedLogin.headers['set-cookie']).toBeUndefined();
      await login(app, 'newpassword123');
    } finally {
      finishComparison.resolve();
      vi.restoreAllMocks();
      await app.close();
    }
  });

  test('concurrent sign-ins can rotate the same incoming session', async () => {
    const app = await buildTestApp(new FileSessionStore(sessionsFile));
    const comparisonStarted = Promise.withResolvers<void>();
    const finishComparison = Promise.withResolvers<void>();

    try {
      const { cookie } = await login(app);
      const compare = bcrypt.compare;
      vi.spyOn(bcrypt, 'compare').mockImplementationOnce(async (password, hash) => {
        comparisonStarted.resolve();
        await finishComparison.promise;
        return compare(password, hash);
      });
      const signIn = () => app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { cookie },
        payload: { password: PASSWORD },
      });
      const waiting = signIn();
      await comparisonStarted.promise;
      const first = await signIn();
      finishComparison.resolve();
      const second = await waiting;

      for (const response of [first, second]) {
        expect(response.statusCode).toBe(200);
        const newCookie = response.cookies[0];
        expect(newCookie.name).toBe('annex_session');
        const check = await app.inject({
          url: '/api/v1/auth/check',
          cookies: { [newCookie.name]: newCookie.value },
        });
        expect(check.statusCode).toBe(200);
      }
      expect((await app.inject({ url: '/api/v1/auth/check', headers: { cookie } })).statusCode).toBe(401);
    } finally {
      finishComparison.resolve();
      vi.restoreAllMocks();
      await app.close();
    }
  });

  test('only one password change can commit against the same credential', async () => {
    const app = await buildTestApp(new FileSessionStore(sessionsFile));
    const hashStarted = Promise.withResolvers<void>();
    const finishHash = Promise.withResolvers<void>();

    try {
      const sessionA = await login(app);
      const sessionB = await login(app);
      const hash = bcrypt.hash;
      vi.spyOn(bcrypt, 'hash').mockImplementationOnce(async (password, salt) => {
        hashStarted.resolve();
        await finishHash.promise;
        return hash(password, salt);
      });
      const pendingChange = changePassword(app, sessionA, 'firstpassword123');
      await hashStarted.promise;
      const change = await changePassword(app, sessionB, 'secondpassword123');
      finishHash.resolve();
      const completedChange = await pendingChange;

      expect(change.statusCode).toBe(200);
      expect(completedChange.statusCode).toBe(401);
      await login(app, 'secondpassword123');
    } finally {
      finishHash.resolve();
      vi.restoreAllMocks();
      await app.close();
    }
  });

  test('keeps the current credential when writing session revocation fails', async () => {
    const store = new FileSessionStore(sessionsFile);
    const app = await buildTestApp(store);

    try {
      const session = await login(app);
      vi.spyOn(store, 'destroyAll').mockRejectedValueOnce(new Error('Session writes are unavailable'));
      const change = await changePassword(app, session, 'newpassword123');
      expect(change.statusCode).toBe(500);
      await login(app);
    } finally {
      vi.restoreAllMocks();
      await app.close();
    }
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
