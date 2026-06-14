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

# Install ffmpeg (required by yt-dlp for audio conversion) and curl
RUN apt-get update && apt-get install -y ffmpeg curl python3 openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json cookies.tx[t] ./
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1
RUN npm ci --omit=dev
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder" npx prisma generate
COPY --from=builder /app/dist ./dist

# Download latest yt-dlp Linux binary
RUN mkdir -p /app/bin \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /app/bin/yt-dlp \
  && chmod +x /app/bin/yt-dlp \
  && /app/bin/yt-dlp --version

EXPOSE 4000
CMD ["node", "dist/server.js"]
