import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { isNoteFilename, readNoteSnapshot } from './fileStore.js';
import { filenameToId, parseNote } from './noteParser.js';
import { addToIndex, removeFromIndex } from './searchIndex.js';

// --- SSE client management ---

interface SSEClient {
  write: (data: string) => boolean;
  end: () => void;
}

const clients = new Set<SSEClient>();
let pingInterval: ReturnType<typeof setInterval> | null = null;

export function addClient(client: SSEClient): void {
  clients.add(client);
  if (pingInterval === null && clients.size > 0) {
    pingInterval = setInterval(() => {
      for (const c of clients) {
        c.write(': ping\n\n');
      }
    }, 30_000);
  }
}

export function removeClient(client: SSEClient): void {
  clients.delete(client);
  if (clients.size === 0 && pingInterval !== null) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

export function broadcast(event: string, data: Record<string, unknown>): void {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    c.write(msg);
  }
}

// --- Self-write suppression ---

const suppressedPaths = new Map<string, ReturnType<typeof setTimeout>>();

export function suppressPath(filePath: string): void {
  const resolved = path.resolve(filePath);
  const existing = suppressedPaths.get(resolved);
  if (existing) clearTimeout(existing);
  suppressedPaths.set(
    resolved,
    setTimeout(() => suppressedPaths.delete(resolved), 2000),
  );
}

function isSuppressed(filePath: string): boolean {
  return suppressedPaths.has(path.resolve(filePath));
}

// --- Per-file debounce ---

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function debounceFile(filePath: string, fn: () => void): void {
  const existing = debounceTimers.get(filePath);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    filePath,
    setTimeout(() => {
      debounceTimers.delete(filePath);
      fn();
    }, 100),
  );
}

// --- Watcher ---

let watcher: FSWatcher | null = null;

export async function startWatcher(notesDir: string): Promise<void> {
  const root = path.resolve(notesDir);
  const currentWatcher = chokidar.watch(root, {
    ignoreInitial: true,
    ignored: [
      /(^|[/\\])(_annex|_trash|_backups|\.syncthing)/,
      (_filePath, stats) => stats !== undefined && !stats.isFile() && !stats.isDirectory(),
    ],
    depth: 0,
    followSymlinks: false,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });
  watcher = currentWatcher;

  function isWatchedNote(filePath: string): boolean {
    return path.dirname(path.resolve(filePath)) === root && isNoteFilename(path.basename(filePath));
  }

  async function handleAddOrChange(filePath: string, event: 'note:created' | 'note:modified') {
    if (isSuppressed(filePath) || !isWatchedNote(filePath)) return;

    const filename = path.basename(filePath);
    try {
      const { body, mtime, mtimeMs } = await readNoteSnapshot(root, filename);
      const note = parseNote(filename, body, mtime);
      const etag = Math.round(mtimeMs).toString(16);
      addToIndex({ ...note, body });
      broadcast(event, { id: note.id, filename: note.filename, etag });
    } catch (error) {
      const { code, statusCode } = error as NodeJS.ErrnoException & { statusCode?: number };
      if (code === 'ENOENT' || code === 'ELOOP' || statusCode === 403) handleUnlink(filePath);
    }
  }

  function handleUnlink(filePath: string) {
    if (isSuppressed(filePath) || !isWatchedNote(filePath)) return;

    const filename = path.basename(filePath);

    const id = filenameToId(filename);
    if (!id) return;

    removeFromIndex(id);
    broadcast('note:deleted', { id, filename });
  }

  currentWatcher.on('add', (filePath: string) => {
    debounceFile(filePath, () => void handleAddOrChange(filePath, 'note:created'));
  });

  currentWatcher.on('change', (filePath: string) => {
    debounceFile(filePath, () => void handleAddOrChange(filePath, 'note:modified'));
  });

  currentWatcher.on('unlink', (filePath: string) => {
    // No debounce on unlink — file is already gone
    handleUnlink(filePath);
  });
  currentWatcher.on('error', (error) => console.error('File watcher error:', error));

  await new Promise<void>((resolve) => currentWatcher.once('ready', resolve));
  console.log('File watcher started');
}

export async function stopWatcher(): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
  for (const timer of suppressedPaths.values()) {
    clearTimeout(timer);
  }
  suppressedPaths.clear();
  console.log('File watcher stopped');
}
