const NotificationModel = require('../models/Notification');
const { sendPushToUser, sendPushToUsers } = require('./pushNotificationService');
const logger            = require('../utils/logger');

async function safeCreate(payload) {
  try {
    const notification = await NotificationModel.create(payload);

    sendPushToUser(payload.userId, {
      title: payload.title,
      body:  payload.body,
      data:  {
        type: payload.type,
        notification_id: notification.notification_id,
        ...(payload.referenceId && { reference_id: payload.referenceId }),
      },
    }).catch(() => {});

    return notification;
  } catch (err) {
    logger.error('Failed to create notification:', { error: err.message, userId: payload.userId, type: payload.type });
    return null;
  }
}

async function safeBulk(userIds, payload) {
  try {
    const notifications = await NotificationModel.createBulk(userIds, payload);

    sendPushToUsers(userIds, {
      title: payload.title,
      body:  payload.body,
      data:  {
        type: payload.type,
        ...(payload.referenceId && { reference_id: payload.referenceId }),
      },
    }).catch(() => {});

    return notifications;
  } catch (err) {
    logger.error('Failed to create bulk notifications:', { error: err.message, userIds, type: payload.type });
    return [];
  }
}

// Reporter notified when expert places a bid
async function notifyNewBid(reporterId, { incidentId, incidentTitle, expertName, proposedFee }) {
  return safeCreate({
    userId: reporterId, type: 'NEW_BID', title: 'New Bid Received',
    body:   `${expertName} placed a bid of $${proposedFee} on "${incidentTitle}".`,
    referenceId: incidentId,
  });
}

// Expert notified when reporter accepts their bid.
// Reporter contact (email + phone) is included so the expert can reach out
// directly — the engagement is now active and PII is unlocked under N002.
async function notifyBidAccepted(
  expertId,
  { incidentId, incidentTitle, reporterName, reporterEmail, reporterPhone }
) {
  const contactLines = [
    reporterEmail ? `Email: ${reporterEmail}` : null,
    reporterPhone ? `Phone: ${reporterPhone}` : null,
  ].filter(Boolean);

  const contactBlock = contactLines.length
    ? `\n\nContact ${reporterName}:\n${contactLines.join('\n')}`
    : '';

  return safeCreate({
    userId: expertId, type: 'BID_ACCEPTED', title: 'Your Bid Was Accepted 🎉',
    body:   `${reporterName} accepted your bid on "${incidentTitle}". Engagement is now in progress.${contactBlock}`,
    referenceId: incidentId,
  });
}

// Expert notified when their bid is declined (manually or auto)
async function notifyBidDeclined(expertId, { incidentId, incidentTitle, wasAutoDeclined = false }) {
  return safeCreate({
    userId: expertId, type: 'BID_DECLINED', title: 'Bid Not Selected',
    body: wasAutoDeclined
      ? `Another expert was selected for "${incidentTitle}". Thank you for your interest.`
      : `Your bid on "${incidentTitle}" was declined by the reporter.`,
    referenceId: incidentId,
  });
}

// Bulk decline — fired when one bid is accepted and all others are auto-declined
async function notifyMultipleExpertsDeclined(expertIds, { incidentId, incidentTitle }) {
  if (!expertIds?.length) return [];
  return safeBulk(expertIds, {
    type: 'BID_DECLINED', title: 'Bid Not Selected',
    body: `Another expert was selected for "${incidentTitle}". Thank you for your interest.`,
    referenceId: incidentId,
  });
}

// Reporter notified when expert marks engagement complete
async function notifyIncidentCompleted(reporterId, { incidentId, incidentTitle, expertName }) {
  return safeCreate({
    userId: reporterId, type: 'INCIDENT_UPDATE', title: 'Engagement Completed',
    body:   `${expertName} has marked the engagement for "${incidentTitle}" as complete.`,
    referenceId: incidentId,
  });
}

// Generic — send to one user or many
async function notifyIncidentUpdate(userIds, { incidentId, title, body }) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (ids.length === 1) {
    return safeCreate({ userId: ids[0], type: 'INCIDENT_UPDATE', title, body, referenceId: incidentId });
  }
  return safeBulk(ids, { type: 'INCIDENT_UPDATE', title, body, referenceId: incidentId });
}

// Low-level generic helpers for custom use-cases
async function createNotification(userId, type, title, body, referenceId = null) {
  return safeCreate({ userId, type, title, body, referenceId });
}

async function createBulkNotification(userIds, type, title, body, referenceId = null) {
  return safeBulk(userIds, { type, title, body, referenceId });
}

module.exports = {
  createNotification,
  createBulkNotification,
  notifyNewBid,
  notifyBidAccepted,
  notifyBidDeclined,
  notifyMultipleExpertsDeclined,
  notifyIncidentCompleted,
  notifyIncidentUpdate,
};
