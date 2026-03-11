import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcrypt';
import { readConfig, writeConfig } from './lib/config.js';

const BCRYPT_ROUNDS = 12;

declare module 'fastify' {
  interface Session {
    authenticated?: boolean;
  }
}

export async function registerAuth(app: FastifyInstance, _notesDir: string) {
  // Rate limiting on login endpoint
  await app.register(rateLimit, {
    max: 5,
    timeWindow: 15 * 60 * 1000, // 15 minutes
    keyGenerator: (req) => req.ip,
    hook: 'preHandler',
    allowList: [],
    // Only apply to login route via route-level config
    global: false,
  });

  // Login route
  app.post('/api/v1/auth/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: 15 * 60 * 1000,
        keyGenerator: (req: FastifyRequest) => req.ip,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
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
      // Artificial delay to slow brute-force attempts
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return reply.status(401).send({ error: 'Incorrect password' });
    }

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
        max: 5,
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
