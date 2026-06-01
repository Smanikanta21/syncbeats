import { Router, Request, Response } from 'express';
import axios from 'axios';
import { Upload } from '@aws-sdk/lib-storage';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { requireAuth } from '../auth/authMiddleware';
import { RoomManager } from '../core/RoomManager';
import { getS3Client, getBucket } from '../utils/s3';
import prisma from '../db/prisma';

// Helper to stream the audio file from RapidAPI response directly to S3
async function streamToS3(mp3DownloadUrl: string, youtubeId: string): Promise<string> {
  const response = await axios({
    method: 'GET',
    url: mp3DownloadUrl,
    responseType: 'stream',
    timeout: 120_000, // 2-minute download timeout
  });

  const bucket = getBucket();
  const s3Key = `tracks/${youtubeId}.mp3`;

  const parallelUpload = new Upload({
    client: getS3Client(),
    params: {
      Bucket: bucket,
      Key: s3Key,
      Body: response.data,
      ContentType: 'audio/mpeg',
    },
  });

  await parallelUpload.done();

  // Return S3 CloudFront/S3 URL
  const cdnDomain = process.env.CDN_DOMAIN;
  if (cdnDomain) {
    return `https://${cdnDomain}/${s3Key}`;
  }
  const region = process.env.AWS_REGION || 'ap-south-1';
  return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
}

export function createYoutubeDownloadRoutes(roomManager: RoomManager): Router {
  const router = Router();

  router.post('/:roomId/yt-download', requireAuth, async (req: Request, res: Response) => {
    const { videoId, title } = req.body as { videoId?: string; title?: string };
    const userId = req.user!.sub;

    if (!videoId?.trim() || !title?.trim()) {
      res.status(400).json({ error: 'videoId and title are required' });
      return;
    }

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      res.status(400).json({ error: 'Invalid YouTube videoId' });
      return;
    }

    try {
      // 1. THE CACHE CHECK (Cost: $0, Time: 5ms)
      const cachedTrack = await prisma.cachedTrack.findUnique({
        where: { youtubeId: videoId },
      });

      if (cachedTrack) {
        console.log(`[YT Download] Cache HIT for ${videoId}. Serving from S3.`);

        const s3Key = `tracks/${videoId}.mp3`;
        const bucket = getBucket();
        const getObjectCommand = new GetObjectCommand({
          Bucket: bucket,
          Key: s3Key,
        });

        const s3Response = await getS3Client().send(getObjectCommand);
        if (s3Response.Body) {
          res.setHeader('Content-Type', 'audio/mpeg');
          if (s3Response.ContentLength) {
            res.setHeader('Content-Length', s3Response.ContentLength);
          }
          res.setHeader('Content-Disposition', `attachment; filename="${cachedTrack.title}.mp3"`);
          (s3Response.Body as any).pipe(res);
          return;
        } else {
          throw new Error('S3 response body is empty for cache hit');
        }
      }

      // 2. THE API FETCH (Cost: 1 Quota, Time: ~2s)
      console.log(`[YT Download] Cache MISS for ${videoId}. Contacting RapidAPI...`);
      const RAPID_API_KEY = process.env.RAPID_API_KEY || '';
      if (!RAPID_API_KEY) {
        throw new Error('RAPID_API_KEY is not configured in the environment');
      }

      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const apiResponse = await axios.request({
        method: 'GET',
        url: 'https://youtube-mp310.p.rapidapi.com/download/mp3',
        params: { url: youtubeUrl },
        headers: {
          'x-rapidapi-key': RAPID_API_KEY,
          'x-rapidapi-host': 'youtube-mp310.p.rapidapi.com'
        },
        timeout: 30000,
      });

      const temporaryMp3Url = apiResponse.data.downloadUrl;
      if (!temporaryMp3Url) {
        throw new Error('RapidAPI failed to return a valid download link. Response: ' + JSON.stringify(apiResponse.data));
      }

      // 3. DIRECT UPLOAD TO S3
      console.log(`[YT Download] Uploading stream to S3...`);
      const permanentS3Url = await streamToS3(temporaryMp3Url, videoId);

      // 4. UPDATE THE GLOBAL CACHE
      console.log(`[YT Download] Saving track to database cache...`);
      const newTrack = await prisma.cachedTrack.create({
        data: {
          youtubeId: videoId,
          title: title || 'Unknown Title',
          s3Url: permanentS3Url,
          requestedBy: userId,
        }
      });

      // 5. Stream the newly downloaded track to client response
      console.log(`[YT Download] Streaming newly downloaded track from S3 to client...`);
      const s3Key = `tracks/${videoId}.mp3`;
      const bucket = getBucket();
      const getObjectCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      });

      const s3Response = await getS3Client().send(getObjectCommand);
      if (s3Response.Body) {
        res.setHeader('Content-Type', 'audio/mpeg');
        if (s3Response.ContentLength) {
          res.setHeader('Content-Length', s3Response.ContentLength);
        }
        res.setHeader('Content-Disposition', `attachment; filename="${newTrack.title}.mp3"`);
        (s3Response.Body as any).pipe(res);
      } else {
        throw new Error('S3 response body is empty after successful upload');
      }

    } catch (err) {
      console.error('[YT Download] failed:', err);
      res.status(500).json({ error: 'Failed to download YouTube track' });
    }
  });

  return router;
}

