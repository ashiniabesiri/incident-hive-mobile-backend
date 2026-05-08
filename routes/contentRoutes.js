const { Router } = require('express');

const controller = require('../controllers/contentController');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// Your API document lists news/testimonials as app content.
// Keep them authenticated so only app users can access them.
router.use(requireAuth);

router.get('/news', controller.getNews);
router.get('/testimonials', controller.getTestimonials);

module.exports = router;