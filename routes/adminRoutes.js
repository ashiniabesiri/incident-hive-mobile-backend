const { Router } = require('express');

const controller = require('../controllers/adminController');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

/**
 * POST /api/v1/admin/experts
 * Create a new expert account with profile.
 */
router.post('/experts', controller.createExpert);

/**
 * POST /api/v1/admin/sessions/terminate
 * Terminate all sessions for a specific user.
 */
router.post('/sessions/terminate', controller.terminateSession);

/**
 * PATCH /api/v1/admin/users/:user_id/status
 * Suspend or reactivate a user account.
 */
router.patch('/users/:user_id/status', controller.updateUserStatus);

/**
 * GET /api/v1/admin/audit-logs
 * Query audit logs with optional filters.
 */
router.get('/audit-logs', controller.getAuditLogs);

module.exports = router;
