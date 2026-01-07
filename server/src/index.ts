import express from 'express';
import cors from 'cors';
import { config, connectDatabase } from './config/index.js';
import { importRoutes, jobRoutes, sseRoutes } from './routes/index.js';
import { startBatchWorker } from './queues/index.js';
import { scheduleCron } from './cron/scheduler.js';
import { initSSE } from './events/sse.js';

async function main() {
  await connectDatabase();
  initSSE();
  startBatchWorker();
  scheduleCron();

  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/import', importRoutes);
  app.use('/api/import', sseRoutes);
  app.use('/api/jobs', jobRoutes);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.listen(config.PORT, () => {
    console.log(`🚀 Server running on http://localhost:${config.PORT}`);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
