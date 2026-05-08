/**
 * routes/notificationRoutes.js
 * Express router for notification retrieval and read-state management.
 *
 * Mounted at /api/v1/notifications in server.js.
 *
 * All routes require authentication. Both reporters and experts receive
 * notifications, so no role-specific guard is applied — requireAuth alone
 * is sufficient.
 *
 * Route ordering matters:
 * PATCH /read-all must be registered BEFORE PATCH /:notification_id/read,
 * otherwise Express matches "read-all" as a notification_id parameter.
 *
 * Endpoints:
 *   GET   /api/v1/notifications                           — paginated list + unread count
 *   PATCH /api/v1/notifications/read-all                  — mark all unread as read
 *   PATCH /api/v1/notifications/:notification_id/read     — mark one as read
 */

const { Router } = require('express');

const controller = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// Every notification route requires a valid JWT — any authenticated user.
router.use(requireAuth);

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/notifications
 * Retrieve the authenticated user's notifications, newest first.
 */
router.get('/', controller.getNotifications);

/**
 * PATCH /api/v1/notifications/read-all
 * Mark ALL of the user's unread notifications as read in one operation.
 *
 * Must be defined BEFORE /:notification_id/read to prevent Express
 *     from treating "read-all" as a notification_id value.
 */
router.patch('/read-all', controller.markAllAsRead);

/**
 * PATCH /api/v1/notifications/:notification_id/read
 * Mark a single notification as read.
 * Returns 404 if not found or not owned by the calling user.
 */
router.patch('/:notification_id/read', controller.markAsRead);

module.exports = router;
