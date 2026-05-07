/**
 * routes/expertRoutes.js
 * Express router for expert feed, expert profiles, and availability management.
 *
 * Mounted at /api in server.js, giving these final paths:
 *
 *   GET   /api/feed/incidents                — expert incident feed (paginated)
 *   GET   /api/feed/incidents/:incident_id   — feed incident detail + has_bid flag
 *   GET   /api/experts/:expert_id/profile    — public expert profile (any auth user)
 *   PATCH /api/profile/availability          — expert sets their availability
 *
 * Add to server.js:
 *   app.use('/api', expertRoutes);
 *
 * Role matrix:
 *   /feed/*                → Expert only (requireExpert)
 *   /experts/:id/profile   → Any authenticated user (requireReporter covers reporter/expert/admin)
 *   /profile/availability  → Expert only (requireExpert)
 */

const { Router } = require('express');

const controller              = require('../controllers/expertController');
const { requireAuth }         = require('../middleware/auth');
const { requireReporter, requireExpert } = require('../middleware/rbac');

const router = Router();

// All routes in this file require a valid JWT
router.use(requireAuth);

// ─── Expert Feed ───────────────────────────────────────────────────────────────

/**
 * GET /api/feed/incidents
 * Paginated list of open incidents visible to experts.
 * All reporter PII is stripped. Reporter ID is hidden for anonymous incidents.
 *
 * Query params (all optional):
 *   incident_type — filter: Phishing | Ransomware | Data Breach |
 *                           Account Compromise | DDoS | Social Engineering | Other
 *   search        — keyword search on incident title (ILIKE)
 *   ai_ranked     — "true" to rank by relevance to expert's expertise_areas
 *   page          — 1-based page (default: 1)
 *   limit         — results per page, 1–50 (default: 10)
 *
 * When ai_ranked=true, the response includes a `relevance_score` per incident
 * and a `meta.expertiseAreas` field showing which areas were used for ranking.
 */
router.get(
  '/feed/incidents',
  requireExpert,
  controller.getFeedIncidents
);

/**
 * GET /api/feed/incidents/:incident_id
 * Full detail of a single open incident.
 * Only returns incidents that are Open and within the bid window.
 * Adds has_bid (boolean) and bid_id / bid_status for the calling expert.
 * Full description (not truncated). Same PII rules as the list endpoint.
 */
router.get(
  '/feed/incidents/:incident_id',
  requireExpert,
  controller.getFeedIncidentDetail
);

// ─── Expert Profiles (public) ─────────────────────────────────────────────────

/**
 * GET /api/experts/:expert_id/profile
 * Publicly readable expert profile for any authenticated user.
 * Reporters use this to research experts before accepting their bids.
 *
 * Returns:
 *   expert_id, first_name, last_name, profile_picture_url (null until added),
 *   expertise_areas, credentials, availability_status, completed_engagements,
 *   total_earned, profile_created_at
 *
 * Never returns: email, phone_number (N016 — only revealed after bid acceptance)
 */
router.get(
  '/experts/:expert_id/profile',
  requireReporter,   // requireReporter allows reporter, expert, and admin
  controller.getExpertProfile
);

// ─── Own Profile Management ───────────────────────────────────────────────────

/**
 * PATCH /api/profile/availability
 * Expert toggles their own availability status.
 * Setting to 'Unavailable' is a signal to reporters browsing experts
 * but does NOT prevent experts from placing new bids.
 *
 * Body: { availability: "Available" | "Unavailable" }
 */
router.patch(
  '/profile/availability',
  requireExpert,
  controller.updateAvailability
);

module.exports = router;
