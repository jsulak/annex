import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

/** Resolve a filename within notesDir and assert it stays inside. */
export function safePath(notesDir: string, filename: string): string {
  const resolved = path.resolve(notesDir, filename);
  const resolvedDir = path.resolve(notesDir);
  if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
    throw Object.assign(new Error('Path traversal denied'), { statusCode: 400 });
  }
  return resolved;
}

/** List .md files, excluding _*, .*, and .syncthing temp files. */
export async function listNoteFiles(notesDir: string): Promise<string[]> {
  const entries = await fs.readdir(notesDir);
  return entries.filter((f) => {
    if (f.startsWith('_') || f.startsWith('.')) return false;
    if (f.includes('.syncthing')) return false;
    return f.endsWith('.md');
  });
}

/** Read a note file as UTF-8. */
export async function readNoteFile(notesDir: string, filename: string): Promise<string> {
  const filePath = safePath(notesDir, filename);
  return fs.readFile(filePath, 'utf-8');
}

/** Write a note file with LF line endings (atomic: write to temp then rename). */
export async function writeNoteFile(notesDir: string, filename: string, content: string): Promise<void> {
  const filePath = safePath(notesDir, filename);
  const normalized = content.replace(/\r\n/g, '\n');
  const tmpPath = filePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  await fs.writeFile(tmpPath, normalized, 'utf-8');
  await fs.rename(tmpPath, filePath);
}

/** Move a note to _trash/ (create if needed). Never unlinks. */
export async function deleteNoteFile(notesDir: string, filename: string): Promise<void> {
  const filePath = safePath(notesDir, filename);
  const trashDir = path.join(notesDir, '_trash');
  await fs.mkdir(trashDir, { recursive: true });
  const trashPath = path.join(trashDir, filename);
  await fs.rename(filePath, trashPath);
}

/** Rename a note file on disk. */
export async function renameNoteFile(notesDir: string, oldFilename: string, newFilename: string): Promise<void> {
  const oldPath = safePath(notesDir, oldFilename);
  const newPath = safePath(notesDir, newFilename);
  await fs.rename(oldPath, newPath);
}

/** Return the mtime of a note file. */
export async function statNoteFile(notesDir: string, filename: string): Promise<{ mtime: Date; mtimeMs: number }> {
  const filePath = safePath(notesDir, filename);
  const stat = await fs.stat(filePath);
  return { mtime: stat.mtime, mtimeMs: stat.mtimeMs };
}

/** Find the file in notesDir matching the given ID (numeric prefix or full filename stem). */
export async function findFileById(notesDir: string, id: string): Promise<string | null> {
  if (!id) return null;
  const files = await listNoteFiles(notesDir);
  // Numeric IDs match by prefix; non-numeric IDs match exact filename stem
  if (/^\d{12,14}$/.test(id)) {
    return files.find((f) => f.startsWith(id)) ?? null;
  }
  const stem = id.replace(/\.md$/i, '');
  return files.find((f) => f.replace(/\.md$/i, '') === stem) ?? null;
}
