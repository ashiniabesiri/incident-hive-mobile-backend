
const Joi = require('joi');

const ExpertProfileModel = require('../models/ExpertProfile');
const UserModel = require('../models/User');
const BidModel = require('../models/Bid');
const { query } = require('../config/database');

// Postgres, which would otherwise throw `22P02 invalid_text_representation`
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

// Helpers

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

// GET /api/v1/feed/incidents

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

    let expertiseAreas = [];
    let relevanceExpr = '0';

    // TODO: when a real recommendation model is available, replace the
    if (aiRanked) {
      expertiseAreas = await getExpertAreas(expertId);

      if (expertiseAreas.length === 0) {
        conditions.push('FALSE');
      } else {
        filterParams.push(expertiseAreas);
        const areasIdx = filterParams.length;
        const areasParam = `$${areasIdx}`;

        conditions.push(`(
          i.incident_type = ANY(${areasParam}::text[])
          OR EXISTS (
            SELECT 1 FROM unnest(${areasParam}::text[]) AS area
            WHERE i.title ILIKE '%' || area || '%'
               OR i.description ILIKE '%' || area || '%'
          )
        )`);

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

    const whereClause = conditions.join(' AND ');

    const dataParams = [...filterParams];

    dataParams.push(expertId);
    const expertParam = `$${dataParams.length}`;

    const hasBidExpr = `EXISTS (
      SELECT 1 FROM bids b2
      WHERE b2.incident_id = i.incident_id
        AND b2.expert_id = ${expertParam}
    )`;

    const innerOrder = aiRanked
      ? 'relevance_score DESC, i.created_at DESC'
      : 'i.created_at DESC';
    const orderClause = `ORDER BY (${hasBidExpr}) ASC, ${innerOrder}`;

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
        ) AS bid_count,
        ${hasBidExpr} AS has_bid
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

// GET /api/v1/feed/incidents/:incident_id

async function getFeedIncidentDetail(req, res, next) {
  try {
    const { incident_id } = req.params;
    const expertId = req.user.userId;

    // moves to In Progress / Completed — otherwise the active-engagement
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
         AND i.deleted_at IS NULL
         AND (
           (i.status = 'Open' AND i.bid_window_ends_at > NOW())
           OR EXISTS (
             SELECT 1 FROM bids b
             WHERE b.incident_id = i.incident_id
               AND b.expert_id = $2
           )
         )`,
      [incident_id, expertId]
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

// GET /api/v1/experts/:expert_id/profile

async function getExpertProfile(req, res, next) {
  try {
    const { expert_id } = req.params;

    if (!UUID_REGEX.test(expert_id)) {
      return sendError(
        res,
        400,
        'INVALID_EXPERT_ID',
        'Invalid expert id.'
      );
    }

    let profileRow = await ExpertProfileModel.findWithUser(expert_id);

    // would otherwise see a 404 from "View Profile" on every fresh expert.
    if (!profileRow) {
      const user = await UserModel.findById(expert_id);
      if (user && user.role === 'expert' && user.account_status !== 'deleted') {
        profileRow = {
          user_id: user.user_id,
          first_name: user.first_name,
          last_name: user.last_name,
          profile_picture_url: user.profile_picture_url || null,
          bio: null,
          expertise_areas: [],
          credentials: null,
          availability_status: null,
          completed_engagements: 0,
          total_earned: 0,
          profile_created_at: user.created_at,
        };
      }
    }

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

// PATCH /api/v1/profile/availability

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

// GET /api/v1/experts/me/bids

async function getMyBidHistory(req, res, next) {
  try {
    const expertId = req.user.userId;

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const rows = await BidModel.findByUser(expertId, { limit, offset });

    return res.status(200).json({
      success: true,
      data: { bids: rows },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getFeedIncidents,
  getFeedIncidentDetail,
  getMyBidHistory,
  getExpertProfile,
  updateAvailability,
};