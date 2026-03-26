import express from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { validateFileUpload } from '../middleware/validation.js';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Log Cloudinary config status on startup
console.log('[Upload] Cloudinary config:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? '✅ set' : '❌ missing',
  api_key: process.env.CLOUDINARY_API_KEY ? '✅ set' : '❌ missing',
  api_secret: process.env.CLOUDINARY_API_SECRET ? '✅ set' : '❌ missing',
});

// Upload voice message
router.post('/voice', upload.single('audio'), validateFileUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, msg: 'No audio file provided' });
    }

    const duration = parseInt(req.body.duration || '0');

    // Upload to Cloudinary
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video', // Cloudinary uses 'video' for audio files
        folder: 'chatzi/voice-messages',
        format: 'm4a',
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', JSON.stringify(error));
          return res.status(500).json({ 
            success: false, 
            msg: 'Upload failed',
            detail: error.message 
          });
        }

        res.json({
          success: true,
          audioUrl: result?.secure_url,
          duration,
        });
      }
    );

    // Convert buffer to stream and pipe to Cloudinary
    const bufferStream = Readable.from(req.file.buffer);
    bufferStream.pipe(uploadStream);
  } catch (error) {
    console.error('Voice upload error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
});

export default router;
