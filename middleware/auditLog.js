const AuditLogModel = require('../models/AuditLog');
const logger = require('../utils/logger');

const ROUTE_MAP = [
  { method: 'POST',   pattern: /\/auth\/register$/,                  action: 'USER_REGISTER',          resource: 'user' },
  { method: 'POST',   pattern: /\/auth\/login$/,                     action: 'USER_LOGIN',             resource: 'session' },
  { method: 'POST',   pattern: /\/auth\/logout$/,                    action: 'USER_LOGOUT',            resource: 'session' },
  { method: 'POST',   pattern: /\/auth\/forgot-password$/,           action: 'PASSWORD_RESET_REQUEST', resource: 'user' },
  { method: 'POST',   pattern: /\/auth\/reset-password$/,            action: 'PASSWORD_RESET',         resource: 'user' },
  { method: 'POST',   pattern: /\/auth\/mfa\/setup$/,                action: 'MFA_SETUP',              resource: 'user' },
  { method: 'POST',   pattern: /\/auth\/mfa\/verify$/,               action: 'MFA_VERIFY',             resource: 'user' },

  { method: 'PUT',    pattern: /\/profile$/,                         action: 'PROFILE_UPDATE',         resource: 'user' },
  { method: 'PUT',    pattern: /\/profile\/password$/,               action: 'PASSWORD_CHANGE',        resource: 'user' },
  { method: 'DELETE', pattern: /\/profile$/,                         action: 'ACCOUNT_DELETE',         resource: 'user' },
  { method: 'POST',   pattern: /\/profile\/picture$/,                action: 'PROFILE_PICTURE_UPLOAD', resource: 'user' },
  { method: 'PATCH',  pattern: /\/profile\/availability$/,           action: 'AVAILABILITY_UPDATE',    resource: 'expert_profile' },

  { method: 'POST',   pattern: /\/incidents$/,                       action: 'INCIDENT_CREATE',        resource: 'incident' },
  { method: 'PUT',    pattern: /\/incidents\/([^/]+)$/,              action: 'INCIDENT_UPDATE',        resource: 'incident',     paramIdx: 1 },
  { method: 'DELETE', pattern: /\/incidents\/([^/]+)$/,              action: 'INCIDENT_DELETE',        resource: 'incident',     paramIdx: 1 },
  { method: 'PATCH',  pattern: /\/incidents\/([^/]+)\/status$/,      action: 'INCIDENT_STATUS_UPDATE', resource: 'incident',     paramIdx: 1 },

  { method: 'POST',   pattern: /\/incidents\/([^/]+)\/bids$/,        action: 'BID_PLACE',              resource: 'bid',          paramIdx: 1 },
  { method: 'POST',   pattern: /\/incidents\/([^/]+)\/bids\/([^/]+)\/accept$/,  action: 'BID_ACCEPT',  resource: 'bid',          paramIdx: 2 },
  { method: 'POST',   pattern: /\/incidents\/([^/]+)\/bids\/([^/]+)\/decline$/, action: 'BID_DECLINE', resource: 'bid',          paramIdx: 2 },
  { method: 'POST',   pattern: /\/incidents\/([^/]+)\/complete$/,    action: 'INCIDENT_COMPLETE',      resource: 'incident',     paramIdx: 1 },

  { method: 'PATCH',  pattern: /\/notifications\/read-all$/,         action: 'NOTIFICATIONS_READ_ALL', resource: 'notification' },
  { method: 'PATCH',  pattern: /\/notifications\/([^/]+)\/read$/,    action: 'NOTIFICATION_READ',      resource: 'notification', paramIdx: 1 },
  { method: 'POST',   pattern: /\/notifications\/push-token$/,       action: 'PUSH_TOKEN_REGISTER',    resource: 'user_device' },

  { method: 'POST',   pattern: /\/admin\/experts$/,                  action: 'ADMIN_CREATE_EXPERT',    resource: 'user' },
  { method: 'POST',   pattern: /\/admin\/sessions\/terminate$/,      action: 'ADMIN_TERMINATE_SESSION', resource: 'session' },
  { method: 'PATCH',  pattern: /\/admin\/users\/([^/]+)\/status$/,   action: 'ADMIN_UPDATE_USER_STATUS', resource: 'user', paramIdx: 1 },
];

function resolveRoute(method, path) {
  for (const route of ROUTE_MAP) {
    if (route.method !== method) continue;
    const match = path.match(route.pattern);
    if (match) {
      const resourceId = route.paramIdx ? match[route.paramIdx] : null;
      return { action: route.action, resourceType: route.resource, resourceId };
    }
  }
  return null;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || null;
}

function auditLog(req, res, next) {
  if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = function (body) {
    const resolved = resolveRoute(req.method, req.originalUrl.split('?')[0]);

    if (resolved) {
      const entry = {
        userId: req.user?.userId || null,
        action: resolved.action,
        resourceType: resolved.resourceType,
        resourceId: resolved.resourceId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        statusCode: res.statusCode,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || null,
        details: body?.success === false ? { error_code: body?.error?.code } : null,
      };

      AuditLogModel.create(entry).catch((err) => {
        logger.error('Audit log write failed:', { error: err.message, action: entry.action });
      });
    }

    return originalJson(body);
  };

  next();
}

module.exports = auditLog;
