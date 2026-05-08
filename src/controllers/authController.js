/**
 * controllers/authController.js
 * Handler functions for every /api/auth/* endpoint.
 *
 * Each handler is an async function. Errors bubble up to errorHandler.js
 * via the next(error) convention. Simple client errors use early returns.
 */

const bcrypt = require('bcrypt');

const UserModel   = require('../models/User');
const TokenService = require('../services/tokenService');
const { sendVerificationEmail, sendMfaCode, sendAccountDeletionEmail } = require('../services/emailService');
const { generateOtp, timingSafeEqual, encrypt, decrypt } = require('../utils/encryption');
const { set, get, del } = require('../config/redis');
const logger = require('../utils/logger');

const SALT_ROUNDS      = 10;
const VERIFY_PREFIX    = 'verify:';
const MFA_PREFIX       = 'mfa:';
const BIOMETRIC_PREFIX = 'biometric:';
const VERIFY_TTL       = 15 * 60;  // 15 min
const MFA_TTL          = 15 * 60;  // 15 min
const BIOMETRIC_TTL    = 30 * 24 * 60 * 60; // 30 days

// ─── R001: Register ────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new reporter account
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName, phoneNumber]
 *             properties:
 *               email:       { type: string, format: email }
 *               password:    { type: string, minLength: 8 }
 *               firstName:   { type: string }
 *               lastName:    { type: string }
 *               phoneNumber: { type: string }
 *     responses:
 *       201: { description: Registration successful — verification email sent }
 *       409: { description: Email already registered }
 */
async function register(req, res, next) {
  try {
    const { email, password, firstName, lastName, phoneNumber } = req.body;

    // Check for existing account
    const existing = await UserModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Persist user
    const user = await UserModel.create({ email, passwordHash, firstName, lastName, phoneNumber });

    // Generate and cache 6-digit verification code in Redis
    const code = generateOtp();
    await set(`${VERIFY_PREFIX}${email}`, code, VERIFY_TTL);

    // Send verification email (fire-and-forget; failure shouldn't block the response)
    sendVerificationEmail(email, code, firstName).catch((err) =>
      logger.error('Failed to send verification email:', err)
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully. Please check your email for a verification code.',
      data: {
        userId:    user.user_id,
        email:     user.email,
        firstName: user.first_name,
        lastName:  user.last_name,
        role:      user.role,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── R002: Verify Email ────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email address with 6-digit code
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, verificationCode]
 *             properties:
 *               email:            { type: string }
 *               verificationCode: { type: string, minLength: 6, maxLength: 6 }
 */
async function verifyEmail(req, res, next) {
  try {
    const { email, verificationCode } = req.body;

    // Retrieve stored code from Redis
    const stored = await get(`${VERIFY_PREFIX}${email}`);
    if (!stored) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired or was not found. Please request a new one.',
      });
    }

    // Constant-time comparison
    if (!timingSafeEqual(stored, verificationCode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code. Please check and try again.',
      });
    }

    // Mark email as verified in DB
    const user = await UserModel.markEmailVerified(email);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Remove the used code from Redis
    await del(`${VERIFY_PREFIX}${email}`);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully. You can now log in.',
    });
  } catch (error) {
    next(error);
  }
}

