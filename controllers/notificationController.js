
const Joi = require('joi');
const NotificationModel = require('../models/Notification');
const UserDeviceModel   = require('../models/UserDevice');

// GET /api/notifications

async function getNotifications(req, res, next) {
  try {
    const userId = req.user.userId;

    // Parse + clamp query params
    const unreadOnly = req.query.unread_only === 'true';
    const page       = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit      = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset     = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      NotificationModel.findByUser(userId, { unreadOnly, limit, offset }),
      NotificationModel.countByUser(userId, { unreadOnly }),
      NotificationModel.countUnread(userId),
    ]);

    const mapped = notifications.map(({ body, ...rest }) => ({
      ...rest,
      message: body,
    }));

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        notifications: mapped,
        unread_count: unreadCount,
        pagination: {
          total,
          page,
          limit,
          total_pages: totalPages,
          has_next_page: page < totalPages,
          has_prev_page: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/notifications/:notification_id/read

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

// PATCH /api/notifications/read-all

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

// POST /api/notifications/push-token

const pushTokenSchema = Joi.object({
  device_id: Joi.string().min(3).max(255).required(),
  fcm_token: Joi.string().min(10).max(4096).required(),
});

async function registerPushToken(req, res, next) {
  try {
    const { error, value } = pushTokenSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed.',
          details: error.details.map((d) => d.message.replace(/['"]/g, '')),
        },
      });
    }

    const userId = req.user.userId;

    await UserDeviceModel.upsertDevice({
      deviceId: value.device_id,
      userId,
    });

    const updated = await UserDeviceModel.updateFcmToken(
      userId,
      value.device_id,
      value.fcm_token
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'DEVICE_NOT_FOUND',
          message: 'Device not found for this user.',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        device_id: updated.device_id,
        push_enabled: true,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  registerPushToken,
};
