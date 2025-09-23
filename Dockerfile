# === STAGE 1: Builder ===
FROM node:23-alpine AS builder

WORKDIR /app

# Copy package.json and install ALL dependencies
COPY package*.json ./
RUN npm ci

# === STAGE 2: Production Runtime ===
FROM node:23-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install curl, tar, xz (needed for extracting Pandoc tarball)
RUN apk add --no-cache \
    curl \
    tar \
    xz \
    supervisor \
    nano \
    pandoc


# Copy package files
COPY package*.json ./

# Install only production dependencies (no dev deps)
RUN npm ci --only=production && npm cache clean --force

# Copy application source code
COPY . .

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 && \
    chown -R appuser:nodejs /app
USER appuser

# Start the application
CMD ["node", "index.js"]
