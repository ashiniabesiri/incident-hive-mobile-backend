/**
 * controllers/profileController.js
 * Handles /api/v1/profile endpoints.
 */

const bcrypt = require('bcryptjs');
const Joi = require('joi');

const UserModel = require('../models/User');
const ExpertProfileModel = require('../models/ExpertProfile');
const TokenService = require('../services/tokenService');
const { uploadFile } = require('../services/fileUploadService');
const { sendAccountDeletionEmail } = require('../services/emailService');

const SALT_ROUNDS = 10;

const updateProfileSchema = Joi.object({
  first_name: Joi.string().min(1).max(100).trim(),
  firstName: Joi.string().min(1).max(100).trim(),
  last_name: Joi.string().min(1).max(100).trim(),
  lastName: Joi.string().min(1).max(100).trim(),
  phone_number: Joi.string().pattern(/^\+?[\d\s\-().]{7,20}$/).trim().allow(null, ''),
  phoneNumber: Joi.string().pattern(/^\+?[\d\s\-().]{7,20}$/).trim().allow(null, ''),
  expertise_areas: Joi.array().items(Joi.string().trim().max(100)).max(20),
  bio: Joi.string().max(2000).trim().allow(null, ''),
  credentials: Joi.string().max(2000).trim().allow(null, ''),
}).min(1);

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#()\-_=+[\]{};:'",.<>/\\|`~])/)
    .required()
    .messages({
      'string.pattern.base':
        'New password must have uppercase, lowercase, number, and special character.',
    }),
});

function validationError(res, error) {
  return res.status(422).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed.',
      details: error.details.map((d) => d.message.replace(/['"]/g, '')),
    },
  });
}

/**
 * GET /api/v1/profile
 */
async function getProfile(req, res, next) {
  try {
    const user = await UserModel.findPublicById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found.',
        },
      });
    }

    const data = {
      user_id: user.user_id,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone: user.phone_number,
      role: user.role,
      profile_picture_url: user.profile_picture_url || null,
      biometric_enabled: false,
      mfa_enabled: user.mfa_enabled,
      email_verified: user.email_verified,
      created_at: user.created_at,
    };

    if (user.role === 'expert') {
      const expert = await ExpertProfileModel.findById(user.user_id);
      if (expert) {
        data.expertise_areas = expert.expertise_areas || [];
        data.bio = expert.bio || null;
        data.credentials = expert.credentials || null;
        data.availability = expert.availability_status;
        data.past_jobs_count = expert.completed_engagements;
      }
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/v1/profile
 */
async function updateProfile(req, res, next) {
  try {
    const { error, value } = updateProfileSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) return validationError(res, error);

    const firstName   = value.first_name   || value.firstName;
    const lastName     = value.last_name    || value.lastName;
    const phoneNumber  = value.phone_number !== undefined ? value.phone_number : value.phoneNumber;

    const hasUserFields   = firstName || lastName || phoneNumber !== undefined;
    const hasExpertFields = value.expertise_areas || value.bio !== undefined || value.credentials !== undefined;

    let updated;
    if (hasUserFields) {
      updated = await UserModel.updateProfile(req.user.userId, {
        firstName,
        lastName,
        phoneNumber,
      });
    } else {
      updated = await UserModel.findPublicById(req.user.userId);
    }

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found.',
        },
      });
    }

    const data = {
      user_id: updated.user_id,
      first_name: updated.first_name,
      last_name: updated.last_name,
      email: updated.email,
      phone_number: updated.phone_number,
      role: updated.role,
      profile_picture_url: updated.profile_picture_url || null,
    };

    if (updated.role === 'expert') {
      if (hasExpertFields) {
        const expertUpdate = {};
        if (value.expertise_areas)        expertUpdate.expertiseAreas = value.expertise_areas;
        if (value.bio !== undefined)       expertUpdate.bio = value.bio;
        if (value.credentials !== undefined) expertUpdate.credentials = value.credentials;

        await ExpertProfileModel.update(req.user.userId, expertUpdate);
      }

      const expert = await ExpertProfileModel.findById(req.user.userId);
      if (expert) {
        data.expertise_areas = expert.expertise_areas || [];
        data.bio = expert.bio || null;
        data.credentials = expert.credentials || null;
        data.availability = expert.availability_status;
        data.past_jobs_count = expert.completed_engagements;
      }
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/v1/profile/password
 */
async function changePassword(req, res, next) {
  try {
    const { error, value } = changePasswordSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) return validationError(res, error);

    const user = await UserModel.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found.',
        },
      });
    }

    const passwordMatch = await bcrypt.compare(value.currentPassword, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'CURRENT_PASSWORD_INCORRECT',
          message: 'Current password is incorrect.',
        },
      });
    }

    const newPasswordHash = await bcrypt.hash(value.newPassword, SALT_ROUNDS);

    await UserModel.updatePassword(req.user.userId, newPasswordHash);
    await TokenService.revokeAllTokens(req.user.userId);

    return res.status(200).json({
      success: true,
      data: {
        message: 'Password changed successfully. Please log in again.',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/profile/picture
 */
async function uploadProfilePicture(req, res, next) {
  try {
    if (!req.file) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'PROFILE_PICTURE_REQUIRED',
          message: 'Profile picture file is required.',
        },
      });
    }

    const uploaded = await uploadFile(req.file);

    const updated = await UserModel.updateProfilePicture(
      req.user.userId,
      uploaded.fileUrl
    );

    return res.status(200).json({
      success: true,
      data: {
        profile_picture_url: updated.profile_picture_url,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/profile
 */
const deleteAccountSchema = Joi.object({
  password: Joi.string().required(),
  confirm_deletion: Joi.boolean().valid(true).required().messages({
    'any.only': 'confirm_deletion must be true to delete your account.',
  }),
});

async function deleteAccount(req, res, next) {
  try {
    const { error: valError } = deleteAccountSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (valError) return validationError(res, valError);

    const user = await UserModel.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found.',
        },
      });
    }

    const passwordMatch = await bcrypt.compare(req.body.password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_PASSWORD',
          message: 'Password confirmation failed.',
        },
      });
    }

    sendAccountDeletionEmail(user.email).catch(() => {});

    await UserModel.anonymise(req.user.userId);
    await TokenService.revokeAllTokens(req.user.userId);

    return res.status(200).json({
      success: true,
      data: {
        message: 'Account deleted successfully.',
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  uploadProfilePicture,
  deleteAccount,
};