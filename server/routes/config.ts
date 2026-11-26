import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readSettings, updateSettings, type Settings } from '../lib/config.js';

export async function registerConfig(app: FastifyInstance) {
  // GET /api/v1/config — returns settings
  app.get('/api/v1/config', async (_request: FastifyRequest, _reply: FastifyReply) => {
    return { settings: await readSettings() };
  });

  // PUT /api/v1/config — partial update of settings
  app.put('/api/v1/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const { settings } = (request.body ?? {}) as { settings?: Partial<Settings> };

    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return reply.status(400).send({ error: 'settings object is required' });
    }

    return { settings: await updateSettings(settings) };
  });
}
