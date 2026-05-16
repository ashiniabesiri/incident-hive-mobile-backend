
const { Router } = require('express');

const controller = require('../controllers/incidentController');
const { requireAuth }     = require('../middleware/auth');
const { requireReporterOnly } = require('../middleware/rbac');
const { upload }          = require('../middleware/upload');

const router = Router();

router.use(requireAuth);
router.use(requireReporterOnly);

// Routes

router.post(
  '/',
  upload,
  controller.createIncident
);

router.get(
  '/',
  controller.listIncidents
);

router.get(
  '/:incident_id',
  controller.getIncident
);

router.put(
  '/:incident_id',
  upload,
  controller.updateIncident
);

router.patch(
  '/:incident_id/status',
  controller.updateStatus
);

router.delete(
  '/:incident_id',
  controller.deleteIncident
);

router.post(
  '/:incident_id/review',
  controller.submitReview
);

module.exports = router;
