
const Joi = require('joi');

const IncidentModel    = require('../models/Incident');
const AttachmentModel  = require('../models/Attachment');
const BidModel         = require('../models/Bid');
const IncidentReviewModel = require('../models/IncidentReview');
const { uploadFiles, deleteFiles } = require('../services/fileUploadService');
const { query }        = require('../config/database');
const logger           = require('../utils/logger');

// Case-normalisation helpers

const STATUS_MAP = Object.fromEntries(
  IncidentModel.VALID_STATUSES.map((s) => [s.toLowerCase(), s])
);
const TYPE_MAP = Object.fromEntries(
  IncidentModel.VALID_TYPES.map((t) => [t.toLowerCase(), t])
);

function normaliseStatus(val) { return STATUS_MAP[val.toLowerCase()] || val; }
function normaliseType(val)   { return TYPE_MAP[val.toLowerCase()] || val; }

// Validation schemas (incident-specific)

const createIncidentSchema = Joi.object({
  title:         Joi.string().min(3).max(150).trim().required().messages({
    'string.min':   'Title must be at least 3 characters.',
    'string.max':   'Title must not exceed 150 characters.',
    'any.required': 'Title is required.',
  }),
  description:   Joi.string().min(10).max(5000).trim().required().messages({
    'string.min':   'Description must be at least 10 characters.',
    'string.max':   'Description must not exceed 5000 characters.',
    'any.required': 'Description is required.',
  }),
  incident_type: Joi.string()
    .custom((val) => normaliseType(val))
    .valid(...IncidentModel.VALID_TYPES)
    .required()
    .messages({
      'any.only':    `incident_type must be one of: ${IncidentModel.VALID_TYPES.join(', ')}.`,
      'any.required': 'incident_type is required.',
    }),
  budget:        Joi.number().precision(2).min(0).optional().allow(null),
  currency:      Joi.string().valid('LKR', 'USD', 'EUR', 'GBP').default('LKR'),
  is_anonymous:  Joi.boolean().default(false),
});

const updateIncidentSchema = Joi.object({
  title:         Joi.string().min(3).max(150).trim(),
  description:   Joi.string().min(10).max(5000).trim(),
  incident_type: Joi.string().custom((val) => normaliseType(val)).valid(...IncidentModel.VALID_TYPES),
  budget:        Joi.number().precision(2).min(0).allow(null),
  currency:      Joi.string().valid('LKR', 'USD', 'EUR', 'GBP'),
  is_anonymous:  Joi.boolean(),
}).min(1).messages({
  'object.min': 'At least one field must be provided to update.',
});

const updateStatusSchema = Joi.object({
  status: Joi.string()
    .custom((val) => normaliseStatus(val))
    .valid('In Progress', 'Completed', 'Cancelled')
    .required()
    .messages({
      'any.only':    'Status must be one of: In Progress, Completed, Cancelled.',
      'any.required': 'Status is required.',
    }),
});

// Helpers

function validateBody(schema, body, res) {
  const { error, value } = schema.validate(body, {
    abortEarly:   false,
    stripUnknown: true,
  });
  if (error) {
    res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed.',
        details: error.details.map((d) => d.message.replace(/['"]/g, '')),
      },
    });
    return null;
  }
  return value;
}

async function assertOwnership(incidentId, reporterId, res) {
  const incident = await IncidentModel.findById(incidentId);
  if (!incident || incident.reporter_id !== reporterId) {
    res.status(404).json({
      success: false,
      error: {
        code: 'INCIDENT_NOT_FOUND',
        message: 'Incident not found.',
      },
    });
    return null;
  }
  return incident;
}

// POST /api/incidents

