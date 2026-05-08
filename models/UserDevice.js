/**
 * models/UserDevice.js
 * Database queries for user_devices table.
 */

const { query } = require('../config/database');

const UserDeviceModel = {
  async upsertDevice({ deviceId, userId, deviceName = null, biometricEnabled = false }) {
    const { rows } = await query(
      `INSERT INTO user_devices
         (device_id, user_id, device_name, biometric_enabled, last_used_at)
       VALUES
         ($1, $2, $3, $4, NOW())
       ON CONFLICT (device_id)
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         device_name = COALESCE(EXCLUDED.device_name, user_devices.device_name),
         biometric_enabled = EXCLUDED.biometric_enabled,
         last_used_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [deviceId, userId, deviceName, biometricEnabled]
    );

    return rows[0];
  },

  async findByDeviceId(deviceId) {
    const { rows } = await query(
      `SELECT *
       FROM user_devices
       WHERE device_id = $1`,
      [deviceId]
    );

    return rows[0] || null;
  },

  async findByUserAndDevice(userId, deviceId) {
    const { rows } = await query(
      `SELECT *
       FROM user_devices
       WHERE user_id = $1
         AND device_id = $2`,
      [userId, deviceId]
    );

    return rows[0] || null;
  },

  async enableBiometric(userId, deviceId, deviceName = null) {
    const { rows } = await query(
      `INSERT INTO user_devices
         (device_id, user_id, device_name, biometric_enabled, last_used_at)
       VALUES
         ($1, $2, $3, true, NOW())
       ON CONFLICT (device_id)
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         device_name = COALESCE(EXCLUDED.device_name, user_devices.device_name),
         biometric_enabled = true,
         last_used_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [deviceId, userId, deviceName]
    );

    return rows[0];
  },

  async touchDevice(userId, deviceId) {
    const { rows } = await query(
      `UPDATE user_devices
       SET last_used_at = NOW(), updated_at = NOW()
       WHERE user_id = $1
         AND device_id = $2
       RETURNING *`,
      [userId, deviceId]
    );

    return rows[0] || null;
  },
};

module.exports = UserDeviceModel;