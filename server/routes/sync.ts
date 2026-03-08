import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const SYNCTHING_URL = 'http://localhost:8384';
const DEVICE_ID_RE = /^[A-Z0-9]{7}(-[A-Z0-9]{7}){7}$/;

export async function registerSync(app: FastifyInstance, apiKey: string, notesDir: string) {
  if (!apiKey) {
    // Syncthing not configured — return 503 for all sync routes
    app.get('/api/v1/sync/status', async (_req, reply) => {
      return reply.status(503).send({ error: 'Syncthing not configured' });
    });
    app.get('/api/v1/sync/connections', async (_req, reply) => {
      return reply.status(503).send({ error: 'Syncthing not configured' });
    });
    app.get('/api/v1/sync/config/devices', async (_req, reply) => {
      return reply.status(503).send({ error: 'Syncthing not configured' });
    });
    app.post('/api/v1/sync/config/devices', async (_req, reply) => {
      return reply.status(503).send({ error: 'Syncthing not configured' });
    });
    app.get('/api/v1/sync/folder/status', async (_req, reply) => {
      return reply.status(503).send({ error: 'Syncthing not configured' });
    });
    return;
  }

  const headers: Record<string, string> = { 'X-API-Key': apiKey };

  async function proxyGet(syncthingPath: string, reply: FastifyReply) {
    try {
      const res = await fetch(`${SYNCTHING_URL}${syncthingPath}`, { headers });
      if (!res.ok) {
        return reply.status(res.status).send({ error: 'Syncthing API error' });
      }
      return reply.send(await res.json());
    } catch {
      return reply.status(502).send({ error: 'Cannot reach Syncthing' });
    }
  }

  // GET /api/v1/sync/status — returns VPS device ID
  app.get('/api/v1/sync/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    return proxyGet('/rest/system/status', reply);
  });

  // GET /api/v1/sync/connections — connection status for paired devices
  app.get('/api/v1/sync/connections', async (_req: FastifyRequest, reply: FastifyReply) => {
    return proxyGet('/rest/system/connections', reply);
  });

  // GET /api/v1/sync/config/devices — list configured remote devices
  app.get('/api/v1/sync/config/devices', async (_req: FastifyRequest, reply: FastifyReply) => {
    return proxyGet('/rest/config/devices', reply);
  });

  // POST /api/v1/sync/config/devices — add a remote device and share the notes folder
  app.post('/api/v1/sync/config/devices', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { deviceID: string; name?: string };
    if (!body.deviceID || !DEVICE_ID_RE.test(body.deviceID)) {
      return reply.status(400).send({ error: 'Invalid device ID format' });
    }

    try {
      // Add the device
      const deviceRes = await fetch(`${SYNCTHING_URL}/rest/config/devices`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          deviceID: body.deviceID,
          name: body.name || 'Mac',
          autoAcceptFolders: true,
        }]),
      });
      if (!deviceRes.ok) {
        const text = await deviceRes.text();
        return reply.status(deviceRes.status).send({ error: `Failed to add device: ${text}` });
      }

      // Get the local device ID to include in folder config
      const statusRes = await fetch(`${SYNCTHING_URL}/rest/system/status`, { headers });
      const status = await statusRes.json() as { myID: string };

      // Configure shared folder with the notes directory
      const folderRes = await fetch(`${SYNCTHING_URL}/rest/config/folders`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          id: 'annex-notes',
          label: 'Annex Notes',
          path: notesDir,
          type: 'sendreceive',
          devices: [
            { deviceID: status.myID },
            { deviceID: body.deviceID },
          ],
          rescanIntervalS: 3600,
          fsWatcherEnabled: true,
          fsWatcherDelayS: 10,
        }]),
      });
      if (!folderRes.ok) {
        const text = await folderRes.text();
        return reply.status(folderRes.status).send({ error: `Failed to configure folder: ${text}` });
      }

      return reply.send({ ok: true });
    } catch {
      return reply.status(502).send({ error: 'Cannot reach Syncthing' });
    }
  });

  // GET /api/v1/sync/folder/status — sync completion for the notes folder
  app.get('/api/v1/sync/folder/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    return proxyGet('/rest/db/status?folder=annex-notes', reply);
  });
}
