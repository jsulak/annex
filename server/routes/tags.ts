import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { listNoteFiles, readNoteFile, statNoteFile } from '../lib/fileStore.js';
import { parseNote } from '../lib/noteParser.js';

export async function registerTags(app: FastifyInstance, notesDir: string) {
  // GET /api/v1/tags — all tags with note counts
  app.get('/api/v1/tags', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const files = await listNoteFiles(notesDir);
    const tagCounts = new Map<string, number>();

    for (const filename of files) {
      try {
        const [body, { mtime }] = await Promise.all([
          readNoteFile(notesDir, filename),
          statNoteFile(notesDir, filename),
        ]);
        const note = parseNote(filename, body, mtime);
        for (const tag of note.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
      } catch {
        // Skip unreadable files
      }
    }

    const tags = [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    return tags;
  });
}
