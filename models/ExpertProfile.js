/**
 * models/ExpertProfile.js
 * All PostgreSQL queries for the `expert_profiles` table.
 *
 * This table extends the `users` table for expert-role users only.
 * It uses the same user_id as both its primary key and foreign key —
 * a one-to-one relationship enforced at the DB level.
 *
 * DDL:
 *
 *   CREATE TABLE expert_profiles (
 *     user_id                 UUID          PRIMARY KEY
 *                             REFERENCES users(user_id) ON DELETE CASCADE,
 *     credentials             TEXT,
 *     expertise_areas         TEXT[]        NOT NULL DEFAULT '{}',
 *     availability_status     VARCHAR(20)   NOT NULL DEFAULT 'Available'
 *                             CHECK (availability_status IN ('Available','Unavailable')),
 *     completed_engagements   INTEGER       NOT NULL DEFAULT 0 CHECK (completed_engagements >= 0),
 *     total_earned            DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (total_earned >= 0),
 *     created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
 *     updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
 *   );
 *
 *   CREATE INDEX idx_expert_profiles_availability ON expert_profiles(availability_status);
 *   CREATE INDEX idx_expert_profiles_areas        ON expert_profiles USING GIN(expertise_areas);
 */

const { query } = require('../config/database');

const VALID_AVAILABILITY = ['Available', 'Unavailable'];

