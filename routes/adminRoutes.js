const { Router } = require('express');

const controller = require('../controllers/adminController');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

router.post('/experts', controller.createExpert);

router.post('/sessions/terminate', controller.terminateSession);

router.patch('/users/:user_id/status', controller.updateUserStatus);

router.get('/users', controller.listUsers);

router.get('/users/:user_id', controller.getUser);

router.get('/dashboard/stats', controller.getDashboardStats);

router.get('/audit-logs', controller.getAuditLogs);

module.exports = router;
