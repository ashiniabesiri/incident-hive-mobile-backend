const { query } = require('../config/database');

const NewsModel = {
  async findAll({ limit = 20, offset = 0 } = {}) {
    const { rows } = await query(
      `SELECT
         news_id,
         title,
         summary,
         source_name,
         source_url,
         is_ai_summary,
         created_at
       FROM news
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return rows;
  },

  async countAll() {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total FROM news`
    );

    return rows[0].total;
  },
};

module.exports = NewsModel;