import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
  const cdnDomain = process.env.CDN_DOMAIN || "ds4qzxgjm76yj.cloudfront.net";
  if (cdnDomain) {
    return `https://${cdnDomain}/${s3Key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
}
