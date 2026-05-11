/**
 * controllers/authController.js
 * Handler functions for /api/v1/auth/* endpoints.
 */

const bcrypt = require('bcryptjs');
const Joi = require('joi');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');

const UserModel = require('../models/User');
const UserDeviceModel = require('../models/UserDevice');
const TokenService = require('../services/tokenService');

const {
  sendVerificationEmail,
  sendMfaCode,
  sendPasswordResetEmail,
  sendAccountDeletionEmail,
} = require('../services/emailService');

const {
  generateOtp,
  timingSafeEqual,
  encrypt,
} = require('../utils/encryption');

const { set, get, del } = require('../config/redis');
const logger = require('../utils/logger');

// ─── Constants ────────────────────────────────────────────────────────────────
const SALT_ROUNDS = 10;

const VERIFY_PREFIX  = 'verify:';
const MFA_PREFIX     = 'mfa:';
const PW_RESET_PREFIX = 'pwreset:';

const VERIFY_TTL   = parseInt(process.env.EMAIL_VERIFICATION_TTL_SECONDS || '900', 10);
const MFA_TTL      = parseInt(process.env.MFA_OTP_TTL_SECONDS || '300', 10);
const PW_RESET_TTL = parseInt(process.env.PASSWORD_RESET_TTL_SECONDS || '900', 10);
const { ACCESS_TTL, SESSION_TTL } = TokenService;

// ─── Google OAuth client ──────────────────────────────────────────────────────
const googleAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sendError(res, status, code, message, details = null) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  });
}

function formatUser(user) {
  return {
    userId: user.user_id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
    mfaEnabled: user.mfa_enabled,
    emailVerified: user.email_verified,
    profilePictureUrl: user.profile_picture_url || null,
  };
}

