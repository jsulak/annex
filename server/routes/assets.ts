import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'node:path';
import { readMediaFile } from '../lib/fileStore.js';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
};

export async function registerAssets(app: FastifyInstance, notesDir: string) {
  app.get('/api/v1/assets/*', async (request: FastifyRequest, reply: FastifyReply) => {
    // Fastify already decodes wildcard parameters.
    const assetPath = (request.params as { '*': string })['*'];

    if (!assetPath) {
      return reply.status(400).send({ error: 'Path required' });
    }

    const ext = path.extname(path.resolve(notesDir, assetPath)).toLowerCase();
    if (ext === '.svg') {
      return reply.status(403).send({ error: 'File type not allowed' });
    }

    try {
      const data = await readMediaFile(notesDir, assetPath);
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      return reply.type(contentType).send(data);
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 403) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      return reply.status(404).send({ error: 'Asset not found' });
    }
  });
}
