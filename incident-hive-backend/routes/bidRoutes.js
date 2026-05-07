/**
 * routes/bidRoutes.js
 * Express router for all bid and engagement completion endpoints.
 *
 * Mounted at /api/incidents in server.js alongside incidentRoutes.js.
 * The two routers share the same base path without conflicting because
 * incidentRoutes handles /:incident_id CRUD while bidRoutes handles
 * /:incident_id/bids/* and /:incident_id/complete.
 *
 * Mount in server.js:
 *   app.use('/api/incidents', bidRoutes);
 *
 * Role matrix:
 *   GET    /:incident_id/bids                        Reporter
 *   POST   /:incident_id/bids                        Expert
 *   POST   /:incident_id/bids/:bid_id/accept         Reporter + MFA step-up
 *   POST   /:incident_id/bids/:bid_id/decline        Reporter
 *   POST   /:incident_id/complete                    Expert
 */

const { Router } = require('express');

const controller              = require('../controllers/bidController');
const { requireAuth }         = require('../middleware/auth');
const { requireReporter, requireExpert } = require('../middleware/rbac');
const { requireMfaStepUp }    = require('../middleware/mfaStepUp');

const router = Router();

// All bid routes require authentication
router.use(requireAuth);

// ─── Reporter routes ───────────────────────────────────────────────────────────

/**
 * GET /api/incidents/:incident_id/bids
 * List all bids on the reporter's incident.
 * Expert PII (email, phone) is stripped from every response row.
 *
 * Query params:
 *   page  — 1-based page number (default: 1)
 *   limit — results per page, 1–50 (default: 20)
 */
router.get(
  '/:incident_id/bids',
  requireReporter,
  controller.listBids
);

/**
 * POST /api/incidents/:incident_id/bids/:bid_id/accept
 * Accept a specific bid on the reporter's incident.
 *
 * MFA step-up required — the caller's JWT must contain amr: ['pwd','mfa'].
 * If MFA was not used in the current session, a 403 with code
 * MFA_STEP_UP_REQUIRED is returned. The client must re-authenticate via
 * POST /api/auth/mfa/login and retry with the new token.
 *
 * Side effects:
 *   - accepted bid → 'Accepted'
 *   - all other Pending bids on this incident → 'Declined' (in one transaction)
 *   - incident.status → 'In Progress'
 *   - expert PII revealed in response
 *   - notifications sent to accepted expert + all auto-declined experts
 */
router.post(
  '/:incident_id/bids/:bid_id/accept',
  requireReporter,
  requireMfaStepUp,
  controller.acceptBid
);

/**
 * POST /api/incidents/:incident_id/bids/:bid_id/decline
 * Explicitly decline a single Pending bid.
 * The incident stays Open; remaining Pending bids are unaffected.
 * A BID_DECLINED notification is sent to the expert.
 */
router.post(
  '/:incident_id/bids/:bid_id/decline',
  requireReporter,
  controller.declineBid
);

// ─── Expert routes ─────────────────────────────────────────────────────────────

/**
 * POST /api/incidents/:incident_id/bids
 * Submit a new bid on an Open incident.
 *
 * Guards (evaluated in the controller):
 *   - incident.status must be 'Open'
 *   - bid_window_ends_at must not have elapsed
 *   - expert must not have an existing bid on this incident
 *
 * Body: { proposed_approach, estimated_hours, proposed_fee }
 * A NEW_BID notification is sent to the incident's reporter.
 */
router.post(
  '/:incident_id/bids',
  requireExpert,
  controller.placeBid
);

/**
 * POST /api/incidents/:incident_id/complete
 * Expert marks their engagement as complete.
 *
 * The caller must be the expert with the Accepted bid on this incident.
 * Any other expert (or a reporter) calling this endpoint receives 403.
 *
 * Side effects:
 *   - incident.status → 'Completed'
 *   - expert_profiles.completed_engagements += 1
 *   - expert_profiles.total_earned += accepted bid's proposed_fee
 *   - INCIDENT_UPDATE notification sent to the reporter
 */
router.post(
  '/:incident_id/complete',
  requireExpert,
  controller.completeEngagement
);

module.exports = router;
