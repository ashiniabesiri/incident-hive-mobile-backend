const { Router } = require('express');

const controller = require('../controllers/contentController');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.use(requireAuth);

router.get('/news', controller.getNews);
router.get('/testimonials', controller.getTestimonials);

module.exports = router;