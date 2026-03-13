import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import csrf from '@fastify/csrf-protection';
import { registerAuth } from './auth.js';
import { registerNotes } from './routes/notes.js';
import { registerSearch } from './routes/search.js';
import { registerTags } from './routes/tags.js';
import { registerEvents } from './routes/events.js';
import { registerConfig } from './routes/config.js';
import { registerSync } from './routes/sync.js';
import { buildIndex, getIndexSize } from './lib/searchIndex.js';
import { startWatcher, stopWatcher } from './lib/watcher.js';
import { createBackup, pruneBackups } from './lib/backup.js';
import { FileSessionStore } from './lib/sessionStore.js';

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

const SYNCTHING_API_KEY = process.env.SYNCTHING_API_KEY || '';
const PORT = parseInt(process.env.PORT || '3000', 10);
const SESSION_MAX_AGE_DAYS = parseInt(process.env.SESSION_MAX_AGE_DAYS || '30', 10);
const IS_PROD = process.env.NODE_ENV === 'production';
const BACKUP_KEEP = parseInt(process.env.BACKUP_KEEP || '7', 10);
const BACKUP_INTERVAL_MS = parseInt(process.env.BACKUP_INTERVAL_HOURS || '24', 10) * 60 * 60 * 1000;

// Resolve and validate NOTES_DIR
const resolvedNotesDir = path.resolve(NOTES_DIR);

const SESSIONS_FILE = process.env.SESSIONS_FILE ||
  path.join(os.homedir(), '.annex', 'sessions.json');

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

  // Response compression (gzip/brotli/deflate)
  await app.register(compress, { global: true });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: IS_PROD ? undefined : false,
  });

  // Cookie + session (file-backed store persists sessions across restarts)
  const sessionStore = new FileSessionStore(SESSIONS_FILE);
  await sessionStore.init();
  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret: SESSION_SECRET,
    store: sessionStore,
    cookieName: 'annex_session',
    cookie: {
      maxAge: SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'strict',
      path: '/',
    },
  });

  // CSRF protection (registered after session, before routes)
  await app.register(csrf, { sessionPlugin: '@fastify/session' });

  // Apply CSRF validation to all mutating routes except login
  const CSRF_MUTATING = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
  app.addHook('preValidation', (request, reply, done) => {
    if (!CSRF_MUTATING.has(request.method)) return done();
    if (request.url === '/api/v1/auth/login') return done();
    return app.csrfProtection(request, reply, done);
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

  // Sync (Syncthing) API
  await registerSync(app, SYNCTHING_API_KEY, resolvedNotesDir);

  // Build search index
  const indexed = await buildIndex(resolvedNotesDir);
  console.log(`Search index built: ${indexed} notes indexed`);

  // Start file watcher (after index is built)
  await startWatcher(resolvedNotesDir);

  // CSRF token endpoint (authenticated — AppLayout fetches this on mount)
  app.get('/api/v1/auth/csrf-token', async (_request, reply) => {
    const token = await reply.generateCsrf();
    return reply.send({ token });
  });

  // Health check (public — safe for external uptime monitors)
  app.get('/api/v1/health', async (_request, reply) => {
    const mem = process.memoryUsage();

    // Disk usage of notes directory
    let notesDirBytes = 0;
    try {
      const files = await fs.readdir(resolvedNotesDir);
      for (const f of files) {
        try {
          const stat = await fs.stat(path.join(resolvedNotesDir, f));
          if (stat.isFile()) notesDirBytes += stat.size;
        } catch { /* skip */ }
      }
    } catch { /* skip */ }

    // Free disk space on the volume containing NOTES_DIR
    let disk: { freeBytes: number; totalBytes: number; usedPct: number } | null = null;
    try {
      const s = await fs.statfs(resolvedNotesDir);
      const freeBytes = s.bfree * s.bsize;
      const totalBytes = s.blocks * s.bsize;
      const usedPct = totalBytes > 0 ? Math.round(((totalBytes - freeBytes) / totalBytes) * 100) : 0;
      disk = { freeBytes, totalBytes, usedPct };
    } catch { /* statfs not available in older Node builds */ }

    return reply.send({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
      },
      noteCount: getIndexSize(),
      notesDirBytes,
      disk,
    });
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
      setHeaders: (res, filePath) => {
        if (filePath.includes('/assets/')) {
          // Hashed Vite assets — cache for 1 year
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          // index.html and other entry points — always revalidate
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
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

  // Automated backups — run after a 1-minute warm-up, then every BACKUP_INTERVAL_MS
  async function runBackup() {
    try {
      const dest = await createBackup(resolvedNotesDir);
      await pruneBackups(resolvedNotesDir, BACKUP_KEEP);
      console.log(`Backup created: ${path.basename(dest)}`);
    } catch (err) {
      console.error('Backup failed:', err);
    }
  }

  const backupTimer = setTimeout(() => {
    void runBackup();
    const recurring = setInterval(() => void runBackup(), BACKUP_INTERVAL_MS);
    recurring.unref();
  }, 60_000);
  backupTimer.unref();

  // Disk space monitor — warn when free space drops below LOW_DISK_WARN_PCT (default 10%)
  const LOW_DISK_WARN_PCT = parseInt(process.env.LOW_DISK_WARN_PCT || '10', 10);
  const DISK_CHECK_INTERVAL_MS = 60 * 60 * 1000; // every hour
  async function checkDiskSpace() {
    try {
      const s = await fs.statfs(resolvedNotesDir);
      const freeBytes = s.bfree * s.bsize;
      const totalBytes = s.blocks * s.bsize;
      const freePct = totalBytes > 0 ? Math.round((freeBytes / totalBytes) * 100) : 100;
      if (freePct < LOW_DISK_WARN_PCT) {
        const freeGB = (freeBytes / 1e9).toFixed(2);
        app.log.warn({ freeBytes, freePct }, `Low disk space: ${freeGB} GB free (${freePct}% remaining)`);
      }
    } catch { /* statfs not available — skip */ }
  }
  const diskCheckTimer = setInterval(() => void checkDiskSpace(), DISK_CHECK_INTERVAL_MS);
  diskCheckTimer.unref();

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearTimeout(backupTimer);
    console.log(`${signal} received — shutting down gracefully...`);
    try {
      await app.close();
      console.log('Fastify server closed');
    } catch (err) {
      console.error('Error closing Fastify:', err);
    }
    try {
      await stopWatcher();
    } catch (err) {
      console.error('Error stopping watcher:', err);
    }
    console.log('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
