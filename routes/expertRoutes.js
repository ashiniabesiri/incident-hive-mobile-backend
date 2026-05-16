
const { Router } = require('express');

const controller              = require('../controllers/expertController');
const { requireAuth }         = require('../middleware/auth');
const { requireReporter, requireExpert } = require('../middleware/rbac');

const router = Router();

router.use(requireAuth);

// Expert Feed

router.get(
  '/feed/incidents',
  requireExpert,
  controller.getFeedIncidents
);

router.get(
  '/feed/incidents/:incident_id',
  requireExpert,
  controller.getFeedIncidentDetail
);

// Expert Profiles (public)

router.get(
  '/experts/:expert_id/profile',
  requireReporter,   // requireReporter allows reporter, expert, and admin
  controller.getExpertProfile
);

// Own Profile Management

router.patch(
  '/profile/availability',
  requireExpert,
  controller.updateAvailability
);

router.get(
  '/experts/me/bids',
  requireExpert,
  controller.getMyBidHistory
);

module.exports = router;
