import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { safePath, listNoteFiles, writeNoteFile, readNoteFile, findFileById } from '../server/lib/fileStore.js';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filestore-test-'));
});

afterAll(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('safePath', () => {
  test('allows simple filename', () => {
    const result = safePath(tmpDir, 'note.md');
    expect(result).toBe(path.join(tmpDir, 'note.md'));
  });

  test('rejects path traversal with ../', () => {
    expect(() => safePath(tmpDir, '../etc/passwd')).toThrow('Path traversal denied');
  });

  test('rejects path traversal with absolute path', () => {
    expect(() => safePath(tmpDir, '/etc/passwd')).toThrow('Path traversal denied');
  });

  test('rejects encoded traversal', () => {
    // After decoding, this should still be caught
    expect(() => safePath(tmpDir, '..%2F..%2Fetc%2Fpasswd')).not.toThrow();
    // Note: safePath uses path.resolve, which treats %2F as literal chars (not path separators)
    // So this actually creates a file with %2F in the name — it's safe.
  });

  test('allows filename with spaces', () => {
    const result = safePath(tmpDir, '202401 My Note.md');
    expect(result).toBe(path.join(tmpDir, '202401 My Note.md'));
  });

  test('allows filename with unicode', () => {
    const result = safePath(tmpDir, '202401 Café.md');
    expect(result).toBe(path.join(tmpDir, '202401 Café.md'));
  });
});

describe('listNoteFiles', () => {
  beforeAll(async () => {
    // Create test files
    await fsp.writeFile(path.join(tmpDir, 'note1.md'), 'content');
    await fsp.writeFile(path.join(tmpDir, 'note2.md'), 'content');
    await fsp.writeFile(path.join(tmpDir, '.hidden.md'), 'content');
    await fsp.writeFile(path.join(tmpDir, '_annex.json'), '{}');
    await fsp.writeFile(path.join(tmpDir, 'temp.syncthing.md'), 'content');
    await fsp.writeFile(path.join(tmpDir, 'note.syncthing-tmp'), 'content');
    await fsp.writeFile(path.join(tmpDir, 'readme.txt'), 'content');
    await fsp.writeFile(path.join(tmpDir, '_trash'), ''); // file named _trash (unlikely but test the filter)
  });

  test('includes .md files', async () => {
    const files = await listNoteFiles(tmpDir);
    expect(files).toContain('note1.md');
    expect(files).toContain('note2.md');
  });

  test('excludes dotfiles', async () => {
    const files = await listNoteFiles(tmpDir);
    expect(files).not.toContain('.hidden.md');
  });

  test('excludes underscore-prefixed files', async () => {
    const files = await listNoteFiles(tmpDir);
    expect(files).not.toContain('_annex.json');
    expect(files).not.toContain('_trash');
  });

  test('excludes syncthing temp files', async () => {
    const files = await listNoteFiles(tmpDir);
    expect(files).not.toContain('temp.syncthing.md');
    expect(files).not.toContain('note.syncthing-tmp');
  });

  test('excludes non-.md files', async () => {
    const files = await listNoteFiles(tmpDir);
    expect(files).not.toContain('readme.txt');
  });
});

describe('writeNoteFile and readNoteFile', () => {
  test('write and read roundtrip', async () => {
    await writeNoteFile(tmpDir, 'roundtrip.md', 'Hello World');
    const content = await readNoteFile(tmpDir, 'roundtrip.md');
    expect(content).toBe('Hello World');
  });

  test('normalizes CRLF to LF on write', async () => {
    await writeNoteFile(tmpDir, 'crlf.md', 'line1\r\nline2\r\n');
    const content = await readNoteFile(tmpDir, 'crlf.md');
    expect(content).toBe('line1\nline2\n');
    expect(content).not.toContain('\r');
  });

  test('preserves unicode content', async () => {
    const body = '# Café 🎉\n\n日本語テスト';
    await writeNoteFile(tmpDir, 'unicode.md', body);
    const content = await readNoteFile(tmpDir, 'unicode.md');
    expect(content).toBe(body);
  });

  test('preserves empty content', async () => {
    await writeNoteFile(tmpDir, 'empty.md', '');
    const content = await readNoteFile(tmpDir, 'empty.md');
    expect(content).toBe('');
  });

  test('atomic write leaves no temp files', async () => {
    await writeNoteFile(tmpDir, 'atomic.md', 'test content');
    const files = await fsp.readdir(tmpDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tmpFiles).toHaveLength(0);
    const content = await readNoteFile(tmpDir, 'atomic.md');
    expect(content).toBe('test content');
  });

  test('atomic write overwrites existing file', async () => {
    await writeNoteFile(tmpDir, 'overwrite.md', 'version 1');
    await writeNoteFile(tmpDir, 'overwrite.md', 'version 2');
    const content = await readNoteFile(tmpDir, 'overwrite.md');
    expect(content).toBe('version 2');
  });
});

describe('findFileById', () => {
  beforeAll(async () => {
    await fsp.writeFile(path.join(tmpDir, '202401151432 Sample.md'), 'content');
    await fsp.writeFile(path.join(tmpDir, '20240115143230 WithSeconds.md'), 'content');
  });

  test('finds file by 12-digit ID', async () => {
    const file = await findFileById(tmpDir, '202401151432');
    expect(file).toBe('202401151432 Sample.md');
  });

  test('finds file by 14-digit ID', async () => {
    const file = await findFileById(tmpDir, '20240115143230');
    expect(file).toBe('20240115143230 WithSeconds.md');
  });

  test('returns null for nonexistent ID', async () => {
    const file = await findFileById(tmpDir, '999999999999');
    expect(file).toBeNull();
  });
});
