const { query } = require('../config/database');

/**
 * IncidentReviewModel
 *
 * Per-engagement reviews (rating + optional comment) left by a reporter for
 * the expert who completed their incident. Schema lives in schema.sql §9b.
 *
 * One review per incident is enforced by `incident_id` being the primary key.
 */
const IncidentReviewModel = {
  /**
   * Insert a new review. Throws on PK violation (caller should detect this
   * via `findByIncidentId` first and surface DUPLICATE_REVIEW).
   */
  async create({ incidentId, reporterId, expertId, rating, comment }) {
    const { rows } = await query(
      `INSERT INTO incident_reviews
         (incident_id, reporter_id, expert_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING incident_id, reporter_id, expert_id, rating, comment, created_at`,
      [incidentId, reporterId, expertId, rating, comment || null]
    );
    return rows[0];
  },

  async findByIncidentId(incidentId) {
    const { rows } = await query(
      `SELECT incident_id, reporter_id, expert_id, rating, comment, created_at
         FROM incident_reviews
        WHERE incident_id = $1`,
      [incidentId]
    );
    return rows[0] || null;
  },

  async listByExpert(expertId, { limit = 20, offset = 0 } = {}) {
    const { rows } = await query(
      `SELECT incident_id, reporter_id, expert_id, rating, comment, created_at
         FROM incident_reviews
        WHERE expert_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [expertId, limit, offset]
    );
    return rows;
  },
};

module.exports = IncidentReviewModel;
