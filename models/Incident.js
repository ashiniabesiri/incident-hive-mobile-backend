/**
 * models/Incident.js
 * All PostgreSQL queries for the `incidents` table.
 *
 * DDL (run via runMigrations or a migration tool):
 *
 *   CREATE TABLE incidents (
 *     incident_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
 *     reporter_id      UUID         NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
 *     incident_type    VARCHAR(50)  NOT NULL
 *                      CHECK (incident_type IN (
 *                        'Phishing','Ransomware','Data Breach',
 *                        'Account Compromise','DDoS','Social Engineering','Other'
 *                      )),
 *     title            VARCHAR(150) NOT NULL,
 *     description      TEXT         NOT NULL,
 *     budget           DECIMAL(10,2),
 *     currency         VARCHAR(10)  NOT NULL DEFAULT 'LKR',
 *     is_anonymous     BOOLEAN      NOT NULL DEFAULT false,
 *     status           VARCHAR(20)  NOT NULL DEFAULT 'Open'
 *                      CHECK (status IN ('Open','In Progress','Completed','Cancelled')),
 *     bid_window_ends_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
 *     created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
 *     updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
 *     deleted_at       TIMESTAMPTZ
 *   );
 *
 *   CREATE INDEX idx_incidents_reporter_id ON incidents(reporter_id);
 *   CREATE INDEX idx_incidents_status      ON incidents(status);
 *   CREATE INDEX idx_incidents_type        ON incidents(incident_type);
 */

const { query, withTransaction } = require('../config/database');

// Valid enum values — used for update validation before hitting the DB
const VALID_TYPES = [
  'Phishing', 'Ransomware', 'Data Breach',
  'Account Compromise', 'DDoS', 'Social Engineering', 'Other',
];
const VALID_STATUSES = ['Open', 'In Progress', 'Completed', 'Cancelled'];

const IncidentModel = {

  // ──────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * create
   * Insert a new incident row.
   * bid_window_ends_at defaults to 7 days after creation in the DB,
   * but can be overridden by the caller if needed.
   *
   * @param {Object}  params
   * @param {string}  params.reporterId     UUID of the reporting user
   * @param {string}  params.incidentType   One of VALID_TYPES
   * @param {string}  params.title          Max 150 chars
   * @param {string}  params.description    Max 5000 chars
   * @param {number}  [params.budget]       Decimal value, nullable
   * @param {boolean} [params.isAnonymous]  Default false
   * @returns {Object} Created incident row
   */
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

  // ──────────────────────────────────────────────────────────────────────────────
  // READ
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * findById
   * Fetch a single incident by its UUID.
   * Excludes soft-deleted records.
   *
   * @param {string} incidentId  UUID
   * @returns {Object|null}
   */
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

  /**
   * findByIdWithReporter
   * Same as findById but JOINs the reporter's public profile.
   * If the incident is marked anonymous, reporter fields are masked.
   *
   * @param {string} incidentId  UUID
   * @returns {Object|null}
   */
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

  /**
   * findByReporter
   * All incidents submitted by a specific user (own incidents dashboard).
   * Ordered newest first. Excludes soft-deleted rows.
   *
   * @param {string} reporterId  UUID
   * @param {Object} [opts]
   * @param {number} [opts.limit=20]
   * @param {number} [opts.offset=0]
   * @returns {Object[]}
   */
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

  /**
   * findAll
   * Paginated list of all non-deleted incidents.
   * Supports optional filtering by status and/or incident_type.
   *
   * @param {Object} [opts]
   * @param {string} [opts.status]        Filter by status
   * @param {string} [opts.incidentType]  Filter by incident_type
   * @param {number} [opts.limit=20]
   * @param {number} [opts.offset=0]
   * @returns {Object[]}
   */
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

  /**
   * countAll
   * Total count matching the same filters as findAll — used for pagination metadata.
   *
   * @param {Object} [opts]
   * @param {string} [opts.status]
   * @param {string} [opts.incidentType]
   * @returns {number}
   */
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

  // ──────────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * update
   * Partially update an incident's editable fields.
   * Only non-undefined values in `fields` are applied — unset keys are ignored.
   * updated_at is always refreshed.
   *
   * @param {string} incidentId  UUID
   * @param {Object} fields      Any subset of: { title, description, budget,
   *                               incidentType, isAnonymous, status }
   * @returns {Object|null}      Updated row, or null if not found / deleted
   */
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

  /**
   * updateStatus
   * Convenience wrapper — update only the status column.
   *
   * @param {string} incidentId  UUID
   * @param {string} status      One of VALID_STATUSES
   * @returns {Object|null}
   */
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

  // ──────────────────────────────────────────────────────────────────────────────
  // DELETE
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * softDelete
   * Marks the incident as deleted without removing the row.
   * Preserves bid and audit history.
   *
   * @param {string} incidentId  UUID
   * @returns {Object|null}      { incident_id, deleted_at } or null if not found
   */
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

  // ──────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────────────────────────

  /** Enum lists exposed for controller-level validation */
  VALID_TYPES,
  VALID_STATUSES,
};

module.exports = IncidentModel;
