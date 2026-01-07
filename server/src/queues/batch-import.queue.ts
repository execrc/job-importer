import { Queue } from 'bullmq';
import { connection } from '../config/index.js';
import type { ParsedJob } from '../utils/index.js';

export interface BatchImportJobData {
  feedUrl: string;
  jobs: ParsedJob[];
  importLogId: string;
  batchIndex: number;
  totalBatches: number;
}

export const batchImportQueue = new Queue<BatchImportJobData>('job-import-batch', {
  connection: connection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // 2s -> 4s -> 8s (slightly longer for batches)
    },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

console.log('📋 Batch import queue initialized');
