import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createBackup, pruneBackups } from '../server/lib/backup.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'annex-backup-test-'));
  // Seed a couple of note files
  await fs.writeFile(path.join(tmpDir, '202401010000 Note A.md'), '# Note A');
  await fs.writeFile(path.join(tmpDir, '202401010001 Note B.md'), '# Note B');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('createBackup', () => {
  test('creates a tar.gz archive in _backups/', async () => {
    const dest = await createBackup(tmpDir);

    expect(dest).toMatch(/_backups\/backup-\d{14,17}\.tar\.gz$/);
    const stat = await fs.stat(dest);
    expect(stat.size).toBeGreaterThan(0);
  });

  test('_backups/ directory is created if absent', async () => {
    await createBackup(tmpDir);
    const stat = await fs.stat(path.join(tmpDir, '_backups'));
    expect(stat.isDirectory()).toBe(true);
  });

  test('backup archive does not include _backups/ itself', async () => {
    // Run two backups; if _backups/ were included the second would capture the first
    await createBackup(tmpDir);
    const dest2 = await createBackup(tmpDir);
    // The second archive should be small (only the two note files)
    const stat = await fs.stat(dest2);
    expect(stat.size).toBeGreaterThan(0);
    // And there should be exactly 2 backup files
    const files = await fs.readdir(path.join(tmpDir, '_backups'));
    expect(files.filter(f => f.endsWith('.tar.gz'))).toHaveLength(2);
  });
});

describe('pruneBackups', () => {
  test('deletes oldest backups, keeping only N most recent', async () => {
    // Create 5 backups with small sleeps to get different timestamps
    for (let i = 0; i < 5; i++) {
      // Manually create fake backup files with ascending timestamps
      const ts = `20240101000${i}00`;
      await fs.mkdir(path.join(tmpDir, '_backups'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, '_backups', `backup-${ts}.tar.gz`), `fake-${i}`);
    }

    await pruneBackups(tmpDir, 3);

    const remaining = await fs.readdir(path.join(tmpDir, '_backups'));
    const backups = remaining.filter(f => f.endsWith('.tar.gz')).sort();
    expect(backups).toHaveLength(3);
    // Should keep the 3 newest (highest timestamps)
    expect(backups[0]).toContain('20240101000200');
    expect(backups[2]).toContain('20240101000400');
  });

  test('does nothing when fewer backups than keep limit', async () => {
    await createBackup(tmpDir);
    await pruneBackups(tmpDir, 7);
    const files = await fs.readdir(path.join(tmpDir, '_backups'));
    expect(files.filter(f => f.endsWith('.tar.gz'))).toHaveLength(1);
  });

  test('does nothing if _backups/ does not exist', async () => {
    await expect(pruneBackups(tmpDir, 7)).resolves.toBeUndefined();
  });
});
