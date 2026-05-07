/**
 * models/Attachment.js
 * All PostgreSQL queries for the `attachments` table.
 *
 * Attachments store metadata about files uploaded alongside an incident.
 * The actual file binary lives in object storage (S3, Cloudinary, etc.) —
 * only the URL and metadata are persisted here.
 *
 * DDL:
 *
 *   CREATE TABLE attachments (
 *     attachment_id  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
 *     incident_id    UUID         NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
 *     file_name      VARCHAR(255) NOT NULL,
 *     file_url       TEXT         NOT NULL,
 *     file_size      INTEGER      NOT NULL CHECK (file_size > 0),   -- bytes
 *     mime_type      VARCHAR(100) NOT NULL,
 *     uploaded_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
 *   );
 *
 *   CREATE INDEX idx_attachments_incident_id ON attachments(incident_id);
 */

const { query } = require('../config/database');

// Allowlist of accepted MIME types — enforce in the controller before calling create()
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Text
  'text/plain',
  'text/csv',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB in bytes

const AttachmentModel = {

  // ──────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * create
   * Record a single file attachment after it has been uploaded to object storage.
   *
   * @param {Object} params
   * @param {string} params.incidentId   UUID of the parent incident
   * @param {string} params.fileName     Original filename e.g. "screenshot.png"
   * @param {string} params.fileUrl      Public or signed URL from object storage
   * @param {number} params.fileSize     Size in bytes
   * @param {string} params.mimeType     MIME type e.g. "image/png"
   * @returns {Object} Created attachment row
   */
  async create({ incidentId, fileName, fileUrl, fileSize, mimeType }) {
    const sql = `
      INSERT INTO attachments
        (incident_id, file_name, file_url, file_size, mime_type)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const { rows } = await query(sql, [
      incidentId,
      fileName,
      fileUrl,
      fileSize,
      mimeType,
    ]);
    return rows[0];
  },

  /**
   * createBulk
   * Record multiple attachments for the same incident in one INSERT.
   * All files must belong to the same incident_id.
   *
   * @param {string}   incidentId    UUID of the parent incident
   * @param {Object[]} files         Array of { fileName, fileUrl, fileSize, mimeType }
   * @returns {Object[]} All created rows
   */
  async createBulk(incidentId, files) {
    if (!files || files.length === 0) return [];

    const params    = [];
    const valueSets = files.map(({ fileName, fileUrl, fileSize, mimeType }) => {
      const base = params.length;
      params.push(incidentId, fileName, fileUrl, fileSize, mimeType);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });

    const { rows } = await query(
      `INSERT INTO attachments (incident_id, file_name, file_url, file_size, mime_type)
       VALUES ${valueSets.join(', ')}
       RETURNING *`,
      params
    );
    return rows;
  },

  // ──────────────────────────────────────────────────────────────────────────────
  // READ
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * findById
   * Fetch a single attachment by its UUID.
   *
   * @param {string} attachmentId  UUID
   * @returns {Object|null}
   */
  async findById(attachmentId) {
    const { rows } = await query(
      'SELECT * FROM attachments WHERE attachment_id = $1',
      [attachmentId]
    );
    return rows[0] || null;
  },

  /**
   * findByIncident
   * All attachments belonging to a specific incident, ordered oldest first
   * (insertion order — the order in which files were uploaded).
   *
   * @param {string} incidentId  UUID
   * @returns {Object[]}
   */
  async findByIncident(incidentId) {
    const { rows } = await query(
      `SELECT *
       FROM attachments
       WHERE incident_id = $1
       ORDER BY uploaded_at ASC`,
      [incidentId]
    );
    return rows;
  },

  /**
   * findByUser
   * All attachments across every incident submitted by a specific reporter.
   * Useful for a "my files" view or storage quota checks.
   *
   * @param {string} reporterId  UUID
   * @param {Object} [opts]
   * @param {number} [opts.limit=50]
   * @param {number} [opts.offset=0]
   * @returns {Object[]}
   */
  async findByUser(reporterId, { limit = 50, offset = 0 } = {}) {
    const { rows } = await query(
      `SELECT
         a.*,
         i.title          AS incident_title,
         i.incident_type  AS incident_type
       FROM attachments a
       JOIN incidents i ON i.incident_id = a.incident_id
       WHERE i.reporter_id = $1
         AND i.deleted_at IS NULL
       ORDER BY a.uploaded_at DESC
       LIMIT $2 OFFSET $3`,
      [reporterId, limit, offset]
    );
    return rows;
  },

  /**
   * update
   * Update mutable fields on an attachment.
   * In practice, only file_name is ever changed after upload
   * (the URL and size are immutable once stored in object storage).
   *
   * @param {string} attachmentId  UUID
   * @param {Object} fields        Any subset of: { fileName, fileUrl }
   * @returns {Object|null}
   */
  async update(attachmentId, fields) {
    const allowed = {
      fileName: 'file_name',
      fileUrl:  'file_url',
    };

    const setClauses = [];
    const params     = [];

    for (const [jsKey, dbCol] of Object.entries(allowed)) {
      if (fields[jsKey] !== undefined) {
        params.push(fields[jsKey]);
        setClauses.push(`${dbCol} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) return this.findById(attachmentId);

    params.push(attachmentId);

    const { rows } = await query(
      `UPDATE attachments
       SET ${setClauses.join(', ')}
       WHERE attachment_id = $${params.length}
       RETURNING *`,
      params
    );
    return rows[0] || null;
  },

  // ──────────────────────────────────────────────────────────────────────────────
  // DELETE
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * delete
   * Hard-delete a single attachment record.
   * NOTE: The caller is responsible for also deleting the file from object storage
   *       (S3 DeleteObject, Cloudinary destroy, etc.) — this method only removes
   *       the database row.
   *
   * @param {string} attachmentId  UUID
   * @returns {Object|null} The deleted row (contains file_url for storage cleanup)
   */
  async delete(attachmentId) {
    const { rows } = await query(
      'DELETE FROM attachments WHERE attachment_id = $1 RETURNING *',
      [attachmentId]
    );
    return rows[0] || null;
  },

  /**
   * deleteByIncident
   * Delete all attachments for a given incident.
   * Called when an incident is hard-deleted or during cleanup.
   * Returns all deleted rows so the caller can clean up object storage.
   *
   * @param {string} incidentId  UUID
   * @returns {Object[]} All deleted rows (each has file_url for storage cleanup)
   */
  async deleteByIncident(incidentId) {
    const { rows } = await query(
      'DELETE FROM attachments WHERE incident_id = $1 RETURNING *',
      [incidentId]
    );
    return rows;
  },

  // ──────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * getTotalSizeByIncident
   * Sum of file_size (bytes) for all attachments on an incident.
   * Useful for enforcing per-incident storage limits.
   *
   * @param {string} incidentId  UUID
   * @returns {number} Total bytes used
   */
  async getTotalSizeByIncident(incidentId) {
    const { rows } = await query(
      `SELECT COALESCE(SUM(file_size), 0)::int AS total_bytes
       FROM attachments
       WHERE incident_id = $1`,
      [incidentId]
    );
    return rows[0].total_bytes;
  },

  /**
   * countByIncident
   * Number of attachments on a given incident.
   * Use to enforce a max-files-per-incident limit before calling create().
   *
   * @param {string} incidentId  UUID
   * @returns {number}
   */
  async countByIncident(incidentId) {
    const { rows } = await query(
      'SELECT COUNT(*)::int AS total FROM attachments WHERE incident_id = $1',
      [incidentId]
    );
    return rows[0].total;
  },

  /** Allowlist and size cap exported for controller-level validation */
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
};

module.exports = AttachmentModel;
