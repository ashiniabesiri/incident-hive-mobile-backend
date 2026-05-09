const logger = require('../utils/logger');
const UserDeviceModel = require('../models/UserDevice');

let firebaseAdmin;
let messagingClient;

const MAX_RETRIES    = 3;
const BASE_DELAY_MS  = 500;

const RETRYABLE_CODES = new Set([
  'messaging/server-unavailable',
  'messaging/internal-error',
  'messaging/unknown-error',
]);

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err) {
  return RETRYABLE_CODES.has(err?.code) || err?.code === 'UNAVAILABLE';
}

async function sendWithRetry(messaging, payload, attempt = 1) {
  try {
    if (payload.token) {
      return await messaging.send(payload);
    }
    return await messaging.sendEachForMulticast(payload);
  } catch (err) {
    if (isRetryable(err) && attempt < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 200;
      logger.warn(`FCM retry ${attempt}/${MAX_RETRIES} after ${Math.round(delay)}ms: ${err.code}`);
      await sleep(delay);
      return sendWithRetry(messaging, payload, attempt + 1);
    }
    throw err;
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
      await sendWithRetry(messaging, { ...message, token: tokens[0] });
    } else {
      const response = await sendWithRetry(messaging, { ...message, tokens });

      if (response.failureCount > 0) {
        const staleTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
            staleTokens.push(tokens[idx]);
          }
        });
        if (staleTokens.length) {
          logger.info(`Removing ${staleTokens.length} stale FCM token(s) for user ${userId}`);
        }
      }
    }
  } catch (err) {
    logger.error(`FCM send failed for user ${userId} after retries: ${err.message}`);
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
