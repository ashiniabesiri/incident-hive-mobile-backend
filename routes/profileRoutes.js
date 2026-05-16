
const { Router } = require('express');

const controller = require('../controllers/profileController');
const { requireAuth } = require('../middleware/auth');
const { uploadProfilePicture } = require('../middleware/profileUpload');

const router = Router();

// All profile routes require login
router.use(requireAuth);

router.get('/', controller.getProfile);
router.put('/', controller.updateProfile);
router.put('/password', controller.changePassword);
router.post('/picture', uploadProfilePicture, controller.uploadProfilePicture);
router.delete('/', controller.deleteAccount);

module.exports = router;