import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { search } from '../lib/searchIndex.js';

export async function registerSearch(app: FastifyInstance) {
  app.get('/api/v1/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const { q, limit } = request.query as { q?: string; limit?: string };

    if (!q || typeof q !== 'string' || q.trim() === '') {
      return reply.status(400).send({ error: 'Query parameter "q" is required' });
    }

    const maxResults = limit ? Math.min(parseInt(limit, 10) || 50, 200) : 50;
    const results = search(q.trim(), maxResults);
    return results;
  });
}
