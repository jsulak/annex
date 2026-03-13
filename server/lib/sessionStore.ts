import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

type Callback = (err?: Error | null) => void;

// Minimal session shape — cookie.expires may be a Date or ISO string after JSON round-trip
interface StoredSession {
  cookie: { expires?: Date | string | null; [k: string]: unknown };
  [key: string]: unknown;
}

/** Custom file-backed session store for @fastify/session.
 *
 * Sessions are kept in memory and written atomically to a single JSON file
 * at `filePath` (mode 0600). On startup, call `init()` to load existing
 * sessions from disk — valid, non-expired sessions are restored; expired
 * ones are discarded.
 *
 * Cast to `unknown` when passing as `store` to fastifySession — the interface
 * is structurally compatible but the Fastify.Session namespace type isn't
 * directly importable.
 */
export class FileSessionStore {
  private sessions = new Map<string, StoredSession>();
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /** Load persisted sessions from disk. Call once before registering with Fastify. */
  async init(): Promise<void> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, 'utf-8');
    } catch {
      return; // File doesn't exist yet — nothing to load
    }

    let parsed: Record<string, StoredSession>;
    try {
      parsed = JSON.parse(raw) as Record<string, StoredSession>;
    } catch {
      return; // Corrupt file — start fresh
    }

    const now = Date.now();
    for (const [id, session] of Object.entries(parsed)) {
      if (this.isExpired(session, now)) continue;
      this.sessions.set(id, session);
    }
  }

  get(sessionId: string, callback: (err: Error | null, session: StoredSession | null) => void): void {
    const session = this.sessions.get(sessionId) ?? null;
    if (session && this.isExpired(session, Date.now())) {
      this.sessions.delete(sessionId);
      callback(null, null);
      return;
    }
    callback(null, session);
  }

  set(sessionId: string, session: StoredSession, callback: Callback): void {
    this.sessions.set(sessionId, session);
    this.pruneExpired();
    this.persist().then(() => callback(null), (err: unknown) => callback(err instanceof Error ? err : new Error(String(err))));
  }

  destroy(sessionId: string, callback: Callback): void {
    this.sessions.delete(sessionId);
    this.persist().then(() => callback(null), (err: unknown) => callback(err instanceof Error ? err : new Error(String(err))));
  }

  private isExpired(session: StoredSession, now: number): boolean {
    const expires = session?.cookie?.expires;
    if (!expires) return false;
    return new Date(expires).getTime() < now;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (this.isExpired(session, now)) this.sessions.delete(id);
    }
  }

  private async persist(): Promise<void> {
    const data: Record<string, unknown> = {};
    for (const [id, session] of this.sessions) {
      data[id] = session;
    }
    const json = JSON.stringify(data, null, 2);

    // Ensure parent directory exists with 0700 permissions
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });

    // Atomic write: temp file → rename, then lock down permissions
    const tmp = this.filePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
    await fs.writeFile(tmp, json, { encoding: 'utf-8', mode: 0o600 });
    await fs.rename(tmp, this.filePath);
    await fs.chmod(this.filePath, 0o600);
  }
}
