
const { Router } = require('express');

const controller              = require('../controllers/bidController');
const { requireAuth }         = require('../middleware/auth');
const { requireReporter, requireExpert } = require('../middleware/rbac');

const router = Router();

// All bid routes require authentication
router.use(requireAuth);

// Reporter routes

router.get(
  '/:incident_id/bids',
  requireReporter,
  controller.listBids
);

router.post(
  '/:incident_id/bids/:bid_id/accept',
  requireReporter,
  controller.acceptBid
);

router.post(
  '/:incident_id/bids/:bid_id/decline',
  requireReporter,
  controller.declineBid
);

// Expert routes

router.post(
  '/:incident_id/bids',
  requireExpert,
  controller.placeBid
);

router.post(
  '/:incident_id/complete',
  requireExpert,
  controller.completeEngagement
);

module.exports = router;
