# syntax=docker/dockerfile:1
# Enable BuildKit features for better caching
# Build stage - Dependencies only
FROM node:22.11.0-alpine AS deps
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ linux-headers eudev-dev

# Copy package files
COPY package.json package-lock.json .npmrc* ./

# Use BuildKit cache mount for npm cache
# This caches npm downloads between builds
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund --verbose || \
    npm install --omit=dev --no-audit --no-fund --verbose

# Build stage - Full dependencies for building
FROM node:22.11.0-alpine AS builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ linux-headers eudev-dev

# Copy package files
COPY package.json package-lock.json .npmrc* ./

# Install ALL dependencies (including dev) for build
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund || \
    npm install --no-audit --no-fund

# Copy source code and build
COPY . .

# Build the application
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

# Production stage - Minimal final image
FROM node:22.11.0-alpine AS production
WORKDIR /app

# Add curl for healthcheck and create non-root user
RUN apk add --no-cache curl && \
    adduser -S nodeuser -u 1001

# Copy production dependencies from deps stage
COPY --from=deps --chown=nodeuser:nodeuser /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder --chown=nodeuser:nodeuser /app/build ./build
COPY --from=builder --chown=nodeuser:nodeuser /app/src ./src
COPY --from=builder --chown=nodeuser:nodeuser /app/package*.json ./
COPY --from=builder --chown=nodeuser:nodeuser /app/scripts ./scripts
COPY --from=builder --chown=nodeuser:nodeuser /app/.npmrc* ./

# Set build argument and environment variable
ARG COMMIT_HASH=local
ENV COMMIT_HASH=${COMMIT_HASH:-local} \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048"

# Switch to non-root user
USER nodeuser

# Expose the port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/status || exit 1

# Start the application
CMD ["npm", "run", "start"]