
const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// Storage strategy
const USE_S3 = process.env.FILE_STORAGE === 's3';

// Local storage setup
// Files are saved to <project_root>/uploads/incidents/
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'incidents');

if (!USE_S3) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

let s3Client;
let S3_BUCKET;

function getS3Client() {
  if (s3Client) return s3Client;

  let S3Client, Upload;
  try {
    ({ S3Client } = require('@aws-sdk/client-s3'));
    ({ Upload }   = require('@aws-sdk/lib-storage'));
  } catch {
    throw new Error(
      'S3 storage selected but @aws-sdk/client-s3 is not installed. ' +
      'Run: npm install @aws-sdk/client-s3 @aws-sdk/lib-storage'
    );
  }

  S3_BUCKET = process.env.S3_BUCKET_NAME;
  if (!S3_BUCKET) throw new Error('S3_BUCKET_NAME environment variable is not set.');

  s3Client = new S3Client({
    region:      process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  s3Client._Upload = Upload;

  return s3Client;
}

// Helpers

function sanitiseFilename(originalName) {
  return path.basename(originalName)
    .replace(/[^a-zA-Z0-9._-]/g, '_') // replace unsafe chars
    .replace(/_{2,}/g, '_');           // collapse consecutive underscores
}

function buildStorageKey(originalName) {
  const safe = sanitiseFilename(originalName);
  return `incidents/${uuidv4()}_${safe}`;
}

// Local disk upload

async function uploadToLocal(file) {
  const storageKey = buildStorageKey(file.originalname);
  const filePath   = path.join(process.cwd(), 'uploads', storageKey);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  await fs.promises.writeFile(filePath, file.buffer);

  const baseUrl  = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const fileUrl  = `${baseUrl}/uploads/${storageKey}`;

  logger.info(`File saved locally: ${filePath}`);

  return {
    fileName: sanitiseFilename(file.originalname),
    fileUrl,
    fileSize: file.size,
    mimeType: file.mimetype,
  };
}

// S3 upload

async function uploadToS3(file) {
  const client     = getS3Client();
  const Upload     = client._Upload;
  const storageKey = buildStorageKey(file.originalname);

  const upload = new Upload({
    client,
    params: {
      Bucket:      S3_BUCKET,
      Key:         storageKey,
      Body:        file.buffer,
      ContentType: file.mimetype,
      // ACL: 'public-read',
    },
  });

  const result  = await upload.done();
  const fileUrl = result.Location ||
    `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${storageKey}`;

  logger.info(`File uploaded to S3: ${storageKey}`);

  return {
    fileName: sanitiseFilename(file.originalname),
    fileUrl,
    fileSize: file.size,
    mimeType: file.mimetype,
  };
}

// Delete helpers

async function deleteFile(fileUrl) {
  try {
    if (USE_S3) {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const client = getS3Client();
      const key = new URL(fileUrl).pathname.replace(/^\//, '');
      await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      logger.info(`S3 object deleted: ${key}`);
    } else {
      // Extract local path from URL
      const baseUrl   = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const localPath = fileUrl.replace(baseUrl, '');
      const filePath  = path.join(process.cwd(), localPath);
      await fs.promises.unlink(filePath);
      logger.info(`Local file deleted: ${filePath}`);
    }
  } catch (err) {
    // Log but don't throw — a failed delete should not break the API response
    logger.error(`Failed to delete file ${fileUrl}:`, err.message);
  }
}

async function deleteFiles(fileUrls = []) {
  await Promise.allSettled(fileUrls.map(deleteFile));
}

// Primary export

async function uploadFile(file) {
  return USE_S3 ? uploadToS3(file) : uploadToLocal(file);
}

async function uploadFiles(files = []) {
  return Promise.all(files.map(uploadFile));
}

module.exports = { uploadFile, uploadFiles, deleteFile, deleteFiles };
