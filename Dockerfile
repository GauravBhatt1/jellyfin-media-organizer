# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including devDependencies
RUN npm ci

# Copy source code
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY script ./script
COPY vite.config.ts tsconfig.json tailwind.config.ts postcss.config.js index.html ./
COPY drizzle.config.ts ./
COPY theme.json ./

# Build the application using node directly
RUN node --import tsx script/build.ts

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Create media directories
RUN mkdir -p /mnt /media /data

# Expose port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Start the application
CMD ["node", "dist/index.cjs"]
