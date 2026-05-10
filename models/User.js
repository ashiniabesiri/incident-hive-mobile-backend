/**
 * models/User.js
 * All PostgreSQL queries relating to the `users` table.
 */

const { query, withTransaction } = require('../config/database');

const UserModel = {
  // ──────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ──────────────────────────────────────────────────────────────────────────────

  async create({ email, passwordHash, firstName, lastName, phoneNumber, role = 'reporter', profilePictureUrl = null }) {
    const sql = `
      INSERT INTO users
        (email, password_hash, first_name, last_name, phone_number, role, profile_picture_url)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        user_id, email, first_name, last_name, phone_number,
        profile_picture_url, role, mfa_enabled, email_verified,
        account_status, created_at
    `;

    const { rows } = await query(sql, [
      email.toLowerCase().trim(),
      passwordHash,
      firstName.trim(),
      lastName.trim(),
      phoneNumber,
      role,
      profilePictureUrl,
    ]);

    return rows[0];
  },

  // ──────────────────────────────────────────────────────────────────────────────
  // READ
  // ──────────────────────────────────────────────────────────────────────────────

  async findByEmail(email) {
    const { rows } = await query(
      `SELECT *
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND account_status != 'deleted'`,
      [email]
    );

    return rows[0] || null;
  },

  async findById(userId) {
    const { rows } = await query(
      `SELECT *
       FROM users
       WHERE user_id = $1
         AND account_status != 'deleted'`,
      [userId]
    );

    return rows[0] || null;
  },

  async findPublicById(userId) {
    const { rows } = await query(
      `SELECT
         user_id, email, first_name, last_name, phone_number,
         profile_picture_url,
         role, mfa_enabled, email_verified, account_status,
         last_login_at, created_at
       FROM users
       WHERE user_id = $1
         AND account_status != 'deleted'`,
      [userId]
    );

    return rows[0] || null;
  },

  async findAll({ role, accountStatus, search, limit = 20, offset = 0 } = {}) {
    const conditions = ["account_status != 'deleted'"];
    const params = [];

    if (role) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }
    if (accountStatus) {
      params.push(accountStatus);
      conditions.push(`account_status = $${params.length}`);
    }
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(
        `(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR email ILIKE $${params.length})`
      );
    }

    const whereClause = conditions.join(' AND ');
    params.push(limit, offset);

    const dataSQL = `
      SELECT user_id, email, first_name, last_name, phone_number,
             role, email_verified, account_status, mfa_enabled,
             last_login_at, created_at
      FROM users
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const countParams = params.slice(0, params.length - 2);
    const countSQL = `SELECT COUNT(*)::int AS total FROM users WHERE ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      query(dataSQL, params),
      query(countSQL, countParams),
    ]);

    return {
      users: dataResult.rows,
      total: countResult.rows[0].total,
    };
  },

  // ──────────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ──────────────────────────────────────────────────────────────────────────────

  async markEmailVerified(email) {
    const { rows } = await query(
      `UPDATE users
       SET email_verified = true, updated_at = NOW()
       WHERE LOWER(email) = LOWER($1)
       RETURNING user_id, email, email_verified`,
      [email]
    );

    return rows[0] || null;
  },

  async updatePassword(userId, newPasswordHash) {
    const { rows } = await query(
      `UPDATE users
       SET password_hash = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING user_id`,
      [newPasswordHash, userId]
    );

    return rows[0] || null;
  },

  async updateLastLogin(userId) {
    await query(
      `UPDATE users
       SET last_login_at = NOW(), updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );
  },

  async enableMfa(userId, mfaSecret) {
    const { rows } = await query(
      `UPDATE users
       SET mfa_enabled = true, mfa_secret = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING user_id, mfa_enabled`,
      [mfaSecret, userId]
    );

    return rows[0] || null;
  },

  async disableMfa(userId) {
    const { rows } = await query(
      `UPDATE users
       SET mfa_enabled = false, mfa_secret = NULL, updated_at = NOW()
       WHERE user_id = $1
       RETURNING user_id, mfa_enabled`,
      [userId]
    );

    return rows[0] || null;
  },

  async updateAccountStatus(userId, status) {
    const { rows } = await query(
      `UPDATE users
       SET account_status = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING user_id, account_status`,
      [status, userId]
    );

    return rows[0] || null;
  },

  async updateProfile(userId, { firstName, lastName, phoneNumber }) {
    const { rows } = await query(
      `UPDATE users
       SET
         first_name = COALESCE($1, first_name),
         last_name = COALESCE($2, last_name),
         phone_number = COALESCE($3, phone_number),
         updated_at = NOW()
       WHERE user_id = $4
         AND account_status != 'deleted'
       RETURNING
         user_id, email, first_name, last_name, phone_number,
         profile_picture_url, role, mfa_enabled, email_verified,
         account_status, created_at`,
      [firstName, lastName, phoneNumber, userId]
    );

    return rows[0] || null;
  },

  async updateProfilePicture(userId, profilePictureUrl) {
    const { rows } = await query(
      `UPDATE users
       SET profile_picture_url = $1, updated_at = NOW()
       WHERE user_id = $2
         AND account_status != 'deleted'
       RETURNING user_id, profile_picture_url`,
      [profilePictureUrl, userId]
    );

    return rows[0] || null;
  },

  // ──────────────────────────────────────────────────────────────────────────────
  // DELETE / GDPR
  // ──────────────────────────────────────────────────────────────────────────────

  async anonymise(userId) {
    const placeholderEmail = `deleted_${Date.now()}_${userId.slice(0, 8)}@deleted.invalid`;

    const result = await withTransaction(async (client) => {
      return client.query(
        `UPDATE users
         SET
           email               = $1,
           password_hash       = 'REDACTED',
           first_name          = 'Deleted',
           last_name           = 'User',
           phone_number        = NULL,
           profile_picture_url = NULL,
           mfa_secret          = NULL,
           mfa_enabled         = false,
           account_status      = 'deleted',
           deleted_at          = NOW(),
           updated_at          = NOW()
         WHERE user_id = $2
         RETURNING user_id, account_status, deleted_at`,
        [placeholderEmail, userId]
      );
    });

    return result.rows[0] || null;
  },
};

module.exports = UserModel;