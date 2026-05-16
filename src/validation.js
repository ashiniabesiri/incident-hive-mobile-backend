
const logger = require('../utils/logger');

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

    req[source] = value;
    next();
  };
}

module.exports = { validate };