const ExpertProfileModel = {

  // ──────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * create
   * Insert a new expert profile row.
   * Called immediately after the user row is created with role = 'expert'.
   *
   * @param {Object}   params
   * @param {string}   params.userId               UUID — must match an existing user
   * @param {string}   [params.credentials]        Free-text credentials string e.g. "CISSP, CEH"
   * @param {string[]} [params.expertiseAreas]     Array of area strings e.g. ['Phishing','DDoS']
   * @param {string}   [params.availabilityStatus] 'Available' | 'Unavailable'
   * @returns {Object} Created expert_profiles row
   */
  async create({
    userId,
    credentials        = null,
    expertiseAreas     = [],
    availabilityStatus = 'Available',
  }) {
    const sql = `
      INSERT INTO expert_profiles
        (user_id, credentials, expertise_areas, availability_status)
      VALUES
        ($1, $2, $3, $4)
      RETURNING *
    `;
    const { rows } = await query(sql, [
      userId,
      credentials,
      expertiseAreas,    // pg driver serialises JS arrays to Postgres TEXT[]
      availabilityStatus,
    ]);
    return rows[0];
  },

  // ──────────────────────────────────────────────────────────────────────────────
  // READ
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * findById
   * Fetch the expert profile for a given user_id.
   *
   * @param {string} userId  UUID
   * @returns {Object|null}
   */
  async findById(userId) {
    const { rows } = await query(
      'SELECT * FROM expert_profiles WHERE user_id = $1',
      [userId]
    );
    return rows[0] || null;
  },

  /**
   * findByUser
   * Alias for findById — semantically clear when called with a userId
   * from req.user in a controller.
   *
   * @param {string} userId  UUID
   * @returns {Object|null}
   */
  async findByUser(userId) {
    return this.findById(userId);
  },

  /**
   * findWithUser
   * JOIN expert_profiles with the users table to return a combined public profile.
   * Never returns password_hash or mfa_secret.
   *
   * @param {string} userId  UUID
   * @returns {Object|null}
   */
  async findWithUser(userId) {
    const { rows } = await query(
      `SELECT
         u.user_id,
         u.email,
         u.first_name,
         u.last_name,
         u.phone_number,
         u.role,
         u.email_verified,
         u.account_status,
         u.last_login_at,
         u.created_at             AS user_created_at,
         ep.credentials,
         ep.bio,
         ep.expertise_areas,
         ep.availability_status,
         ep.completed_engagements,
         ep.total_earned,
         ep.created_at            AS profile_created_at,
         ep.updated_at            AS profile_updated_at
       FROM expert_profiles ep
       JOIN users u ON u.user_id = ep.user_id
       WHERE ep.user_id = $1
         AND u.account_status != 'deleted'`,
      [userId]
    );
    return rows[0] || null;
  },

  /**
   * findAll
   * Paginated list of all expert profiles, optionally filtered by
   * availability_status or a specific expertise area.
   *
   * @param {Object} [opts]
   * @param {string}   [opts.availabilityStatus]  'Available' | 'Unavailable'
   * @param {string}   [opts.expertiseArea]       Filter: area must be in expertise_areas array
   * @param {number}   [opts.limit=20]
   * @param {number}   [opts.offset=0]
   * @returns {Object[]}
   */
  async findAll({ availabilityStatus, expertiseArea, limit = 20, offset = 0 } = {}) {
    const conditions = ["u.account_status != 'deleted'"];
    const params     = [];

    if (availabilityStatus) {
      params.push(availabilityStatus);
      conditions.push(`ep.availability_status = $${params.length}`);
    }

    if (expertiseArea) {
      params.push(expertiseArea);
      // Postgres array contains operator: expertise_areas @> ARRAY[$n]
      conditions.push(`ep.expertise_areas @> ARRAY[$${params.length}]::TEXT[]`);
    }

    params.push(limit, offset);

    const { rows } = await query(
      `SELECT
         u.user_id, u.first_name, u.last_name, u.email,
         ep.credentials, ep.expertise_areas, ep.availability_status,
         ep.completed_engagements, ep.total_earned
       FROM expert_profiles ep
       JOIN users u ON u.user_id = ep.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ep.completed_engagements DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  },

  // ──────────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * update
   * Partially update editable profile fields.
   * Only keys present in `fields` are changed — others are left untouched.
   *
   * @param {string} userId  UUID
   * @param {Object} fields  Any subset of: { credentials, expertiseAreas, availabilityStatus }
   * @returns {Object|null}
   */
  async update(userId, fields) {
    const allowed = {
      credentials:        'credentials',
      bio:                'bio',
      expertiseAreas:     'expertise_areas',
      availabilityStatus: 'availability_status',
    };

    const setClauses = [];
    const params     = [];

    for (const [jsKey, dbCol] of Object.entries(allowed)) {
      if (fields[jsKey] !== undefined) {
        params.push(fields[jsKey]);
        setClauses.push(`${dbCol} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) return this.findById(userId);

    setClauses.push('updated_at = NOW()');
    params.push(userId);

    const { rows } = await query(
      `UPDATE expert_profiles
       SET ${setClauses.join(', ')}
       WHERE user_id = $${params.length}
       RETURNING *`,
      params
    );
    return rows[0] || null;
  },

  /**
   * updateAvailability
   * Convenience wrapper — toggle availability without touching other fields.
   *
   * @param {string} userId  UUID
   * @param {string} status  'Available' | 'Unavailable'
   * @returns {Object|null}
   */
  async updateAvailability(userId, status) {
    const { rows } = await query(
      `UPDATE expert_profiles
       SET availability_status = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING user_id, availability_status, updated_at`,
      [status, userId]
    );
    return rows[0] || null;
  },

  /**
   * incrementEngagements
   * Called when a bid transitions to a completed state.
   * Atomically bumps completed_engagements and adds to total_earned.
   *
   * @param {string} userId        UUID of the expert
   * @param {number} earnedAmount  Fee amount to add to total_earned
   * @returns {Object|null}
   */
  async incrementEngagements(userId, earnedAmount = 0) {
    const { rows } = await query(
      `UPDATE expert_profiles
       SET
         completed_engagements = completed_engagements + 1,
         total_earned          = total_earned + $1,
         updated_at            = NOW()
       WHERE user_id = $2
       RETURNING user_id, completed_engagements, total_earned`,
      [earnedAmount, userId]
    );
    return rows[0] || null;
  },

  // ──────────────────────────────────────────────────────────────────────────────
  // DELETE
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * delete
   * Hard-delete the expert profile row.
   * The CASCADE on the FK means this also fires if the parent user row is deleted.
   * Typically called when an expert's account is being cleaned up by an admin.
   *
   * @param {string} userId  UUID
   * @returns {Object|null} The deleted row, or null if not found
   */
  async delete(userId) {
    const { rows } = await query(
      'DELETE FROM expert_profiles WHERE user_id = $1 RETURNING *',
      [userId]
    );
    return rows[0] || null;
  },

  // ──────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────────────────────────

  VALID_AVAILABILITY,
};

module.exports = ExpertProfileModel;
