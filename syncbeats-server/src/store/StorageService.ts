import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

// Instantiate a storage client.
// This requires either GOOGLE_APPLICATION_CREDENTIALS or running in a GCP environment.
const storage = new Storage();

// Replace with your actual bucket name.
const bucketName = process.env.GCS_BUCKET_NAME || 'syncbeats-audio-bucket';

export const uploadAudioToGCS = async (file: any, userId: string): Promise<{ url: string; size: number }> => {
  const bucket = storage.bucket(bucketName);
  
  // Generate a unique, safe filename
  const cleanOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filename = `tracks/${userId}/${Date.now()}-${uuidv4()}-${cleanOriginalName}`;
  const blob = bucket.file(filename);

  const writeStream = blob.createWriteStream({
    resumable: false,
    contentType: file.mimetype,
  });

  return new Promise((resolve, reject) => {
    writeStream.on('error', (err) => reject(err));
    
    writeStream.on('finish', () => {
      // Constructs the public URL for the file
      const publicUrl = `https://storage.googleapis.com/${bucketName}/${blob.name}`;
      resolve({ url: publicUrl, size: file.size });
    });

    // Write file buffer to GCS
    writeStream.end(file.buffer);
  });
};
