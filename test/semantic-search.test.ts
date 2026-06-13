import Database from 'better-sqlite3';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { SemanticIndex, type EmbeddingProvider } from '../server/lib/semanticSearch.js';
import { startTestServer, stopTestServer, api, nextId, type TestContext } from './setup.js';

let ctx: TestContext;
let http: ReturnType<typeof api>;
let dbFile: string;

async function waitFor<T>(fn: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 3000;
  let lastValue: T;
  do {
    lastValue = await fn();
    if (predicate(lastValue)) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  return lastValue!;
}

async function search(q: string) {
  const res = await http.get(`/api/v1/search?q=${encodeURIComponent(q)}`);
  expect(res.ok).toBe(true);
  return await res.json() as Array<{
    id: string;
    matchType?: string;
    semanticScore?: number;
    semanticSnippet?: string;
  }>;
}

beforeAll(async () => {
  ctx = await startTestServer({ semanticSearch: true });
  http = api(ctx);
  dbFile = process.env.SEMANTIC_INDEX_FILE ?? '';
});

afterAll(async () => {
  await stopTestServer(ctx);
});

describe('semantic search', () => {
  test('appends semantic-only related results for natural-language queries', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, {
      body: '# Coaching Notes\n\nQuiet mentorship sessions help apprentices learn judgment.',
    });

    const results = await waitFor(
      () => search('where do I talk about learning or mentorship?'),
      (items) => items.some((item) => item.id === id && item.matchType === 'semantic'),
    );

    const match = results.find((item) => item.id === id);
    expect(match?.matchType).toBe('semantic');
    expect(match?.semanticScore).toBeGreaterThanOrEqual(0.5);
    expect(match?.semanticSnippet).toContain('mentorship sessions');

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('keeps exact matches before semantic-only related results', async () => {
    const exactId = nextId();
    const relatedId = nextId();
    await http.put(`/api/v1/notes/${exactId}`, {
      body: '# Learning Marker\n\nlearning exactSearchMarker77',
    });
    await http.put(`/api/v1/notes/${relatedId}`, {
      body: '# Coaching Adjacent\n\nMentorship without the exact marker.',
    });

    const results = await waitFor(
      () => search('learning exactSearchMarker77'),
      (items) =>
        items.some((item) => item.id === exactId) &&
        items.some((item) => item.id === relatedId && item.matchType === 'semantic'),
    );

    expect(results.findIndex((item) => item.id === exactId))
      .toBeLessThan(results.findIndex((item) => item.id === relatedId));

    await http.delete(`/api/v1/notes/${exactId}`);
    await http.delete(`/api/v1/notes/${relatedId}`);
  });

  test('semantic cache stores no note body plaintext', async () => {
    const id = nextId();
    const secret = 'plaintextSecretNeedleAlpha';
    await http.put(`/api/v1/notes/${id}`, {
      body: `# Private Mentorship\n\n${secret} belongs only in the markdown note.`,
    });

    await waitFor(
      () => search('learning mentorship'),
      (items) => items.some((item) => item.id === id),
    );

    const db = new Database(dbFile, { readonly: true });
    const noteRows = db.prepare('SELECT * FROM semantic_notes WHERE note_id = ?').all(id);
    const chunkRows = db.prepare('SELECT note_id, chunk_index, start_offset, end_offset, norm FROM semantic_chunks WHERE note_id = ?').all(id);
    db.close();

    expect(JSON.stringify(noteRows)).not.toContain(secret);
    expect(JSON.stringify(chunkRows)).not.toContain(secret);

    await http.delete(`/api/v1/notes/${id}`);
  });

  test('updates and removes semantic chunks when notes change', async () => {
    const id = nextId();
    await http.put(`/api/v1/notes/${id}`, {
      body: '# Mentorship Lifecycle\n\nMentorship appears before the update.',
    });

    await waitFor(
      () => search('learning mentorship'),
      (items) => items.some((item) => item.id === id),
    );

    await http.put(`/api/v1/notes/${id}`, {
      body: '# Strategy Lifecycle\n\nRoadmap planning appears after the update.',
    });

    await waitFor(
      () => search('strategy planning roadmap'),
      (items) => items.some((item) => item.id === id),
    );

    const staleResults = await waitFor(
      () => search('learning mentorship'),
      (items) => !items.some((item) => item.id === id),
    );
    expect(staleResults.some((item) => item.id === id)).toBe(false);

    await http.delete(`/api/v1/notes/${id}`);

    const deletedResults = await waitFor(
      () => search('strategy planning roadmap'),
      (items) => !items.some((item) => item.id === id),
    );
    expect(deletedResults.some((item) => item.id === id)).toBe(false);
  });
});

describe('semantic index failure handling', () => {
  test('embedding failures disable semantic search without an unhandled rejection', async () => {
    class ThrowingProvider implements EmbeddingProvider {
      async embed(): Promise<number[][]> {
        throw Object.assign(new Error('quota exhausted'), { status: 429, code: 'insufficient_quota' });
      }
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'annex-semantic-failure-'));
    const dbPath = path.join(tmpDir, 'semantic.sqlite');
    const note = {
      id: 'failure-note',
      filename: 'failure-note.md',
      title: 'Failure Note',
      snippet: 'Mentorship',
      tags: [],
      links: [],
      references: [],
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      body: '# Failure Note\n\nMentorship should trigger embedding.',
    };

    const index = new SemanticIndex({
      dbFile: dbPath,
      model: 'fake-model',
      minScore: 0.25,
      provider: new ThrowingProvider(),
      getNote: (id) => id === note.id ? note : undefined,
    });

    index.start([note]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(index.isReady()).toBe(false);
    index.scheduleReindex(note);
    expect(index.isReady()).toBe(false);

    index.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
