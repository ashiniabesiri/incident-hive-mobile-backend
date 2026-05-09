const bcrypt = require('bcryptjs');
const Joi = require('joi');

const UserModel = require('../models/User');
const ExpertProfileModel = require('../models/ExpertProfile');
const TokenService = require('../services/tokenService');
const AuditLogModel = require('../models/AuditLog');
const { withTransaction } = require('../config/database');
const { sendExpertWelcomeEmail } = require('../services/emailService');

const { query } = require('../config/database');

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

    const result = await withTransaction(async (client) => {
      const { rows: [user] } = await client.query(
        `INSERT INTO users
           (email, password_hash, first_name, last_name, phone_number, role, email_verified)
         VALUES ($1, $2, $3, $4, $5, 'expert', true)
         RETURNING user_id, email, first_name, last_name, phone_number,
                   profile_picture_url, role, email_verified, account_status, created_at`,
        [value.email.toLowerCase().trim(), passwordHash, value.firstName.trim(), value.lastName.trim(), value.phoneNumber || null]
      );

      const { rows: [profile] } = await client.query(
        `INSERT INTO expert_profiles
           (user_id, credentials, bio, expertise_areas)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [user.user_id, value.credentials || null, value.bio || null, value.expertise_areas]
      );

      return { user, profile };
    });

    const { user, profile } = result;

    sendExpertWelcomeEmail(user.email, value.password, user.first_name).catch(() => {});

    return res.status(201).json({
      success: true,
      data: {
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        email_verified: user.email_verified,
        expertise_areas: profile.expertise_areas || [],
        credentials: profile.credentials || null,
        bio: profile.bio || null,
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

// ─── GET /api/v1/admin/audit-logs ─────────────────────────────────────────────

async function getAuditLogs(req, res, next) {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));

    const filters = {
      userId:       req.query.user_id       || null,
      action:       req.query.action        || null,
      resourceType: req.query.resource_type || null,
      resourceId:   req.query.resource_id   || null,
      startDate:    req.query.start_date    || null,
      endDate:      req.query.end_date      || null,
      page,
      limit,
    };

    const result = await AuditLogModel.findAll(filters);

    return res.status(200).json({
      success: true,
      data: {
        audit_logs: result.logs,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          total_pages: result.total_pages,
          has_next_page: result.page < result.total_pages,
          has_prev_page: result.page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── GET /api/v1/admin/users ──────────────────────────────────────────────────

async function listUsers(req, res, next) {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const { users, total } = await UserModel.findAll({
      role:          req.query.role          || undefined,
      accountStatus: req.query.account_status || undefined,
      search:        req.query.search        || undefined,
      limit,
      offset,
    });

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          page,
          limit,
          total_pages: totalPages,
          has_next_page: page < totalPages,
          has_prev_page: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── GET /api/v1/admin/users/:user_id ────────────────────────────────────────

async function getUser(req, res, next) {
  try {
    const { user_id } = req.params;

    const user = await UserModel.findPublicById(user_id);
    if (!user) {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found.');
    }

    const data = { ...user };

    if (user.role === 'expert') {
      const profile = await ExpertProfileModel.findById(user_id);
      if (profile) {
        data.expertise_areas = profile.expertise_areas || [];
        data.credentials     = profile.credentials || null;
        data.bio             = profile.bio || null;
        data.availability_status    = profile.availability_status;
        data.completed_engagements  = profile.completed_engagements;
        data.total_earned           = profile.total_earned;
      }
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ─── GET /api/v1/admin/dashboard/stats ───────────────────────────────────────

async function getDashboardStats(req, res, next) {
  try {
    const statsSQL = `
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE account_status != 'deleted') AS total_users,
        (SELECT COUNT(*)::int FROM users WHERE role = 'reporter' AND account_status != 'deleted') AS total_reporters,
        (SELECT COUNT(*)::int FROM users WHERE role = 'expert' AND account_status != 'deleted') AS total_experts,
        (SELECT COUNT(*)::int FROM users WHERE account_status = 'suspended') AS suspended_users,
        (SELECT COUNT(*)::int FROM incidents WHERE deleted_at IS NULL) AS total_incidents,
        (SELECT COUNT(*)::int FROM incidents WHERE status = 'Open' AND deleted_at IS NULL) AS open_incidents,
        (SELECT COUNT(*)::int FROM incidents WHERE status = 'In Progress' AND deleted_at IS NULL) AS in_progress_incidents,
        (SELECT COUNT(*)::int FROM incidents WHERE status = 'Completed' AND deleted_at IS NULL) AS completed_incidents,
        (SELECT COUNT(*)::int FROM bids) AS total_bids
    `;

    const { rows } = await query(statsSQL);

    return res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createExpert,
  terminateSession,
  updateUserStatus,
  getAuditLogs,
  listUsers,
  getUser,
  getDashboardStats,
};
