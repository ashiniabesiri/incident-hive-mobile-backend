
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

router.use(authLimiter);

// Public routes

router.post(
  '/register',
  registerLimiter,
  validate(registerSchema),
  controller.register
);

router.post(
  '/verify-email',
  verifyEmailLimiter,
  validate(verifyEmailSchema),
  controller.verifyEmail
);

router.post(
  '/resend-verification',
  resendVerificationLimiter,
  validate(resendVerificationSchema),
  controller.resendVerification
);

router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  controller.login
);

router.post(
  '/refresh',
  refreshLimiter,
  validate(refreshSchema),
  controller.refreshToken
);

router.post(
  '/mfa/login',
  mfaLimiter,
  validate(mfaLoginSchema),
  controller.mfaLogin
);

router.post(
  '/biometric/login',
  biometricLoginLimiter,
  validate(biometricLoginSchema),
  controller.biometricLogin
);

router.post(
  '/google',
  validate(googleLoginSchema),
  controller.googleLogin
);

router.post(
  '/forgot-password',
  passwordLimiter,
  validate(forgotPasswordSchema),
  controller.forgotPassword
);

router.post(
  '/verify-reset-otp',
  passwordLimiter,
  validate(verifyResetOtpSchema),
  controller.verifyResetOtp
);

router.post(
  '/reset-password',
  passwordLimiter,
  validate(resetPasswordSchema),
  controller.resetPassword
);

// Protected routes

router.post(
  '/logout',
  requireAuth,
  validate(logoutSchema),
  controller.logout
);

router.get(
  '/profile',
  requireAuth,
  controller.getProfile
);

router.post(
  '/mfa/setup',
  requireAuth,
  mfaLimiter,
  controller.mfaSetup
);

router.post(
  '/mfa/verify',
  requireAuth,
  mfaLimiter,
  validate(mfaVerifySchema),
  controller.mfaVerify
);

router.post(
  '/change-password',
  requireAuth,
  passwordLimiter,
  validate(changePasswordSchema),
  controller.changePassword
);

router.delete(
  '/account',
  requireAuth,
  controller.deleteAccount
);

router.post(
  '/biometric/register',
  requireAuth,
  biometricEnrollLimiter,
  validate(biometricRegisterSchema),
  controller.biometricRegister
);

router.post(
  '/biometric/enroll',
  requireAuth,
  biometricEnrollLimiter,
  validate(biometricRegisterSchema),
  controller.biometricRegister
);

module.exports = router;