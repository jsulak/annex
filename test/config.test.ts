import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  migrateLegacyAuth, readPasswordHash, readSettings, updateSettings, writePasswordHash,
} from '../server/lib/config.js';

const LEGACY_HASH = '$2b$12$6qQXBZMeoIFGTDf3NSkX5.q1kH62vYIfaxpmiFv3oHJMdslONT0wy';
const NEW_HASH = '$2b$12$6vrCipuW.vXwiXO1GaUcS.nahAIDZIkpG/aE/YL0zy8QPmvKjOpiO';

let tempDir: string;
let notesDir: string;
let configDir: string;
let syncedFile: string;
let authFile: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'annex-config-'));
  notesDir = path.join(tempDir, 'notes');
  configDir = path.join(tempDir, 'private');
  syncedFile = path.join(notesDir, '_annex.json');
  authFile = path.join(configDir, 'auth.json');
  await fs.mkdir(notesDir);
  vi.stubEnv('NOTES_DIR', notesDir);
  vi.stubEnv('CONFIG_DIR', configDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('reads synced settings without importing authentication state', async () => {
  await fs.writeFile(syncedFile, JSON.stringify({ passwordHash: LEGACY_HASH, settings: { fontSize: 15 } }));

  expect(await readPasswordHash()).toBe('');
  expect((await readSettings()).fontSize).toBe(15);
  await expect(fs.stat(authFile)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('explicit migration preserves settings and stores the hash privately with mode 0600', async () => {
  await fs.writeFile(syncedFile, JSON.stringify({ passwordHash: LEGACY_HASH, settings: { fontSize: 15 } }));

  await migrateLegacyAuth();

  expect(await readPasswordHash()).toBe(LEGACY_HASH);
  expect(JSON.parse(await fs.readFile(syncedFile, 'utf8'))).toEqual({ settings: { fontSize: 15 } });
  expect((await fs.stat(authFile)).mode & 0o777).toBe(0o600);

  await writePasswordHash(NEW_HASH);
  expect(await readPasswordHash()).toBe(NEW_HASH);
  expect((await fs.stat(authFile)).mode & 0o777).toBe(0o600);
});

test('the setup migration command runs without a prompt', async () => {
  await fs.writeFile(syncedFile, JSON.stringify({ passwordHash: LEGACY_HASH, settings: { fontSize: 15 } }));

  const { stdout } = await promisify(execFile)(process.execPath, [
    '--import', 'tsx', 'server/setup.ts', '--migrate-auth',
  ], { env: { ...process.env, NODE_ENV: 'production' } });

  expect(stdout).toContain('Private authentication state is ready.');
  expect(await readPasswordHash()).toBe(LEGACY_HASH);
  expect(JSON.parse(await fs.readFile(syncedFile, 'utf8'))).toEqual({ settings: { fontSize: 15 } });
});

test('a reintroduced legacy hash cannot replace or recover private state', async () => {
  await fs.writeFile(syncedFile, JSON.stringify({ passwordHash: LEGACY_HASH }));
  await migrateLegacyAuth();
  await writePasswordHash(NEW_HASH);
  await fs.writeFile(syncedFile, JSON.stringify({ passwordHash: LEGACY_HASH }));

  expect(await readPasswordHash()).toBe(NEW_HASH);
  await migrateLegacyAuth();
  expect(await readPasswordHash()).toBe(NEW_HASH);
  expect(JSON.parse(await fs.readFile(syncedFile, 'utf8'))).toEqual({});

  await fs.unlink(authFile);
  await fs.writeFile(syncedFile, JSON.stringify({ passwordHash: LEGACY_HASH }));
  expect(await readPasswordHash()).toBe('');
  await expect(migrateLegacyAuth()).rejects.toThrow(/already disabled/);
  await expect(fs.stat(authFile)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('malformed private state is rejected without looking up the legacy hash', async () => {
  await fs.writeFile(syncedFile, JSON.stringify({ passwordHash: LEGACY_HASH }));
  await writePasswordHash(NEW_HASH);
  await fs.writeFile(authFile, '{');

  await expect(readPasswordHash()).rejects.toThrow(/Invalid JSON/);
  await expect(migrateLegacyAuth()).rejects.toThrow(/Invalid JSON/);
  expect(JSON.parse(await fs.readFile(syncedFile, 'utf8')).passwordHash).toBe(LEGACY_HASH);
});

test('settings writes discard credential fields and auth writes preserve newer settings', async () => {
  await writePasswordHash(LEGACY_HASH);
  const patch = { fontSize: 16, passwordHash: NEW_HASH };
  await updateSettings(patch);
  expect(await readPasswordHash()).toBe(LEGACY_HASH);
  expect(await fs.readFile(syncedFile, 'utf8')).not.toContain('passwordHash');

  await writePasswordHash(NEW_HASH);
  expect(await readPasswordHash()).toBe(NEW_HASH);
  expect((await readSettings()).fontSize).toBe(16);
});

test('private state cannot be placed inside the notes tree via a symlink', async () => {
  await fs.symlink(notesDir, configDir, 'dir');
  vi.stubEnv('CONFIG_DIR', path.join(configDir, 'new-directory'));

  await expect(writePasswordHash(LEGACY_HASH)).rejects.toThrow(/outside NOTES_DIR/);
  expect(await fs.readdir(notesDir)).toEqual([]);
});
