
const { query } = require('../config/database');

const VALID_TYPES = [
  'NEW_BID',
  'BID_ACCEPTED',
  'BID_DECLINED',
  'INCIDENT_UPDATE',
];

const NotificationModel = {

  // CREATE

  async create({ userId, type, title, body, referenceId = null }) {
    const sql = `
      INSERT INTO notifications
        (user_id, type, title, body, reference_id)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const { rows } = await query(sql, [userId, type, title, body, referenceId]);
    return rows[0];
  },

  async createBulk(userIds, { type, title, body, referenceId = null }) {
    if (!userIds || userIds.length === 0) return [];

    const params      = [];
    const valueSets   = userIds.map((userId) => {
      const base = params.length;
      params.push(userId, type, title, body, referenceId);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });

    const { rows } = await query(
      `INSERT INTO notifications (user_id, type, title, body, reference_id)
       VALUES ${valueSets.join(', ')}
       RETURNING *`,
      params
    );
    return rows;
  },

  // READ

  async findById(notificationId) {
    const { rows } = await query(
      'SELECT * FROM notifications WHERE notification_id = $1',
      [notificationId]
    );
    return rows[0] || null;
  },

  async findByUser(userId, { unreadOnly = false, limit = 30, offset = 0 } = {}) {
    const conditions = ['user_id = $1'];
    const params     = [userId];

    if (unreadOnly) {
      conditions.push('is_read = false');
    }

    params.push(limit, offset);

    const { rows } = await query(
      `SELECT *
       FROM notifications
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  },

  async countUnread(userId) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total
       FROM notifications
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    return rows[0].total;
  },

  async countByUser(userId, { unreadOnly = false } = {}) {
    const conditions = ['user_id = $1'];
    if (unreadOnly) conditions.push('is_read = false');
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total FROM notifications WHERE ${conditions.join(' AND ')}`,
      [userId]
    );
    return rows[0].total;
  },

  // UPDATE

  async markAsRead(notificationId, userId) {
    const { rows } = await query(
      `UPDATE notifications
       SET is_read = true
       WHERE notification_id = $1
         AND user_id = $2
       RETURNING *`,
      [notificationId, userId]
    );
    return rows[0] || null;
  },

  async markAllAsRead(userId) {
    const { rowCount } = await query(
      `UPDATE notifications
       SET is_read = true
       WHERE user_id = $1
         AND is_read = false`,
      [userId]
    );
    return rowCount;
  },

  async update(notificationId, fields) {
    const allowed = {
      title:  'title',
      body:   'body',
      isRead: 'is_read',
    };

    const setClauses = [];
    const params     = [];

    for (const [jsKey, dbCol] of Object.entries(allowed)) {
      if (fields[jsKey] !== undefined) {
        params.push(fields[jsKey]);
        setClauses.push(`${dbCol} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) return this.findById(notificationId);

    params.push(notificationId);

    const { rows } = await query(
      `UPDATE notifications
       SET ${setClauses.join(', ')}
       WHERE notification_id = $${params.length}
       RETURNING *`,
      params
    );
    return rows[0] || null;
  },

  // DELETE

  async delete(notificationId, userId) {
    const { rows } = await query(
      `DELETE FROM notifications
       WHERE notification_id = $1
         AND user_id = $2
       RETURNING *`,
      [notificationId, userId]
    );
    return rows[0] || null;
  },

  async deleteAllByUser(userId) {
    const { rowCount } = await query(
      'DELETE FROM notifications WHERE user_id = $1',
      [userId]
    );
    return rowCount;
  },

  // HELPERS

  VALID_TYPES,
};

module.exports = NotificationModel;
