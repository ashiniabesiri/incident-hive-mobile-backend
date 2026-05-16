
const { Router } = require('express');

const controller = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const {
  authLimiter,
  loginLimiter,
  registerLimiter,
  mfaLimiter,
  passwordLimiter,
} = require('../middleware/rateLimit');
const {
  registerSchema,
  verifyEmailSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  mfaVerifySchema,
  mfaLoginSchema,
  biometricRegisterSchema,
  biometricLoginSchema,
} = require('../utils/validationSchemas');

const router = Router();

router.use(authLimiter);

// Public routes

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication and account management
 *   - name: MFA
 *     description: Multi-factor authentication
 *   - name: Biometric
 *     description: Biometric authentication
 */

// R001 — Registration
router.post(
  '/register',
  registerLimiter,
  validate(registerSchema),
  controller.register
);

// R002 — Email Verification
router.post(
  '/verify-email',
  validate(verifyEmailSchema),
  controller.verifyEmail
);

// R003 — Login
router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  controller.login
);

// R004 — Refresh Token Rotation
router.post(
  '/refresh',
  validate(refreshSchema),
  controller.refreshToken
);

// MFA Login (second factor — public because user is mid-login, no token yet)
router.post(
  '/mfa/login',
  mfaLimiter,
  validate(mfaLoginSchema),
  controller.mfaLogin
);

// Biometric Login
router.post(
  '/biometric/login',
  validate(biometricLoginSchema),
  controller.biometricLogin
);

// Protected routes (JWT required)

// Logout
router.post(
  '/logout',
  requireAuth,
  controller.logout
);

// Get Profile
router.get(
  '/profile',
  requireAuth,
  controller.getProfile
);

// MFA Setup (initiate)
router.post(
  '/mfa/setup',
  requireAuth,
  mfaLimiter,
  controller.mfaSetup
);

// MFA Verify (confirm setup)
router.post(
  '/mfa/verify',
  requireAuth,
  mfaLimiter,
  validate(mfaVerifySchema),
  controller.mfaVerify
);

// Change Password
router.post(
  '/change-password',
  requireAuth,
  passwordLimiter,
  validate(changePasswordSchema),
  controller.changePassword
);

// Account Deletion (GDPR)
router.delete(
  '/account',
  requireAuth,
  controller.deleteAccount
);

// Biometric Register
router.post(
  '/biometric/register',
  requireAuth,
  validate(biometricRegisterSchema),
  controller.biometricRegister
);

module.exports = router;
