/**
 * controllers/expertController.js
 * Handler functions for the expert feed and profile management endpoints.
 */

const Joi = require('joi');

const ExpertProfileModel = require('../models/ExpertProfile');
const BidModel = require('../models/Bid');
const { query } = require('../config/database');

const {
  filterIncidentForFeed,
  filterIncidentsForFeed,
  filterExpertProfile,
} = require('../middleware/piiFilter');

// Validation schemas 

const availabilitySchema = Joi.object({
  availability: Joi.string()
    .valid('Available', 'Unavailable')
    .required()
    .messages({
      'any.only': 'availability must be "Available" or "Unavailable".',
      'any.required': 'availability is required.',
    }),
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function validateBody(schema, body, res) {
  const { error, value } = schema.validate(body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'Validation failed.',
      error.details.map((d) => d.message.replace(/['"]/g, ''))
    );
    return null;
  }

  return value;
}

async function getExpertAreas(expertId) {
  const profile = await ExpertProfileModel.findById(expertId);
  return profile?.expertise_areas || [];
}

// ─── GET /api/v1/feed/incidents ────────────────────────────────────────────────

async function getFeedIncidents(req, res, next) {
  try {
    const expertId = req.user.userId;

    const { incident_type, search } = req.query;
    const aiRanked = req.query.ai_ranked === 'true';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '10', 10)));
    const offset = (page - 1) * limit;

    const conditions = [
      "i.status = 'Open'",
      'i.deleted_at IS NULL',
      'i.bid_window_ends_at > NOW()',
    ];

    // Separate params are safer:
    // filterParams = used by WHERE and count query
    // dataParams = used by data query including ranking, limit, offset
    const filterParams = [];

    if (incident_type) {
      filterParams.push(incident_type);
      conditions.push(`i.incident_type = $${filterParams.length}`);
    }

    if (search && search.trim()) {
      filterParams.push(`%${search.trim()}%`);
      conditions.push(
        `(i.title ILIKE $${filterParams.length} OR i.description ILIKE $${filterParams.length})`
      );
    }

    const whereClause = conditions.join(' AND ');

    let expertiseAreas = [];
    let relevanceExpr = '0';
    const dataParams = [...filterParams];

    if (aiRanked) {
      expertiseAreas = await getExpertAreas(expertId);

      if (expertiseAreas.length > 0) {
        dataParams.push(expertiseAreas);
        const areasParam = `$${dataParams.length}`;

        relevanceExpr = `
          (CASE WHEN i.incident_type = ANY(${areasParam}::text[]) THEN 2 ELSE 0 END)
          + LEAST(
              (
                SELECT COUNT(*)::int
                FROM unnest(${areasParam}::text[]) AS area
                WHERE i.title ILIKE '%' || area || '%'
                   OR i.description ILIKE '%' || area || '%'
              ),
              3
            )
        `;
      }
    }

    const orderClause = aiRanked
      ? 'ORDER BY relevance_score DESC, i.created_at DESC'
      : 'ORDER BY i.created_at DESC';

    dataParams.push(limit);
    const limitParam = `$${dataParams.length}`;

    dataParams.push(offset);
    const offsetParam = `$${dataParams.length}`;

    const dataSQL = `
      SELECT
        i.incident_id,
        i.incident_type,
        i.title,
        i.description,
        i.budget,
        i.is_anonymous,
        i.status,
        i.reporter_id,
        i.bid_window_ends_at AS expires_at,
        i.created_at,
        i.updated_at,
        (${relevanceExpr}) AS relevance_score,
        (
          SELECT COUNT(*)::int
          FROM bids b
          WHERE b.incident_id = i.incident_id
        ) AS bid_count
      FROM incidents i
      WHERE ${whereClause}
      ${orderClause}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const countSQL = `
      SELECT COUNT(*)::int AS total
      FROM incidents i
      WHERE ${whereClause}
    `;

    const [dataResult, countResult] = await Promise.all([
      query(dataSQL, dataParams),
      query(countSQL, filterParams),
    ]);

    const total = countResult.rows[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    const incidents = filterIncidentsForFeed(dataResult.rows, {
      truncateDescription: true,
      includeRelevance: aiRanked,
    });

    return res.status(200).json({
      success: true,
      data: {
        incidents,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        meta: {
          aiRanked,
          expertiseAreas: aiRanked ? expertiseAreas : undefined,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── GET /api/v1/feed/incidents/:incident_id ──────────────────────────────────

async function getFeedIncidentDetail(req, res, next) {
  try {
    const { incident_id } = req.params;
    const expertId = req.user.userId;

    const { rows } = await query(
      `SELECT
         i.incident_id,
         i.incident_type,
         i.title,
         i.description,
         i.budget,
         i.is_anonymous,
         i.status,
         i.reporter_id,
         i.bid_window_ends_at AS expires_at,
         i.created_at,
         i.updated_at,
         (
           SELECT COUNT(*)::int
           FROM bids b
           WHERE b.incident_id = i.incident_id
         ) AS bid_count
       FROM incidents i
       WHERE i.incident_id = $1
         AND i.status = 'Open'
         AND i.deleted_at IS NULL
         AND i.bid_window_ends_at > NOW()`,
      [incident_id]
    );

    if (!rows[0]) {
      return sendError(
        res,
        404,
        'INCIDENT_NOT_FOUND',
        'Incident not found or no longer accepting bids.'
      );
    }

    const existingBid = await BidModel.findByExpertAndIncident(expertId, incident_id);

    const incident = filterIncidentForFeed(rows[0], {
      truncateDescription: false,
      includeRelevance: false,
    });

    incident.has_bid = !!existingBid;
    incident.bid_id = existingBid?.bid_id || null;
    incident.bid_status = existingBid?.status || null;

    return res.status(200).json({
      success: true,
      data: { incident },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── GET /api/v1/experts/:expert_id/profile ───────────────────────────────────

async function getExpertProfile(req, res, next) {
  try {
    const { expert_id } = req.params;

    const profileRow = await ExpertProfileModel.findWithUser(expert_id);

    if (!profileRow) {
      return sendError(
        res,
        404,
        'EXPERT_PROFILE_NOT_FOUND',
        'Expert profile not found.'
      );
    }

    const profile = filterExpertProfile(profileRow);

    return res.status(200).json({
      success: true,
      data: { profile },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── PATCH /api/v1/profile/availability ───────────────────────────────────────

async function updateAvailability(req, res, next) {
  try {
    const expertId = req.user.userId;

    const body = validateBody(availabilitySchema, req.body, res);
    if (!body) return null;

    const existing = await ExpertProfileModel.findById(expertId);

    if (!existing) {
      return sendError(
        res,
        404,
        'EXPERT_PROFILE_NOT_FOUND',
        'Expert profile not found. Please contact an administrator.'
      );
    }

    const updated = await ExpertProfileModel.updateAvailability(
      expertId,
      body.availability
    );

    return res.status(200).json({
      success: true,
      message: `Availability updated to '${body.availability}'.`,
      data: {
        expert_id: expertId,
        availability_status: updated.availability_status,
        updated_at: updated.updated_at,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getFeedIncidents,
  getFeedIncidentDetail,
  getExpertProfile,
  updateAvailability,
};