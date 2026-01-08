# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm (pinned version for reproducibility)
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace root files
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/

# Install dependencies for server only
RUN pnpm install --frozen-lockfile --filter server

# Copy server source code
COPY server/ ./server/

# Build TypeScript
WORKDIR /app/server
RUN pnpm build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile --filter server && pnpm store prune

# Copy built files from builder
COPY --from=builder /app/server/dist ./server/dist

WORKDIR /app/server

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
