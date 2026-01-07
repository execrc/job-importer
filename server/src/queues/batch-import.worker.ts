import { Worker, Job as BullJob } from 'bullmq';
import { connection, config } from '../config/index.js';
import { Job, ImportLog } from '../models/index.js';
import { classifyError } from '../utils/index.js';
import { publishEvent } from '../events/sse.js';
import type { BatchImportJobData } from './batch-import.queue.js';

export function startBatchWorker(): Worker<BatchImportJobData> {
  const worker = new Worker<BatchImportJobData>(
    'job-import-batch',
    async (job: BullJob<BatchImportJobData>) => {
      const { feedUrl, jobs, importLogId, batchIndex, totalBatches } = job.data;

      try {
        // Step 1: Find which externalIds already exist
        const externalIds = jobs.map((j) => j.externalId);
        const existingJobs = await Job.find(
          { externalId: { $in: externalIds } },
          { externalId: 1 }
        ).lean();
        const existingSet = new Set(existingJobs.map((j) => j.externalId));

        // Step 2: Build bulkWrite operations
        const operations = jobs.map((jobData) => ({
          updateOne: {
            filter: { externalId: jobData.externalId },
            update: {
              $set: {
                sourceUrl: feedUrl,
                title: jobData.title,
                company: jobData.company,
                location: jobData.location,
                jobType: jobData.jobType,
                description: jobData.description,
                content: jobData.content,
                link: jobData.link,
                imageUrl: jobData.imageUrl,
                publishedAt: jobData.publishedAt,
              },
            },
            upsert: true,
          },
        }));

        // Step 3: Execute bulkWrite
        const bulkResult = await Job.bulkWrite(operations, { ordered: false });

        // Step 4: Calculate new vs updated
        let newCount = 0;
        let updatedCount = 0;
        for (const jobData of jobs) {
          if (existingSet.has(jobData.externalId)) {
            updatedCount++;
          } else {
            newCount++;
          }
        }

        // Step 5: Update ImportLog counters atomically
        const updatedLog = await ImportLog.findOneAndUpdate(
          { _id: importLogId },
          { $inc: { newJobs: newCount, updatedJobs: updatedCount } },
          { new: true }
        );

        // Step 6: Emit progress event
        if (updatedLog) {
          await publishEvent({
            type: 'import:progress',
            importLogId,
            data: {
              newJobs: updatedLog.newJobs,
              updatedJobs: updatedLog.updatedJobs,
              failedJobs: updatedLog.failedJobs,
              totalFetched: updatedLog.totalFetched,
              batchIndex,
              totalBatches,
            },
          });
        }

        // Step 7: Check if all batches complete
        if (updatedLog) {
          const processed = updatedLog.newJobs + updatedLog.updatedJobs + updatedLog.failedJobs;
          if (processed >= updatedLog.totalFetched && updatedLog.status === 'processing') {
            await ImportLog.updateOne(
              { _id: importLogId },
              { $set: { status: 'completed', completedAt: new Date() } }
            );
            await publishEvent({
              type: 'import:completed',
              importLogId,
              data: {
                newJobs: updatedLog.newJobs,
                updatedJobs: updatedLog.updatedJobs,
                failedJobs: updatedLog.failedJobs,
              },
            });
            console.log(
              `📊 Import ${importLogId} completed: ${updatedLog.newJobs} new, ${updatedLog.updatedJobs} updated`
            );
          }
        }

        return {
          success: true,
          newCount,
          updatedCount,
          batchIndex,
          upsertedCount: bulkResult.upsertedCount,
          modifiedCount: bulkResult.modifiedCount,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Log all jobs in batch as failed
        const errors = jobs.map((j) => ({
          externalId: j.externalId,
          title: j.title,
          reason: errorMessage,
          errorType: classifyError(error),
        }));

        const updatedLog = await ImportLog.findOneAndUpdate(
          { _id: importLogId },
          {
            $inc: { failedJobs: jobs.length },
            $push: { importErrors: { $each: errors } },
          },
          { new: true }
        );

        // Emit progress event for failures
        if (updatedLog) {
          await publishEvent({
            type: 'import:progress',
            importLogId,
            data: {
              newJobs: updatedLog.newJobs,
              updatedJobs: updatedLog.updatedJobs,
              failedJobs: updatedLog.failedJobs,
              totalFetched: updatedLog.totalFetched,
            },
          });

          // Check if all processed (including failures)
          const processed = updatedLog.newJobs + updatedLog.updatedJobs + updatedLog.failedJobs;
          if (processed >= updatedLog.totalFetched && updatedLog.status === 'processing') {
            await ImportLog.updateOne(
              { _id: importLogId },
              { $set: { status: 'completed', completedAt: new Date() } }
            );
            await publishEvent({
              type: 'import:completed',
              importLogId,
              data: {
                newJobs: updatedLog.newJobs,
                updatedJobs: updatedLog.updatedJobs,
                failedJobs: updatedLog.failedJobs,
              },
            });
          }
        }

        throw error; // rethrow for retry
      }
    },
    {
      connection: connection as any,
      concurrency: config.WORKER_CONCURRENCY,
    }
  );

  worker.on('completed', (job) => {
    const result = job.returnvalue as { batchIndex: number; newCount: number; updatedCount: number };
    console.log(
      `✅ Batch ${result?.batchIndex ?? '?'} completed: ${result?.newCount ?? 0} new, ${result?.updatedCount ?? 0} updated`
    );
  });

  worker.on('failed', (job, err) => {
    console.error(
      `❌ Batch ${job?.data?.batchIndex ?? '?'} failed (attempt ${job?.attemptsMade}): ${err.message}`
    );
  });

  console.log(`👷 Batch worker started with concurrency: ${config.WORKER_CONCURRENCY}`);
  return worker;
}
