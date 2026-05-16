
const Joi = require('joi');

// Reusable field definitions
const email = Joi.string().email({ tlds: { allow: false } }).lowercase().trim().required();

const password = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#()\-_=+[\]{};:'",.<>\/\\|`~])/)
  .required()
  .messages({
    'string.pattern.base':
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    'string.min': 'Password must be at least 8 characters long',
  });

const sixDigitCode = Joi.string().length(6).pattern(/^\d{6}$/).required().messages({
  'string.pattern.base': 'Code must be exactly 6 digits',
  'string.length': 'Code must be exactly 6 digits',
});

// Auth Schemas

const registerSchema = Joi.object({
  email,
  password,
  firstName: Joi.string().min(1).max(100).trim().required(),
  lastName:  Joi.string().min(1).max(100).trim().required(),
  phoneNumber: Joi.string()
    .pattern(/^\+?[\d\s\-().]{7,20}$/)
    .trim()
    .required()
    .messages({ 'string.pattern.base': 'Please provide a valid phone number' }),
});

const verifyEmailSchema = Joi.object({
  email,
  verificationCode: sixDigitCode,
});

const loginSchema = Joi.object({
  email,
  password: Joi.string().required(), // No complexity check on login
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: password,
}).custom((value, helpers) => {
  if (value.currentPassword === value.newPassword) {
    return helpers.error('any.invalid');
  }
  return value;
}).messages({ 'any.invalid': 'New password must be different from the current password' });

// MFA Schemas

const mfaSetupSchema = Joi.object({
});

const mfaVerifySchema = Joi.object({
  code: sixDigitCode,
});

const mfaLoginSchema = Joi.object({
  email,
  code: sixDigitCode,
});

// Biometric Schemas

const biometricRegisterSchema = Joi.object({
  biometricKey: Joi.string().min(16).max(1024).required().messages({
    'string.min': 'Biometric key is too short',
    'string.max': 'Biometric key is too long',
  }),
});

const biometricLoginSchema = Joi.object({
  userId:       Joi.string().uuid().required(),
  biometricKey: Joi.string().min(16).max(1024).required(),
});

module.exports = {
  registerSchema,
  verifyEmailSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  mfaSetupSchema,
  mfaVerifySchema,
  mfaLoginSchema,
  biometricRegisterSchema,
  biometricLoginSchema,
};
