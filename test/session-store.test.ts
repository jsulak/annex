import { expect, test, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileSessionStore } from '../server/lib/sessionStore.js';

test.each(['one session', 'all sessions'])('persists revocation of %s after pending saves', async (scope) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'annex-session-order-'));
  const file = path.join(dir, 'sessions.json');
  const store = new FileSessionStore(file);
  const rename = fs.rename;
  const entered = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const renameSpy = vi.spyOn(fs, 'rename').mockImplementationOnce(async (from, to) => {
    entered.resolve();
    await resume.promise;
    return rename(from, to);
  });
  const mkdirSpy = vi.spyOn(fs, 'mkdir');
  const save = new Promise<void>((resolve, reject) => {
    store.set('id', { cookie: {}, authenticated: true }, err => err ? reject(err) : resolve());
  });

  try {
    await entered.promise;
    const revoke = scope === 'all sessions'
      ? store.destroyAll()
      : new Promise<void>((resolve, reject) => store.destroy('id', err => err ? reject(err) : resolve()));
    const writesWhileSaveIsPending = mkdirSpy.mock.calls.length;
    resume.resolve();
    await Promise.all([save, revoke]);

    expect(writesWhileSaveIsPending).toBe(1);
    const reloaded = new FileSessionStore(file);
    await reloaded.init();
    reloaded.get('id', (err, session) => {
      expect(err).toBeNull();
      expect(session).toBeNull();
    });
  } finally {
    resume.resolve();
    renameSpy.mockRestore();
    mkdirSpy.mockRestore();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('conditional saves preserve generations and cannot resurrect revoked sessions after restart', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'annex-session-cas-'));
  const file = path.join(dir, 'sessions.json');
  const store = new FileSessionStore(file);
  const save = (value: Parameters<FileSessionStore['set']>[1]) => new Promise<void>((resolve, reject) => {
    store.set('id', value, err => err ? reject(err) : resolve());
  });
  const update = (generation: string, value: Parameters<FileSessionStore['set']>[1]) => new Promise<void>((resolve, reject) => {
    store.compareAndSet('id', generation, value, err => err ? reject(err) : resolve());
  });
  const read = (target: FileSessionStore) => new Promise<unknown>((resolve, reject) => {
    target.get('id', (err, value) => err ? reject(err) : resolve(value));
  });
  try {
    await expect(update('id', { cookie: {} })).rejects.toMatchObject({ code: 'ENOENT' });
    // Legacy persisted sessions use the store key as their generation.
    await save({ cookie: {}, value: 'legacy' });
    const current = { cookie: {}, __fastifySessionMetadata: { generation: 'new' }, value: 'current' };
    await update('id', current);
    await expect(update('id', { cookie: {}, value: 'stale' })).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await read(store)).toEqual(current);
    await update('new', { ...current, value: 'updated' });
    const reloaded = new FileSessionStore(file);
    await reloaded.init();
    expect(await read(reloaded)).toEqual({ ...current, value: 'updated' });
    await new Promise<void>((resolve, reject) => store.destroy('id', err => err ? reject(err) : resolve()));
    await expect(update('new', current)).rejects.toMatchObject({ code: 'ENOENT' });
    await save(current);
    await store.destroyAll();
    await expect(update('new', current)).rejects.toMatchObject({ code: 'ENOENT' });
    const revoked = new FileSessionStore(file);
    await revoked.init();
    expect(await read(revoked)).toBeNull();
    await save({ cookie: { expires: new Date(0) } });
    await expect(update('id', current)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
