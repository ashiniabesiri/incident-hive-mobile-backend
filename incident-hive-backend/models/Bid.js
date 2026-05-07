/**
 * models/Bid.js
 * All PostgreSQL queries for the `bids` table.
 *
 * DDL:
 *
 *   CREATE TABLE bids (
 *     bid_id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
 *     incident_id       UUID         NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
 *     expert_id         UUID         NOT NULL REFERENCES users(user_id)         ON DELETE RESTRICT,
 *     proposed_approach TEXT         NOT NULL,
 *     estimated_hours   INTEGER      NOT NULL CHECK (estimated_hours > 0),
 *     proposed_fee      DECIMAL(10,2) NOT NULL CHECK (proposed_fee >= 0),
 *     status            VARCHAR(20)  NOT NULL DEFAULT 'Pending'
 *                       CHECK (status IN ('Pending','Accepted','Declined')),
 *     submitted_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
 *     updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
 *     -- An expert can only have one active bid per incident
 *     UNIQUE (incident_id, expert_id)
 *   );
 *
 *   CREATE INDEX idx_bids_incident_id ON bids(incident_id);
 *   CREATE INDEX idx_bids_expert_id   ON bids(expert_id);
 *   CREATE INDEX idx_bids_status      ON bids(status);
 */

const { query, withTransaction } = require('../config/database');

const VALID_STATUSES = ['Pending', 'Accepted', 'Declined'];

const BidModel = {

  // ──────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * create
   * Submit a new bid on an incident.
   * The DB UNIQUE constraint on (incident_id, expert_id) prevents duplicate bids —
   * the controller should catch error code 23505 and return a 409.
   *
   * @param {Object} params
   * @param {string} params.incidentId       UUID of the incident being bid on
   * @param {string} params.expertId         UUID of the bidding expert
   * @param {string} params.proposedApproach Full text description of approach
   * @param {number} params.estimatedHours   Positive integer
   * @param {number} params.proposedFee      Non-negative decimal
   * @returns {Object} Created bid row
   */
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

  // ──────────────────────────────────────────────────────────────────────────────
  // READ
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * findById
   * Fetch a single bid by its UUID.
   *
   * @param {string} bidId  UUID
   * @returns {Object|null}
   */
  async findById(bidId) {
    const { rows } = await query(
      'SELECT * FROM bids WHERE bid_id = $1',
      [bidId]
    );
    return rows[0] || null;
  },

  /**
   * findByIdWithExpert
   * Bid row joined with the expert's public profile.
   * Useful for the reporter viewing details of who bid on their incident.
   *
   * @param {string} bidId  UUID
   * @returns {Object|null}
   */
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

  /**
   * findByIncident
   * All bids placed on a specific incident, newest first.
   * Used by reporters to review who has bid on their incident.
   *
   * @param {string} incidentId  UUID
   * @param {Object} [opts]
   * @param {number} [opts.limit=20]
   * @param {number} [opts.offset=0]
   * @returns {Object[]}
   */
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

  /**
   * findByUser
   * All bids placed by a specific expert (expert's bid history).
   *
   * @param {string} expertId  UUID
   * @param {Object} [opts]
   * @param {number} [opts.limit=20]
   * @param {number} [opts.offset=0]
   * @returns {Object[]}
   */
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

  /**
   * findByExpertAndIncident
   * Look up an expert's bid on a specific incident.
   * Used to prevent duplicate bids and for ownership checks.
   *
   * @param {string} expertId    UUID
   * @param {string} incidentId  UUID
   * @returns {Object|null}
   */
  async findByExpertAndIncident(expertId, incidentId) {
    const { rows } = await query(
      'SELECT * FROM bids WHERE expert_id = $1 AND incident_id = $2',
      [expertId, incidentId]
    );
    return rows[0] || null;
  },

  // ──────────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * update
   * Edit the content of a bid (only while status is still 'Pending').
   * Callers should enforce the Pending-only rule before calling this.
   *
   * @param {string} bidId   UUID
   * @param {Object} fields  Any subset of: { proposedApproach, estimatedHours, proposedFee }
   * @returns {Object|null}
   */
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

  /**
   * updateStatus
   * Change the status of a bid.
   *
   * When a bid is Accepted, all other Pending bids on the same incident are
   * automatically Declined in the same transaction — only one expert can be
   * assigned per incident.
   *
   * @param {string} bidId      UUID
   * @param {string} status     'Accepted' | 'Declined'
   * @param {string} [incidentId]  Required when status = 'Accepted'
   * @returns {Object|null}     The updated bid row
   */
  async updateStatus(bidId, status, incidentId = null) {
    if (status === 'Accepted' && incidentId) {
      // Transactional: accept this bid + decline all others on the same incident
      return withTransaction(async (client) => {
        // Accept the chosen bid
        const { rows: acceptedRows } = await client.query(
          `UPDATE bids
           SET status = 'Accepted', updated_at = NOW()
           WHERE bid_id = $1
           RETURNING *`,
          [bidId]
        );

        // Decline every other Pending bid on this incident
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

    // Simple status update (Declined or any non-acceptance change)
    const { rows } = await query(
      `UPDATE bids
       SET status = $1, updated_at = NOW()
       WHERE bid_id = $2
       RETURNING *`,
      [status, bidId]
    );
    return rows[0] || null;
  },

  // ──────────────────────────────────────────────────────────────────────────────
  // DELETE
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * delete
   * Hard-delete a bid by UUID.
   * Bids don't need soft-delete (they carry no long-term audit trail independent
   * of the incident). Callers should ensure the bid is still Pending before deleting.
   *
   * @param {string} bidId  UUID
   * @returns {Object|null} The deleted row, or null if not found
   */
  async delete(bidId) {
    const { rows } = await query(
      'DELETE FROM bids WHERE bid_id = $1 RETURNING *',
      [bidId]
    );
    return rows[0] || null;
  },

  // ──────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────────────────────────

  /** Count of bids on a given incident */
  async countByIncident(incidentId) {
    const { rows } = await query(
      'SELECT COUNT(*)::int AS total FROM bids WHERE incident_id = $1',
      [incidentId]
    );
    return rows[0].total;
  },

  VALID_STATUSES,
};

module.exports = BidModel;
