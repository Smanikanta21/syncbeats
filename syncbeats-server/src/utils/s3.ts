import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import fs from "fs";

const region = process.env.AWS_REGION || "ap-south-1";
const bucket = process.env.S3_BUCKET_NAME || "syncbeats-audio";

const s3Client = new S3Client({ region });

export async function uploadToS3(filePath: string, fileName: string, mimeType: string, roomId: string, userId: string): Promise<string> {
  const fileStream = fs.createReadStream(filePath);
  const s3Key = `rooms/${roomId}/${userId}_${fileName}`;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: fileStream,
    ContentType: mimeType,
  });

  await s3Client.send(command);

  // Return the CDN URL if configured, else the default S3 URL
  const cdnDomain = process.env.CDN_DOMAIN;
  if (cdnDomain) {
    return `https://${cdnDomain}/${s3Key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
}

export async function deleteRoomFromS3(roomId: string): Promise<void> {
  const prefix = `rooms/${roomId}/`;
  
  try {
    // 1. List all objects in the room folder
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });
    
    const response = await s3Client.send(listCommand);
    
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

    await s3Client.send(deleteCommand);
    console.log(`[S3] Deleted ${objectsToDelete.length} objects for room ${roomId}`);
  } catch (err) {
    console.error(`[S3] Error deleting objects for room ${roomId}:`, err);
  }
}

