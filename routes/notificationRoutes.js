
const { Router } = require('express');

const controller              = require('../controllers/notificationController');
const { requireAuth }         = require('../middleware/auth');
const { requireReporter }     = require('../middleware/rbac');

const router = Router();

router.use(requireAuth);
router.use(requireReporter);

// Routes

router.get(
  '/',
  controller.getNotifications
);

router.post(
  '/push-token',
  controller.registerPushToken
);

router.patch(
  '/read-all',
  controller.markAllAsRead
);

router.patch(
  '/:notification_id/read',
  controller.markAsRead
);

module.exports = router;
