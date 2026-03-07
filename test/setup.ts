import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import { registerAuth } from '../server/auth.js';
import { registerNotes } from '../server/routes/notes.js';
import { registerSearch } from '../server/routes/search.js';
import { registerTags } from '../server/routes/tags.js';
import { registerEvents } from '../server/routes/events.js';
import { registerConfig } from '../server/routes/config.js';
import { buildIndex } from '../server/lib/searchIndex.js';
import { startWatcher, stopWatcher } from '../server/lib/watcher.js';

const SEED_DIR = path.join(import.meta.dirname, '..', 'e2e', 'fixtures', 'seed-notes');
const PASSWORD = 'testpassword';

export interface TestContext {
  baseUrl: string;
  notesDir: string;
  cookie: string;
  app: FastifyInstance;
}

export async function startTestServer(): Promise<TestContext> {
  // Create temp dir with seed notes
  const notesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zettelweb-test-'));

  const config = {
    passwordHash: '$2b$12$6qQXBZMeoIFGTDf3NSkX5.q1kH62vYIfaxpmiFv3oHJMdslONT0wy',
    savedSearches: [],
    settings: {
      autoSaveDelay: 500,
      showSnippets: false,
      editorWidth: 680,
      fontSize: 13,
      noteTemplate: '',
      indexExtensions: ['.md'],
      darkMode: 'auto',
    },
  };
  fs.writeFileSync(path.join(notesDir, '_zettelweb.json'), JSON.stringify(config, null, 2));

  for (const file of fs.readdirSync(SEED_DIR)) {
    fs.copyFileSync(path.join(SEED_DIR, file), path.join(notesDir, file));
  }

  // Set env for config.ts (it reads NOTES_DIR)
  process.env.NOTES_DIR = notesDir;

  const app = Fastify({ logger: false });

  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret: 'testsecrettestsecrettestsecrettest',
    cookieName: 'zettelweb_session',
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
    },
  });

  await registerAuth(app, notesDir);
  await registerNotes(app, notesDir);
  await registerSearch(app);
  await registerTags(app, notesDir);
  await registerEvents(app);
  await registerConfig(app);

  app.get('/api/v1/health', async () => ({ status: 'ok' }));

  await buildIndex(notesDir);
  await startWatcher(notesDir);

  const address = await app.listen({ port: 0, host: '127.0.0.1' });

  // Login to get session cookie
  const loginRes = await fetch(`${address}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const setCookie = loginRes.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0];

  return { baseUrl: address, notesDir, cookie, app };
}

export async function stopTestServer(ctx: TestContext): Promise<void> {
  await stopWatcher();
  await ctx.app.close();
  await fsp.rm(ctx.notesDir, { recursive: true, force: true });
}

/** Typed fetch helper that includes auth cookie and JSON content-type. */
export function api(ctx: TestContext) {
  const base = ctx.baseUrl;
  const headers = (extra?: Record<string, string>) => ({
    'Content-Type': 'application/json',
    Cookie: ctx.cookie,
    ...extra,
  });

  return {
    get: (path: string) =>
      fetch(`${base}${path}`, { headers: headers() }),

    put: (path: string, body: unknown, extraHeaders?: Record<string, string>) =>
      fetch(`${base}${path}`, {
        method: 'PUT',
        headers: headers(extraHeaders),
        body: JSON.stringify(body),
      }),

    post: (path: string, body: unknown) =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      }),

    delete: (path: string) =>
      fetch(`${base}${path}`, { method: 'DELETE', headers: { Cookie: ctx.cookie } }),

    /** Make a request without auth cookie. */
    unauthed: (method: string, path: string, body?: unknown) =>
      fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }),
  };
}

let idCounter = 0;
/** Generate unique 12-digit note IDs for tests. */
export function nextId(): string {
  idCounter++;
  const hh = String(Math.floor(idCounter / 60)).padStart(2, '0');
  const mm = String(idCounter % 60).padStart(2, '0');
  return `20980101${hh}${mm}`;
}
