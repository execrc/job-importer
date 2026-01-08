# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       External XML Feeds                        │
│                    (Jobicy x8, HigherEdJobs)                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js Express Server                       │
│                                                                 │
│   ┌────────────┐    ┌─────────────┐    ┌─────────────────┐     │
│   │ Cron (1hr) │───▶│ Feed Fetcher│    │   REST API      │     │
│   └────────────┘    │ (XML→JSON)  │    │ /api/import/*   │     │
│                     └──────┬──────┘    └─────────────────┘     │
│                            ▼                                    │
│                    ┌─────────────┐                              │
│                    │   Batcher   │◄──── BATCH_SIZE config      │
│                    └──────┬──────┘                              │
│                           ▼                                     │
│                    ┌─────────────┐                              │
│                    │ BullMQ Queue│◄──── Redis (Upstash)        │
│                    └──────┬──────┘                              │
│                           ▼                                     │
│    ┌─────────────────────────────────────────────────────┐     │
│    │              Batch Workers (concurrency=5)          │     │
│    │                   MongoDB bulkWrite                  │     │
│    └────────────────────────┬────────────────────────────┘     │
│                             │                                   │
│                    ┌────────▼────────┐                         │
│                    │  SSE Broadcast  │◄──── Redis Pub/Sub      │
│                    └────────┬────────┘                         │
└─────────────────────────────┼───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        MongoDB Atlas                            │
│              jobs collection  │  importlogs collection          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Next.js Frontend                          │
│                  (SSE + polling fallback)                       │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

1. Cron (or API) triggers import
2. Feed Fetcher downloads XML, parses to JSON using `fast-xml-parser`
3. Jobs split into batches (BATCH_SIZE, default 100)
4. Each batch queued as single BullMQ job
5. Worker executes MongoDB `bulkWrite` for entire batch
6. Import stats updated in `importlogs` collection
7. SSE events broadcast to connected frontend clients

## Design Decisions

### Why Batch Processing?

**Problem**: Individual inserts are slow. With 1M+ records, processing one job per queue message would take hours.

**Solution**: Group jobs into batches of 100 and use MongoDB `bulkWrite`.

**Result**: 10-50x faster imports. A feed with 500 jobs becomes 5 batch operations instead of 500 individual operations.

```javascript
// Single bulkWrite for entire batch
await Job.bulkWrite(operations, { ordered: false });
```

### Why Server-Sent Events (SSE)?

**Problem**: Polling wastes resources and introduces latency.

**Solution**: SSE provides real-time server-to-client push. Used Redis Pub/Sub for multi-instance support.

**Why not WebSocket?** SSE is simpler, works over HTTP, and sufficient for one-way server→client updates. No need for bidirectional communication.

**Fallback**: If SSE connection fails, frontend falls back to 3-second polling.

### Why BullMQ + Redis?

**Problem**: Need reliable job processing with retry logic.

**Solution**: BullMQ provides:
- Automatic retries with exponential backoff (2s → 4s → 8s)
- Job persistence (survives server restart)
- Concurrency control
- Failed job tracking

**Why Upstash?** Serverless Redis that works with Vercel/Render. Free tier is sufficient for this use case.

### Why Single Jobs Collection?

**Problem**: Same job might appear in multiple Jobicy feeds (e.g., a "Design" job also in "General").

**Solution**: Single collection with `externalId` as unique key. Upsert ensures:
- First time = insert
- Duplicate = update

This prevents data duplication and maintains accurate counts.

### Why Mongoose over Native Driver?

- Schema validation at application level
- Cleaner API for common operations
- Built-in middleware support
- TypeScript integration

## MongoDB Schema

### jobs
```javascript
{
  externalId: { type: String, required: true, unique: true },
  sourceUrl: String,
  title: { type: String, required: true },
  company: { type: String, required: true },
  location: String,
  jobType: String,
  description: String,
  content: String,
  link: { type: String, required: true },
  imageUrl: String,
  publishedAt: Date,
  createdAt: Date,
  updatedAt: Date
}

// Indexes
{ externalId: 1 }      // unique, for upserts
{ company: 1 }         // for filtering
{ publishedAt: -1 }    // for sorting
```

### importlogs
```javascript
{
  feedUrl: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  startedAt: Date,
  completedAt: Date,
  totalFetched: { type: Number, default: 0 },
  newJobs: { type: Number, default: 0 },
  updatedJobs: { type: Number, default: 0 },
  failedJobs: { type: Number, default: 0 },
  importErrors: [{
    externalId: String,
    title: String,
    reason: String,
    errorType: { type: String, enum: ['validation', 'database', 'parse', 'network', 'unknown'] }
  }]
}

// Indexes
{ createdAt: -1 }              // for pagination
{ feedUrl: 1, createdAt: -1 }  // for feed-specific history
{ status: 1 }                  // for filtering
```

## Scaling for 1M+ Records

### Current Approach
| Setting | Default | Effect |
|---------|---------|--------|
| BATCH_SIZE | 100 | Jobs per bulkWrite operation |
| WORKER_CONCURRENCY | 5 | Parallel batch processing |

### For Large Scale (1M+ jobs)
| Setting | Recommended | Why |
|---------|-------------|-----|
| BATCH_SIZE | 500-1000 | Fewer round trips to MongoDB |
| WORKER_CONCURRENCY | 10-20 | More parallel processing |

### Performance Characteristics
- **Batch of 100**: ~50ms per batch (MongoDB bulkWrite)
- **10,000 jobs**: ~100 batches × 50ms = ~5 seconds total
- **1,000,000 jobs**: ~10,000 batches = ~8-10 minutes with concurrency=5

### Horizontal Scaling
1. Add more worker instances (each connects to same Redis queue)
2. Increase `WORKER_CONCURRENCY` per instance
3. MongoDB Atlas handles concurrent writes automatically

## Real-Time Updates

### SSE Event Types
```typescript
// Import started
{ type: 'import:started', importLogId: string, data: { feedUrl } }

// Progress update (after each batch)
{ type: 'import:progress', importLogId: string, data: { newJobs, updatedJobs, failedJobs, totalFetched } }

// Import completed
{ type: 'import:completed', importLogId: string, data: { newJobs, updatedJobs, failedJobs } }

// Import failed
{ type: 'import:failed', importLogId: string, data: { error } }
```

### Event Flow
```
Worker → Redis Pub/Sub → SSE Service → Connected Clients
```

1. Batch worker completes processing
2. Publishes event to Redis channel `import-events`
3. SSE service (subscribed to channel) receives event
4. Broadcasts to all connected frontend clients
5. Frontend updates UI without page refresh

## Error Handling

| Error Type | Handling | Retry? |
|------------|----------|--------|
| Network (feed fetch) | Exponential backoff | Yes, 3 attempts |
| XML Parse | Log error, mark batch failed | No |
| MongoDB Write | Retry via BullMQ | Yes, 3 attempts |
| Validation | Log individual job error | No |

Failed jobs are tracked in `importlogs.importErrors` with:
- `externalId`: Which job failed
- `reason`: Error message
- `errorType`: Classification for debugging

## Docker Deployment

```
┌──────────────────┐     ┌──────────────────┐
│   Client (3000)  │     │   Server (3001)  │
│   Next.js        │────▶│   Express        │
└──────────────────┘     └────────┬─────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
              ┌─────▼──────┐             ┌──────▼─────┐
              │  MongoDB   │             │   Redis    │
              │  (27017)   │             │   (6379)   │
              └────────────┘             └────────────┘
```

For production, replace local MongoDB/Redis with:
- MongoDB Atlas (managed, free tier available)
- Upstash Redis (serverless, free tier available)
