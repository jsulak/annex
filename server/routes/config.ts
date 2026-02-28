import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readConfig, writeConfig, Config } from '../lib/config.js';

export async function registerConfig(app: FastifyInstance) {
  // GET /api/v1/config — returns settings + savedSearches (omits passwordHash)
  app.get('/api/v1/config', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const config = await readConfig();
    return {
      savedSearches: config.savedSearches,
      settings: config.settings,
    };
  });

  // PUT /api/v1/config — partial update of settings
  app.put('/api/v1/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { settings?: Partial<Config['settings']> };

    if (!body.settings || typeof body.settings !== 'object') {
      return reply.status(400).send({ error: 'settings object is required' });
    }

    const config = await readConfig();
    config.settings = { ...config.settings, ...body.settings };
    await writeConfig(config);

    return {
      savedSearches: config.savedSearches,
      settings: config.settings,
    };
  });
}
