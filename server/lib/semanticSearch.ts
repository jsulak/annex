import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import OpenAI from 'openai';
import type { StoredNote } from './searchIndex.js';

export interface EmbeddingProvider {
  embed(input: string[]): Promise<number[][]>;
}

export interface SemanticSearchResult {
  id: string;
  score: number;
  snippet: string;
  startOffset: number;
  endOffset: number;
}

interface SemanticIndexOptions {
  dbFile: string;
  model: string;
  minScore: number;
  provider: EmbeddingProvider;
  getNote: (id: string) => StoredNote | undefined;
}

interface NoteChunk {
  index: number;
  start: number;
  end: number;
  text: string;
}

interface ChunkRow {
  note_id: string;
  start_offset: number;
  end_offset: number;
  vector: Buffer;
  norm: number;
}

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_MIN_SCORE = 0.25;
const CHUNK_TARGET_CHARS = 2500;
const CHUNK_OVERLAP_CHARS = 250;

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async embed(input: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input,
    });
    return response.data.map((item) => item.embedding);
  }
}

export class FakeEmbeddingProvider implements EmbeddingProvider {
  async embed(input: string[]): Promise<number[][]> {
    return input.map((text) => {
      const lower = text.toLowerCase();
      const vector = new Array<number>(8).fill(0);
      if (/\b(learning|mentorship|mentor|apprentice|teaching)\b/.test(lower)) vector[0] = 1;
      if (/\b(strategy|planning|roadmap)\b/.test(lower)) vector[1] = 1;
      if (/\b(health|sleep|exercise)\b/.test(lower)) vector[2] = 1;
      if (/\b(book|reading|literature)\b/.test(lower)) vector[3] = 1;
      return vector;
    });
  }
}

export class SemanticIndex {
  private readonly db: Database.Database;
  private readonly model: string;
  private readonly minScore: number;
  private readonly provider: EmbeddingProvider;
  private readonly getNote: (id: string) => StoredNote | undefined;
  private readonly pending = new Map<string, StoredNote | null>();
  private ready = false;
  private processing = false;
  private closed = false;

  constructor(options: SemanticIndexOptions) {
    fs.mkdirSync(path.dirname(options.dbFile), { recursive: true });
    this.db = new Database(options.dbFile);
    this.model = options.model;
    this.minScore = options.minScore;
    this.provider = options.provider;
    this.getNote = options.getNote;
    this.prepareSchema();
  }

  start(notes: StoredNote[]): void {
    void this.buildAll(notes).catch((err: unknown) => {
      this.disable('Semantic index build failed; semantic search disabled', err);
    });
  }

  isReady(): boolean {
    return this.ready && !this.closed;
  }

  scheduleReindex(note: StoredNote): void {
    if (this.closed) return;
    this.pending.set(note.id, note);
    if (this.ready) void this.processPending();
  }

  remove(id: string): void {
    if (this.closed) return;
    this.pending.set(id, null);
    this.deleteNote(id);
    if (this.ready) void this.processPending();
  }

