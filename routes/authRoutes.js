/**
 * routes/authRoutes.js
 * Express router for all /api/v1/auth/* endpoints.
 *
 * Public routes:
 *   POST /api/v1/auth/register
 *   POST /api/v1/auth/verify-email
 *   POST /api/v1/auth/login
 *   POST /api/v1/auth/refresh
 *   POST /api/v1/auth/mfa/login
 *   POST /api/v1/auth/biometric/login
 *   POST /api/v1/auth/google
 *
 * Protected routes:
 *   POST /api/v1/auth/logout
 *   GET  /api/v1/auth/profile
 *   POST /api/v1/auth/mfa/setup
 *   POST /api/v1/auth/mfa/verify
 *   POST /api/v1/auth/change-password
 *   DELETE /api/v1/auth/account
 *   POST /api/v1/auth/biometric/register
 *   POST /api/v1/auth/biometric/enroll
 */

const { Router } = require('express');

const controller = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

const {
  authLimiter,
  verifyEmailLimiter,
  resendVerificationLimiter,
  loginLimiter,
  registerLimiter,
  refreshLimiter,
  biometricEnrollLimiter,
  biometricLoginLimiter,
  mfaLimiter,
  passwordLimiter,
} = require('../middleware/rateLimit');

const {
  registerSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  changePasswordSchema,
  mfaVerifySchema,
  mfaLoginSchema,
  biometricRegisterSchema,
  biometricLoginSchema,
  googleLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyResetOtpSchema,
} = require('../utils/validationSchemas');

const router = Router();

// Apply baseline auth limiter to every auth route
router.use(authLimiter);

// ─────────────────────────────────────────────────────────────────────────────
// Public routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/register
 * Create a new reporter account.
 */
router.post(
  '/register',
  registerLimiter,
  validate(registerSchema),
  controller.register
);

/**
 * POST /api/v1/auth/verify-email
 * Verify email using OTP code.
 */
router.post(
  '/verify-email',
  verifyEmailLimiter,
  validate(verifyEmailSchema),
  controller.verifyEmail
);

/**
 * POST /api/v1/auth/resend-verification
 * Resend the email verification OTP. Always returns a generic success response
 * to avoid leaking which emails are registered.
 */
router.post(
  '/resend-verification',
  resendVerificationLimiter,
  validate(resendVerificationSchema),
  controller.resendVerification
);

/**
 * POST /api/v1/auth/login
 * Login with email and password.
 */
router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  controller.login
);

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token.
 */
router.post(
  '/refresh',
  refreshLimiter,
  validate(refreshSchema),
  controller.refreshToken
);

/**
 * POST /api/v1/auth/mfa/login
 * Complete MFA login step.
 */
router.post(
  '/mfa/login',
  mfaLimiter,
  validate(mfaLoginSchema),
  controller.mfaLogin
);

/**
 * POST /api/v1/auth/biometric/login
 * Login using registered biometric key.
 */
router.post(
  '/biometric/login',
  biometricLoginLimiter,
  validate(biometricLoginSchema),
  controller.biometricLogin
);

/**
 * POST /api/v1/auth/google
 * Google Sign-In.
 */
router.post(
  '/google',
  validate(googleLoginSchema),
  controller.googleLogin
);

/**
 * POST /api/v1/auth/forgot-password
 * Request a password reset OTP via email.
 */
router.post(
  '/forgot-password',
  passwordLimiter,
  validate(forgotPasswordSchema),
  controller.forgotPassword
);

/**
 * POST /api/v1/auth/verify-reset-otp
 * Verify the password reset OTP and issue a short-lived reset token that the
 * client must present to /reset-password.
 */
router.post(
  '/verify-reset-otp',
  passwordLimiter,
  validate(verifyResetOtpSchema),
  controller.verifyResetOtp
);

/**
 * POST /api/v1/auth/reset-password
 * Reset password using either the OTP (legacy single-step flow) or the
 * reset token returned by /verify-reset-otp (preferred).
 */
router.post(
  '/reset-password',
  passwordLimiter,
  validate(resetPasswordSchema),
  controller.resetPassword
);

// ─────────────────────────────────────────────────────────────────────────────
// Protected routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/logout
 * Logout and revoke tokens.
 */
router.post(
  '/logout',
  requireAuth,
  validate(logoutSchema),
  controller.logout
);

/**
 * GET /api/v1/auth/profile
 * Legacy profile route.
 *
 * Main API profile route is now:
 * GET /api/v1/profile
 */
router.get(
  '/profile',
  requireAuth,
  controller.getProfile
);

/**
 * POST /api/v1/auth/mfa/setup
 * Start MFA setup by sending OTP.
 */
router.post(
  '/mfa/setup',
  requireAuth,
  mfaLimiter,
  controller.mfaSetup
);

/**
 * POST /api/v1/auth/mfa/verify
 * Verify MFA setup OTP and enable MFA.
 */
router.post(
  '/mfa/verify',
  requireAuth,
  mfaLimiter,
  validate(mfaVerifySchema),
  controller.mfaVerify
);

/**
 * POST /api/v1/auth/change-password
 * Legacy change password route.
 *
 * Main API password route is now:
 * PUT /api/v1/profile/password
 */
router.post(
  '/change-password',
  requireAuth,
  passwordLimiter,
  validate(changePasswordSchema),
  controller.changePassword
);

/**
 * DELETE /api/v1/auth/account
 * Legacy account deletion route.
 *
 * Main API account deletion route is now:
 * DELETE /api/v1/profile
 */
router.delete(
  '/account',
  requireAuth,
  controller.deleteAccount
);

/**
 * POST /api/v1/auth/biometric/register
 * Existing project route for biometric registration.
 */
router.post(
  '/biometric/register',
  requireAuth,
  biometricEnrollLimiter,
  validate(biometricRegisterSchema),
  controller.biometricRegister
);

/**
 * POST /api/v1/auth/biometric/enroll
 * API document alias for biometric enrolment.
 *
 * This uses the same controller as /biometric/register for now.
 */
router.post(
  '/biometric/enroll',
  requireAuth,
  biometricEnrollLimiter,
  validate(biometricRegisterSchema),
  controller.biometricRegister
);

module.exports = router;