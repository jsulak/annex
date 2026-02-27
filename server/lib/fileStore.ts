import fs from 'node:fs/promises';
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

/** Write a note file with LF line endings. */
export async function writeNoteFile(notesDir: string, filename: string, content: string): Promise<void> {
  const filePath = safePath(notesDir, filename);
  const normalized = content.replace(/\r\n/g, '\n');
  await fs.writeFile(filePath, normalized, 'utf-8');
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

/** Find the file in notesDir whose name starts with the given ID. */
export async function findFileById(notesDir: string, id: string): Promise<string | null> {
  const files = await listNoteFiles(notesDir);
  return files.find((f) => f.startsWith(id)) ?? null;
}
