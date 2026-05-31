FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma/ ./prisma/
COPY src/ ./src/
RUN DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder" npx prisma generate
RUN npx tsc

FROM node:20-alpine

# Install ffmpeg (required by yt-dlp for audio conversion) and curl
RUN apk add --no-cache ffmpeg curl python3

WORKDIR /app
COPY package*.json ./
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
