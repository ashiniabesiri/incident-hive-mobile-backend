/**
 * middleware/rbac.js
 * Role-based access control middleware.
 *
 * Each guard accepts a list of allowed roles. Admin always passes — admin is
 * a privileged bypass for support actions. So:
 *   requireReporter → reporter, admin
 *   requireExpert   → expert, admin
 *   requireAdmin    → admin only
 *
 * For routes that should accept any authenticated user (notifications,
 * news, testimonials, public expert profile), do not apply any role guard —
 * just rely on requireAuth.
 */

function sendError(res, status, code, message, details = null) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  });
}

/**
 * requireRole(['reporter']) → only reporters (plus admins) may call.
 * requireRole(['expert'])   → only experts (plus admins) may call.
 *
 * Admin role is automatically allowed in every guard.
 */
function requireRole(allowedRoles) {
  const allowed = new Set([...allowedRoles, 'admin']);

  return (req, res, next) => {
    if (!req.user) {
      return sendError(
        res,
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication required.'
      );
    }

    if (!allowed.has(req.user.role)) {
      return sendError(
        res,
        403,
        'FORBIDDEN',
        'You do not have permission to access this resource.',
        {
          required_roles: [...allowed],
          your_role: req.user.role,
        }
      );
    }

    return next();
  };
}

const requireReporter = requireRole(['reporter']);
const requireExpert = requireRole(['expert']);
const requireAdmin = requireRole(['admin']);

module.exports = {
  requireRole,
  requireReporter,
  requireExpert,
  requireAdmin,
};
