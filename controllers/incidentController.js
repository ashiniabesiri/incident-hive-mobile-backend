/**
 * controllers/incidentController.js
 * Handler functions for all /api/incidents/* endpoints.
 *
 * Ownership rule enforced throughout:
 *   A reporter can only read/modify their OWN incidents.
 *   Any attempt to access another reporter's incident returns 404 (not 403),
 *   so the existence of the resource is not revealed to unauthorised callers.
 *
 * File upload flow:
 *   1. multer (middleware/upload.js) parses multipart, validates type/size, populates req.files
 *   2. fileUploadService.uploadFiles() persists buffers to local disk or S3
 *   3. AttachmentModel.createBulk() records the metadata in PostgreSQL
 *   If any step fails after files are written, uploaded files are cleaned up.
 */

const Joi = require('joi');

const IncidentModel    = require('../models/Incident');
const AttachmentModel  = require('../models/Attachment');
const BidModel         = require('../models/Bid');
const { uploadFiles, deleteFiles } = require('../services/fileUploadService');
const { query }        = require('../config/database');
const logger           = require('../utils/logger');

// ─── Case-normalisation helpers ─────────────────────────────────────────────────

const STATUS_MAP = Object.fromEntries(
  IncidentModel.VALID_STATUSES.map((s) => [s.toLowerCase(), s])
);
const TYPE_MAP = Object.fromEntries(
  IncidentModel.VALID_TYPES.map((t) => [t.toLowerCase(), t])
);

function normaliseStatus(val) { return STATUS_MAP[val.toLowerCase()] || val; }
function normaliseType(val)   { return TYPE_MAP[val.toLowerCase()] || val; }

// ─── Validation schemas (incident-specific) ────────────────────────────────────

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * validateBody
 * Runs a Joi schema against req.body and returns a 400 if validation fails.
 * Returns the sanitised value on success.
 */
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

/**
 * assertOwnership
 * Fetches the incident and checks it belongs to the requesting reporter.
 * Returns null (and sends 404) if not found or not owned.
 */
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

// ─── POST /api/incidents ───────────────────────────────────────────────────────

/**
 * createIncident
 * Creates a new incident and optionally attaches up to 5 uploaded files.
 *
 * Steps:
 *   1. Validate text fields
 *   2. Create the incident row (status = 'Open', bid_window = +7 days)
 *   3. If files present: upload them, then record attachment metadata
 *   4. Return the full incident + attachments
 *
 * On partial failure (incident created, file upload fails):
 *   The incident row is NOT rolled back — the reporter can re-upload files
 *   later. Uploaded files that made it before the failure ARE cleaned up.
 */
