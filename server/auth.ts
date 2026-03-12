import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcrypt';
import { readConfig, writeConfig } from './lib/config.js';

const BCRYPT_ROUNDS = 12;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

interface LockoutEntry {
  failures: number;
  lockedUntil?: number;
}

declare module 'fastify' {
  interface Session {
    authenticated?: boolean;
  }
}

export interface AuthOptions {
  /** Max login requests per timeWindow before rate-limiting. Default: 20. */
  rateLimitMax?: number;
  /** Artificial delay (ms) on wrong password. Default: 1000. */
  loginDelayMs?: number;
}

export async function registerAuth(app: FastifyInstance, _notesDir: string, opts: AuthOptions = {}) {
  const rateLimitMax = opts.rateLimitMax ?? 20;
  const loginDelayMs = opts.loginDelayMs ?? 1000;

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
      return reply.status(429).send({
        error: 'Too many failed login attempts. Account locked for 15 minutes.',
      });
    }

    const { password } = request.body as { password: string };

    if (!password || typeof password !== 'string') {
      return reply.status(400).send({ error: 'Password is required' });
    }

    const config = await readConfig();
    if (!config.passwordHash) {
      return reply.status(500).send({ error: 'No password configured. Run: npm run setup' });
    }

    const valid = await bcrypt.compare(password, config.passwordHash);
    if (!valid) {
      recordFailure(ip);
      if (loginDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, loginDelayMs));
      }
      return reply.status(401).send({ error: 'Incorrect password' });
    }

    resetLockout(ip);
    request.session.set('authenticated', true);
    return { ok: true };
  });

  // Logout route
  app.post('/api/v1/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    void request.session.destroy();
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

    const { currentPassword, newPassword } = request.body as {
      currentPassword: string;
      newPassword: string;
    };

    if (!currentPassword || !newPassword) {
      return reply.status(400).send({ error: 'Both currentPassword and newPassword are required' });
    }

    if (newPassword.length < 8) {
      return reply.status(400).send({ error: 'New password must be at least 8 characters' });
    }

    const config = await readConfig();
    const valid = await bcrypt.compare(currentPassword, config.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Current password is incorrect' });
    }

    config.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await writeConfig(config);

    // Destroy current session (user must re-login)
    void request.session.destroy();
    return { ok: true };
  });

  // Auth check endpoint — lets the frontend check if session is valid
  app.get('/api/v1/auth/check', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.session.get('authenticated')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    return { ok: true };
  });

  // Protect all /api/v1/* routes except login and health
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip non-API routes
    if (!request.url.startsWith('/api/v1/')) {
      return;
    }

    // Public routes
    const publicRoutes = ['/api/v1/auth/login', '/api/v1/health'];
    if (publicRoutes.some((route) => request.url.startsWith(route))) {
      return;
    }

    if (!request.session.get('authenticated')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
}
