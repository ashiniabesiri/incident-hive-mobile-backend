
const { query, withTransaction } = require('../config/database');

const UserModel = {
  // Create

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

  // Read

  async findByEmail(email) {
    const { rows } = await query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND account_status != $2',
      [email, 'deleted']
    );
    return rows[0] || null;
  },

  async findById(userId) {
    const { rows } = await query(
      'SELECT * FROM users WHERE user_id = $1 AND account_status != $2',
      [userId, 'deleted']
    );
    return rows[0] || null;
  },

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

  // Update

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
      'UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE user_id = $1',
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

  // Delete / GDPR

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
