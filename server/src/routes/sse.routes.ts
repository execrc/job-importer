import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';
import { addClient, removeClient, getClientCount } from '../events/sse.js';
import { randomUUID } from 'crypto';

export const sseRoutes: RouterType = Router();

// SSE endpoint for real-time import updates
sseRoutes.get('/events', (req: Request, res: Response) => {
  const clientId = randomUUID();

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

  // Register client
  addClient(clientId, res);

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(clientId);
  });
});

// Get SSE status (for debugging)
sseRoutes.get('/events/status', (_req: Request, res: Response) => {
  res.json({
    connectedClients: getClientCount(),
    timestamp: new Date().toISOString(),
  });
});
