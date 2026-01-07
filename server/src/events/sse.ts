import { Redis } from 'ioredis';
import type { Response } from 'express';
import { config } from '../config/env.js';

const CHANNEL = 'import-events';

// Types for SSE events
export interface SSEEvent {
  type: 'import:started' | 'import:progress' | 'import:completed' | 'import:failed';
  importLogId: string;
  timestamp: string;
  data: {
    feedUrl?: string;
    newJobs?: number;
    updatedJobs?: number;
    failedJobs?: number;
    totalFetched?: number;
    error?: string;
    batchIndex?: number;
    totalBatches?: number;
  };
}

// Store connected SSE clients
const clients = new Map<string, Response>();

// Create separate Redis connections for pub/sub
let publisher: Redis | null = null;
let subscriber: Redis | null = null;

function createRedisConnection(): Redis {
  if (!config.REDIS_URL) {
    throw new Error('REDIS_URL is required for SSE');
  }
  const isUpstash = config.REDIS_URL.includes('upstash');
  return new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(isUpstash && { tls: {} }),
  });
}

// Initialize Redis Pub/Sub
export function initSSE(): void {
  publisher = createRedisConnection();
  subscriber = createRedisConnection();

  subscriber.subscribe(CHANNEL, (err) => {
    if (err) {
      console.error('Failed to subscribe to SSE channel:', err);
    } else {
      console.log('SSE subscribed to import-events channel');
    }
  });

  subscriber.on('message', (_channel: string, message: string) => {
    // Broadcast to all connected clients
    const data = `data: ${message}\n\n`;
    for (const [clientId, res] of clients) {
      try {
        res.write(data);
      } catch {
        // Client disconnected, remove from list
        clients.delete(clientId);
      }
    }
  });

  console.log('SSE service initialized');
}

// Add a client to receive events
export function addClient(clientId: string, res: Response): void {
  clients.set(clientId, res);
  console.log(`SSE client connected: ${clientId} (total: ${clients.size})`);
}

// Remove a client
export function removeClient(clientId: string): void {
  clients.delete(clientId);
  console.log(`SSE client disconnected: ${clientId} (total: ${clients.size})`);
}

// Publish an event (called from worker/service)
export async function publishEvent(event: Omit<SSEEvent, 'timestamp'>): Promise<void> {
  if (!publisher) {
    console.warn('SSE publisher not initialized');
    return;
  }

  const fullEvent: SSEEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  await publisher.publish(CHANNEL, JSON.stringify(fullEvent));
}

// Get number of connected clients
export function getClientCount(): number {
  return clients.size;
}

// Cleanup on shutdown
export async function closeSSE(): Promise<void> {
  if (subscriber) {
    await subscriber.unsubscribe(CHANNEL);
    subscriber.disconnect();
  }
  if (publisher) {
    publisher.disconnect();
  }
  clients.clear();
}
