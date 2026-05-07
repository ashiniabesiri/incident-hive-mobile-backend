/**
 * routes/incidentRoutes.js
 * Express router for all /api/incidents/* endpoints.
 *
 * All routes require a valid JWT (requireAuth) and reporter-level access
 * (requireReporter). Ownership of individual incidents is enforced inside
 * each controller handler — a reporter cannot access another reporter's data.
 *
 * Middleware chain per route:
 *   requireAuth → requireReporter → [upload?] → controller
 *
 * File upload routes use the `upload` middleware from middleware/upload.js
 * BEFORE the controller so req.files is populated at handler time.
 * Non-file routes skip `upload` entirely.
 *
 * Mount in server.js:
 *   app.use('/api/incidents', incidentRoutes);
 *   app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
 */

const { Router } = require('express');

const controller = require('../controllers/incidentController');
const { requireAuth }     = require('../middleware/auth');
const { requireReporter } = require('../middleware/rbac');
const { upload }          = require('../middleware/upload');

const router = Router();

// ─── Apply auth + role to the entire router ────────────────────────────────────
// Every /api/incidents route requires a valid JWT and at minimum reporter role.
router.use(requireAuth);
router.use(requireReporter);

// ─── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/incidents
 * Create a new incident with optional file attachments.
 *
 * Accepts multipart/form-data:
 *   - Text fields:  title, description, incident_type, budget, is_anonymous
 *   - File field:   attachments (up to 5 files, 10MB each, JPG/PNG/PDF/TXT)
 *
 * The `upload` middleware must run before the controller so multer can
 * parse the multipart body and populate req.files.
 * Text field validation (Joi) happens inside the controller handler.
 */
router.post(
  '/',
  upload,
  controller.createIncident
);

/**
 * GET /api/incidents
 * List the authenticated reporter's own incidents (paginated).
 *
 * Query params (all optional):
 *   status        — filter: Open | In Progress | Completed | Cancelled
 *   incident_type — filter: Phishing | Ransomware | Data Breach |
 *                           Account Compromise | DDoS | Social Engineering | Other
 *   search        — ILIKE search on incident title
 *   page          — 1-based page number (default: 1)
 *   limit         — results per page, 1–50 (default: 10)
 */
router.get(
  '/',
  controller.listIncidents
);

/**
 * GET /api/incidents/:incident_id
 * Get full details of a single incident including attachments and bid count.
 * Returns 404 if the incident doesn't exist OR belongs to another reporter.
 */
router.get(
  '/:incident_id',
  controller.getIncident
);

/**
 * PUT /api/incidents/:incident_id
 * Update the content of an incident.
 * Only allowed while status = 'Open'.
 *
 * Accepts multipart/form-data so reporters can replace/add attachments
 * while editing. If no files are sent, req.files will be an empty array.
 *
 * Body fields (all optional, at least one required):
 *   title, description, incident_type, budget, is_anonymous
 */
router.put(
  '/:incident_id',
  upload,
  controller.updateIncident
);

/**
 * PATCH /api/incidents/:incident_id/status
 * Change the status of an incident.
 *
 * Body: { status: "In Progress" | "Completed" | "Cancelled" }
 *
 * 'Open' is not a valid target status — reporters cannot revert an incident
 * to Open once it has progressed.
 * Completed and Cancelled incidents cannot be changed further.
 */
router.patch(
  '/:incident_id/status',
  controller.updateStatus
);

/**
 * DELETE /api/incidents/:incident_id
 * Soft-delete an incident (sets deleted_at, forces status → Cancelled).
 * Only allowed while status = 'Open'.
 * Also removes any associated files from storage.
 */
router.delete(
  '/:incident_id',
  controller.deleteIncident
);

module.exports = router;
