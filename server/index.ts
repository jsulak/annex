import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import helmet from '@fastify/helmet';
import { registerAuth } from './auth.js';
import { registerNotes } from './routes/notes.js';
import { registerSearch } from './routes/search.js';
import { registerTags } from './routes/tags.js';
import { registerEvents } from './routes/events.js';
import { registerConfig } from './routes/config.js';
import { buildIndex } from './lib/searchIndex.js';
import { startWatcher } from './lib/watcher.js';

function requireEnv(name: string, minLength = 1): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} environment variable is required`);
    process.exit(1);
  }
  if (value.length < minLength) {
    console.error(`${name} must be at least ${minLength} characters`);
    process.exit(1);
  }
  return value;
}

const NOTES_DIR = requireEnv('NOTES_DIR');
const SESSION_SECRET = requireEnv('SESSION_SECRET', 32);

const PORT = parseInt(process.env.PORT || '3000', 10);
const SESSION_MAX_AGE_DAYS = parseInt(process.env.SESSION_MAX_AGE_DAYS || '30', 10);
const IS_PROD = process.env.NODE_ENV === 'production';

// Resolve and validate NOTES_DIR
const resolvedNotesDir = path.resolve(NOTES_DIR);

async function start() {
  // Ensure NOTES_DIR exists
  try {
    await fs.access(resolvedNotesDir);
  } catch {
    console.error(`NOTES_DIR does not exist: ${resolvedNotesDir}`);
    process.exit(1);
  }

  const app = Fastify({
    logger: true,
    trustProxy: IS_PROD,
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: IS_PROD ? undefined : false,
  });

  // Cookie + session
  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret: SESSION_SECRET,
    cookieName: 'annex_session',
    cookie: {
      maxAge: SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'strict',
      path: '/',
    },
  });

  // Auth routes and middleware
  await registerAuth(app, resolvedNotesDir);

  // Notes API
  await registerNotes(app, resolvedNotesDir);

  // Search API
  await registerSearch(app);

  // Tags API
  await registerTags(app, resolvedNotesDir);

  // SSE events endpoint
  await registerEvents(app);

  // Config API
  await registerConfig(app);

  // Build search index
  const indexed = await buildIndex(resolvedNotesDir);
  console.log(`Search index built: ${indexed} notes indexed`);

  // Start file watcher (after index is built)
  await startWatcher(resolvedNotesDir);

  // Health check (public)
  app.get('/api/v1/health', async () => {
    return { status: 'ok' };
  });

  // Block search engine indexing
  app.get('/robots.txt', async (_request, reply) => {
    return reply.type('text/plain').send('User-agent: *\nDisallow: /\n');
  });

  // Serve static frontend in production
  if (IS_PROD) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const distPath = path.join(__dirname, '..', 'client');
    await app.register(fastifyStatic, {
      root: distPath,
      wildcard: false,
    });

    // SPA fallback: serve index.html for non-API routes
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  const host = IS_PROD ? '127.0.0.1' : '0.0.0.0';
  await app.listen({ port: PORT, host });
  console.log(`Annex server listening on port ${PORT}`);
  console.log(`Notes directory: ${resolvedNotesDir}`);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