// ─── R003: Login ───────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate and receive JWT tokens
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string }
 *               password: { type: string }
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // Fetch user (including password_hash for comparison)
    const user = await UserModel.findByEmail(email);

    // Use bcrypt.compare even on a fake hash to prevent timing attacks
    const fakeHash = '$2b$10$invalidhashinvalidhashinvalidhashXXXXXXXXXXXXXXXXXXXXXX';
    const passwordMatch = await bcrypt.compare(password, user?.password_hash || fakeHash);

    if (!user || !passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email address before logging in.',
      });
    }

    if (user.account_status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact support.',
      });
    }

    // If MFA is enabled, issue a short-lived MFA challenge instead of full tokens
    if (user.mfa_enabled) {
      const mfaCode = generateOtp();
      await set(`${MFA_PREFIX}${email}`, mfaCode, MFA_TTL);
      sendMfaCode(email, mfaCode, user.first_name).catch((err) =>
        logger.error('Failed to send MFA code:', err)
      );

      return res.status(200).json({
        success: true,
        mfaRequired: true,
        message: 'MFA code sent to your email. Please complete the MFA step.',
      });
    }

    // Generate tokens
    const accessToken  = TokenService.generateAccessToken({
      userId: user.user_id,
      email:  user.email,
      role:   user.role,
    });
    const refreshToken = await TokenService.generateRefreshToken(user.user_id);

    // Start the sliding session
    await TokenService.touchSession(user.user_id);

    // Record login timestamp
    await UserModel.updateLastLogin(user.user_id);

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        accessToken,
        refreshToken,
        user: {
          userId:        user.user_id,
          email:         user.email,
          firstName:     user.first_name,
          lastName:      user.last_name,
          role:          user.role,
          mfaEnabled:    user.mfa_enabled,
          emailVerified: user.email_verified,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── R004: Refresh Token Rotation ─────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate refresh token and get a new access token
 *     security: []
 */
async function refreshToken(req, res, next) {
  try {
    const { refreshToken } = req.body;

    // Validate and extract userId from Redis-backed token
    const { userId } = await TokenService.validateRefreshToken(refreshToken);

    // Fetch current user to get email and role for new token payload
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    // Rotate: delete old → issue new pair
    const { accessToken: newAccess, refreshToken: newRefresh } =
      await TokenService.rotateRefreshToken(userId, user.email, user.role);

    // Slide session window
    await TokenService.touchSession(userId);

    res.status(200).json({
      success: true,
      message: 'Tokens refreshed.',
      data: { accessToken: newAccess, refreshToken: newRefresh },
    });
  } catch (error) {
    if (error.message.includes('refresh token')) {
      return res.status(401).json({ success: false, message: error.message });
    }
    next(error);
  }
}

// ─── Logout ────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke all tokens and end session
 */
async function logout(req, res, next) {
  try {
    await TokenService.revokeAllTokens(req.user.userId);
    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    next(error);
  }
}

// ─── MFA Setup ─────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/mfa/setup:
 *   post:
 *     tags: [MFA]
 *     summary: Enable MFA for the authenticated user
 */
async function mfaSetup(req, res, next) {
  try {
    const { userId, email } = req.user;

    // Generate and send a verification code to confirm the user controls the email
    const code = generateOtp();
    await set(`${MFA_PREFIX}${email}`, code, MFA_TTL);

    const user = await UserModel.findById(userId);
    sendMfaCode(email, code, user.first_name).catch((err) =>
      logger.error('Failed to send MFA setup code:', err)
    );

    res.status(200).json({
      success: true,
      message: 'MFA setup initiated. A verification code has been sent to your email.',
    });
  } catch (error) {
    next(error);
  }
}

// ─── MFA Verify (finalise setup) ──────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/mfa/verify:
 *   post:
 *     tags: [MFA]
 *     summary: Confirm MFA setup code and activate MFA
 */
async function mfaVerify(req, res, next) {
  try {
    const { userId, email } = req.user;
    const { code } = req.body;

    const stored = await get(`${MFA_PREFIX}${email}`);
    if (!stored || !timingSafeEqual(stored, code)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired MFA code.',
      });
    }

    // Store a reference secret (the email itself, encrypted, serves as the "secret")
    const mfaSecret = encrypt(email);
    await UserModel.enableMfa(userId, mfaSecret);
    await del(`${MFA_PREFIX}${email}`);

    res.status(200).json({
      success: true,
      message: 'MFA has been successfully enabled on your account.',
    });
  } catch (error) {
    next(error);
  }
}

// ─── MFA Login (second factor) ─────────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/mfa/login:
 *   post:
 *     tags: [MFA]
 *     summary: Complete login with MFA code (called after /login when mfaRequired=true)
 *     security: []
 */
async function mfaLogin(req, res, next) {
  try {
    const { email, code } = req.body;

    const stored = await get(`${MFA_PREFIX}${email}`);
    if (!stored || !timingSafeEqual(stored, code)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired MFA code.',
      });
    }

    const user = await UserModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    await del(`${MFA_PREFIX}${email}`);

    // Issue full token pair
    const accessToken  = TokenService.generateAccessToken({
      userId: user.user_id,
      email:  user.email,
      role:   user.role,
    });
    const refreshToken = await TokenService.generateRefreshToken(user.user_id);
    await TokenService.touchSession(user.user_id);
    await UserModel.updateLastLogin(user.user_id);

    res.status(200).json({
      success: true,
      message: 'MFA login successful.',
      data: {
        accessToken,
        refreshToken,
        user: {
          userId:     user.user_id,
          email:      user.email,
          firstName:  user.first_name,
          lastName:   user.last_name,
          role:       user.role,
          mfaEnabled: user.mfa_enabled,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Change Password ───────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change the authenticated user's password
 */
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const { userId } = req.user;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect.',
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await UserModel.updatePassword(userId, newPasswordHash);

    // Revoke all existing sessions to force re-login
    await TokenService.revokeAllTokens(userId);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please log in again with your new password.',
    });
  } catch (error) {
    next(error);
  }
}

