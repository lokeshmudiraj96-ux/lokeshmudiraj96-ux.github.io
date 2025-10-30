const Joi = require('joi');

// Validation schemas
const schemas = {
  userId: Joi.string().uuid().required(),
  experimentId: Joi.string().hex().length(16).required(),
  itemId: Joi.alternatives().try(
    Joi.string().uuid(),
    Joi.number().integer().positive()
  ).required(),
  limit: Joi.number().integer().min(1).max(50).default(10),
  algorithm: Joi.string().valid(
    'collaborative', 'content_based', 'hybrid', 'neural', 
    'trending', 'adaptive_hybrid', 'weighted_hybrid'
  ),
  interactionType: Joi.string().valid(
    'view', 'click', 'purchase', 'favorite', 'share', 'rate'
  ).required(),
  context: Joi.object({
    timeOfDay: Joi.number().integer().min(0).max(23),
    location: Joi.object({
      latitude: Joi.number().min(-90).max(90),
      longitude: Joi.number().min(-180).max(180)
    }),
    weather: Joi.object({
      temperature: Joi.number(),
      condition: Joi.string(),
      season: Joi.string().valid('spring', 'summer', 'autumn', 'winter')
    }),
    budgetRange: Joi.object({
      min: Joi.number().min(0),
      max: Joi.number().positive()
    }),
    mealPeriod: Joi.string().valid('breakfast', 'lunch', 'dinner', 'snack'),
    category: Joi.string(),
    isFirstVisit: Joi.boolean(),
    isExploring: Joi.boolean(),
    promotionalItems: Joi.array().items(Joi.alternatives().try(
      Joi.string().uuid(),
      Joi.number().integer().positive()
    ))
  }).unknown(true),
  experimentConfig: Joi.object({
    name: Joi.string().min(3).max(100).required(),
    description: Joi.string().max(500),
    controlAlgorithm: Joi.string().required(),
    treatmentAlgorithm: Joi.string().required(),
    trafficSplit: Joi.number().min(0).max(1).default(0.5),
    targetMetrics: Joi.array().items(
      Joi.string().valid('ctr', 'conversion_rate', 'user_engagement', 'revenue_per_user')
    ).min(1).default(['ctr', 'conversion_rate']),
    segmentFilters: Joi.object({
      minInteractions: Joi.number().integer().min(0),
      preferredCategories: Joi.array().items(Joi.string()),
      registrationDaysAgo: Joi.number().integer().min(0)
    }).unknown(true).default({}),
    duration: Joi.number().integer().min(1).max(90).default(14)
  }).required()
};

// Generic validation function
const validate = (schema, data, options = {}) => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    allowUnknown: options.allowUnknown || false,
    stripUnknown: options.stripUnknown || true,
    ...options
  });

  if (error) {
    const validationErrors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));

    throw {
      name: 'ValidationError',
      message: 'Validation failed',
      errors: validationErrors
    };
  }

  return value;
};

// Middleware factories
const validateUserId = (req, res, next) => {
  try {
    const validatedUserId = validate(schemas.userId, req.params.userId);
    req.params.userId = validatedUserId;
    next();
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid user ID format',
      code: 'INVALID_USER_ID',
      details: error.errors || [{ message: 'User ID must be a valid UUID' }]
    });
  }
};

const validateExperimentId = (req, res, next) => {
  try {
    const validatedExperimentId = validate(schemas.experimentId, req.params.experimentId);
    req.params.experimentId = validatedExperimentId;
    next();
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid experiment ID format',
      code: 'INVALID_EXPERIMENT_ID',
      details: error.errors || [{ message: 'Experiment ID must be a 16-character hexadecimal string' }]
    });
  }
};

const validateItemId = (req, res, next) => {
  try {
    const validatedItemId = validate(schemas.itemId, req.params.itemId);
    req.params.itemId = validatedItemId;
    next();
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid item ID format',
      code: 'INVALID_ITEM_ID',
      details: error.errors || [{ message: 'Item ID must be a valid UUID or positive integer' }]
    });
  }
};