async function createIncident(req, res, next) {
  try {
    const body = validateBody(createIncidentSchema, req.body, res);
    if (!body) return;

    const { title, description, incident_type, budget, currency, is_anonymous } = body;
    const reporterId = req.user.userId;

    const incident = await IncidentModel.create({
      reporterId,
      incidentType: incident_type,
      title,
      description,
      budget,
      currency,
      isAnonymous: is_anonymous,
    });

    let attachments = [];

    if (req.files && req.files.length > 0) {
      let uploadedMeta = [];

      try {
        uploadedMeta = await uploadFiles(req.files);

        // Record metadata in the attachments table
        attachments = await AttachmentModel.createBulk(
          incident.incident_id,
          uploadedMeta
        );
      } catch (uploadErr) {
        await deleteFiles(uploadedMeta.map((f) => f.fileUrl));
        logger.error('Attachment upload failed after incident creation:', uploadErr);
        return res.status(201).json({
          success: true,
          message: 'Incident created, but file upload failed. You can add files later.',
          data: { incident, attachments: [] },
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Incident reported successfully.',
      data: { incident, attachments },
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/incidents

async function listIncidents(req, res, next) {
  try {
    const reporterId = req.user.userId;

    // Parse + sanitise query params
    const { search } = req.query;
    const status        = req.query.status        ? normaliseStatus(req.query.status)        : undefined;
    const incident_type = req.query.incident_type ? normaliseType(req.query.incident_type)   : undefined;
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '10', 10)));
    const offset = (page - 1) * limit;

    const VALID_SORT_FIELDS = ['created_at', 'updated_at', 'budget', 'status'];
    const sortBy    = VALID_SORT_FIELDS.includes(req.query.sort_by) ? req.query.sort_by : 'created_at';
    const sortOrder = req.query.sort_order === 'asc' ? 'ASC' : 'DESC';

    if (status && !IncidentModel.VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Invalid status. Must be one of: ${IncidentModel.VALID_STATUSES.join(', ')}.`,
        },
      });
    }
    if (incident_type && !IncidentModel.VALID_TYPES.includes(incident_type)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INCIDENT_TYPE',
          message: `Invalid incident_type. Must be one of: ${IncidentModel.VALID_TYPES.join(', ')}.`,
        },
      });
    }

    // Build dynamic WHERE clause
    const conditions = ['i.reporter_id = $1', 'i.deleted_at IS NULL'];
    const params     = [reporterId];

    if (status) {
      params.push(status);
      conditions.push(`i.status = $${params.length}`);
    }
    if (incident_type) {
      params.push(incident_type);
      conditions.push(`i.incident_type = $${params.length}`);
    }
    if (search) {
      params.push(`%${search.trim()}%`);
      conditions.push(`i.title ILIKE $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    params.push(limit, offset);

    const dataQuery = `
      SELECT
        i.*,
        (
          SELECT COUNT(*)::int
          FROM bids b
          WHERE b.incident_id = i.incident_id
        ) AS bid_count
      FROM incidents i
      WHERE ${whereClause}
      ORDER BY i.${sortBy} ${sortOrder}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const countParams = params.slice(0, params.length - 2); // exclude limit/offset
    const countQuery  = `
      SELECT COUNT(*)::int AS total
      FROM incidents i
      WHERE ${whereClause}
    `;

    const [dataResult, countResult] = await Promise.all([
      query(dataQuery, params),
      query(countQuery, countParams),
    ]);

    const incidents  = dataResult.rows;
    const total      = countResult.rows[0].total;
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        incidents,
        pagination: {
          total,
          page,
          limit,
          sort_by: sortBy,
          sort_order: sortOrder.toLowerCase(),
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

// GET /api/incidents/:incident_id

async function getIncident(req, res, next) {
  try {
    const { incident_id } = req.params;
    const reporterId      = req.user.userId;

    const incident = await assertOwnership(incident_id, reporterId, res);
    if (!incident) return;

    const [attachments, bids] = await Promise.all([
      AttachmentModel.findByIncident(incident_id),
      BidModel.findByIncident(incident_id),
    ]);

    res.status(200).json({
      success: true,
      data: {
        incident: {
          ...incident,
          bid_count: bids.length,
          bids,
        },
        attachments,
      },
    });
  } catch (error) {
    next(error);
  }
}

// PUT /api/incidents/:incident_id

async function updateIncident(req, res, next) {
  try {
    const { incident_id } = req.params;
    const reporterId      = req.user.userId;

    // Ownership check
    const incident = await assertOwnership(incident_id, reporterId, res);
    if (!incident) return;

    // Status guard
    if (incident.status !== 'Open') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'INCIDENT_NOT_EDITABLE',
          message: `Incident cannot be edited because its status is '${incident.status}'. Only 'Open' incidents can be updated.`,
        },
      });
    }

    // Validate body
    const body = validateBody(updateIncidentSchema, req.body, res);
    if (!body) return;

    const updated = await IncidentModel.update(incident_id, {
      title:        body.title,
      description:  body.description,
      incidentType: body.incident_type,
      budget:       body.budget,
      currency:     body.currency,
      isAnonymous:  body.is_anonymous,
    });

    res.status(200).json({
      success: true,
      message: 'Incident updated successfully.',
      data:    { incident: updated },
    });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/incidents/:incident_id/status

async function updateStatus(req, res, next) {
  try {
    const { incident_id } = req.params;
    const reporterId      = req.user.userId;

    // Ownership check
    const incident = await assertOwnership(incident_id, reporterId, res);
    if (!incident) return;

    // Validate body
    const body = validateBody(updateStatusSchema, req.body, res);
    if (!body) return;

    const { status } = body;

    if (['Completed', 'Cancelled'].includes(incident.status)) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'STATUS_CHANGE_FORBIDDEN',
          message: `Cannot change the status of an incident that is already '${incident.status}'.`,
        },
      });
    }

    const updated = await IncidentModel.updateStatus(incident_id, status);

    res.status(200).json({
      success: true,
      message: `Incident status updated to '${status}'.`,
      data:    { incident: updated },
    });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/incidents/:incident_id

async function deleteIncident(req, res, next) {
  try {
    const { incident_id } = req.params;
    const reporterId      = req.user.userId;

    // Ownership check
    const incident = await assertOwnership(incident_id, reporterId, res);
    if (!incident) return;

    // Status guard
    if (incident.status !== 'Open') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'INCIDENT_NOT_DELETABLE',
          message: `Only 'Open' incidents can be deleted. Current status: '${incident.status}'.`,
        },
      });
    }

    // Accepted-bid guard
    if (await BidModel.hasAcceptedBid(incident_id)) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'HAS_ACCEPTED_BID',
          message: 'Cannot delete an incident that has an accepted bid.',
        },
      });
    }

    const attachments = await AttachmentModel.findByIncident(incident_id);

    await IncidentModel.softDelete(incident_id);

    if (attachments.length > 0) {
      deleteFiles(attachments.map((a) => a.file_url)).catch((err) =>
        logger.error('Failed to clean up attachment files on incident delete:', err)
      );
    }

    res.status(200).json({
      success: true,
      message: 'Incident deleted successfully.',
      data:    { message: 'Incident deleted successfully.' },
    });
  } catch (error) {
    next(error);
  }
}

// POST /api/incidents/:incident_id/review

const submitReviewSchema = Joi.object({
  rating:  Joi.number().integer().min(1).max(5).required().messages({
    'any.required':   'Rating is required.',
    'number.base':    'Rating must be a number between 1 and 5.',
    'number.min':     'Rating must be between 1 and 5.',
    'number.max':     'Rating must be between 1 and 5.',
    'number.integer': 'Rating must be an integer between 1 and 5.',
  }),
  comment: Joi.string().trim().max(2000).allow('', null).messages({
    'string.max': 'Comment must not exceed 2000 characters.',
  }),
});

async function submitReview(req, res, next) {
  try {
    const { incident_id } = req.params;
    const reporterId = req.user.userId;

    const body = validateBody(submitReviewSchema, req.body, res);
    if (!body) return;

    const incident = await assertOwnership(incident_id, reporterId, res);
    if (!incident) return;

    if (incident.status !== 'Completed') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'INCIDENT_NOT_COMPLETED',
          message: `You can only review a Completed incident. Current status: '${incident.status}'.`,
        },
      });
    }

    // Identify the expert from the accepted bid. There is exactly one because
    const acceptedBidRows = await query(
      `SELECT expert_id FROM bids
        WHERE incident_id = $1 AND status = 'Accepted'
        LIMIT 1`,
      [incident_id]
    );
    const acceptedBid = acceptedBidRows.rows[0];
    if (!acceptedBid) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'NO_ACCEPTED_BID',
          message: 'Cannot review an incident that has no accepted bid.',
        },
      });
    }

    const existing = await IncidentReviewModel.findByIncidentId(incident_id);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_REVIEW',
          message: 'You have already submitted a review for this incident.',
        },
      });
    }

    const review = await IncidentReviewModel.create({
      incidentId: incident_id,
      reporterId,
      expertId:   acceptedBid.expert_id,
      rating:     body.rating,
      comment:    body.comment,
    });

    return res.status(201).json({
      success: true,
      message: 'Review submitted successfully.',
      data:    { review },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createIncident,
  listIncidents,
  getIncident,
  updateIncident,
  updateStatus,
  deleteIncident,
  submitReview,
};
