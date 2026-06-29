FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1
RUN npm ci
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma/ ./prisma/
COPY src/ ./src/
RUN DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder" npx prisma generate
RUN npx tsc

FROM node:20-slim

# Install curl, python3, and symlink python for yt-dlp runtime
RUN apt-get update && apt-get install -y curl python3 python-is-python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1
RUN npm ci --omit=dev
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder" npx prisma generate
COPY --from=builder /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/server.js"]