// Request body validation middleware
const validateRequestBody = (schemaName) => {
  return (req, res, next) => {
    try {
      if (!schemas[schemaName]) {
        throw new Error(`Schema ${schemaName} not found`);
      }

      const validatedData = validate(schemas[schemaName], req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      return res.status(400).json({
        error: 'Request body validation failed',
        code: 'VALIDATION_ERROR',
        details: error.errors || [{ message: error.message }]
      });
    }
  };
};

// Query parameters validation middleware
const validateQuery = (customSchema) => {
  return (req, res, next) => {
    try {
      const querySchema = customSchema || Joi.object({
        limit: schemas.limit,
        algorithm: schemas.algorithm,
        context: Joi.string(), // Will be parsed as JSON
        includeExplanations: Joi.boolean().default(true),
        diversityFactor: Joi.number().min(0).max(1).default(0.3),
        excludeInteracted: Joi.boolean().default(true),
        timePeriod: Joi.string().valid('day', 'week', 'month').default('day'),
        category: Joi.string(),
        mealPeriod: Joi.string().valid('breakfast', 'lunch', 'dinner', 'snack')
      }).unknown(true);

      const validatedQuery = validate(querySchema, req.query, { allowUnknown: true });
      
      // Parse context if provided as string
      if (validatedQuery.context && typeof validatedQuery.context === 'string') {
        try {
          validatedQuery.context = JSON.parse(validatedQuery.context);
          // Validate parsed context
          validatedQuery.context = validate(schemas.context, validatedQuery.context, { 
            allowUnknown: true 
          });
        } catch (contextError) {
          return res.status(400).json({
            error: 'Invalid context format',
            code: 'INVALID_CONTEXT',
            details: [{ message: 'Context must be valid JSON' }]
          });
        }
      }

      req.query = validatedQuery;
      next();
    } catch (error) {
      return res.status(400).json({
        error: 'Query parameters validation failed',
        code: 'QUERY_VALIDATION_ERROR',
        details: error.errors || [{ message: error.message }]
      });
    }
  };
};

// Interaction tracking validation
const validateInteraction = (req, res, next) => {
  try {
    // Validate URL parameters
    validate(schemas.userId, req.params.userId);
    validate(schemas.itemId, req.params.itemId);
    
    // Validate request body
    const interactionSchema = Joi.object({
      interactionType: schemas.interactionType,
      interactionValue: Joi.number().when('interactionType', {
        is: 'rate',
        then: Joi.number().min(1).max(5).required(),
        otherwise: Joi.number().optional()
      }),
      metadata: Joi.object({
        timestamp: Joi.date().iso().default(() => new Date()),
        source: Joi.string().valid('web', 'mobile', 'api').default('api'),
        sessionId: Joi.string().uuid(),
        recommendationId: Joi.string(),
        position: Joi.number().integer().min(0),
        context: schemas.context
      }).unknown(true).default({})
    });

    const validatedBody = validate(interactionSchema, req.body);
    req.body = validatedBody;
    
    next();
  } catch (error) {
    return res.status(400).json({
      error: 'Interaction validation failed',
      code: 'INTERACTION_VALIDATION_ERROR',
      details: error.errors || [{ message: error.message }]
    });
  }
};

// Experiment creation validation
const validateExperimentCreation = validateRequestBody('experimentConfig');

// Custom validation for specific endpoints
const validateRecommendationRequest = (req, res, next) => {
  try {
    // Validate path parameters
    validate(schemas.userId, req.params.userId);
    
    // Validate and set defaults for query parameters
    const querySchema = Joi.object({
      limit: schemas.limit,
      algorithm: schemas.algorithm.optional(),
      context: Joi.alternatives().try(
        Joi.string(), // JSON string
        schemas.context // Already parsed object
      ).default({}),
      includeExplanations: Joi.boolean().default(true),
      diversityFactor: Joi.number().min(0).max(1).default(0.3),
      excludeInteracted: Joi.boolean().default(true)
    });

    let validatedQuery = validate(querySchema, req.query);
    
    // Parse and validate context
    if (typeof validatedQuery.context === 'string') {
      try {
        validatedQuery.context = JSON.parse(validatedQuery.context);
      } catch (parseError) {
        return res.status(400).json({
          error: 'Invalid context JSON format',
          code: 'INVALID_CONTEXT_JSON'
        });
      }
    }
    
    validatedQuery.context = validate(schemas.context, validatedQuery.context, { 
      allowUnknown: true 
    });
    
    req.query = validatedQuery;
    next();
  } catch (error) {
    return res.status(400).json({
      error: 'Recommendation request validation failed',
      code: 'RECOMMENDATION_VALIDATION_ERROR',
      details: error.errors || [{ message: error.message }]
    });
  }
};

// Sanitization helpers
const sanitizeInput = (input, type = 'string') => {
  if (input === null || input === undefined) {
    return input;
  }

  switch (type) {
    case 'string':
      return String(input).trim().replace(/[<>]/g, '');
    case 'number':
      const num = Number(input);
      return isNaN(num) ? null : num;
    case 'boolean':
      return Boolean(input);
    case 'array':
      return Array.isArray(input) ? input.map(item => sanitizeInput(item, 'string')) : [];
    default:
      return input;
  }
};

// Rate limiting validation
const validateRateLimit = (req, res, next) => {
  const rateLimitHeaders = {
    'X-RateLimit-Limit': res.get('X-RateLimit-Limit'),
    'X-RateLimit-Remaining': res.get('X-RateLimit-Remaining'),
    'X-RateLimit-Reset': res.get('X-RateLimit-Reset')
  };

  // Add rate limit info to response
  req.rateLimitInfo = rateLimitHeaders;
  next();
};

// Input size validation
const validateInputSize = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    const maxBytes = parseSize(maxSize);

    if (contentLength > maxBytes) {
      return res.status(413).json({
        error: 'Request payload too large',
        code: 'PAYLOAD_TOO_LARGE',
        maxSize: maxSize
      });
    }

    next();
  };
};

// Helper function to parse size strings
const parseSize = (size) => {
  const units = {
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)$/);
  if (!match) {
    throw new Error('Invalid size format');
  }

  return parseFloat(match[1]) * units[match[2]];
};

// Error handler for async routes
const handleAsyncErrors = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Request validation summary middleware
const validationSummary = (req, res, next) => {
  const summary = {
    validatedAt: new Date(),
    userId: req.params.userId,
    endpoint: req.route?.path || req.path,
    method: req.method,
    hasValidation: true
  };

  req.validationSummary = summary;
  next();
};

module.exports = {
  // Validation schemas
  schemas,
  validate,

  // Middleware
  validateUserId,
  validateExperimentId,
  validateItemId,
  validateRequestBody,
  validateQuery,
  validateInteraction,
  validateExperimentCreation,
  validateRecommendationRequest,
  validateRateLimit,
  validateInputSize,
  validationSummary,

  // Helpers
  sanitizeInput,
  handleAsyncErrors,
  parseSize
};