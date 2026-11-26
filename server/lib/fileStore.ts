import fs from 'node:fs/promises';
import { constants, type Stats } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { filenameToId } from './noteParser.js';

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

/** Check lexical containment. File operations also check filesystem entry types. */
export function safePath(notesDir: string, filename: string): string {
  const resolved = path.resolve(notesDir, filename);
  if (filename.includes('\0') || !isWithin(notesDir, resolved)) {
    throw Object.assign(new Error('Path traversal denied'), { statusCode: 400 });
  }
  return resolved;
}

function childFilePath(directory: string, filename: string): string {
  if (!filename || filename === '.' || filename === '..' || path.basename(filename) !== filename) {
    throw Object.assign(new Error('Path traversal denied'), { statusCode: 400 });
  }
  return safePath(directory, filename);
}

function unsafeEntry(): Error {
  return Object.assign(new Error('Unsafe notes directory entry'), { statusCode: 403 });
}

function sameEntry(first: Stats, second: Stats): boolean {
  return first.dev === second.dev && first.ino === second.ino;
}

async function directoryStats(directory: string): Promise<Stats> {
  const stats = await fs.lstat(directory);
  if (!stats.isDirectory()) throw unsafeEntry();
  return stats;
}

/** Check each directory from the configured root down. Recheck its identity after asynchronous I/O. */
async function guardDirectory(notesDir: string, directory: string): Promise<() => Promise<void>> {
  const root = path.resolve(notesDir);
  if (!isWithin(root, directory)) throw unsafeEntry();
  const directories = [{ path: root, stats: await directoryStats(root) }];
  let current = root;
  if (directory !== root) {
    for (const component of path.relative(root, directory).split(path.sep)) {
      current = path.join(current, component);
      directories.push({ path: current, stats: await directoryStats(current) });
    }
  }
  return async () => {
    for (const entry of directories) {
      if (!sameEntry(entry.stats, await directoryStats(entry.path))) throw unsafeEntry();
    }
  };
}

interface WriteDirectory {
  path: string;
  recheck: () => Promise<void>;
}

