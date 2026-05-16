
const { query } = require('../config/database');

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

  // CREATE

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

  // READ

  async findById(attachmentId) {
    const { rows } = await query(
      'SELECT * FROM attachments WHERE attachment_id = $1',
      [attachmentId]
    );
    return rows[0] || null;
  },

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

  // DELETE

  async delete(attachmentId) {
    const { rows } = await query(
      'DELETE FROM attachments WHERE attachment_id = $1 RETURNING *',
      [attachmentId]
    );
    return rows[0] || null;
  },

  async deleteByIncident(incidentId) {
    const { rows } = await query(
      'DELETE FROM attachments WHERE incident_id = $1 RETURNING *',
      [incidentId]
    );
    return rows;
  },

  // HELPERS

  async getTotalSizeByIncident(incidentId) {
    const { rows } = await query(
      `SELECT COALESCE(SUM(file_size), 0)::int AS total_bytes
       FROM attachments
       WHERE incident_id = $1`,
      [incidentId]
    );
    return rows[0].total_bytes;
  },

  async countByIncident(incidentId) {
    const { rows } = await query(
      'SELECT COUNT(*)::int AS total FROM attachments WHERE incident_id = $1',
      [incidentId]
    );
    return rows[0].total;
  },

  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
};

module.exports = AttachmentModel;
