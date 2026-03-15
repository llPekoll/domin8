FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source + migrations
COPY . .

EXPOSE 3002

# Run migrations then start server
CMD ["sh", "-c", "bun run db:migrate && bun src/index.ts"]
