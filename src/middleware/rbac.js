
function requireRole(allowedRoles) {
  return (req, res, next) => {
    // requireAuth must run before requireRole — it sets req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const { role } = req.user;

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This endpoint requires one of the following roles: ${allowedRoles.join(', ')}.`,
        yourRole: role,
      });
    }

    next();
  };
}

const requireReporter     = requireRole(['reporter', 'expert', 'admin']);
const requireReporterOnly = requireRole(['reporter', 'admin']);
const requireExpert       = requireRole(['expert', 'admin']);
const requireAdmin        = requireRole(['admin']);

module.exports = { requireRole, requireReporter, requireReporterOnly, requireExpert, requireAdmin };
