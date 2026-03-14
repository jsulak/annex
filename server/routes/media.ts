import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import multipart from '@fastify/multipart';
import path from 'node:path';
import { writeMediaFile } from '../lib/fileStore.js';

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

/** Sanitize an uploaded filename and prepend a timestamp to avoid collisions. */
function buildSafeFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw Object.assign(new Error(`File type not allowed: ${ext}`), { statusCode: 400 });
  }
  const base = path.basename(originalName, ext)
    .normalize('NFC')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 64);
  return `${Date.now()}_${base || 'image'}${ext}`;
}

export async function registerMedia(app: FastifyInstance, notesDir: string) {
  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  });

  app.post('/api/v1/media', async (request: FastifyRequest, reply: FastifyReply) => {
    const part = await request.file();
    if (!part) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    let filename: string;
    try {
      filename = buildSafeFilename(part.filename);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of part.file) {
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);

    if (data.length === 0) {
      return reply.status(400).send({ error: 'Empty file' });
    }

    const relativePath = await writeMediaFile(notesDir, filename, data);
    return reply.status(201).send({ path: relativePath });
  });
}