  async search(
    query: string,
    limit: number,
    excludeIds: Set<string>,
    candidateFilter: (note: StoredNote) => boolean,
  ): Promise<SemanticSearchResult[]> {
    if (!this.isReady() || limit <= 0) return [];

    const [queryVector] = await this.provider.embed([query]);
    const queryNorm = vectorNorm(queryVector);
    if (queryNorm === 0) return [];

    const rows = this.db.prepare(`
      SELECT c.note_id, c.start_offset, c.end_offset, c.vector, c.norm
      FROM semantic_chunks c
      JOIN semantic_notes n ON n.note_id = c.note_id
      WHERE n.model = ?
    `).all(this.model) as ChunkRow[];

    const best = new Map<string, { score: number; start: number; end: number }>();
    for (const row of rows) {
      if (excludeIds.has(row.note_id) || row.norm === 0) continue;
      const note = this.getNote(row.note_id);
      if (!note || !candidateFilter(note)) continue;

      const vector = bufferToVector(row.vector);
      const score = dot(queryVector, vector) / (queryNorm * row.norm);
      if (score < this.minScore) continue;

      const existing = best.get(row.note_id);
      if (!existing || score > existing.score) {
        best.set(row.note_id, { score, start: row.start_offset, end: row.end_offset });
      }
    }

    return [...best.entries()]
      .map(([id, match]) => {
        const note = this.getNote(id);
        const range = note ? semanticPassageRange(note.body, match.start, match.end) : null;
        return note
          ? {
              id,
              score: match.score,
              snippet: semanticSnippet(note.body, range?.start ?? match.start, range?.end ?? match.end),
              startOffset: range?.start ?? match.start,
              endOffset: range?.end ?? match.end,
            }
          : null;
      })
      .filter((result): result is SemanticSearchResult => result !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.pending.clear();
    this.db.close();
  }

  private prepareSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS semantic_notes (
        note_id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        mtime TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS semantic_chunks (
        note_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        vector BLOB NOT NULL,
        norm REAL NOT NULL,
        PRIMARY KEY (note_id, chunk_index),
        FOREIGN KEY (note_id) REFERENCES semantic_notes(note_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_semantic_notes_model ON semantic_notes(model);
    `);
  }

  private async buildAll(notes: StoredNote[]): Promise<void> {
    this.ready = false;
    for (const note of notes) {
      if (this.closed) return;
      const current = this.getNote(note.id);
      if (!current) continue;
      await this.indexNote(current);
    }
    this.ready = true;
    await this.processPending();
  }

  private async processPending(): Promise<void> {
    if (this.processing || this.closed) return;
    this.processing = true;
    try {
      while (this.pending.size > 0) {
        const [id, note] = this.pending.entries().next().value as [string, StoredNote | null];
        this.pending.delete(id);
        if (note === null) {
          this.deleteNote(id);
        } else {
          const current = this.getNote(id);
          if (current) {
            try {
              await this.indexNote(current);
            } catch (err) {
              this.disable('Semantic reindex failed; semantic search disabled', err);
              return;
            }
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async indexNote(note: StoredNote): Promise<void> {
    const contentHash = noteHash(note, this.model);
    const existing = this.db.prepare(`
      SELECT content_hash FROM semantic_notes WHERE note_id = ? AND model = ?
    `).get(note.id, this.model) as { content_hash: string } | undefined;
    if (existing?.content_hash === contentHash) return;

    const chunks = chunkNote(note);
    const embeddings = await this.provider.embed(chunks.map((chunk) => chunk.text));
    const dimensions = embeddings[0]?.length ?? 0;

    const replaceNote = this.db.transaction(() => {
      this.deleteNote(note.id);
      this.db.prepare(`
        INSERT INTO semantic_notes (note_id, filename, content_hash, model, dimensions, mtime)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(note.id, note.filename, contentHash, this.model, dimensions, note.modifiedAt);

      const insertChunk = this.db.prepare(`
        INSERT INTO semantic_chunks
          (note_id, chunk_index, start_offset, end_offset, vector, norm)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < chunks.length; i++) {
        const vector = embeddings[i] ?? [];
        insertChunk.run(
          note.id,
          chunks[i].index,
          chunks[i].start,
          chunks[i].end,
          vectorToBuffer(vector),
          vectorNorm(vector),
        );
      }
    });

    replaceNote();
  }

  private deleteNote(id: string): void {
    this.db.prepare('DELETE FROM semantic_chunks WHERE note_id = ?').run(id);
    this.db.prepare('DELETE FROM semantic_notes WHERE note_id = ?').run(id);
  }

  private disable(message: string, err: unknown): void {
    console.error(message, err);
    this.ready = false;
    this.close();
  }
}

export function createSemanticIndexFromEnv(
  getNote: (id: string) => StoredNote | undefined,
): SemanticIndex | null {
  const providerName = process.env.SEMANTIC_EMBEDDING_PROVIDER;
  const model = process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_MODEL;
  const minScore = Number.parseFloat(process.env.SEMANTIC_MIN_SCORE || String(DEFAULT_MIN_SCORE));
  const dbFile = process.env.SEMANTIC_INDEX_FILE ||
    path.join(os.homedir(), '.annex', 'semantic-index.sqlite');

  if (providerName === 'fake') {
    return new SemanticIndex({
      dbFile,
      model,
      minScore: Number.isFinite(minScore) ? minScore : DEFAULT_MIN_SCORE,
      provider: new FakeEmbeddingProvider(),
      getNote,
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  return new SemanticIndex({
    dbFile,
    model,
    minScore: Number.isFinite(minScore) ? minScore : DEFAULT_MIN_SCORE,
    provider: new OpenAIEmbeddingProvider(apiKey, model),
    getNote,
  });
}

function noteHash(note: StoredNote, model: string): string {
  return crypto
    .createHash('sha256')
    .update(model)
    .update('\0')
    .update(note.filename)
    .update('\0')
    .update(note.title)
    .update('\0')
    .update(note.body)
    .digest('hex');
}

function chunkNote(note: StoredNote): NoteChunk[] {
  const ranges = paragraphRanges(note.body);
  const chunks: NoteChunk[] = [];
  let currentStart: number | null = null;
  let currentEnd = 0;

  for (const range of ranges) {
    if (currentStart === null) {
      currentStart = range.start;
      currentEnd = range.end;
      continue;
    }

    if (range.end - currentStart <= CHUNK_TARGET_CHARS) {
      currentEnd = range.end;
      continue;
    }

    chunks.push(makeChunk(note, chunks.length, currentStart, currentEnd));
    currentStart = Math.max(0, currentEnd - CHUNK_OVERLAP_CHARS);
    currentEnd = range.end;
  }

  if (currentStart !== null) {
    chunks.push(makeChunk(note, chunks.length, currentStart, currentEnd));
  }

  if (chunks.length === 0) {
    chunks.push(makeChunk(note, 0, 0, 0));
  }

  return chunks;
}

function paragraphRanges(body: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const re = /\S(?:[\s\S]*?)(?=\n\s*\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
    if (match[0].length === 0) re.lastIndex++;
  }
  return ranges;
}

function semanticPassageRange(body: string, start: number, end: number): { start: number; end: number } {
  const candidates = paragraphRanges(body)
    .filter((range) => range.start >= start && range.end <= end)
    .filter((range) => {
      const text = body.slice(range.start, range.end).trim();
      if (!text) return false;
      if (/^#{1,6}\s+/.test(text)) return false;
      if (/^(title|date|keywords):\s*/i.test(text)) return false;
      return true;
    });

  if (candidates.length > 0) return candidates[0];
  return { start, end };
}

function makeChunk(note: StoredNote, index: number, start: number, end: number): NoteChunk {
  const bodyText = note.body.slice(start, end);
  return {
    index,
    start,
    end,
    text: `Filename: ${note.filename}\nTitle: ${note.title}\n\n${bodyText}`,
  };
}

function semanticSnippet(body: string, start: number, end: number): string {
  const source = (start === end ? body.slice(0, 180) : body.slice(start, end)).replace(/\s+/g, ' ').trim();
  if (source.length <= 180) return source;
  return `${source.slice(0, 177).trim()}...`;
}

function vectorNorm(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function dot(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < len; i++) total += a[i] * b[i];
  return total;
}

function vectorToBuffer(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

function bufferToVector(buffer: Buffer): number[] {
  const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return Array.from(new Float32Array(copy));
}
