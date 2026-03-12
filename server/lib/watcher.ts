import path from 'node:path';
import fs from 'node:fs/promises';
import chokidar, { type FSWatcher } from 'chokidar';
import { parseNote } from './noteParser.js';
import { addToIndex, removeFromIndex } from './searchIndex.js';
import { filenameToId } from './noteParser.js';

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

function broadcast(event: string, data: Record<string, unknown>): void {
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

function isValidNoteFile(filename: string): boolean {
  if (filename.startsWith('_') || filename.startsWith('.')) return false;
  if (filename.includes('.syncthing')) return false;
  return filename.endsWith('.md');
}

export async function startWatcher(notesDir: string): Promise<void> {
  watcher = chokidar.watch(notesDir, {
    ignoreInitial: true,
    ignored: /(^|[/\\])(_annex|_trash|_backups|\.syncthing)/,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  async function handleAddOrChange(filePath: string, event: 'note:created' | 'note:modified') {
    if (isSuppressed(filePath)) return;

    const filename = path.basename(filePath);
    if (!isValidNoteFile(filename)) return;

    try {
      const body = await fs.readFile(filePath, 'utf-8');
      const stat = await fs.stat(filePath);
      const note = parseNote(filename, body, stat.mtime);
      addToIndex({ ...note, body });
      broadcast(event, { id: note.id, filename: note.filename });
    } catch {
      // File may have been deleted between event and read
    }
  }

  function handleUnlink(filePath: string) {
    if (isSuppressed(filePath)) return;

    const filename = path.basename(filePath);
    if (!isValidNoteFile(filename)) return;

    const id = filenameToId(filename);
    if (!id) return;

    removeFromIndex(id);
    broadcast('note:deleted', { id, filename });
  }

  watcher.on('add', (filePath: string) => {
    debounceFile(filePath, () => void handleAddOrChange(filePath, 'note:created'));
  });

  watcher.on('change', (filePath: string) => {
    debounceFile(filePath, () => void handleAddOrChange(filePath, 'note:modified'));
  });

  watcher.on('unlink', (filePath: string) => {
    // No debounce on unlink — file is already gone
    handleUnlink(filePath);
  });

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