async function withWriteDirectory<T>(
  entryPath: string,
  operation: (directory: WriteDirectory) => Promise<T>,
  parent?: WriteDirectory,
): Promise<T> {
  if (parent) {
    await parent.recheck();
    await fs.mkdir(entryPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
  }
  const expected = await directoryStats(entryPath);
  // Linux procfs keeps each mutation relative to the opened directory if its pathname is replaced.
  // The portable path uses identity checks before writes and renames.
  const handle = process.platform === 'linux'
    ? await fs.open(entryPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    : undefined;
  try {
    if (handle && !sameEntry(expected, await handle.stat())) throw unsafeEntry();
    const recheck = async () => {
      await parent?.recheck();
      if (!sameEntry(expected, await directoryStats(entryPath))) throw unsafeEntry();
    };
    return await operation({ path: handle ? `/proc/self/fd/${handle.fd}` : entryPath, recheck });
  } finally {
    await handle?.close();
  }
}

async function regularFileStats(filePath: string): Promise<Stats> {
  const stats = await fs.lstat(filePath);
  if (!stats.isFile()) throw unsafeEntry();
  return stats;
}

async function checkDestination(filePath: string): Promise<void> {
  await regularFileStats(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

async function readRegularFile(notesDir: string, filePath: string): Promise<{ data: Buffer; stats: Stats }> {
  const recheck = await guardDirectory(notesDir, path.dirname(filePath));
  const expected = await regularFileStats(filePath);
  // O_NOFOLLOW guards the final component. O_NONBLOCK handles a FIFO replacing it before open.
  const file = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stats = await file.stat();
    if (!stats.isFile() || !sameEntry(expected, stats)) throw unsafeEntry();
    await recheck();
    return { data: await file.readFile(), stats };
  } finally {
    await file.close();
  }
}

async function writeAtomically(filePath: string, content: string | Buffer, recheck: () => Promise<void>): Promise<void> {
  await checkDestination(filePath);
  await recheck();
  const tmpPath = filePath + '.tmp.' + crypto.randomBytes(8).toString('hex');
  const file = await fs.open(tmpPath, 'wx');
  try {
    try {
      await recheck();
      await file.writeFile(content);
    } finally {
      await file.close();
    }
    await checkDestination(filePath);
    await recheck();
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    // Only clean up a temp file we created, in the directory we originally checked.
    await recheck().then(() => fs.unlink(tmpPath)).catch(() => {});
    throw error;
  }
}

export function isNoteFilename(filename: string): boolean {
  return filename.endsWith('.md') && !filename.startsWith('_') && !filename.startsWith('.') &&
    !filename.includes('.syncthing');
}

/** List regular .md files, excluding _*, .*, and .syncthing temp files. */
export async function listNoteFiles(notesDir: string): Promise<string[]> {
  await directoryStats(notesDir);
  const entries = await fs.readdir(notesDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && isNoteFilename(entry.name)).map((entry) => entry.name);
}

/** Read a note and its metadata from the same regular file. */
export async function readNoteSnapshot(notesDir: string, filename: string) {
  const { data, stats } = await readRegularFile(notesDir, childFilePath(notesDir, filename));
  return { body: data.toString('utf-8'), mtime: stats.mtime, mtimeMs: stats.mtimeMs };
}

/** Read a note file as UTF-8. */
export async function readNoteFile(notesDir: string, filename: string): Promise<string> {
  return (await readNoteSnapshot(notesDir, filename)).body;
}

/** Write a note file with LF line endings (atomic: write to temp then rename). */
export async function writeNoteFile(notesDir: string, filename: string, content: string): Promise<void> {
  const filePath = childFilePath(notesDir, filename);
  await withWriteDirectory(path.dirname(filePath), async (directory) => {
    await writeAtomically(path.join(directory.path, filename), content.replace(/\r\n/g, '\n'), directory.recheck);
  });
}

/** Move a note to _trash/ (create if needed). */
export async function deleteNoteFile(notesDir: string, filename: string): Promise<void> {
  const filePath = childFilePath(notesDir, filename);
  await withWriteDirectory(path.dirname(filePath), async (root) => {
    const source = path.join(root.path, filename);
    await regularFileStats(source);
    await withWriteDirectory(path.join(root.path, '_trash'), async (trash) => {
      const destination = path.join(trash.path, filename);
      await checkDestination(destination);
      await trash.recheck();
      await fs.rename(source, destination);
    }, root);
  });
}

/** Rename a note file on disk. */
export async function renameNoteFile(notesDir: string, oldFilename: string, newFilename: string): Promise<void> {
  const rootPath = path.dirname(childFilePath(notesDir, oldFilename));
  childFilePath(notesDir, newFilename);
  await withWriteDirectory(rootPath, async (directory) => {
    const source = path.join(directory.path, oldFilename);
    const destination = path.join(directory.path, newFilename);
    await regularFileStats(source);
    await checkDestination(destination);
    await directory.recheck();
    await fs.rename(source, destination);
  });
}

/** Return the mtime of a regular note file. */
export async function statNoteFile(notesDir: string, filename: string): Promise<{ mtime: Date; mtimeMs: number }> {
  const filePath = childFilePath(notesDir, filename);
  await directoryStats(path.dirname(filePath));
  const stats = await regularFileStats(filePath);
  return { mtime: stats.mtime, mtimeMs: stats.mtimeMs };
}

/** Read a file from NOTES_DIR/media/. Nested directories must also be real directories. */
export async function readMediaFile(notesDir: string, relativePath: string): Promise<Buffer> {
  const mediaDir = path.resolve(notesDir, 'media');
  const filePath = path.resolve(notesDir, relativePath);
  if (relativePath.includes('\0') || filePath === mediaDir || !isWithin(mediaDir, filePath)) {
    throw Object.assign(new Error('Forbidden media path'), { statusCode: 403 });
  }
  return (await readRegularFile(notesDir, filePath)).data;
}

/** Write a binary file atomically to NOTES_DIR/media/. Returns the relative path "media/<filename>". */
export async function writeMediaFile(notesDir: string, filename: string, data: Buffer): Promise<string> {
  childFilePath(notesDir, filename);
  await withWriteDirectory(path.resolve(notesDir), async (root) => {
    await withWriteDirectory(path.join(root.path, 'media'), async (media) => {
      await writeAtomically(path.join(media.path, filename), data, media.recheck);
    }, root);
  });
  return 'media/' + filename;
}

/** Find the file in notesDir matching the given ID (timestamp ID or full filename stem). */
export async function findFileById(notesDir: string, id: string): Promise<string | null> {
  if (!id) return null;
  const files = await listNoteFiles(notesDir);
  // Numeric timestamp IDs must match exactly after parsing the filename prefix.
  // A raw startsWith match lets YYYYMMDDHHMM collide with YYYYMMDDHHMMSS.
  if (/^\d{12,14}$/.test(id)) {
    return files.find((f) => filenameToId(f) === id) ?? null;
  }
  const stem = id.replace(/\.md$/i, '');
  return files.find((f) => f.replace(/\.md$/i, '') === stem) ?? null;
}
