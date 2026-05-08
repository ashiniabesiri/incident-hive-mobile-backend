const NewsModel = require('../models/News');
const TestimonialModel = require('../models/Testimonial');

function parsePagination(req) {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * GET /api/v1/news
 */
async function getNews(req, res, next) {
  try {
    const { page, limit, offset } = parsePagination(req);

    const [news, total] = await Promise.all([
      NewsModel.findAll({ limit, offset }),
      NewsModel.countAll(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      data: {
        news,
        pagination: {
          total,
          page,
          limit,
          total_pages: totalPages,
          has_next_page: page < totalPages,
          has_prev_page: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/testimonials
 */
async function getTestimonials(req, res, next) {
  try {
    const { page, limit, offset } = parsePagination(req);

    const [testimonials, total] = await Promise.all([
      TestimonialModel.findActive({ limit, offset }),
      TestimonialModel.countActive(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      data: {
        testimonials,
        pagination: {
          total,
          page,
          limit,
          total_pages: totalPages,
          has_next_page: page < totalPages,
          has_prev_page: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getNews,
  getTestimonials,
};