// ─── Register ─────────────────────────────────────────────────────────────────
async function register(req, res, next) {
  try {
    const { email, password, firstName, lastName, phoneNumber, device_id } = req.body;

    const existing = await UserModel.findByEmail(email);

    if (existing) {
      return sendError(
        res,
        409,
        'EMAIL_ALREADY_EXISTS',
        'An account with this email already exists.'
      );
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await UserModel.create({
      email,
      passwordHash,
      firstName,
      lastName,
      phoneNumber,
    });

    // Email verification is not required — mark the account as verified
    // immediately so the user can log in right away.
    await UserModel.markEmailVerified(email);

    const accessToken = TokenService.generateAccessToken({
      userId: user.user_id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = await TokenService.generateRefreshToken(user.user_id, device_id || null);
    await TokenService.touchSession(user.user_id);

    return res.status(201).json({
      success: true,
      data: {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        user_type: user.role,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TTL,
        email_verified: true,
        session_timeout_seconds: SESSION_TTL,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── Verify Email ─────────────────────────────────────────────────────────────
async function verifyEmail(req, res, next) {
  try {
    const { email, verificationCode } = req.body;

    const stored = await get(`${VERIFY_PREFIX}${email}`);

    if (!stored) {
      return sendError(
        res,
        400,
        'VERIFICATION_CODE_EXPIRED',
        'Verification code has expired or was not found. Please request a new one.'
      );
    }

    if (!timingSafeEqual(stored, verificationCode)) {
      return sendError(
        res,
        400,
        'INVALID_VERIFICATION_CODE',
        'Invalid verification code. Please check and try again.'
      );
    }

    const user = await UserModel.markEmailVerified(email);

    if (!user) {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found.');
    }

    await del(`${VERIFY_PREFIX}${email}`);

    return res.status(200).json({
      success: true,
      data: {
        message: 'Email verified successfully. You can now log in.',
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── Resend Verification Email ────────────────────────────────────────────────
async function resendVerification(req, res, next) {
  try {
    const { email } = req.body;

    const user = await UserModel.findByEmail(email);

    // Generic response — do not leak whether the email is registered.
    const genericResponse = {
      success: true,
      data: {
        message:
          'If an account with this email exists and is unverified, a new verification code has been sent.',
      },
    };

    if (!user || user.email_verified) {
      return res.status(200).json(genericResponse);
    }

    const code = generateOtp();
    await set(`${VERIFY_PREFIX}${email}`, code, VERIFY_TTL);

    sendVerificationEmail(email, code, user.first_name).catch((err) =>
      logger.error('Failed to resend verification email:', err)
    );

    return res.status(200).json({
      ...genericResponse,
      data: {
        ...genericResponse.data,
        // Development only: helps testing when SMTP email is not configured.
        ...(process.env.NODE_ENV === 'development' && {
          dev_verification_code: code,
        }),
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function login(req, res, next) {
  try {
    const { email, password, device_id } = req.body;

    const user = await UserModel.findByEmail(email);

    // Valid bcrypt hash used only to reduce timing difference when user not found.
    const fakeHash = await bcrypt.hash('FakePassword@123', SALT_ROUNDS);

    const passwordMatch = await bcrypt.compare(
      password,
      user?.password_hash || fakeHash
    );

    if (!user || !passwordMatch) {
      return sendError(
        res,
        401,
        'INVALID_CREDENTIALS',
        'Invalid email or password.'
      );
    }

    if (user.account_status !== 'active') {
      return sendError(
        res,
        403,
        'ACCOUNT_NOT_ACTIVE',
        'Your account has been suspended. Please contact support.'
      );
    }

    // Look up biometric status for this device
    const device = await UserDeviceModel.findByUserAndDevice(user.user_id, device_id);
    const biometricEnabled = device?.biometric_enabled || false;

    if (user.mfa_enabled) {
      const mfaCode = generateOtp();
      await set(`${MFA_PREFIX}${email}`, mfaCode, MFA_TTL);

      sendMfaCode(email, mfaCode, user.first_name).catch((err) =>
        logger.error('Failed to send MFA code:', err)
      );

      return res.status(200).json({
        success: true,
        data: {
          mfa_required: true,
          message:
            'An MFA code has been sent to your email. Please complete the second step.',

          // Development only: helps testing when SMTP email is not configured.
          ...(process.env.NODE_ENV === 'development' && {
            dev_mfa_code: mfaCode,
          }),
        },
      });
    }

    const accessToken = TokenService.generateAccessToken({
      userId: user.user_id,
      email: user.email,
      role: user.role,
      amr: ['pwd'],
    });

    const refreshToken = await TokenService.generateRefreshToken(user.user_id, device_id);

    await TokenService.touchSession(user.user_id);
    await UserModel.updateLastLogin(user.user_id);

    // Register/touch the device on successful login
    await UserDeviceModel.upsertDevice({
      deviceId: device_id,
      userId: user.user_id,
    });

    return res.status(200).json({
      success: true,
      data: {
        user_id: user.user_id,
        role: user.role,
        user_type: user.role,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TTL,
        biometric_enabled: biometricEnabled,
        mfa_required: false,
        session_timeout_seconds: SESSION_TTL,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── Refresh Token ────────────────────────────────────────────────────────────
async function refreshToken(req, res, next) {
  try {
    const { refresh_token: incomingToken, device_id } = req.body;

    const { userId, deviceId: tokenDeviceId } =
      await TokenService.validateRefreshToken(incomingToken);

    if (tokenDeviceId && tokenDeviceId !== device_id) {
      return sendError(
        res,
        401,
        'DEVICE_MISMATCH',
        'device_id does not match the token.'
      );
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return sendError(res, 401, 'USER_NOT_FOUND', 'User not found.');
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await TokenService.rotateRefreshToken(userId, user.email, user.role, device_id);

    await TokenService.touchSession(userId);

    return res.status(200).json({
      success: true,
      data: {
        access_token: accessToken,
        refresh_token: newRefreshToken,
        token_type: 'Bearer',
        expires_in: TokenService.ACCESS_TTL,
        session_timeout_seconds: TokenService.SESSION_TTL,
      },
    });
  } catch (error) {
    if (error.code === 'TOKEN_REPLAY') {
      return sendError(
        res,
        409,
        'TOKEN_REPLAY',
        error.message
      );
    }

    if (
      error.message.includes('refresh token') ||
      error.message.includes('Token type mismatch')
    ) {
      return sendError(
        res,
        401,
        'INVALID_REFRESH_TOKEN',
        error.message
      );
    }

    return next(error);
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout(req, res, next) {
  try {
    const { refresh_token } = req.body;

    const accessToken = req.headers.authorization?.split(' ')[1];
    await Promise.all([
      TokenService.blacklistAccessToken(accessToken),
      TokenService.blacklistRefreshToken(refresh_token),
    ]);
    await TokenService.revokeAllTokens(req.user.userId);

    return res.status(200).json({
      success: true,
      data: {
        message: 'Logged out successfully.',
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── MFA Setup ────────────────────────────────────────────────────────────────
async function mfaSetup(req, res, next) {
  try {
    const { userId, email } = req.user;

    const code = generateOtp();
    await set(`${MFA_PREFIX}${email}`, code, MFA_TTL);

    const user = await UserModel.findById(userId);

    sendMfaCode(email, code, user?.first_name || 'User').catch((err) =>
      logger.error('Failed to send MFA setup code:', err)
    );

    return res.status(200).json({
      success: true,
      data: {
        message: 'MFA setup initiated. A verification code has been sent to your email.',

        // Development only: helps testing when SMTP email is not configured.
        ...(process.env.NODE_ENV === 'development' && {
          dev_mfa_code: code,
        }),
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── MFA Verify ───────────────────────────────────────────────────────────────
async function mfaVerify(req, res, next) {
  try {
    const { userId, email, role } = req.user;
    const otp_code = req.body.otp_code || req.body.mfa_code;

    const stored = await get(`${MFA_PREFIX}${email}`);

    if (!stored || !timingSafeEqual(stored, otp_code)) {
      return sendError(
        res,
        401,
        'INVALID_MFA_CODE',
        'Invalid or expired OTP.'
      );
    }

    // For email OTP MFA, we store encrypted email as simple secret reference.
    const mfaSecret = encrypt(email);

    await UserModel.enableMfa(userId, mfaSecret);
    await del(`${MFA_PREFIX}${email}`);

    const accessToken = TokenService.generateAccessToken({
      userId,
      email,
      role,
      amr: ['pwd', 'mfa'],
    });
    const refreshToken = await TokenService.generateRefreshToken(userId, req.body.device_id || null);

    return res.status(200).json({
      success: true,
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: TokenService.ACCESS_TTL,
        session_timeout_seconds: TokenService.SESSION_TTL,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── MFA Login ────────────────────────────────────────────────────────────────
async function mfaLogin(req, res, next) {
  try {
    const { email, otp_code, device_id } = req.body;

    const stored = await get(`${MFA_PREFIX}${email}`);

    if (!stored || !timingSafeEqual(stored, otp_code)) {
      return sendError(
        res,
        401,
        'INVALID_MFA_CODE',
        'Invalid or expired MFA code.'
      );
    }

    const user = await UserModel.findByEmail(email);

    if (!user) {
      return sendError(res, 401, 'USER_NOT_FOUND', 'User not found.');
    }

    await del(`${MFA_PREFIX}${email}`);

    const accessToken = TokenService.generateAccessToken({
      userId: user.user_id,
      email: user.email,
      role: user.role,
      amr: ['pwd', 'mfa'],
    });

    const refreshToken = await TokenService.generateRefreshToken(user.user_id, device_id || null);

    await TokenService.touchSession(user.user_id);
    await UserModel.updateLastLogin(user.user_id);

    const mfaDevice = device_id ? await UserDeviceModel.findByUserAndDevice(user.user_id, device_id) : null;

    return res.status(200).json({
      success: true,
      data: {
        user_id: user.user_id,
        role: user.role,
        user_type: user.role,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TTL,
        biometric_enabled: mfaDevice?.biometric_enabled || false,
        mfa_required: false,
        session_timeout_seconds: SESSION_TTL,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── Google Sign-In ───────────────────────────────────────────────────────────
async function googleLogin(req, res, next) {
  try {
    const { idToken, device_id } = req.body;

    let payload;

    try {
      // Accept tokens issued for any of the configured Google client IDs:
      //  • GOOGLE_CLIENT_ID — iOS native client (audience = iOS client ID).
      //  • GOOGLE_WEB_CLIENT_ID — Web/server client used by Android Credential
      //    Manager (audience = Web client ID).
      const audiences = [
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_WEB_CLIENT_ID,
      ].filter(Boolean);

      const ticket = await googleAuthClient.verifyIdToken({
        idToken,
        audience: audiences,
      });

      payload = ticket.getPayload();
    } catch (verifyError) {
      logger.error('Google token verification failed:', verifyError.message);

      return sendError(
        res,
        401,
        'INVALID_GOOGLE_TOKEN',
        'Invalid Google token.'
      );
    }

    const email = payload.email;
    const emailVerified = payload.email_verified;
    const firstName = payload.given_name || 'User';
    const lastName = payload.family_name || '';
    const profilePictureUrl = payload.picture || null;

    if (!email || !emailVerified) {
      return sendError(
        res,
        401,
        'GOOGLE_EMAIL_NOT_VERIFIED',
        'Google email not verified.'
      );
    }

    let user = await UserModel.findByEmail(email);

    if (!user) {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, SALT_ROUNDS);

      user = await UserModel.create({
        email,
        passwordHash,
        firstName,
        lastName,
        phoneNumber: null,
        profilePictureUrl,
      });

      await UserModel.markEmailVerified(email);
      user.email_verified = true;
    } else if (!user.email_verified) {
      await UserModel.markEmailVerified(email);
      user.email_verified = true;
    }

    if (user.account_status && user.account_status !== 'active') {
      return sendError(
        res,
        403,
        'ACCOUNT_NOT_ACTIVE',
        'Your account has been suspended. Please contact support.'
      );
    }

    const accessToken = TokenService.generateAccessToken({
      userId: user.user_id,
      email: user.email,
      role: user.role,
      amr: ['google'],
    });

    const refreshToken = await TokenService.generateRefreshToken(user.user_id, device_id || null);

    await TokenService.touchSession(user.user_id);
    await UserModel.updateLastLogin(user.user_id);

    const googleDevice = device_id ? await UserDeviceModel.findByUserAndDevice(user.user_id, device_id) : null;

    return res.status(200).json({
      success: true,
      data: {
        user_id: user.user_id,
        role: user.role,
        user_type: user.role,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TTL,
        biometric_enabled: googleDevice?.biometric_enabled || false,
        mfa_required: false,
        session_timeout_seconds: SESSION_TTL,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── Change Password ──────────────────────────────────────────────────────────
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const { userId } = req.user;

    const user = await UserModel.findById(userId);

    if (!user) {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found.');
    }

    const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);

    if (!passwordMatch) {
      return sendError(
        res,
        401,
        'CURRENT_PASSWORD_INCORRECT',
        'Current password is incorrect.'
      );
    }

    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await UserModel.updatePassword(userId, newPasswordHash);
    await TokenService.revokeAllTokens(userId);

    return res.status(200).json({
      success: true,
      data: {
        message: 'Password changed successfully. Please log in again with your new password.',
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── Account Deletion ─────────────────────────────────────────────────────────
const deleteAccountSchema = Joi.object({
  password: Joi.string().required(),
  confirm_deletion: Joi.boolean().valid(true).required().messages({
    'any.only': 'confirm_deletion must be true to delete your account.',
  }),
});

async function deleteAccount(req, res, next) {
  try {
    const { error: valError } = deleteAccountSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (valError) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed.',
          details: valError.details.map((d) => d.message.replace(/['"]/g, '')),
        },
      });
    }

    const { userId, email } = req.user;
    const { password } = req.body;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Incorrect password.' },
      });
    }

    sendAccountDeletionEmail(email).catch((err) =>
      logger.error('Failed to send account deletion email:', err)
    );

    await UserModel.anonymise(userId);
    await TokenService.revokeAllTokens(userId);

    return res.status(200).json({
      success: true,
      data: {
        message:
          'Your account and associated personal data have been deleted/anonymised.',
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── Biometric Register / Enroll ──────────────────────────────────────────────
async function biometricRegister(req, res, next) {
  try {
    const { userId } = req.user;
    const { device_id, device_name } = req.body;

    const device = await UserDeviceModel.enableBiometric(
      userId,
      device_id,
      device_name || null
    );

    return res.status(200).json({
      success: true,
      data: {
        device_id: device.device_id,
        biometric_enabled: device.biometric_enabled,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── Biometric Login ──────────────────────────────────────────────────────────
async function biometricLogin(req, res, next) {
  try {
    const { user_id, device_id } = req.body;

    const device = await UserDeviceModel.findByUserAndDevice(user_id, device_id);

    if (!device || !device.biometric_enabled) {
      return sendError(
        res,
        401,
        'BIOMETRIC_NOT_ENABLED',
        'Biometric login is not enabled for this device.'
      );
    }

    const user = await UserModel.findById(user_id);

    if (!user || user.account_status !== 'active') {
      return sendError(
        res,
        401,
        'USER_ACCOUNT_INACTIVE',
        'User account is not active.'
      );
    }

    const accessToken = TokenService.generateAccessToken({
      userId: user.user_id,
      email: user.email,
      role: user.role,
      amr: ['bio'],
    });

    const refreshToken = await TokenService.generateRefreshToken(user.user_id, device_id);

    await TokenService.touchSession(user.user_id);
    await UserDeviceModel.touchDevice(user.user_id, device_id);
    await UserModel.updateLastLogin(user.user_id);

    return res.status(200).json({
      success: true,
      data: {
        user_id: user.user_id,
        role: user.role,
        user_type: user.role,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TTL,
        biometric_enabled: true,
        mfa_required: false,
        session_timeout_seconds: SESSION_TTL,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── Get Profile Legacy Route ─────────────────────────────────────────────────
async function getProfile(req, res, next) {
  try {
    const user = await UserModel.findPublicById(req.user.userId);

    if (!user) {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found.');
    }

    return res.status(200).json({
      success: true,
      data: {
        user: formatUser(user),
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── POST /api/v1/auth/forgot-password ────────────────────────────────────────

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    const user = await UserModel.findByEmail(email);

    if (!user) {
      return res.status(200).json({
        success: true,
        data: {
          message: 'If an account with that email exists, a reset code has been sent.',
        },
      });
    }

    const otp = generateOtp();
    await set(`${PW_RESET_PREFIX}${user.email.toLowerCase()}`, otp, PW_RESET_TTL);

    sendPasswordResetEmail(user.email, otp, user.first_name).catch((err) =>
      logger.error('Password reset email failed:', err)
    );

    return res.status(200).json({
      success: true,
      data: {
        message: 'If an account with that email exists, a reset code has been sent.',
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── POST /api/v1/auth/reset-password ─────────────────────────────────────────

async function resetPassword(req, res, next) {
  try {
    const { email, otp_code, new_password } = req.body;

    const storedOtp = await get(`${PW_RESET_PREFIX}${email.toLowerCase()}`);

    if (!storedOtp) {
      return sendError(res, 400, 'RESET_CODE_EXPIRED', 'Reset code has expired or was not requested.');
    }

    if (!timingSafeEqual(otp_code, storedOtp)) {
      return sendError(res, 400, 'INVALID_RESET_CODE', 'Invalid reset code.');
    }

    const user = await UserModel.findByEmail(email);
    if (!user) {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found.');
    }

    const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);
    await UserModel.updatePassword(user.user_id, newHash);

    await del(`${PW_RESET_PREFIX}${email.toLowerCase()}`);
    await TokenService.revokeAllTokens(user.user_id);

    return res.status(200).json({
      success: true,
      data: {
        message: 'Password has been reset successfully. Please log in with your new password.',
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  refreshToken,
  logout,
  mfaSetup,
  mfaVerify,
  mfaLogin,
  googleLogin,
  changePassword,
  deleteAccount,
  biometricRegister,
  biometricLogin,
  getProfile,
  forgotPassword,
  resetPassword,
};