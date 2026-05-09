const Joi = require('joi');

// ── Reusable fields ────────────────────────────────────────────────────────────
const emailField = Joi.string()
  .email({ tlds: { allow: false } })
  .lowercase()
  .trim()
  .required();

const strongPassword = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#()\-_=+[\]{};:'",.<>/\\|`~])/)
  .required()
  .messages({
    'string.pattern.base':
      'Password must have uppercase, lowercase, number, and special character.',
  });

const sixDigitCode = Joi.string()
  .length(6)
  .pattern(/^\d{6}$/)
  .required()
  .messages({
    'string.pattern.base': 'Code must be exactly 6 digits.',
  });

// ── Auth schemas ───────────────────────────────────────────────────────────────
const registerSchema = Joi.object({
  email: emailField,
  password: strongPassword,
  firstName: Joi.string().min(1).max(100).trim().required(),
  lastName: Joi.string().min(1).max(100).trim().required(),
  phoneNumber: Joi.string()
    .pattern(/^\+?[\d\s\-().]{7,20}$/)
    .trim()
    .optional()
    .allow(null, '')
    .messages({
      'string.pattern.base': 'Provide a valid phone number.',
    }),
  device_id: Joi.string().min(3).max(255).optional().allow(null, ''),
});

const verifyEmailSchema = Joi.object({
  email: emailField,
  verificationCode: sixDigitCode,
});

const loginSchema = Joi.object({
  email: emailField,
  password: Joi.string().required(),
  device_id: Joi.string().min(3).max(255).required(),
});

const refreshSchema = Joi.object({
  refresh_token: Joi.string().required(),
  device_id: Joi.string().min(3).max(255).required(),
});

const logoutSchema = Joi.object({
  refresh_token: Joi.string().required(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: strongPassword,
})
  .custom((value, helpers) => {
    if (value.currentPassword === value.newPassword) {
      return helpers.error('any.invalid');
    }

    return value;
  })
  .messages({
    'any.invalid': 'New password must differ from current password.',
  });

const mfaVerifySchema = Joi.object({
  otp_code: sixDigitCode.optional(),
  mfa_code: sixDigitCode.optional(),
  device_id: Joi.string().min(3).max(255).optional().allow(null, ''),
}).or('otp_code', 'mfa_code');

const mfaLoginSchema = Joi.object({
  email: emailField,
  otp_code: sixDigitCode,
  device_id: Joi.string().min(3).max(255).optional().allow(null, ''),
});

// Safer biometric enrolment.
// Biometric data stays on the phone.
// Backend only stores device_id and biometric_enabled = true.
const biometricRegisterSchema = Joi.object({
  device_id: Joi.string().min(3).max(255).required(),
  device_name: Joi.string().min(1).max(255).optional().allow(null, ''),
});

const biometricLoginSchema = Joi.object({
  user_id: Joi.string().uuid().required(),
  device_id: Joi.string().min(3).max(255).required(),
});

// ── Google login schema ──────────────────────────────────────────────────────
const googleLoginSchema = Joi.object({
  idToken: Joi.string().required(),
  device_id: Joi.string().min(3).max(255).optional().allow(null, ''),
});

// ── Password reset schemas ───────────────────────────────────────────────────
const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
  otp_code: Joi.string().length(6).pattern(/^\d+$/).required().messages({
    'string.length': 'Reset code must be 6 digits.',
    'string.pattern.base': 'Reset code must be 6 digits.',
  }),
  new_password: strongPassword,
});

module.exports = {
  // Auth
  registerSchema,
  verifyEmailSchema,
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
};