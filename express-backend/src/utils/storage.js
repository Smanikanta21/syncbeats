const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');

const bucketName = process.env.GCS_BUCKET_NAME;


let storage;
try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        storage = new Storage();
    }
} catch (err) {
    console.warn("GCS initialization failed, falling back to local storage.", err.message);
}

const MAX_STORAGE_LIMIT = 100 * 1024 * 1024;

function hasEnoughStorage(currentUsage, fileSize) {
    return (currentUsage + fileSize) <= MAX_STORAGE_LIMIT;
}

async function uploadFile(file, userId) {

    if (storage && bucketName) {
        try {
            return await uploadToGCS(file, userId);
        } catch (error) {
            console.error("GCS Upload failed, attempting local fallback:", error.message);
        }
    }

    return await uploadToLocal(file, userId);
}

async function uploadToGCS(file, userId) {
    const bucket = storage.bucket(bucketName);
    const fileName = `${userId}/${Date.now()}-${file.originalname.replace(/ /g, '_')}`;
    const blob = bucket.file(fileName);

    const blobStream = blob.createWriteStream({
        resumable: false,
        contentType: file.mimetype,
    });

    return new Promise((resolve, reject) => {
        blobStream.on('error', (err) => reject(err));
        blobStream.on('finish', () => {
            const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
            resolve(publicUrl);
        });
        blobStream.end(file.buffer);
    });
}

async function uploadToLocal(file, userId) {
    const uploadDir = path.join(__dirname, '../../public/uploads', userId.toString());

    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const fileName = `${Date.now()}-${file.originalname.replace(/ /g, '_')}`;
    const filePath = path.join(uploadDir, fileName);

    await fs.promises.writeFile(filePath, file.buffer);


    const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5001}`;
    return `${baseUrl}/uploads/${userId}/${fileName}`;
}

module.exports = {
    hasEnoughStorage,
    uploadFile,
    MAX_STORAGE_LIMIT
};
