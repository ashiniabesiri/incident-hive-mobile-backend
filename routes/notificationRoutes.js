/**
 * routes/notificationRoutes.js
 * Express router for notification retrieval and read-state management.
 *
 * Mounted at /api/notifications in server.js.
 *
 * All routes require authentication. Both reporters and experts receive
 * notifications, so requireReporter (which allows reporter/expert/admin)
 * is used as the role guard — no role-specific restrictions here.
 *
 * ⚠️  Route ordering matters:
 *   PATCH /read-all must be registered BEFORE PATCH /:notification_id/read,
 *   otherwise Express matches "read-all" as a notification_id parameter.
 *
 * Endpoints:
 *   GET   /api/notifications                           — paginated list + unread count
 *   PATCH /api/notifications/read-all                 — mark all unread as read
 *   PATCH /api/notifications/:notification_id/read    — mark one as read
 *
 * Add to server.js:
 *   app.use('/api/notifications', notificationRoutes);
 */

const { Router } = require('express');

const controller              = require('../controllers/notificationController');
const { requireAuth }         = require('../middleware/auth');
const { requireReporter }     = require('../middleware/rbac');

const router = Router();

// Every notification route requires a valid JWT + at least reporter-level access
router.use(requireAuth);
router.use(requireReporter);

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/notifications
 * Retrieve the authenticated user's notifications, newest first.
 * Also returns unread_count for app badge display.
 *
 * Query params (all optional):
 *   unread_only — "true" to return only unread notifications
 *   page        — 1-based page number (default: 1)
 *   limit       — results per page, 1–50 (default: 20)
 */
router.get(
  '/',
  controller.getNotifications
);

/**
 * POST /api/notifications/push-token
 * Register or update an FCM push token for the authenticated user's device.
 * Body: { device_id, fcm_token }
 */
router.post(
  '/push-token',
  controller.registerPushToken
);

/**
 * PATCH /api/notifications/read-all
 * Mark ALL of the user's unread notifications as read in one operation.
 * Typically called when the notification screen is opened.
 * Returns { updated_count: n } — 0 is a valid success response.
 *
 * ⚠️  Must be defined BEFORE /:notification_id/read to prevent Express
 *     from treating "read-all" as a notification_id value.
 */
router.patch(
  '/read-all',
  controller.markAllAsRead
);

/**
 * PATCH /api/notifications/:notification_id/read
 * Mark a single notification as read.
 * Returns 404 if not found or not owned by the calling user.
 */
router.patch(
  '/:notification_id/read',
  controller.markAsRead
);

module.exports = router;
