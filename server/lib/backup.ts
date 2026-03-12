import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const BACKUP_DIR_NAME = '_backups';
const DEFAULT_KEEP = 7;

/**
 * Create a timestamped tar.gz snapshot of notesDir, stored in notesDir/_backups/.
 * Excludes _backups/ and _trash/ from the archive.
 * Returns the path to the created archive.
 */
export async function createBackup(notesDir: string): Promise<string> {
  const backupDir = path.join(notesDir, BACKUP_DIR_NAME);
  await fs.mkdir(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 17); // YYYYMMDDHHmmssSSS
  const filename = `backup-${timestamp}.tar.gz`;
  const dest = path.join(backupDir, filename);

  const parentDir = path.dirname(notesDir);
  const baseName = path.basename(notesDir);

  await execFileAsync('tar', [
    '-czf', dest,
    `--exclude=${baseName}/${BACKUP_DIR_NAME}`,
    `--exclude=${baseName}/_trash`,
    '-C', parentDir,
    baseName,
  ]);

  return dest;
}

/**
 * Delete the oldest backup archives, retaining only the `keep` most recent.
 */
export async function pruneBackups(notesDir: string, keep: number = DEFAULT_KEEP): Promise<void> {
  const backupDir = path.join(notesDir, BACKUP_DIR_NAME);

  let entries: string[];
  try {
    entries = await fs.readdir(backupDir);
  } catch {
    return; // _backups/ doesn't exist yet — nothing to prune
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
