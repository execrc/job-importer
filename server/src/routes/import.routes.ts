import { Router } from 'express';
import { ImportLog } from '../models/index.js';
import { triggerImport, triggerAllImports, FEED_SOURCES } from '../services/index.js';

const router = Router();

router.get('/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      ImportLog.find().sort({ startedAt: -1 }).skip(skip).limit(limit).lean(),
      ImportLog.countDocuments(),
    ]);

    res.json({
      data: logs.map((log) => ({
        id: log._id,
        fileName: log.feedUrl,
        importDateTime: log.startedAt,
        status: log.status,
        total: log.totalFetched,
        new: log.newJobs,
        updated: log.updatedJobs,
        failed: log.failedJobs,
        errors: log.importErrors || [],
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching import logs:', error);
    res.status(500).json({ error: 'Failed to fetch import logs' });
  }
});

router.get('/logs/:id', async (req, res) => {
  try {
    const log = await ImportLog.findById(req.params.id).lean();

    if (!log) {
      return res.status(404).json({ error: 'Import log not found' });
    }

    res.json({
      id: log._id,
      fileName: log.feedUrl,
      importDateTime: log.startedAt,
      completedAt: log.completedAt,
      status: log.status,
      total: log.totalFetched,
      new: log.newJobs,
      updated: log.updatedJobs,
      failed: log.failedJobs,
      errors: log.importErrors,
    });
  } catch (error) {
    console.error('Error fetching import log:', error);
    res.status(500).json({ error: 'Failed to fetch import log' });
  }
});

router.post('/trigger', async (req, res) => {
  try {
    const { feedUrl } = req.body;

    if (!feedUrl) {
      return res.status(400).json({ error: 'feedUrl is required' });
    }

    const importLogId = await triggerImport(feedUrl);
    res.json({ message: 'Import started', importLogId });
  } catch (error) {
    console.error('Error triggering import:', error);
    res.status(500).json({ error: 'Failed to trigger import' });
  }
});

router.post('/trigger-all', async (_req, res) => {
  try {
    triggerAllImports().catch(console.error);
    res.json({ message: 'Import started for all feeds', feedCount: FEED_SOURCES.length });
  } catch (error) {
    console.error('Error triggering all imports:', error);
    res.status(500).json({ error: 'Failed to trigger imports' });
  }
});

router.get('/feeds', (_req, res) => {
  res.json({ feeds: FEED_SOURCES });
});

export const importRoutes: Router = router;
