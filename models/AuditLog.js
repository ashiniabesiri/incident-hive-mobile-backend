const { query } = require('../config/database');

const AuditLogModel = {
  async create({ userId, action, resourceType, resourceId, method, path, statusCode, ipAddress, userAgent, details }) {
    const { rows } = await query(
      `INSERT INTO audit_logs
         (user_id, action, resource_type, resource_id, method, path, status_code, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [userId || null, action, resourceType, resourceId || null, method, path, statusCode || null, ipAddress || null, userAgent || null, details ? JSON.stringify(details) : null]
    );
    return rows[0];
  },

  async findAll({ userId, action, resourceType, resourceId, startDate, endDate, page = 1, limit = 50 }) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (userId) {
      conditions.push(`user_id = $${idx++}`);
      params.push(userId);
    }
    if (action) {
      conditions.push(`action = $${idx++}`);
      params.push(action);
    }
    if (resourceType) {
      conditions.push(`resource_type = $${idx++}`);
      params.push(resourceType);
    }
    if (resourceId) {
      conditions.push(`resource_id = $${idx++}`);
      params.push(resourceId);
    }
    if (startDate) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(endDate);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countQuery = `SELECT COUNT(*)::int AS total FROM audit_logs ${where}`;
    const dataQuery = `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;

    const [countResult, dataResult] = await Promise.all([
      query(countQuery, params),
      query(dataQuery, [...params, limit, offset]),
    ]);

    const total = countResult.rows[0].total;

    return {
      logs: dataResult.rows,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  },
};

module.exports = AuditLogModel;
