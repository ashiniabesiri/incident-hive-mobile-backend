
const { query } = require('../config/database');

const VALID_AVAILABILITY = ['Available', 'Unavailable'];

const ExpertProfileModel = {

  // CREATE

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
      expertiseAreas,
      availabilityStatus,
    ]);
    return rows[0];
  },

  // READ

  async findById(userId) {
    const { rows } = await query(
      'SELECT * FROM expert_profiles WHERE user_id = $1',
      [userId]
    );
    return rows[0] || null;
  },

  async findByUser(userId) {
    return this.findById(userId);
  },

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
         u.profile_picture_url,
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

  async findAll({ availabilityStatus, expertiseArea, limit = 20, offset = 0 } = {}) {
    const conditions = ["u.account_status != 'deleted'"];
    const params     = [];

    if (availabilityStatus) {
      params.push(availabilityStatus);
      conditions.push(`ep.availability_status = $${params.length}`);
    }

    if (expertiseArea) {
      params.push(expertiseArea);
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

  // UPDATE

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

  // DELETE

  async delete(userId) {
    const { rows } = await query(
      'DELETE FROM expert_profiles WHERE user_id = $1 RETURNING *',
      [userId]
    );
    return rows[0] || null;
  },

  // HELPERS

  VALID_AVAILABILITY,
};

module.exports = ExpertProfileModel;
