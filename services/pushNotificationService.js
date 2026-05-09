const logger = require('../utils/logger');
const UserDeviceModel = require('../models/UserDevice');

let firebaseAdmin;
let messagingClient;

function getMessaging() {
  if (messagingClient) return messagingClient;

  if (!process.env.FCM_SERVICE_ACCOUNT_PATH && !process.env.FCM_SERVICE_ACCOUNT_JSON) {
    return null;
  }

  try {
    firebaseAdmin = require('firebase-admin');

    const credential = process.env.FCM_SERVICE_ACCOUNT_JSON
      ? firebaseAdmin.credential.cert(JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON))
      : firebaseAdmin.credential.cert(require(process.env.FCM_SERVICE_ACCOUNT_PATH));

    if (!firebaseAdmin.apps.length) {
      firebaseAdmin.initializeApp({ credential });
    }

    messagingClient = firebaseAdmin.messaging();
    logger.info('FCM push notifications: enabled');
    return messagingClient;
  } catch (err) {
    logger.warn(`FCM push notifications: disabled (${err.message})`);
    return null;
  }
}

async function sendPushToUser(userId, { title, body, data = {} }) {
  const messaging = getMessaging();
  if (!messaging) return;

  try {
    const tokens = await UserDeviceModel.findFcmTokensByUser(userId);
    if (!tokens.length) return;

    const message = {
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
    };

    if (tokens.length === 1) {
      await messaging.send({ ...message, token: tokens[0] });
    } else {
      const response = await messaging.sendEachForMulticast({
        ...message,
        tokens,
      });

      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
            logger.info(`Stale FCM token removed for user ${userId}`);
          }
        });
      }
    }
  } catch (err) {
    logger.error(`FCM send failed for user ${userId}: ${err.message}`);
  }
}

async function sendPushToUsers(userIds, { title, body, data = {} }) {
  await Promise.allSettled(
    userIds.map((uid) => sendPushToUser(uid, { title, body, data }))
  );
}

module.exports = {
  sendPushToUser,
  sendPushToUsers,
};
