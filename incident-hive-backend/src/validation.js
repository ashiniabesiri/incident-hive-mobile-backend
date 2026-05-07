/**
 * middleware/validation.js
 * Factory that creates an Express middleware from a Joi schema.
 *
 * Usage:
 *   router.post('/register', validate(registerSchema), registerHandler);
 */

const logger = require('../utils/logger');

/**
 * validate
 * @param {import('joi').Schema} schema - Joi schema to validate req.body against
 * @param {string} [source='body'] - 'body' | 'query' | 'params'
 * @returns Express middleware
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly:      false, // Return all validation errors at once
      stripUnknown:    true,  // Remove keys not in the schema
      allowUnknown:    false,
    });

    if (error) {
      const messages = error.details.map((d) => d.message.replace(/['"]/g, ''));
      logger.debug(`Validation failed for ${req.method} ${req.path}:`, messages);

      return res.status(400).json({
        success: false,
        message: 'Validation failed. Please check the fields below.',
        errors:  messages,
      });
    }

    // Replace the source with the sanitised / coerced Joi output
    req[source] = value;
    next();
  };
}

module.exports = { validate };
