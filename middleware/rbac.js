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

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(
        res,
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication required.'
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(
        res,
        403,
        'FORBIDDEN',
        'You do not have permission to access this resource.',
        {
          required_roles: allowedRoles,
          your_role: req.user.role,
        }
      );
    }

    return next();
  };
}

// Existing project behavior:
// requireReporter allows all authenticated app roles.
// Do not change this now because other routes depend on it.
const requireReporter = requireRole(['reporter', 'expert', 'admin']);
const requireReporterOnly = requireRole(['reporter', 'admin']);
const requireExpert = requireRole(['expert', 'admin']);
const requireAdmin = requireRole(['admin']);

module.exports = {
  requireRole,
  requireReporter,
  requireReporterOnly,
  requireExpert,
  requireAdmin,
};