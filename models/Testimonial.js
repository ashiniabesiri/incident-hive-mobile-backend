const { query } = require('../config/database');

const TestimonialModel = {
  async findActive({ limit = 20, offset = 0 } = {}) {
    const { rows } = await query(
      `SELECT
         testimonial_id,
         author_name,
         role_label,
         content,
         created_at
       FROM testimonials
       WHERE is_active = true
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return rows;
  },

  async countActive() {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total
       FROM testimonials
       WHERE is_active = true`
    );

    return rows[0].total;
  },
};

module.exports = TestimonialModel;