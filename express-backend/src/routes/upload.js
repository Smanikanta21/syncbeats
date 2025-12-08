const express = require('express');
const multer = require('multer');
const { PrismaClient } = require('../generated/prisma');
const { uploadFile, hasEnoughStorage, MAX_STORAGE_LIMIT } = require('../utils/storage');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_STORAGE_LIMIT
    },
});
const prisma = new PrismaClient();
const router = express.Router();

async function handleFileUpload(req, res) {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded." });
    }
    const userId = req.user.id;
    const fileSize = req.file.size;
    try {
        const user = await prisma.users.findUnique({
            where: { id: userId },
            select: { storageUsed: true }
        });

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        if (!hasEnoughStorage(user.storageUsed, fileSize)) {
            const remaining = (MAX_STORAGE_LIMIT - user.storageUsed) / (1024 * 1024);
            return res.status(400).json({
                message: `Storage limit exceeded. You have ${remaining.toFixed(2)}MB remaining.`
            });
        }
        const publicUrl = await uploadFile(req.file, userId);
        await prisma.users.update({
            where: { id: userId },
            data: {
                storageUsed: {
                    increment: fileSize
                }
            }
        });
        return res.status(200).json({
            message: "File uploaded successfully.",
            url: publicUrl,
            size: fileSize
        });

    } catch (error) {
        console.error("Upload Error:", error);
        return res.status(500).json({ message: "Failed to upload file." });
    }
}

module.exports = {
    handleFileUpload,
    uploadMiddleware: upload.single('file')
};
