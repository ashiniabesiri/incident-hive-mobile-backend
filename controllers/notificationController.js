/**
 * controllers/notificationController.js
 * Handler functions for notification retrieval and read-state management.
 *
 * All endpoints operate only on the authenticated user's OWN notifications.
 * A user can never read, mark, or delete another user's notifications —
 * ownership is enforced by passing req.user.userId into every model method
 * rather than trusting any ID from the request body or params.
 *
 * Notification types in the system:
 *   NEW_BID         → reporter receives when an expert bids
 *   BID_ACCEPTED    → expert receives when their bid is accepted
 *   BID_DECLINED    → expert receives when their bid is declined
 *   INCIDENT_UPDATE → either party receives on status changes
 */

const NotificationModel = require('../models/Notification');

// ─── GET /api/notifications ────────────────────────────────────────────────────

/**
 * getNotifications
 * Returns a paginated list of the authenticated user's notifications,
 * ordered newest first, with a total unread count for badge display.
 *
 * Query params:
 *   unread_only — "true" to return only unread notifications (default: false)
 *   page        — 1-based page number (default: 1)
 *   limit       — results per page, 1–50 (default: 20)
 */
async function getNotifications(req, res, next) {
  try {
    const userId = req.user.userId;

    // ── Parse + clamp query params ─────────────────────────────────────────
    const unreadOnly = req.query.unread_only === 'true';
    const page       = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit      = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset     = (page - 1) * limit;

    // ── Fetch notifications + unread count in parallel ─────────────────────
    const [notifications, unreadCount] = await Promise.all([
      NotificationModel.findByUser(userId, { unreadOnly, limit, offset }),
      NotificationModel.countUnread(userId),
    ]);

    // ── Alias body → message per API docs ────────────────────────────────
    const mapped = notifications.map(({ body, ...rest }) => ({
      ...rest,
      message: body,
    }));

    // ── Derive total for pagination ────────────────────────────────────────
    const total = notifications.length < limit
      ? offset + notifications.length
      : null;
    const totalPages = total !== null ? Math.ceil(total / limit) : null;

    res.status(200).json({
      success: true,
      data: {
        notifications: mapped,
        unread_count: unreadCount,
        pagination: {
          page,
          limit,
          ...(total !== null && { total }),
          ...(totalPages !== null && { total_pages: totalPages }),
          has_next_page: notifications.length === limit,
          has_prev_page: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── PATCH /api/notifications/:notification_id/read ───────────────────────────

/**
 * markAsRead
 * Mark a single notification as read.
 *
 * Ownership is enforced inside NotificationModel.markAsRead — the update
 * includes WHERE user_id = $2 so a user can never mark another user's
 * notification as read.
 *
 * Returns 404 if the notification doesn't exist OR belongs to another user
 * (we don't distinguish between the two cases to avoid confirming existence).
 */
async function markAsRead(req, res, next) {
  try {
    const { notification_id } = req.params;
    const userId              = req.user.userId;

    const notification = await NotificationModel.markAsRead(notification_id, userId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found.',
        },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      data:    { notification },
    });
  } catch (error) {
    next(error);
  }
}

// ─── PATCH /api/notifications/read-all ────────────────────────────────────────

/**
 * markAllAsRead
 * Marks every unread notification for the authenticated user as read.
 * Called when the user opens the notifications screen and implicitly
 * "sees" all pending notifications.
 *
 * Returns the count of notifications that were updated (0 if inbox was
 * already empty / all already read — not an error).
 */
async function markAllAsRead(req, res, next) {
  try {
    const userId = req.user.userId;

    const updatedCount = await NotificationModel.markAllAsRead(userId);

    res.status(200).json({
      success: true,
      message: updatedCount > 0
        ? `${updatedCount} notification${updatedCount === 1 ? '' : 's'} marked as read.`
        : 'No unread notifications.',
      data: { updated_count: updatedCount },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};
