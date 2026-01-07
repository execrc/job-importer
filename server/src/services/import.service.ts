import { ImportLog } from '../models/index.js';
import { batchImportQueue } from '../queues/index.js';
import { fetchFeed } from './feed-fetcher.service.js';
import { publishEvent } from '../events/sse.js';
import { config } from '../config/index.js';

export const FEED_SOURCES = [
  'https://jobicy.com/?feed=job_feed',
  'https://jobicy.com/?feed=job_feed&job_categories=smm&job_types=full-time',
  'https://jobicy.com/?feed=job_feed&job_categories=seller&job_types=full-time&search_region=france',
  'https://jobicy.com/?feed=job_feed&job_categories=design-multimedia',
  'https://jobicy.com/?feed=job_feed&job_categories=data-science',
  'https://jobicy.com/?feed=job_feed&job_categories=copywriting',
  'https://jobicy.com/?feed=job_feed&job_categories=business',
  'https://jobicy.com/?feed=job_feed&job_categories=management',
  'https://www.higheredjobs.com/rss/articleFeed.cfm',
];

export async function triggerImport(feedUrl: string): Promise<string> {
  const importLog = await ImportLog.create({
    feedUrl,
    status: 'processing',
    startedAt: new Date(),
    totalFetched: 0,
    newJobs: 0,
    updatedJobs: 0,
    failedJobs: 0,
    importErrors: [],
  });

  // Emit SSE event for import started
  await publishEvent({
    type: 'import:started',
    importLogId: importLog._id.toString(),
    data: { feedUrl },
  });

  try {
    const jobs = await fetchFeed(feedUrl);

    await ImportLog.updateOne({ _id: importLog._id }, { $set: { totalFetched: jobs.length } });

    if (jobs.length === 0) {
      await ImportLog.updateOne(
        { _id: importLog._id },
        { $set: { status: 'completed', completedAt: new Date() } }
      );
      await publishEvent({
        type: 'import:completed',
        importLogId: importLog._id.toString(),
        data: { feedUrl, newJobs: 0, updatedJobs: 0, failedJobs: 0 },
      });
      console.log(`📤 Queued 0 jobs for import (marked as completed)`);
      return importLog._id.toString();
    }

    // Batch jobs for bulk processing
    const BATCH_SIZE = config.BATCH_SIZE;
    const batches = [];
    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
      batches.push(jobs.slice(i, i + BATCH_SIZE));
    }

    // Queue each batch
    for (let i = 0; i < batches.length; i++) {
      await batchImportQueue.add(
        'import-batch',
        {
          feedUrl,
          jobs: batches[i],
          importLogId: importLog._id.toString(),
          batchIndex: i,
          totalBatches: batches.length,
        },
        {
          jobId: `${importLog._id}-batch-${i}`,
        }
      );
    }

    console.log(`📤 Queued ${jobs.length} jobs in ${batches.length} batches (batch size: ${BATCH_SIZE})`);
    return importLog._id.toString();
  } catch (error) {
    await ImportLog.updateOne(
      { _id: importLog._id },
      {
        $set: { status: 'failed', completedAt: new Date() },
        $push: {
          importErrors: {
            reason: error instanceof Error ? error.message : String(error),
            errorType: 'network',
          },
        },
      }
    );
    await publishEvent({
      type: 'import:failed',
      importLogId: importLog._id.toString(),
      data: { feedUrl, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

export async function triggerAllImports(): Promise<void> {
  console.log(`🚀 Starting import for all ${FEED_SOURCES.length} feeds`);

  for (const feedUrl of FEED_SOURCES) {
    try {
      await triggerImport(feedUrl);
    } catch (error) {
      console.error(`❌ Failed to import ${feedUrl}:`, error);
    }
  }
}

export async function markImportComplete(importLogId: string): Promise<void> {
  await ImportLog.updateOne(
    { _id: importLogId },
    { $set: { status: 'completed', completedAt: new Date() } }
  );
}
