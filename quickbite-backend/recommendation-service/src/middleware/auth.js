const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { redis } = require('../config/database');

// API Key validation middleware
const validateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'API key is required',
        code: 'MISSING_API_KEY'
      });
    }

    // In production, validate against a database or secure store
    const validApiKeys = process.env.VALID_API_KEYS?.split(',') || ['recommendation-service-key'];
    
    if (!validApiKeys.includes(apiKey)) {
      return res.status(401).json({
        error: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
    }

    req.apiKey = apiKey;
    next();

  } catch (error) {
    console.error('Error validating API key:', error);
    res.status(500).json({
      error: 'API key validation failed',
      code: 'API_KEY_VALIDATION_ERROR'
    });
  }
};

// JWT authentication middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'Authentication token is required',
        code: 'MISSING_AUTH_TOKEN'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'recommendation-secret-key');
    req.user = decoded;
    
    // Check if user has required permissions for admin routes
    if (req.path.includes('/experiments') || req.path.includes('/neural') || req.path.includes('/trending/analyze')) {
      if (!decoded.role || !['admin', 'data_scientist'].includes(decoded.role)) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }
    }

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid authentication token',
        code: 'INVALID_AUTH_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Authentication token has expired',
        code: 'EXPIRED_AUTH_TOKEN'
      });
    }

    console.error('Authentication error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

// Rate limiting middleware
const rateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req, res) => {
    // Different limits based on endpoint
    if (req.path.includes('/recommendations')) {
      return 100; // 100 requests per 15 minutes for recommendations
    }
    if (req.path.includes('/interactions')) {
      return 500; // Higher limit for interaction tracking
    }
    if (req.path.includes('/experiments')) {
      return 20; // Lower limit for experiment management
    }
    return 60; // Default limit
  },
  message: (req, res) => {
    return {
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    };
  },
  standardHeaders: true,
  legacyHeaders: false,
  
  // Use Redis for distributed rate limiting
  store: {
    async incr(key) {
      const current = await redis.incr(`rate_limit:${key}`);
      if (current === 1) {
        await redis.expire(`rate_limit:${key}`, 900); // 15 minutes
      }
      return { totalHits: current, resetTime: Date.now() + 900000 };
    },
    
    async decrement(key) {
      await redis.decr(`rate_limit:${key}`);
    },
    
    async resetKey(key) {
      await redis.del(`rate_limit:${key}`);
    }
  }
});

// Advanced rate limiting for high-volume endpoints
const createAdvancedRateLimit = (options = {}) => {
  const {
    windowMs = 60000, // 1 minute
    maxPerWindow = 10,
    maxPerDay = 1000,
    keyGenerator = (req) => req.ip
  } = options;

  return async (req, res, next) => {
    try {
      const key = keyGenerator(req);
      const windowKey = `rate_limit_window:${key}:${Math.floor(Date.now() / windowMs)}`;
      const dayKey = `rate_limit_day:${key}:${new Date().toISOString().split('T')[0]}`;

      // Check window limit
      const windowCount = await redis.incr(windowKey);
      if (windowCount === 1) {
        await redis.expire(windowKey, Math.ceil(windowMs / 1000));
      }

      // Check daily limit
      const dayCount = await redis.incr(dayKey);
      if (dayCount === 1) {
        await redis.expire(dayKey, 86400); // 24 hours
      }

      if (windowCount > maxPerWindow) {
        return res.status(429).json({
          error: 'Rate limit exceeded for this window',
          code: 'WINDOW_RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }

      if (dayCount > maxPerDay) {
        return res.status(429).json({
          error: 'Daily rate limit exceeded',
          code: 'DAILY_RATE_LIMIT_EXCEEDED',
          retryAfter: 86400
        });
      }

      // Add rate limit headers
      res.set({
        'X-RateLimit-Window-Limit': maxPerWindow,
        'X-RateLimit-Window-Remaining': Math.max(0, maxPerWindow - windowCount),
        'X-RateLimit-Daily-Limit': maxPerDay,
        'X-RateLimit-Daily-Remaining': Math.max(0, maxPerDay - dayCount)
      });

      next();

    } catch (error) {
      console.error('Advanced rate limiting error:', error);
      // Continue on rate limiting error to avoid blocking service
      next();
    }
  };
};

// Cache middleware for GET requests
const cacheMiddleware = (ttl = 300) => { // 5 minutes default
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    try {
      const cacheKey = `api_cache:${req.originalUrl}:${JSON.stringify(req.query)}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        const cachedData = JSON.parse(cached);
        return res.json({
          ...cachedData,
          meta: {
            ...cachedData.meta,
            cached: true,
            cacheHit: true
          }
        });
      }

      // Store original json method
      const originalJson = res.json;
      
      // Override json method to cache response
      res.json = function(body) {
        // Cache successful responses only
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redis.setex(cacheKey, ttl, JSON.stringify(body)).catch(console.error);
        }
        
        // Call original json method
        originalJson.call(this, body);
      };

      next();

    } catch (error) {
      console.error('Cache middleware error:', error);
      next(); // Continue without caching on error
    }
  };
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  
  // Log response time when request completes
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
    
    // Store metrics in Redis
    const metricsKey = `api_metrics:${req.method}:${req.route?.path || req.originalUrl}`;
    redis.lpush(metricsKey, JSON.stringify({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.route?.path || req.originalUrl,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    })).catch(console.error);
    
    // Keep only last 1000 entries
    redis.ltrim(metricsKey, 0, 999).catch(console.error);
  });

  next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('API Error:', err);

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: err.message
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid parameter format',
      code: 'INVALID_PARAMETER'
    });
  }

  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      code: 'SERVICE_UNAVAILABLE'
    });
  }

  // Default error response
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
};

// CORS middleware
const corsMiddleware = (req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
  const origin = req.headers.origin;

  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  next();
};

module.exports = {
  validateApiKey,
  authMiddleware,
  rateLimitMiddleware,
  createAdvancedRateLimit,
  cacheMiddleware,
  requestLogger,
  errorHandler,
  corsMiddleware,
  securityHeaders
};