import { Redis } from 'ioredis';
import { config } from './env.js';

if (!config.REDIS_URL) {
  throw new Error('REDIS_URL environment variable is required');
}

// detect upstash for TLS
const isUpstash = config.REDIS_URL.includes('upstash');
const redisType = isUpstash ? '☁️  Upstash' : '🔗 Local Redis';

console.log(`📡 Connecting to Redis: ${redisType}`);

export const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // required for BullMQ
  enableReadyCheck: false,
  ...(isUpstash && { tls: {} }), // enable TLS for upstash
});

connection.on('connect', () => {
  console.log(`✅ Connected to Redis (${redisType})`);
});

connection.on('error', (err: Error) => {
  console.error('❌ Redis connection error:', err.message);
});
