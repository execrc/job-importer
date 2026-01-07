# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm (pinned version for reproducibility)
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace root files
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json ./client/

# Install dependencies for client only
RUN pnpm install --frozen-lockfile --filter client

# Copy client source code
COPY client/ ./client/

# Build argument for API URL (can be overridden at build time)
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build Next.js
WORKDIR /app/client
RUN pnpm build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy standalone build
COPY --from=builder /app/client/.next/standalone ./
COPY --from=builder /app/client/.next/static ./client/.next/static

# Copy public folder if it exists (using a workaround for optional copy)
COPY --from=builder /app/client/public* ./client/public/

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

USER nodejs

WORKDIR /app/client

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