async function createIncident(req, res, next) {
  try {
    // ── 1. Validate text body ──────────────────────────────────────────────
    const body = validateBody(createIncidentSchema, req.body, res);
    if (!body) return;

    const { title, description, incident_type, budget, currency, is_anonymous } = body;
    const reporterId = req.user.userId;

    // ── 2. Create incident row ─────────────────────────────────────────────
    const incident = await IncidentModel.create({
      reporterId,
      incidentType: incident_type,
      title,
      description,
      budget,
      currency,
      isAnonymous: is_anonymous,
    });

    // ── 3. Handle file attachments ─────────────────────────────────────────
    let attachments = [];

    if (req.files && req.files.length > 0) {
      let uploadedMeta = [];

      try {
        // Upload all files concurrently (local disk or S3)
        uploadedMeta = await uploadFiles(req.files);

        // Record metadata in the attachments table
        attachments = await AttachmentModel.createBulk(
          incident.incident_id,
          uploadedMeta
        );
      } catch (uploadErr) {
        // Clean up any files that were written before the failure
        await deleteFiles(uploadedMeta.map((f) => f.fileUrl));
        logger.error('Attachment upload failed after incident creation:', uploadErr);
        // Return success for the incident itself but surface the file error
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

// ─── GET /api/incidents ────────────────────────────────────────────────────────

/**
 * listIncidents
 * Returns a paginated list of the authenticated reporter's incidents.
 * Each row includes a live bid_count subquery.
 *
 * Query params:
 *   status        — filter by incident status
 *   incident_type — filter by type
 *   search        — ILIKE search on title
 *   page          — 1-based page number (default 1)
 *   limit         — results per page (default 10, max 50)
 */
async function listIncidents(req, res, next) {
  try {
    const reporterId = req.user.userId;

    // ── Parse + sanitise query params ─────────────────────────────────────
    const { search } = req.query;
    const status        = req.query.status        ? normaliseStatus(req.query.status)        : undefined;
    const incident_type = req.query.incident_type ? normaliseType(req.query.incident_type)   : undefined;
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '10', 10)));
    const offset = (page - 1) * limit;

    const VALID_SORT_FIELDS = ['created_at', 'updated_at', 'budget', 'status'];
    const sortBy    = VALID_SORT_FIELDS.includes(req.query.sort_by) ? req.query.sort_by : 'created_at';
    const sortOrder = req.query.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Validate enum values if provided (after normalisation)
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

    // ── Build dynamic WHERE clause ─────────────────────────────────────────
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

    // ── Fetch paginated data + total count in one round-trip ───────────────
    // bid_count is a correlated subquery — no N+1 problem.
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

    // Run data + count queries in parallel
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

// ─── GET /api/incidents/:incident_id ──────────────────────────────────────────

/**
 * getIncident
 * Returns a single incident with its attachments and bid summary.
 * 404 is returned for any incident not owned by the requesting reporter
 * (ownership is enforced, not just authentication).
 */
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

// ─── PUT /api/incidents/:incident_id ──────────────────────────────────────────

/**
 * updateIncident
 * Edit the content of an incident.
 * Only allowed while status = 'Open' — once bids have been accepted or
 * the incident is completed, the record becomes immutable.
 */
async function updateIncident(req, res, next) {
  try {
    const { incident_id } = req.params;
    const reporterId      = req.user.userId;

    // ── Ownership check ────────────────────────────────────────────────────
    const incident = await assertOwnership(incident_id, reporterId, res);
    if (!incident) return;

    // ── Status guard ───────────────────────────────────────────────────────
    if (incident.status !== 'Open') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'INCIDENT_NOT_EDITABLE',
          message: `Incident cannot be edited because its status is '${incident.status}'. Only 'Open' incidents can be updated.`,
        },
      });
    }

    // ── Validate body ──────────────────────────────────────────────────────
    const body = validateBody(updateIncidentSchema, req.body, res);
    if (!body) return;

    // Map camelCase API fields to the model's camelCase keys
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

// ─── PATCH /api/incidents/:incident_id/status ─────────────────────────────────

/**
 * updateStatus
 * Change the status of an incident.
 *
 * Allowed transitions (reporter-initiated):
 *   Open         → In Progress  (shouldn't normally happen without an accepted bid,
 *                                but supported per API spec)
 *   Open         → Cancelled
 *   In Progress  → Completed
 *   In Progress  → Cancelled
 *
 * 'Open' is excluded from the request body because a reporter
 * cannot move an incident back to Open once it has moved forward.
 */
async function updateStatus(req, res, next) {
  try {
    const { incident_id } = req.params;
    const reporterId      = req.user.userId;

    // ── Ownership check ────────────────────────────────────────────────────
    const incident = await assertOwnership(incident_id, reporterId, res);
    if (!incident) return;

    // ── Validate body ──────────────────────────────────────────────────────
    const body = validateBody(updateStatusSchema, req.body, res);
    if (!body) return;

    const { status } = body;

    // ── Guard: cannot change status of a completed or cancelled incident ───
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

// ─── DELETE /api/incidents/:incident_id ───────────────────────────────────────

/**
 * deleteIncident
 * Soft-deletes an incident (sets deleted_at, forces status to Cancelled).
 * Only allowed while status = 'Open' — prevents deleting active engagements.
 *
 * Also cleans up attached files from storage (local or S3) so no orphaned
 * blobs are left behind.
 */
async function deleteIncident(req, res, next) {
  try {
    const { incident_id } = req.params;
    const reporterId      = req.user.userId;

    // ── Ownership check ────────────────────────────────────────────────────
    const incident = await assertOwnership(incident_id, reporterId, res);
    if (!incident) return;

    // ── Status guard ───────────────────────────────────────────────────────
    if (incident.status !== 'Open') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'INCIDENT_NOT_DELETABLE',
          message: `Only 'Open' incidents can be deleted. Current status: '${incident.status}'.`,
        },
      });
    }

    // ── Fetch attachments before deleting (need URLs for storage cleanup) ──
    const attachments = await AttachmentModel.findByIncident(incident_id);

    // ── Soft-delete the incident (cascades on DB level) ────────────────────
    await IncidentModel.softDelete(incident_id);

    // ── Clean up stored files (fire-and-forget — don't block the response) ─
    if (attachments.length > 0) {
      deleteFiles(attachments.map((a) => a.file_url)).catch((err) =>
        logger.error('Failed to clean up attachment files on incident delete:', err)
      );
    }

    res.status(200).json({
      success: true,
      message: 'Incident deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createIncident,
  listIncidents,
  getIncident,
  updateIncident,
  updateStatus,
  deleteIncident,
};
