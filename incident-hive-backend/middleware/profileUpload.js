/**
 * middleware/profileUpload.js
 * Upload middleware for profile pictures.
 */

const multer = require('multer');
const path = require('path');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function sendError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(mime) || !ALLOWED_EXTENSIONS.has(ext)) {
    return cb(
      Object.assign(
        new Error('Profile picture must be JPG or PNG.'),
        {
          status: 422,
          code: 'INVALID_PROFILE_PICTURE',
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
    files: 1,
  },
});

function uploadProfilePicture(req, res, next) {
  multerInstance.single('picture')(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      return sendError(
        res,
        422,
        err.code || 'PROFILE_UPLOAD_ERROR',
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Profile picture must be 5MB or smaller.'
          : 'Profile picture upload failed.'
      );
    }

    return sendError(
      res,
      err.status || 422,
      err.code || 'INVALID_PROFILE_PICTURE',
      err.message || 'Invalid profile picture.'
    );
  });
}

module.exports = {
  uploadProfilePicture,
};