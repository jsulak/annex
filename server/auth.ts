import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcrypt';
import { readPasswordHash, writePasswordHash } from './lib/config.js';

const BCRYPT_ROUNDS = 12;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const LOCKOUT_MESSAGE = 'Too many failed login attempts. Account locked for 15 minutes.';
const CSRF_MUTATING = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

export const sessionPersistence = { saveUninitialized: false, rolling: false };

export function sessionCookieOptions(secure: boolean, maxAge: number) {
  return {
    cookieName: secure ? '__Host-annex_session' : 'annex_session',
    cookie: { maxAge, httpOnly: true, secure, sameSite: 'strict' as const, path: '/' },
  };
}

interface LockoutEntry {
  failures: number;
  lockedUntil?: number;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    publicApi?: boolean;
  }

  interface Session {
    authenticated?: boolean;
  }
}

export interface AuthOptions {
  /** Max login requests per timeWindow before rate-limiting. Default: 20. */
  rateLimitMax?: number;
  /** Artificial delay (ms) on wrong password. Default: 1000. */
  loginDelayMs?: number;
  /** Optional hook to invalidate every active session after a password change. */
  invalidateAllSessions?: () => Promise<void>;
}

export async function registerAuth(app: FastifyInstance, _notesDir: string, opts: AuthOptions = {}) {
  const rateLimitMax = opts.rateLimitMax ?? 20;
  const loginDelayMs = opts.loginDelayMs ?? 1000;
  let pendingAuthChange = Promise.resolve();

  // Keep credential checks at commit time ordered with session saves and password changes.
  function serializeAuthChange<T>(operation: () => Promise<T>): Promise<T> {
    const result = pendingAuthChange.then(operation);
    pendingAuthChange = result.then(() => {}, () => {});
    return result;
  }

  async function saveLoginSession(request: FastifyRequest): Promise<void> {
    // Preserve Fastify's HTTPS requirement when saving the session explicitly.
    if (request.session.cookie.secure === true && request.protocol !== 'https') return;

    if (request.session.isPersisted()) {
      try {
        await request.session.regenerate();
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        // A concurrent rotation or logout retired the incoming cookie.
        await new Promise<void>((resolve, reject) => {
          app.decryptSession('', request, (err) => err ? reject(err) : resolve());
        });
      }
    }
    request.session.set('authenticated', true);
    await request.session.save();
  }

  // Per-instance lockout state (not shared across server instances)
  const lockouts = new Map<string, LockoutEntry>();

  function getLockout(ip: string): LockoutEntry {
    const entry = lockouts.get(ip) ?? { failures: 0 };
    // Auto-expire
    if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
      lockouts.delete(ip);
      return { failures: 0 };
    }
    return entry;
  }

  function isLockedOut(ip: string): boolean {
    const entry = getLockout(ip);
    return !!(entry.lockedUntil && Date.now() < entry.lockedUntil);
  }

  function recordFailure(ip: string): void {
    const entry = getLockout(ip);
    entry.failures += 1;
    if (entry.failures >= LOCKOUT_THRESHOLD) {
      entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
    lockouts.set(ip, entry);
  }

  function resetLockout(ip: string): void {
    lockouts.delete(ip);
  }

  // Rate limiting — a separate backstop against volumetric abuse
  await app.register(rateLimit, {
    max: rateLimitMax,
    timeWindow: 15 * 60 * 1000,
    keyGenerator: (req) => req.ip,
    hook: 'preHandler',
    allowList: [],
    global: false,
  });

  // Login route
  app.post('/api/v1/auth/login', {
    config: {
      publicApi: true,
      rateLimit: {
        max: rateLimitMax,
        timeWindow: 15 * 60 * 1000,
        keyGenerator: (req: FastifyRequest) => req.ip,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = request.ip;

    // Account lockout check (before bcrypt to avoid wasted work)
    if (isLockedOut(ip)) {
      return reply.status(429).send({ error: LOCKOUT_MESSAGE });
    }

    const { password } = (request.body ?? {}) as { password?: unknown };

    if (!password || typeof password !== 'string') {
      return reply.status(400).send({ error: 'Password is required' });
    }

    const passwordHash = await readPasswordHash();
    if (!passwordHash) {
      return reply.status(500).send({ error: 'No password configured. Run: npm run setup' });
    }

    const valid = await bcrypt.compare(password, passwordHash);
    const status = await serializeAuthChange(async () => {
      if (isLockedOut(ip)) return 429;
      if (!valid || await readPasswordHash() !== passwordHash) {
        recordFailure(ip);
        return 401;
      }

      await saveLoginSession(request);
      resetLockout(ip);
      return 200;
    });

    if (status === 429) return reply.status(429).send({ error: LOCKOUT_MESSAGE });
    if (status === 401) {
      if (loginDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, loginDelayMs));
      }
      return reply.status(401).send({ error: 'Incorrect password' });
    }

    return { ok: true };
  });

  // Logout route
  app.post('/api/v1/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    await request.session.destroy();
    return reply.send({ ok: true });
  });

  // Change password route (rate limited)
  app.post('/api/v1/auth/change-password', {
    config: {
      rateLimit: {
        max: rateLimitMax,
        timeWindow: 15 * 60 * 1000,
        keyGenerator: (req: FastifyRequest) => req.ip,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.session.get('authenticated')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { currentPassword, newPassword } = (request.body ?? {}) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };

    if (typeof currentPassword !== 'string' || !currentPassword ||
        typeof newPassword !== 'string' || !newPassword) {
      return reply.status(400).send({ error: 'Both currentPassword and newPassword are required' });
    }

    if (newPassword.length < 8) {
      return reply.status(400).send({ error: 'New password must be at least 8 characters' });
    }

    const passwordHash = await readPasswordHash();
    const valid = passwordHash && await bcrypt.compare(currentPassword, passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    return serializeAuthChange(async () => {
      if (await readPasswordHash() !== passwordHash) {
        return reply.status(401).send({ error: 'Current password is incorrect' });
      }

      try {
        await request.session.reload();
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (!request.session.get('authenticated')) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      // Persist revocation first. If it fails, the current credential stays valid.
      await request.session.destroy();
      await opts.invalidateAllSessions?.();
      if (await readPasswordHash() !== passwordHash) {
        return reply.status(401).send({ error: 'Current password is incorrect' });
      }
      await writePasswordHash(newHash);
      return { ok: true };
    });
  });

  // Auth check endpoint — lets the frontend check if session is valid
  app.get('/api/v1/auth/check', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.session.get('authenticated')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    return { ok: true };
  });

  // Authorize using the route selected by Fastify, with explicit public exceptions.
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.routeOptions.url?.startsWith('/api/') || request.routeOptions.config.publicApi) return;
    if (!request.session.get('authenticated')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  app.addHook('preValidation', (request, reply, done) => {
    if (!CSRF_MUTATING.has(request.method) || request.routeOptions.config.publicApi) return done();
    return app.csrfProtection(request, reply, done);
  });
}
