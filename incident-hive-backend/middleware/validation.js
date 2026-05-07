const logger = require('../utils/logger');

function sendValidationError(res, errors) {
  return res.status(422).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed.',
      details: errors,
    },
  });
}

/**
 * validate(schema, source?)
 * Validates req[source] against a Joi schema.
 * Strips unknown fields and writes sanitised output back to req[source].
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((d) => d.message.replace(/['"]/g, ''));

      logger.debug(`Validation failed [${req.method} ${req.path}]:`, errors);

      return sendValidationError(res, errors);
    }

    req[source] = value;
    return next();
  };
}

module.exports = {
  validate,
};