// ─── Account Deletion (GDPR) ───────────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/account:
 *   delete:
 *     tags: [Auth]
 *     summary: Delete account and anonymise all personal data (GDPR Right to Erasure)
 */
async function deleteAccount(req, res, next) {
  try {
    const { userId, email } = req.user;

    // Send notification before anonymising (email becomes unreachable after)
    sendAccountDeletionEmail(email).catch((err) =>
      logger.error('Failed to send deletion email:', err)
    );

    // Anonymise user data in DB
    await UserModel.anonymise(userId);

    // Revoke all Redis tokens and sessions
    await TokenService.revokeAllTokens(userId);
    // Also remove biometric key if registered
    await del(`${BIOMETRIC_PREFIX}${userId}`);

    res.status(200).json({
      success: true,
      message: 'Your account and all associated personal data have been deleted.',
    });
  } catch (error) {
    next(error);
  }
}

// ─── Biometric Register ────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/biometric/register:
 *   post:
 *     tags: [Biometric]
 *     summary: Register a biometric key for the authenticated user
 */
async function biometricRegister(req, res, next) {
  try {
    const { userId } = req.user;
    const { biometricKey } = req.body;

    // Encrypt the biometric key before storing in Redis
    const encryptedKey = encrypt(biometricKey);
    await set(`${BIOMETRIC_PREFIX}${userId}`, encryptedKey, BIOMETRIC_TTL);

    res.status(200).json({
      success: true,
      message: 'Biometric key registered successfully.',
    });
  } catch (error) {
    next(error);
  }
}

// ─── Biometric Login ───────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/biometric/login:
 *   post:
 *     tags: [Biometric]
 *     summary: Authenticate using a registered biometric key
 *     security: []
 */
async function biometricLogin(req, res, next) {
  try {
    const { userId, biometricKey } = req.body;

    // Retrieve the stored (encrypted) biometric key from Redis
    const storedEncrypted = await get(`${BIOMETRIC_PREFIX}${userId}`);
    if (!storedEncrypted) {
      return res.status(401).json({
        success: false,
        message: 'No biometric key registered for this device. Please log in with your password.',
      });
    }

    let storedKey;
    try {
      storedKey = decrypt(storedEncrypted);
    } catch {
      return res.status(401).json({
        success: false,
        message: 'Biometric key is corrupted. Please re-register.',
      });
    }

    if (!timingSafeEqual(storedKey, biometricKey)) {
      return res.status(401).json({
        success: false,
        message: 'Biometric authentication failed.',
      });
    }

    const user = await UserModel.findById(userId);
    if (!user || user.account_status !== 'active') {
      return res.status(401).json({ success: false, message: 'User account is not active.' });
    }

    // Issue full token pair
    const accessToken  = TokenService.generateAccessToken({
      userId: user.user_id,
      email:  user.email,
      role:   user.role,
    });
    const refreshToken = await TokenService.generateRefreshToken(user.user_id);
    await TokenService.touchSession(user.user_id);
    await UserModel.updateLastLogin(user.user_id);

    res.status(200).json({
      success: true,
      message: 'Biometric login successful.',
      data: {
        accessToken,
        refreshToken,
        user: {
          userId:    user.user_id,
          email:     user.email,
          firstName: user.first_name,
          lastName:  user.last_name,
          role:      user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Get Profile ───────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     tags: [Auth]
 *     summary: Get the authenticated user's profile
 */
async function getProfile(req, res, next) {
  try {
    const user = await UserModel.findPublicById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.status(200).json({
      success: true,
      data: {
        userId:        user.user_id,
        email:         user.email,
        firstName:     user.first_name,
        lastName:      user.last_name,
        phoneNumber:   user.phone_number,
        role:          user.role,
        mfaEnabled:    user.mfa_enabled,
        emailVerified: user.email_verified,
        lastLoginAt:   user.last_login_at,
        createdAt:     user.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  verifyEmail,
  login,
  refreshToken,
  logout,
  mfaSetup,
  mfaVerify,
  mfaLogin,
  changePassword,
  deleteAccount,
  biometricRegister,
  biometricLogin,
  getProfile,
};
