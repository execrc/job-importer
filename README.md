# Job Importer

Scalable job import system with queue processing and history tracking.

## Prerequisites

- Node.js 22+
- pnpm 9+

## Quick Start

### Option 1: Local Development with Docker (Recommended)

Uses local MongoDB and Redis containers:

```bash
# 1. Install dependencies
pnpm install

# 2. Start MongoDB + Redis containers
docker-compose -f docker-compose.dev.yml up -d

# 3. Create .env file
cp .env.example .env

# 4. Update .env for local services
# MONGODB_URI=mongodb://localhost:27017/job-importer
# REDIS_URL=redis://localhost:6379

# 5. Start development servers
make dev
```

### Option 2: Cloud Services (MongoDB Atlas + Upstash Redis)

```bash
# 1. Install dependencies
pnpm install

# 2. Create .env file
cp .env.example .env

# 3. Edit .env with your cloud credentials:
#    - Get MongoDB URI from Atlas: https://cloud.mongodb.com
#    - Get Redis URL from Upstash: https://console.upstash.com

# 4. Start development servers
make dev
```

Server runs at http://localhost:3001
Client runs at http://localhost:3000

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| MONGODB_URI | MongoDB connection string | required |
| REDIS_URL | Redis connection string | required |
| PORT | Server port | 3001 |
| WORKER_CONCURRENCY | Parallel batch workers | 5 |
| BATCH_SIZE | Jobs per bulk insert | 100 |
| NEXT_PUBLIC_API_URL | API URL for frontend | http://localhost:3001 |

## Running with Docker (Full Stack)

```bash
docker-compose up --build
```

This starts MongoDB, Redis, server, and client containers.

## Project Structure

```
/job-importer
├── /client              # Next.js frontend
│   ├── /app             # Pages and components
│   └── /lib             # API client
├── /server              # Express backend
│   ├── /src
│   │   ├── /config      # DB, Redis, env config
│   │   ├── /models      # Mongoose schemas
│   │   ├── /queues      # BullMQ queue and workers
│   │   ├── /routes      # API endpoints
│   │   ├── /services    # Business logic
│   │   ├── /events      # SSE real-time updates
│   │   └── /cron        # Scheduled imports
│   └── Dockerfile
├── /docs                # Architecture documentation
├── docker-compose.yml   # Full stack deployment
└── docker-compose.dev.yml # Local MongoDB + Redis only
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/import/logs` | List import history (paginated) |
| GET | `/api/import/logs/:id` | Get single import details |
| POST | `/api/import/trigger` | Trigger import for one feed |
| POST | `/api/import/trigger-all` | Trigger all 9 feeds |
| GET | `/api/import/feeds` | List available feed URLs |
| GET | `/api/import/events` | SSE stream for real-time updates |
| GET | `/api/jobs` | List imported jobs |
| GET | `/health` | Health check |

## Commands

```bash
make install      # Install dependencies
make dev          # Run server + client
make server-dev   # Server only
make client-dev   # Client only
make build        # Production build
```

## Testing

```bash
# Build verification
cd server && pnpm build
cd client && pnpm build

# Health check
curl http://localhost:3001/health

# Trigger import
curl -X POST http://localhost:3001/api/import/trigger-all

# Check import logs
curl http://localhost:3001/api/import/logs
```

## Feed Sources

9 XML feeds configured:
- **Jobicy** (8 feeds): General, SMM, Seller/France, Design, Data Science, Copywriting, Business, Management
- **HigherEdJobs** (1 feed): Returns 403 due to bot protection - handled gracefully as failed import

## Key Design Decisions

1. **Batch Processing**: Jobs are grouped into batches (default: 100) and processed with MongoDB `bulkWrite` for 10-50x faster imports compared to individual inserts.

2. **Queue-Based Architecture**: BullMQ with Redis ensures reliable processing with automatic retries (exponential backoff: 2s → 4s → 8s) and job persistence across server restarts.

3. **Real-Time Updates**: Server-Sent Events (SSE) push import progress to the frontend. Falls back to polling if SSE connection fails.

4. **Job Deduplication**: Single `jobs` collection with `externalId` as unique key. Same job appearing in multiple feeds updates the existing record rather than creating duplicates.

For detailed architecture diagrams and scaling considerations, see [docs/architecture.md](docs/architecture.md).

## Assumptions

1. `externalId` (from RSS guid/id) uniquely identifies a job across all feeds
2. Same job in multiple Jobicy feeds = single record (last import wins)
3. HigherEdJobs API blocks automated requests (403) - marked as failed, not retried
4. Cron runs every hour at minute 0 to refresh all feeds
5. MongoDB Atlas and Upstash Redis free tiers are sufficient for this use case
6. Frontend polling interval (3s) is acceptable fallback when SSE unavailable
