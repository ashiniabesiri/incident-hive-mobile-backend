const bcrypt = require('bcryptjs');
const Joi = require('joi');

const UserModel = require('../models/User');
const ExpertProfileModel = require('../models/ExpertProfile');
const TokenService = require('../services/tokenService');

const SALT_ROUNDS = 10;

// ─── Validation schemas ────────────────────────────────────────────────────────

const createExpertSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#()\-_=+[\]{};:'",.<>/\\|`~])/)
    .required()
    .messages({
      'string.pattern.base':
        'Password must have uppercase, lowercase, number, and special character.',
    }),
  firstName: Joi.string().min(1).max(100).trim().required(),
  lastName: Joi.string().min(1).max(100).trim().required(),
  phoneNumber: Joi.string().pattern(/^\+?[\d\s\-().]{7,20}$/).trim().optional().allow(null, ''),
  credentials: Joi.string().max(2000).trim().optional().allow(null, ''),
  expertise_areas: Joi.array().items(Joi.string().trim().max(100)).max(20).optional().default([]),
  bio: Joi.string().max(2000).trim().optional().allow(null, ''),
});

const terminateSessionSchema = Joi.object({
  user_id: Joi.string().uuid().required(),
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sendError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
}

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

// ─── POST /api/v1/admin/experts ───────────────────────────────────────────────

async function createExpert(req, res, next) {
  try {
    const { error, value } = createExpertSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) return validationError(res, error);

    const existing = await UserModel.findByEmail(value.email);
    if (existing) {
      return sendError(res, 409, 'EMAIL_ALREADY_EXISTS', 'A user with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(value.password, SALT_ROUNDS);

    const user = await UserModel.create({
      email: value.email,
      passwordHash,
      firstName: value.firstName,
      lastName: value.lastName,
      phoneNumber: value.phoneNumber || null,
      role: 'expert',
    });

    const expertProfile = await ExpertProfileModel.create({
      userId: user.user_id,
      credentials: value.credentials || null,
      expertiseAreas: value.expertise_areas,
    });

    if (value.bio) {
      await ExpertProfileModel.update(user.user_id, { bio: value.bio });
    }

    return res.status(201).json({
      success: true,
      data: {
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        expertise_areas: expertProfile.expertise_areas || [],
        credentials: expertProfile.credentials || null,
        bio: value.bio || null,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── POST /api/v1/admin/sessions/terminate ────────────────────────────────────

async function terminateSession(req, res, next) {
  try {
    const { error, value } = terminateSessionSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) return validationError(res, error);

    const user = await UserModel.findById(value.user_id);
    if (!user) {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found.');
    }

    await TokenService.revokeAllTokens(value.user_id);

    return res.status(200).json({
      success: true,
      data: {
        message: `All sessions terminated for user ${value.user_id}.`,
        user_id: value.user_id,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── PATCH /api/v1/admin/users/:user_id/status ───────────────────────────────

const updateUserStatusSchema = Joi.object({
  account_status: Joi.string().valid('active', 'suspended').required().messages({
    'any.only': 'account_status must be "active" or "suspended".',
  }),
});

async function updateUserStatus(req, res, next) {
  try {
    const { user_id } = req.params;

    const { error, value } = updateUserStatusSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) return validationError(res, error);

    const user = await UserModel.findById(user_id);
    if (!user) {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found.');
    }

    const updated = await UserModel.updateAccountStatus(user_id, value.account_status);

    if (value.account_status === 'suspended') {
      await TokenService.revokeAllTokens(user_id);
    }

    return res.status(200).json({
      success: true,
      data: {
        user_id: updated.user_id,
        account_status: updated.account_status,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createExpert,
  terminateSession,
  updateUserStatus,
};
