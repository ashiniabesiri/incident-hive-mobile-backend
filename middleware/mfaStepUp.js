/**
 * middleware/mfaStepUp.js
 * MFA Step-Up Authentication guard.
 */

function sendError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}

function requireMfaStepUp(req, res, next) {
  if (!req.user) {
    return sendError(
      res,
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication required.'
    );
  }

  const amr = req.user.amr || [];

  if (!amr.includes('mfa')) {
    return sendError(
      res,
      403,
      'MFA_STEP_UP_REQUIRED',
      'This action requires multi-factor authentication. Please complete MFA verification and try again.'
    );
  }

  return next();
}

module.exports = {
  requireMfaStepUp,
};