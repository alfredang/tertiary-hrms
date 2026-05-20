# Multi-stage build for Next.js application
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Configure npm for better reliability
RUN npm config set fetch-retry-maxtimeout 600000 && \
    npm config set fetch-retry-mintimeout 100000 && \
    npm config set fetch-timeout 600000 && \
    npm config set fetch-retries 5

# Copy package files and .npmrc
COPY package.json package-lock.json* .npmrc* ./
# Copy prisma schema so postinstall (prisma generate) works
COPY prisma ./prisma

# Install dependencies with retries and explicit legacy peer deps
RUN npm ci --legacy-peer-deps || \
    (sleep 5 && npm ci --legacy-peer-deps) || \
    (sleep 10 && npm ci --legacy-peer-deps)

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache su-exec

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy Prisma CLI + schema engine so db push can run at container startup
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines

# uploads dir created at startup (see CMD below — root fixes perms, then drops to nextjs)

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run as root so we can fix the uploads volume permissions (Coolify mounts volumes as root).
# After fixing perms we exec the server as the unprivileged nextjs user.
CMD ["sh", "-c", "mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads && chmod 750 /app/uploads; node_modules/.bin/prisma db push --accept-data-loss --skip-generate 2>&1 || echo '[startup] db push failed (non-fatal), starting server anyway'; exec su-exec nextjs node server.js"]
