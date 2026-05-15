/**
 * services/fileUploadService.js
 * Persists uploaded file buffers to either local disk or AWS S3.
 *
 * Storage backend is selected via the FILE_STORAGE environment variable:
 *   FILE_STORAGE=local  (default) — saves to uploads/ directory in the project root
 *   FILE_STORAGE=s3               — streams to an S3-compatible bucket
 *
 * For S3, install the optional AWS packages first:
 *   npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
 *
 * Required env vars for S3:
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME
 *
 * Every upload function returns the same shape so the controller is storage-agnostic:
 *   {
 *     fileName:  string,   original filename (sanitised)
 *     fileUrl:   string,   publicly accessible URL
 *     fileSize:  number,   bytes
 *     mimeType:  string,
 *   }
 */

const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ─── Storage strategy ──────────────────────────────────────────────────────────
const USE_S3 = process.env.FILE_STORAGE === 's3';

// ─── Local storage setup ───────────────────────────────────────────────────────
// Files are saved to <project_root>/uploads/incidents/
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'incidents');

// Ensure the uploads directory exists at startup (synchronous, runs once)
if (!USE_S3) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ─── S3 client (lazy-loaded so local mode never requires the AWS SDK) ─────────
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

  // Attach Upload constructor so callers can use it
  s3Client._Upload = Upload;

  return s3Client;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * sanitiseFilename
 * Strips path traversal characters and replaces spaces so filenames are safe
 * to use in URLs and on disk.
 *
 * @param {string} originalName  e.g. "My Report (1).pdf"
 * @returns {string}             e.g. "My_Report_1_.pdf"
 */
function sanitiseFilename(originalName) {
  return path.basename(originalName)
    .replace(/[^a-zA-Z0-9._-]/g, '_') // replace unsafe chars
    .replace(/_{2,}/g, '_');           // collapse consecutive underscores
}

/**
 * buildStorageKey
 * Generates a unique storage path for a file.
 * Format: {subDir}/{uuid}_{sanitisedName}
 *
 * @param {string} originalName
 * @param {string} [subDir='incidents']
 * @returns {string}
 */
function buildStorageKey(originalName, subDir = 'incidents') {
  const safe = sanitiseFilename(originalName);
  return `${subDir}/${uuidv4()}_${safe}`;
}

// ─── Local disk upload ─────────────────────────────────────────────────────────

/**
 * uploadToLocal
 * Writes a multer buffer to the local uploads/{subDir}/ directory.
 *
 * @param {Object} file           Multer file object { originalname, buffer, size, mimetype }
 * @param {string} [subDir='incidents']
 * @returns {Object}              { fileName, fileUrl, fileSize, mimeType }
 */
async function uploadToLocal(file, subDir = 'incidents') {
  const storageKey = buildStorageKey(file.originalname, subDir);
  const filePath   = path.join(process.cwd(), 'uploads', storageKey);

  // Ensure the subdirectory exists (in case storageKey contains a subpath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Write the buffer from memory to disk
  await fs.promises.writeFile(filePath, file.buffer);

  // Build the public URL — served by Express static middleware at /uploads
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

// ─── S3 upload ─────────────────────────────────────────────────────────────────

/**
 * uploadToS3
 * Streams a multer buffer to an S3-compatible bucket using @aws-sdk/lib-storage.
 * lib-storage handles multipart uploads automatically for large files.
 *
 * @param {Object} file           Multer file object { originalname, buffer, size, mimetype }
 * @param {string} [subDir='incidents']
 * @returns {Object}              { fileName, fileUrl, fileSize, mimeType }
 */
async function uploadToS3(file, subDir = 'incidents') {
  const client     = getS3Client();
  const Upload     = client._Upload;
  const storageKey = buildStorageKey(file.originalname, subDir);

  const upload = new Upload({
    client,
    params: {
      Bucket:      S3_BUCKET,
      Key:         storageKey,
      Body:        file.buffer,
      ContentType: file.mimetype,
      // Set public-read ACL if your bucket doesn't use CloudFront or signed URLs
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

// ─── Delete helpers ────────────────────────────────────────────────────────────

/**
 * deleteFile
 * Delete a single file from whichever storage backend is active.
 * Pass the fileUrl returned by uploadFile — the path is extracted automatically.
 *
 * @param {string} fileUrl  URL originally returned by uploadFile
 */
async function deleteFile(fileUrl) {
  try {
    if (USE_S3) {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const client = getS3Client();
      // Extract the S3 key from the URL
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

/**
 * deleteFiles
 * Delete multiple files. Fires all deletes concurrently.
 *
 * @param {string[]} fileUrls  Array of URLs returned by uploadFile
 */
async function deleteFiles(fileUrls = []) {
  await Promise.allSettled(fileUrls.map(deleteFile));
}

// ─── Primary export ────────────────────────────────────────────────────────────

/**
 * uploadFile
 * Dispatch to local or S3 based on FILE_STORAGE env var.
 *
 * @param {Object} file            Multer file object from req.files
 * @param {string} [subDir='incidents']  Storage sub-directory (e.g. 'profiles')
 * @returns {{ fileName, fileUrl, fileSize, mimeType }}
 */
async function uploadFile(file, subDir = 'incidents') {
  return USE_S3 ? uploadToS3(file, subDir) : uploadToLocal(file, subDir);
}

/**
 * uploadFiles
 * Upload multiple files concurrently.
 *
 * @param {Object[]} files         Array of Multer file objects from req.files
 * @param {string}   [subDir='incidents']
 * @returns {Array<{ fileName, fileUrl, fileSize, mimeType }>}
 */
async function uploadFiles(files = [], subDir = 'incidents') {
  return Promise.all(files.map(f => uploadFile(f, subDir)));
}

module.exports = { uploadFile, uploadFiles, deleteFile, deleteFiles };
