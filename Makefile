.PHONY: install dev server-dev client-dev build test

# Install all dependencies
install:
	pnpm install

# Start both server and client in dev mode
dev:
	pnpm dev

# Start only server
server-dev:
	pnpm --filter server dev

# Start only client
client-dev:
	pnpm --filter client dev

# Build for production
build:
	pnpm build

# Run tests
test:
	pnpm test
