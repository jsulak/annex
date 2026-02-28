import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'node:path';
import {
  listNoteFiles,
  readNoteFile,
  writeNoteFile,
  deleteNoteFile,
  renameNoteFile,
  statNoteFile,
  findFileById,
} from '../lib/fileStore.js';
import { parseNote, extractTitle, NoteIndex, NoteDetail } from '../lib/noteParser.js';
import { addToIndex, removeFromIndex } from '../lib/searchIndex.js';
import { suppressPath } from '../lib/watcher.js';

function mtimeToEtag(mtimeMs: number): string {
  return Math.round(mtimeMs).toString(16);
}

export async function registerNotes(app: FastifyInstance, notesDir: string) {
  // GET /api/v1/notes — list all notes
  app.get('/api/v1/notes', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const files = await listNoteFiles(notesDir);
    const notes: NoteIndex[] = [];

    for (const filename of files) {
      try {
        const [body, { mtime }] = await Promise.all([
          readNoteFile(notesDir, filename),
          statNoteFile(notesDir, filename),
        ]);
        notes.push(parseNote(filename, body, mtime));
      } catch {
        // Skip files that can't be read (e.g., deleted between readdir and read)
      }
    }

    // Sort by modifiedAt descending
    notes.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return notes;
  });

  // GET /api/v1/notes/:id — full note detail
  app.get('/api/v1/notes/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const filename = await findFileById(notesDir, id);

    if (!filename) {
      return reply.status(404).send({ error: 'Note not found' });
    }

    const [body, { mtime, mtimeMs }] = await Promise.all([
      readNoteFile(notesDir, filename),
      statNoteFile(notesDir, filename),
    ]);

    const etag = mtimeToEtag(mtimeMs);
    reply.header('etag', etag);

    const note = parseNote(filename, body, mtime);
    const detail: NoteDetail = { ...note, body, etag };
    return detail;
  });

  // PUT /api/v1/notes/:id — save note body
  app.put('/api/v1/notes/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { body: noteBody, filename: requestedFilename } = request.body as {
      body: string;
      filename?: string;
    };

    if (typeof noteBody !== 'string') {
      return reply.status(400).send({ error: 'body is required' });
    }

    let filename = await findFileById(notesDir, id);

    if (filename) {
      // Existing note — check etag for conflict detection
      const ifMatch = request.headers['if-match'];
      if (ifMatch) {
        const { mtimeMs } = await statNoteFile(notesDir, filename);
        const currentEtag = mtimeToEtag(mtimeMs);
        if (ifMatch !== currentEtag) {
          return reply.status(409).send({ error: 'Conflict: note was modified', currentEtag });
        }
      }
    } else {
      // New note — use requested filename or generate one
      filename = requestedFilename || `${id} Untitled.md`;
      if (!filename.endsWith('.md')) {
        filename += '.md';
      }
    }

    suppressPath(path.join(notesDir, filename));
    await writeNoteFile(notesDir, filename, noteBody);

    // Auto-rename file based on first-line title
    const title = extractTitle(noteBody, filename);
    const sanitized = title.replace(/[/\\:*?"<>|]/g, '').trim() || 'Untitled';
    const expectedFilename = `${id} ${sanitized}.md`;
    if (expectedFilename !== filename) {
      try {
        suppressPath(path.join(notesDir, expectedFilename));
        await renameNoteFile(notesDir, filename, expectedFilename);
        filename = expectedFilename;
      } catch {
        // Keep current filename if rename fails (e.g. collision)
      }
    }

    const { mtime, mtimeMs } = await statNoteFile(notesDir, filename);
    const etag = mtimeToEtag(mtimeMs);
    reply.header('etag', etag);

    const note = parseNote(filename, noteBody, mtime);
    const detail: NoteDetail = { ...note, body: noteBody, etag };

    // Update search index
    addToIndex({ ...note, body: noteBody });

    return detail;
  });

  // DELETE /api/v1/notes/:id — move to _trash/
  app.delete('/api/v1/notes/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const filename = await findFileById(notesDir, id);

    if (!filename) {
      return reply.status(404).send({ error: 'Note not found' });
    }

    suppressPath(path.join(notesDir, filename));
    await deleteNoteFile(notesDir, filename);
    removeFromIndex(id);
    return { ok: true, filename };
  });

  // POST /api/v1/notes/:id/rename — rename note file
  app.post('/api/v1/notes/:id/rename', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { newFilename } = request.body as { newFilename: string };

    if (!newFilename || typeof newFilename !== 'string') {
      return reply.status(400).send({ error: 'newFilename is required' });
    }

    const oldFilename = await findFileById(notesDir, id);
    if (!oldFilename) {
      return reply.status(404).send({ error: 'Note not found' });
    }

    // Check if target already exists
    const existingTarget = await findFileById(notesDir, newFilename);
    if (existingTarget && existingTarget !== oldFilename) {
      return reply.status(409).send({ error: 'A note with that filename already exists' });
    }

    const targetFilename = newFilename.endsWith('.md') ? newFilename : newFilename + '.md';
    suppressPath(path.join(notesDir, targetFilename));
    await renameNoteFile(notesDir, oldFilename, targetFilename);

    const [body, { mtime, mtimeMs }] = await Promise.all([
      readNoteFile(notesDir, targetFilename),
      statNoteFile(notesDir, targetFilename),
    ]);

    const etag = mtimeToEtag(mtimeMs);
    reply.header('etag', etag);

    const note = parseNote(targetFilename, body, mtime);
    const detail: NoteDetail = { ...note, body, etag };
    return detail;
  });
}
