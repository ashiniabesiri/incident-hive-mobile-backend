/**
 * routes/expertRoutes.js
 * Express router for expert feed, expert profiles, and availability management.
 *
 * Mounted at /api/v1 in server.js, giving these final paths:
 *
 *   GET   /api/v1/feed/incidents                — expert incident feed (paginated)
 *   GET   /api/v1/feed/incidents/:incident_id   — feed incident detail + has_bid flag
 *   GET   /api/v1/experts/:expert_id/profile    — public expert profile (any auth user)
 *   PATCH /api/v1/profile/availability          — expert sets their availability
 *
 * Role matrix:
 *   /feed/*                → Expert only (requireExpert)
 *   /experts/:id/profile   → Any authenticated user (no role gate)
 *   /profile/availability  → Expert only (requireExpert)
 */

const { Router } = require('express');

const controller = require('../controllers/expertController');
const { requireAuth } = require('../middleware/auth');
const { requireExpert } = require('../middleware/rbac');

const router = Router();

// All routes in this file require a valid JWT
router.use(requireAuth);

// ─── Expert Feed ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/feed/incidents
 * Paginated list of open incidents visible to experts.
 * All reporter PII is stripped. Reporter ID is hidden for anonymous incidents.
 */
router.get(
  '/feed/incidents',
  requireExpert,
  controller.getFeedIncidents
);

/**
 * GET /api/v1/feed/incidents/:incident_id
 * Full detail of a single open incident.
 */
router.get(
  '/feed/incidents/:incident_id',
  requireExpert,
  controller.getFeedIncidentDetail
);

// ─── Expert Profiles (publicly readable to any authenticated user) ────────────

/**
 * GET /api/v1/experts/:expert_id/profile
 * Publicly readable expert profile for any authenticated user.
 * Reporters use this to research experts before accepting their bids.
 *
 * Never returns: email, phone_number (N016 — only revealed after bid acceptance).
 */
router.get(
  '/experts/:expert_id/profile',
  controller.getExpertProfile
);

// ─── Own Profile Management ───────────────────────────────────────────────────

/**
 * PATCH /api/v1/profile/availability
 * Expert toggles their own availability status.
 * Body: { availability: "Available" | "Unavailable" }
 */
router.patch(
  '/profile/availability',
  requireExpert,
  controller.updateAvailability
);

module.exports = router;
