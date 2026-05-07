/**
 * models/User.js
 * All PostgreSQL queries relating to the users table.
 * No business logic here — controllers/services handle that.
 */

const { query, withTransaction } = require('../config/database');

const UserModel = {
  // ─── Create ───────────────────────────────────────────────────────────────

  /**
   * Insert a new user row.
   * @returns {Object} The newly created user row.
   */
  async create({ email, passwordHash, firstName, lastName, phoneNumber, role = 'reporter' }) {
    const sql = `
      INSERT INTO users (email, password_hash, first_name, last_name, phone_number, role)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING user_id, email, first_name, last_name, phone_number, role,
                mfa_enabled, email_verified, account_status, created_at
    `;
    const { rows } = await query(sql, [email, passwordHash, firstName, lastName, phoneNumber, role]);
    return rows[0];
  },

  // ─── Read ─────────────────────────────────────────────────────────────────

  /**
   * Find a user by their email address (case-insensitive).
   * Returns the full row including password_hash (needed for login).
   */
  async findByEmail(email) {
    const { rows } = await query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND account_status != $2',
      [email, 'deleted']
    );
    return rows[0] || null;
  },

  /**
   * Find a user by their UUID.
   * Excludes deleted accounts.
   */
  async findById(userId) {
    const { rows } = await query(
      'SELECT * FROM users WHERE user_id = $1 AND account_status != $2',
      [userId, 'deleted']
    );
    return rows[0] || null;
  },

  /**
   * Return a safe public profile (no password_hash).
   */
  async findPublicById(userId) {
    const { rows } = await query(
      `SELECT user_id, email, first_name, last_name, phone_number, role,
              mfa_enabled, email_verified, account_status, last_login_at, created_at
       FROM users
       WHERE user_id = $1 AND account_status != 'deleted'`,
      [userId]
    );
    return rows[0] || null;
  },

  // ─── Update ───────────────────────────────────────────────────────────────

  /**
   * Mark the user's email as verified.
   */
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

  /**
   * Update the password hash (change-password flow).
   */
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

  /**
   * Record the last login timestamp.
   */
  async updateLastLogin(userId) {
    await query(
      'UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE user_id = $1',
      [userId]
    );
  },

  /**
   * Enable MFA and store the secret for the user.
   */
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

  /**
   * Disable MFA and clear the secret.
   */
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

  // ─── Delete / GDPR ────────────────────────────────────────────────────────

  /**
   * Anonymise user data (GDPR Right to Erasure).
   * - Replaces PII with placeholder values
   * - Sets account_status = 'deleted'
   * - Records the deletion timestamp
   *
   * The user row is retained (not hard-deleted) to preserve foreign key
   * integrity with incident reports. All PII is overwritten.
   */
  async anonymise(userId) {
    const timestamp = Date.now();
    const anonymisedEmail = `deleted_${timestamp}@deleted.invalid`;

    const { rows } = await withTransaction(async (client) => {
      return client.query(
        `UPDATE users
         SET
           email          = $1,
           password_hash  = 'REDACTED',
           first_name     = 'Deleted',
           last_name      = 'User',
           phone_number   = NULL,
           mfa_secret     = NULL,
           mfa_enabled    = false,
           account_status = 'deleted',
           deleted_at     = NOW(),
           updated_at     = NOW()
         WHERE user_id = $2
         RETURNING user_id, account_status, deleted_at`,
        [anonymisedEmail, userId]
      );
    });

    return rows[0] || null;
  },
};

module.exports = UserModel;
