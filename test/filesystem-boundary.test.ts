import { afterEach, beforeEach, expect, test } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  deleteNoteFile,
  findFileById,
  listNoteFiles,
  readNoteFile,
  renameNoteFile,
  statNoteFile,
  writeMediaFile,
  writeNoteFile,
} from '../server/lib/fileStore.js';
import { buildIndex, search } from '../server/lib/searchIndex.js';
import { startWatcher, stopWatcher } from '../server/lib/watcher.js';
import { registerAssets } from '../server/routes/assets.js';

let fixtureDir: string;
let notesDir: string;
let otherDir: string;

beforeEach(async () => {
  fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'annex-boundary-'));
  notesDir = path.join(fixtureDir, 'notes');
  otherDir = path.join(fixtureDir, 'other');
  await Promise.all([fs.mkdir(notesDir), fs.mkdir(otherDir)]);
});

afterEach(async () => {
  await fs.rm(fixtureDir, { recursive: true, force: true });
});

test('only regular note files are listed, looked up, and indexed', async () => {
  await fs.writeFile(path.join(notesDir, 'Regular.md'), 'Regular fixture');
  await fs.mkdir(path.join(notesDir, 'Directory.md'));
  await fs.symlink('Regular.md', path.join(notesDir, 'Link.md'));
  await fs.symlink('Absent.md', path.join(notesDir, 'Dangling.md'));

  expect(await listNoteFiles(notesDir)).toEqual(['Regular.md']);
  expect(await findFileById(notesDir, 'Link')).toBeNull();
  expect(await buildIndex(notesDir)).toBe(1);
  await expect(readNoteFile(notesDir, 'Link.md')).rejects.toThrow();
  await expect(statNoteFile(notesDir, 'Link.md')).rejects.toThrow();
});

test('note mutations reject symlink sources and destinations', async () => {
  const regular = path.join(notesDir, 'Regular.md');
  const link = path.join(notesDir, 'Link.md');
  await fs.writeFile(regular, 'Original fixture');
  await fs.symlink('Regular.md', link);

  await expect(writeNoteFile(notesDir, 'Link.md', 'Replacement fixture')).rejects.toThrow();
  await expect(renameNoteFile(notesDir, 'Regular.md', 'Link.md')).rejects.toThrow();
  await expect(renameNoteFile(notesDir, 'Link.md', 'Renamed.md')).rejects.toThrow();
  await expect(deleteNoteFile(notesDir, 'Link.md')).rejects.toThrow();
  expect(await fs.readFile(regular, 'utf8')).toBe('Original fixture');
  expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);
  expect((await fs.readdir(notesDir)).sort()).toEqual(['Link.md', 'Regular.md']);
});

test('note filenames stay in the root and media upload names stay in media', async () => {
  await fs.mkdir(path.join(notesDir, 'media'));
  await fs.writeFile(path.join(notesDir, 'Regular.md'), 'Regular fixture');

  await expect(writeNoteFile(notesDir, 'media/Nested.md', 'Nested fixture')).rejects.toThrow();
  await expect(renameNoteFile(notesDir, 'Regular.md', 'media/Nested.md')).rejects.toThrow();
  await expect(writeMediaFile(notesDir, '../Outside.png', Buffer.from('image fixture'))).rejects.toThrow();
  expect((await fs.readdir(notesDir)).sort()).toEqual(['Regular.md', 'media']);
});

test('trash and media mutations require real directories inside the note root', async () => {
  await fs.writeFile(path.join(notesDir, 'Regular.md'), 'Regular fixture');
  await fs.symlink(otherDir, path.join(notesDir, '_trash'));
  await fs.symlink(otherDir, path.join(notesDir, 'media'));

  await expect(deleteNoteFile(notesDir, 'Regular.md')).rejects.toThrow();
  await expect(writeMediaFile(notesDir, 'fixture.png', Buffer.from('image fixture'))).rejects.toThrow();
  expect(await fs.readdir(otherDir)).toEqual([]);
  expect(await fs.readFile(path.join(notesDir, 'Regular.md'), 'utf8')).toBe('Regular fixture');
});

