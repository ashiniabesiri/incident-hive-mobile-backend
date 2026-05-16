const multer = require('multer');
const path = require('path');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
  'text/plain',
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.pdf', '.txt']);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILE_COUNT = 5;

function sendError(res, status, code, message, details = null) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  });
}

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(mime) || !ALLOWED_EXTENSIONS.has(ext)) {
    return cb(
      Object.assign(
        new Error(`File type not allowed: ${file.originalname}. Accepted: JPG, PNG, PDF, TXT.`),
        {
          status: 422,
          code: 'INVALID_FILE_TYPE',
        }
      )
    );
  }

  return cb(null, true);
}

const multerInstance = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILE_COUNT,
  },
});

const ERROR_MESSAGES = {
  LIMIT_FILE_SIZE: `File too large. Max ${MAX_FILE_SIZE / (1024 * 1024)} MB per file.`,
  LIMIT_FILE_COUNT: `Too many files. Max ${MAX_FILE_COUNT} per upload.`,
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field.',
};

function upload(req, res, next) {
  multerInstance.array('attachments', MAX_FILE_COUNT)(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      return sendError(
        res,
        422,
        err.code || 'FILE_UPLOAD_ERROR',
        ERROR_MESSAGES[err.code] || 'File upload error.'
      );
    }

    return sendError(
      res,
      err.status || 422,
      err.code || 'FILE_UPLOAD_ERROR',
      err.message || 'File upload failed.'
    );
  });
}

function uploadOptional(req, res, next) {
  multerInstance.array('attachments', MAX_FILE_COUNT)(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      return sendError(
        res,
        422,
        err.code || 'FILE_UPLOAD_ERROR',
        ERROR_MESSAGES[err.code] || 'File upload error.'
      );
    }

    return sendError(
      res,
      err.status || 422,
      err.code || 'FILE_UPLOAD_ERROR',
      err.message || 'File upload failed.'
    );
  });
}

module.exports = {
  upload,
  uploadOptional,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_FILE_COUNT,
};