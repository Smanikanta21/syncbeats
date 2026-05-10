import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import fs from "fs";

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    const region = process.env.AWS_REGION || "ap-south-1";
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      console.error("[S3] Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY");
    }

    _s3Client = new S3Client({
      region,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }
  return _s3Client;
}

function getBucket(): string {
  return process.env.S3_BUCKET_NAME || "syncbeats-audio";
}

export async function uploadToS3(filePath: string, fileName: string, mimeType: string, roomId: string, userId: string): Promise<string> {
  const fileStream = fs.createReadStream(filePath);
  const s3Key = `rooms/${roomId}/${userId}_${fileName}`;
  const bucket = getBucket();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: fileStream,
    ContentType: mimeType,
  });

  await getS3Client().send(command);

  // Return the CDN URL if configured, else the default S3 URL
  const cdnDomain = process.env.CDN_DOMAIN;
  if (cdnDomain) {
    return `https://${cdnDomain}/${s3Key}`;
  }
  const region = process.env.AWS_REGION || "ap-south-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
}

export async function deleteRoomFromS3(roomId: string): Promise<void> {
  const prefix = `rooms/${roomId}/`;
  const bucket = getBucket();

  try {
    // 1. List all objects in the room folder
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });

    const response = await getS3Client().send(listCommand);

    if (!response.Contents || response.Contents.length === 0) {
      console.log(`[S3] No objects found to delete for room ${roomId}`);
      return;
    }

    // 2. Map contents to delete object list
    const objectsToDelete = response.Contents.map((item) => ({
      Key: item.Key,
    }));

    // 3. Perform bulk deletion
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: objectsToDelete,
        Quiet: false,
      },
    });

    await getS3Client().send(deleteCommand);
    console.log(`[S3] Deleted ${objectsToDelete.length} objects for room ${roomId}`);
  } catch (err) {
    console.error(`[S3] Error deleting objects for room ${roomId}:`, err);
  }
}
