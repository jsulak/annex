import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'node:path';
import fs from 'node:fs/promises';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
};

export async function registerAssets(app: FastifyInstance, notesDir: string) {
  app.get('/api/v1/assets/*', async (request: FastifyRequest, reply: FastifyReply) => {
    const rawPath = (request.params as { '*': string })['*'];

    if (!rawPath) {
      return reply.status(400).send({ error: 'Path required' });
    }

    // Decode URL-encoded characters (e.g. %20 → space) so filenames with spaces resolve correctly
    const decodedPath = decodeURIComponent(rawPath);

    // Resolve and validate path stays within notesDir (path traversal prevention)
    const resolved = path.resolve(notesDir, decodedPath);
    const safePrefix = notesDir.endsWith(path.sep) ? notesDir : notesDir + path.sep;
    if (!resolved.startsWith(safePrefix)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    try {
      const data = await fs.readFile(resolved);
      const ext = path.extname(rawPath).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      return reply.type(contentType).send(data);
    } catch {
      return reply.status(404).send({ error: 'Asset not found' });
    }
  });
}
