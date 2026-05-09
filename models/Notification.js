/**
 * models/Notification.js
 * All PostgreSQL queries for the `notifications` table.
 *
 * DDL:
 *
 *   CREATE TABLE notifications (
 *     notification_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
 *     user_id          UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
 *     type             VARCHAR(50) NOT NULL
 *                      CHECK (type IN (
 *                        'NEW_BID','BID_ACCEPTED','BID_DECLINED','INCIDENT_UPDATE'
 *                      )),
 *     title            VARCHAR(100) NOT NULL,
 *     body             TEXT         NOT NULL,
 *     reference_id     UUID,        -- optional deep-link target (incident_id, bid_id, etc.)
 *     is_read          BOOLEAN      NOT NULL DEFAULT false,
 *     created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
 *   );
 *
 *   CREATE INDEX idx_notifications_user_id  ON notifications(user_id);
 *   CREATE INDEX idx_notifications_is_read  ON notifications(user_id, is_read);
 *   CREATE INDEX idx_notifications_type     ON notifications(type);
 */

const { query } = require('../config/database');

const VALID_TYPES = [
  'NEW_BID',
  'BID_ACCEPTED',
  'BID_DECLINED',
  'INCIDENT_UPDATE',
];

const NotificationModel = {

  // ──────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * create
   * Insert a single notification for one user.
   *
   * @param {Object}      params
   * @param {string}      params.userId       UUID of the recipient
   * @param {string}      params.type         One of VALID_TYPES
   * @param {string}      params.title        Short display title (max 100 chars)
   * @param {string}      params.body         Full notification body text
   * @param {string|null} [params.referenceId] Optional UUID for deep-linking
   *                                           (e.g. incident_id or bid_id)
   * @returns {Object} Created notification row
   */
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

  /**
   * createBulk
   * Insert the same notification for multiple users in one statement.
   * Useful for broadcasting INCIDENT_UPDATE to all bidding experts at once.
   *
   * @param {string[]} userIds     Array of recipient UUIDs
   * @param {string}   type        One of VALID_TYPES
   * @param {string}   title       Notification title
   * @param {string}   body        Notification body
   * @param {string}   [referenceId]  Optional deep-link UUID
   * @returns {Object[]} All created rows
   */
  async createBulk(userIds, { type, title, body, referenceId = null }) {
    if (!userIds || userIds.length === 0) return [];

    // Build a multi-row VALUES clause: ($1,$2,$3,$4,$5), ($6,$7,$8,$9,$10), ...
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

  // ──────────────────────────────────────────────────────────────────────────────
  // READ
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * findById
   * Fetch a single notification by its UUID.
   *
   * @param {string} notificationId  UUID
   * @returns {Object|null}
   */
  async findById(notificationId) {
    const { rows } = await query(
      'SELECT * FROM notifications WHERE notification_id = $1',
      [notificationId]
    );
    return rows[0] || null;
  },

  /**
   * findByUser
   * All notifications for a user, newest first.
   * Optionally filter to unread only.
   *
   * @param {string}  userId   UUID
   * @param {Object}  [opts]
   * @param {boolean} [opts.unreadOnly=false]  If true, return only unread notifications
   * @param {number}  [opts.limit=30]
   * @param {number}  [opts.offset=0]
   * @returns {Object[]}
   */
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

  /**
   * countUnread
   * Total number of unread notifications for a user.
   * Used to show a badge count in the mobile app.
   *
   * @param {string} userId  UUID
   * @returns {number}
   */
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

  // ──────────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * markAsRead
   * Mark a single notification as read.
   *
   * @param {string} notificationId  UUID
   * @param {string} userId          UUID — ensures a user can only mark their own
   * @returns {Object|null}
   */
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

  /**
   * markAllAsRead
   * Mark every unread notification for a user as read in one statement.
   * Called when the user opens the notifications screen.
   *
   * @param {string} userId  UUID
   * @returns {number}       Count of rows updated
   */
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

  /**
   * update
   * Generic partial update — exposed for admin use cases (e.g. correcting a
   * notification body). In normal app flows, markAsRead is sufficient.
   *
   * @param {string} notificationId  UUID
   * @param {Object} fields          Any subset of: { title, body, isRead }
   * @returns {Object|null}
   */
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

  // ──────────────────────────────────────────────────────────────────────────────
  // DELETE
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * delete
   * Hard-delete a single notification.
   * Ownership (user_id = $2) is enforced so users can only delete their own.
   *
   * @param {string} notificationId  UUID
   * @param {string} userId          UUID
   * @returns {Object|null} The deleted row, or null if not found / not owned
   */
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

  /**
   * deleteAllByUser
   * Delete all notifications for a user.
   * Called as part of GDPR account deletion cleanup.
   *
   * @param {string} userId  UUID
   * @returns {number} Count of deleted rows
   */
  async deleteAllByUser(userId) {
    const { rowCount } = await query(
      'DELETE FROM notifications WHERE user_id = $1',
      [userId]
    );
    return rowCount;
  },

  // ──────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────────────────────────

  VALID_TYPES,
};

module.exports = NotificationModel;
