import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const BACKUP_DIR_NAME = '_backups';
const DEFAULT_KEEP = 7;

/**
 * Create a timestamped tar.gz snapshot of notesDir. Production uses a directory
 * outside the synced tree. Legacy archives, trash, and old settings files
 * that could still contain an authentication hash are always excluded.
 * Returns the path to the created archive.
 */
export async function createBackup(notesDir: string, backupDir = path.join(notesDir, BACKUP_DIR_NAME)): Promise<string> {
  await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
  if (!(await fs.lstat(backupDir)).isDirectory()) throw new Error('Backup destination must be a directory');

  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 17); // YYYYMMDDHHmmssSSS
  const filename = `backup-${timestamp}.tar.gz`;
  const dest = path.join(backupDir, filename);

  const parentDir = path.dirname(notesDir);
  const baseName = path.basename(notesDir);

  await execFileAsync('tar', [
    '-czf', dest,
    `--exclude=${baseName}/${BACKUP_DIR_NAME}`,
    `--exclude=${baseName}/_trash`,
    `--exclude=${baseName}/_annex.json`,
    `--exclude=${baseName}/_annex.sync-conflict-*.json`,
    '-C', parentDir,
    baseName,
  ]);

  return dest;
}

/**
 * Delete the oldest backup archives, retaining only the `keep` most recent.
 */
export async function pruneBackups(notesDir: string, keep: number = DEFAULT_KEEP, backupDir = path.join(notesDir, BACKUP_DIR_NAME)): Promise<void> {

  let entries: string[];
  try {
    if (!(await fs.lstat(backupDir)).isDirectory()) throw new Error('Backup destination must be a directory');
    entries = await fs.readdir(backupDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }

  const backups = entries
    .filter((f) => f.startsWith('backup-') && f.endsWith('.tar.gz'))
    .sort(); // ISO-prefixed names sort chronologically

  const excess = backups.length - keep;
  if (excess <= 0) return;

  for (const f of backups.slice(0, excess)) {
    await fs.unlink(path.join(backupDir, f));
  }
}
