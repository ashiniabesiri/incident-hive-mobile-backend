/**
 * middleware/rbac.js
 * Role-Based Access Control middleware.
 *
 * Usage:
 *   router.get('/expert-data', requireAuth, requireRole(['expert', 'admin']), handler);
 */

/**
 * requireRole
 * Returns an Express middleware that rejects requests whose JWT role claim
 * is not in the provided allowedRoles array.
 *
 * @param {string[]} allowedRoles - e.g. ['reporter', 'expert', 'admin']
 */
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

/**
 * Convenience shortcuts
 */
const requireReporter = requireRole(['reporter', 'expert', 'admin']);
const requireExpert   = requireRole(['expert', 'admin']);
const requireAdmin    = requireRole(['admin']);

module.exports = { requireRole, requireReporter, requireExpert, requireAdmin };
