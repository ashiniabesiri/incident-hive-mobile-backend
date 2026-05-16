
const { query, withTransaction } = require('../config/database');

const VALID_TYPES = [
  'Phishing', 'Ransomware', 'Data Breach',
  'Account Compromise', 'DDoS', 'Social Engineering', 'Other',
];
const VALID_STATUSES = ['Open', 'In Progress', 'Completed', 'Cancelled'];

const IncidentModel = {

  // CREATE

  async create({ reporterId, incidentType, title, description, budget = null, currency = 'LKR', isAnonymous = false }) {
    const sql = `
      INSERT INTO incidents
        (reporter_id, incident_type, title, description, budget, currency, is_anonymous)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        incident_id, reporter_id, incident_type, title, description,
        budget, currency, is_anonymous, status, bid_window_ends_at, created_at, updated_at
    `;
    const { rows } = await query(sql, [
      reporterId,
      incidentType,
      title,
      description,
      budget,
      currency,
      isAnonymous,
    ]);
    return rows[0];
  },

  // READ

  async findById(incidentId) {
    const { rows } = await query(
      `SELECT *
       FROM incidents
       WHERE incident_id = $1
         AND deleted_at IS NULL`,
      [incidentId]
    );
    return rows[0] || null;
  },

  async findByIdWithReporter(incidentId) {
    const { rows } = await query(
      `SELECT
         i.*,
         CASE WHEN i.is_anonymous THEN NULL ELSE u.first_name END AS reporter_first_name,
         CASE WHEN i.is_anonymous THEN NULL ELSE u.last_name  END AS reporter_last_name,
         CASE WHEN i.is_anonymous THEN NULL ELSE u.email      END AS reporter_email
       FROM incidents i
       LEFT JOIN users u ON u.user_id = i.reporter_id
       WHERE i.incident_id = $1
         AND i.deleted_at IS NULL`,
      [incidentId]
    );
    return rows[0] || null;
  },

  async findByReporter(reporterId, { limit = 20, offset = 0 } = {}) {
    const { rows } = await query(
      `SELECT *
       FROM incidents
       WHERE reporter_id = $1
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [reporterId, limit, offset]
    );
    return rows;
  },

  async findAll({ status, incidentType, limit = 20, offset = 0 } = {}) {
    const conditions = ['deleted_at IS NULL'];
    const params     = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (incidentType) {
      params.push(incidentType);
      conditions.push(`incident_type = $${params.length}`);
    }

    params.push(limit, offset);

    const { rows } = await query(
      `SELECT *
       FROM incidents
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  },

  async countAll({ status, incidentType } = {}) {
    const conditions = ['deleted_at IS NULL'];
    const params     = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (incidentType) {
      params.push(incidentType);
      conditions.push(`incident_type = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT COUNT(*)::int AS total
       FROM incidents
       WHERE ${conditions.join(' AND ')}`,
      params
    );
    return rows[0].total;
  },

  // UPDATE

  async update(incidentId, fields) {
    const allowed = {
      title:         'title',
      description:   'description',
      budget:        'budget',
      currency:      'currency',
      incidentType:  'incident_type',
      isAnonymous:   'is_anonymous',
      status:        'status',
    };

    const setClauses = [];
    const params     = [];

    for (const [jsKey, dbCol] of Object.entries(allowed)) {
      if (fields[jsKey] !== undefined) {
        params.push(fields[jsKey]);
        setClauses.push(`${dbCol} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) return this.findById(incidentId);

    // Always update the timestamp
    setClauses.push('updated_at = NOW()');

    params.push(incidentId);

    const { rows } = await query(
      `UPDATE incidents
       SET ${setClauses.join(', ')}
       WHERE incident_id = $${params.length}
         AND deleted_at IS NULL
       RETURNING *`,
      params
    );
    return rows[0] || null;
  },

  async updateStatus(incidentId, status) {
    const { rows } = await query(
      `UPDATE incidents
       SET status = $1, updated_at = NOW()
       WHERE incident_id = $2
         AND deleted_at IS NULL
       RETURNING incident_id, status, updated_at`,
      [status, incidentId]
    );
    return rows[0] || null;
  },

  // DELETE

  async softDelete(incidentId) {
    const { rows } = await query(
      `UPDATE incidents
       SET deleted_at = NOW(), updated_at = NOW(), status = 'Cancelled'
       WHERE incident_id = $1
         AND deleted_at IS NULL
       RETURNING incident_id, status, deleted_at`,
      [incidentId]
    );
    return rows[0] || null;
  },

  // HELPERS

  VALID_TYPES,
  VALID_STATUSES,
};

module.exports = IncidentModel;
