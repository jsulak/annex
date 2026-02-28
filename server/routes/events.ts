import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { addClient, removeClient } from '../lib/watcher.js';

export async function registerEvents(app: FastifyInstance) {
  app.get('/api/v1/events', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.hijack();

    const raw = request.raw;
    const res = reply.raw;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx/Caddy buffering
    });

    // Send initial connected event
    res.write('event: connected\ndata: {}\n\n');

    const client = {
      write: (data: string) => res.write(data),
      end: () => res.end(),
    };

    addClient(client);

    raw.on('close', () => {
      removeClient(client);
    });
  });
}
