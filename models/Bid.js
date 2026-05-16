
const { query, withTransaction } = require('../config/database');

const VALID_STATUSES = ['Pending', 'Accepted', 'Declined'];

const BidModel = {

  // CREATE

  async create({ incidentId, expertId, proposedApproach, estimatedHours, proposedFee }) {
    const sql = `
      INSERT INTO bids
        (incident_id, expert_id, proposed_approach, estimated_hours, proposed_fee)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING
        bid_id, incident_id, expert_id, proposed_approach,
        estimated_hours, proposed_fee, status, submitted_at, updated_at
    `;
    const { rows } = await query(sql, [
      incidentId,
      expertId,
      proposedApproach,
      estimatedHours,
      proposedFee,
    ]);
    return rows[0];
  },

  // READ

  async findById(bidId) {
    const { rows } = await query(
      'SELECT * FROM bids WHERE bid_id = $1',
      [bidId]
    );
    return rows[0] || null;
  },

  async findByIdWithExpert(bidId) {
    const { rows } = await query(
      `SELECT
         b.*,
         u.first_name        AS expert_first_name,
         u.last_name         AS expert_last_name,
         u.email             AS expert_email,
         ep.credentials      AS expert_credentials,
         ep.expertise_areas  AS expert_expertise_areas,
         ep.completed_engagements AS expert_completed_engagements
       FROM bids b
       JOIN users         u  ON u.user_id  = b.expert_id
       LEFT JOIN expert_profiles ep ON ep.user_id = b.expert_id
       WHERE b.bid_id = $1`,
      [bidId]
    );
    return rows[0] || null;
  },

  async findByIncident(incidentId, { limit = 20, offset = 0 } = {}) {
    const { rows } = await query(
      `SELECT
         b.*,
         u.first_name       AS expert_first_name,
         u.last_name        AS expert_last_name,
         ep.credentials     AS expert_credentials,
         ep.expertise_areas AS expert_expertise_areas,
         ep.completed_engagements AS expert_completed_engagements
       FROM bids b
       JOIN users          u  ON u.user_id  = b.expert_id
       LEFT JOIN expert_profiles ep ON ep.user_id = b.expert_id
       WHERE b.incident_id = $1
       ORDER BY b.submitted_at DESC
       LIMIT $2 OFFSET $3`,
      [incidentId, limit, offset]
    );
    return rows;
  },

  async findByUser(expertId, { limit = 20, offset = 0 } = {}) {
    const { rows } = await query(
      `SELECT
         b.*,
         i.title          AS incident_title,
         i.incident_type  AS incident_type,
         i.status         AS incident_status
       FROM bids b
       JOIN incidents i ON i.incident_id = b.incident_id
       WHERE b.expert_id = $1
       ORDER BY b.submitted_at DESC
       LIMIT $2 OFFSET $3`,
      [expertId, limit, offset]
    );
    return rows;
  },

  async findByExpertAndIncident(expertId, incidentId) {
    const { rows } = await query(
      'SELECT * FROM bids WHERE expert_id = $1 AND incident_id = $2',
      [expertId, incidentId]
    );
    return rows[0] || null;
  },

  // UPDATE

  async update(bidId, fields) {
    const allowed = {
      proposedApproach: 'proposed_approach',
      estimatedHours:   'estimated_hours',
      proposedFee:      'proposed_fee',
    };

    const setClauses = [];
    const params     = [];

    for (const [jsKey, dbCol] of Object.entries(allowed)) {
      if (fields[jsKey] !== undefined) {
        params.push(fields[jsKey]);
        setClauses.push(`${dbCol} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) return this.findById(bidId);

    setClauses.push('updated_at = NOW()');
    params.push(bidId);

    const { rows } = await query(
      `UPDATE bids
       SET ${setClauses.join(', ')}
       WHERE bid_id = $${params.length}
       RETURNING *`,
      params
    );
    return rows[0] || null;
  },

  async updateStatus(bidId, status, incidentId = null) {
    if (status === 'Accepted' && incidentId) {
      return withTransaction(async (client) => {
        // Accept the chosen bid
        const { rows: acceptedRows } = await client.query(
          `UPDATE bids
           SET status = 'Accepted', updated_at = NOW()
           WHERE bid_id = $1
           RETURNING *`,
          [bidId]
        );

        await client.query(
          `UPDATE bids
           SET status = 'Declined', updated_at = NOW()
           WHERE incident_id = $1
             AND bid_id != $2
             AND status = 'Pending'`,
          [incidentId, bidId]
        );

        return acceptedRows[0] || null;
      });
    }

    const { rows } = await query(
      `UPDATE bids
       SET status = $1, updated_at = NOW()
       WHERE bid_id = $2
       RETURNING *`,
      [status, bidId]
    );
    return rows[0] || null;
  },

  // DELETE

  async delete(bidId) {
    const { rows } = await query(
      'DELETE FROM bids WHERE bid_id = $1 RETURNING *',
      [bidId]
    );
    return rows[0] || null;
  },

  // HELPERS

  async countByIncident(incidentId) {
    const { rows } = await query(
      'SELECT COUNT(*)::int AS total FROM bids WHERE incident_id = $1',
      [incidentId]
    );
    return rows[0].total;
  },

  async hasAcceptedBid(incidentId) {
    const { rows } = await query(
      "SELECT 1 FROM bids WHERE incident_id = $1 AND status = 'Accepted' LIMIT 1",
      [incidentId]
    );
    return rows.length > 0;
  },

  VALID_STATUSES,
};

module.exports = BidModel;