test('trash and media writes reject symlinks inside real directories', async () => {
  const trash = path.join(notesDir, '_trash');
  const media = path.join(notesDir, 'media');
  await Promise.all([fs.mkdir(trash), fs.mkdir(media)]);
  await fs.writeFile(path.join(notesDir, 'Regular.md'), 'Regular fixture');
  await fs.symlink('Absent.md', path.join(trash, 'Regular.md'));
  await fs.symlink('absent.png', path.join(media, 'fixture.png'));

  await expect(deleteNoteFile(notesDir, 'Regular.md')).rejects.toThrow();
  await expect(writeMediaFile(notesDir, 'fixture.png', Buffer.from('image fixture'))).rejects.toThrow();
  expect(await fs.readlink(path.join(trash, 'Regular.md'))).toBe('Absent.md');
  expect(await fs.readlink(path.join(media, 'fixture.png'))).toBe('absent.png');
});

test('assets require a regular file below real media directories', async () => {
  const media = path.join(notesDir, 'media');
  const nested = path.join(media, 'nested');
  await fs.mkdir(nested, { recursive: true });
  await fs.writeFile(path.join(nested, 'image 100%.png'), 'image fixture');
  await fs.writeFile(path.join(otherDir, 'fixture.png'), 'image fixture');
  await fs.symlink('nested/image 100%.png', path.join(media, 'linked.png'));
  await fs.symlink(otherDir, path.join(media, 'linked-dir'));

  const app = Fastify();
  try {
    await registerAssets(app, notesDir);
    const image = await app.inject('/api/v1/assets/media/nested/image%20100%25.png');
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.body).toBe('image fixture');

    for (const asset of ['linked.png', 'linked-dir/fixture.png', 'nested']) {
      const response = await app.inject('/api/v1/assets/media/' + asset);
      expect(response.statusCode).toBe(403);
    }

    await fs.rename(media, path.join(notesDir, 'old-media'));
    await fs.symlink(otherDir, media);
    const response = await app.inject('/api/v1/assets/media/fixture.png');
    expect(response.statusCode).toBe(403);
  } finally {
    await app.close();
  }
});

test('large assets still return the full binary body for a range request', async () => {
  const media = path.join(notesDir, 'media');
  const contents = Buffer.alloc(5 * 1024 * 1024, 0xa5);
  await fs.mkdir(media);
  await fs.writeFile(path.join(media, 'fixture.mp4'), contents);

  const app = Fastify();
  try {
    await registerAssets(app, notesDir);
    const response = await app.inject({
      url: '/api/v1/assets/media/fixture.mp4',
      headers: { range: 'bytes=0-9' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('video/mp4');
    expect(response.headers['content-length']).toBe(String(contents.length));
    expect(response.headers['content-range']).toBeUndefined();
    expect(response.rawPayload.equals(contents)).toBe(true);
  } finally {
    await app.close();
  }
});

test('watcher drops a note replaced by a symlink and indexes a restored regular file', async () => {
  const file = path.join(notesDir, 'Regular.md');
  const target = path.join(otherDir, 'fixture.md');
  await fs.writeFile(target, 'Pomegranate fixture');
  await buildIndex(notesDir);
  await startWatcher(notesDir);

  try {
    await fs.writeFile(file, 'Tangerine fixture');
    await expect.poll(() => search('Tangerine'), { timeout: 3000 }).toHaveLength(1);

    const replacement = path.join(notesDir, '.replacement');
    await fs.symlink(target, replacement);
    await fs.rename(replacement, file);
    await expect.poll(() => search('Tangerine'), { timeout: 3000 }).toHaveLength(0);
    expect(search('Pomegranate')).toHaveLength(0);

    await fs.writeFile(replacement, 'Clementine fixture');
    await fs.rename(replacement, file);
    await expect.poll(() => search('Clementine'), { timeout: 3000 }).toHaveLength(1);
    expect(search('Pomegranate')).toHaveLength(0);
  } finally {
    await stopWatcher();
  }
}, 10_000);
