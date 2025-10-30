const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

// Import middleware
const {
  corsMiddleware,
  securityHeaders,
  requestLogger,
  errorHandler,
  cacheMiddleware
} = require('./src/middleware/auth');

const { validateInputSize } = require('./src/middleware/validation');

// Import routes
const recommendationRoutes = require('./src/routes/recommendation.routes');

// Initialize Express app
const app = express();

// Trust proxy (for load balancers)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(securityHeaders);

// CORS
app.use(corsMiddleware);

// Compression
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(validateInputSize('10mb'));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('combined'));
}
app.use(requestLogger);

// Cache middleware for GET requests
app.use(cacheMiddleware(300)); // 5 minutes default cache

// Health check endpoint (before API key validation)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'QuickBite AI Recommendation Engine',
    version: '1.0.0',
    description: 'Advanced AI-powered recommendation system with ML algorithms, trending analysis, and A/B testing',
    endpoints: {
      recommendations: '/api/v1/users/:userId/recommendations',
      trending: '/api/v1/trending',
      experiments: '/api/v1/experiments',
      health: '/health',
      status: '/api/v1/status'
    },
    documentation: 'https://docs.quickbite.com/recommendation-api',
    algorithms: [
      'collaborative_filtering',
      'content_based_filtering',
      'hybrid_recommendation',
      'neural_networks',
      'trending_analysis',
      'seasonal_patterns'
    ],
    features: [
      'personalized_recommendations',
      'contextual_awareness',
      'real_time_trending',
      'ab_testing',
      'performance_analytics',
      'neural_networks'
    ]
  });
});

// API Routes
app.use('/api/v1', recommendationRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'ENDPOINT_NOT_FOUND',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: {
      recommendations: 'GET /api/v1/users/:userId/recommendations',
      trending: 'GET /api/v1/trending',
      health: 'GET /health'
    }
  });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    console.log('HTTP server closed.');
    
    // Close database connections
    const { pool, redis } = require('./src/config/database');
    
    Promise.all([
      pool.end().catch(console.error),
      redis.quit().catch(console.error)
    ]).finally(() => {
      console.log('Database connections closed.');
      process.exit(0);
    });
  });

  // Force close after timeout
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start server
const PORT = process.env.PORT || 3007;
const server = app.listen(PORT, () => {
  console.log(`
🚀 QuickBite AI Recommendation Engine Started
   
   Server: http://localhost:${PORT}
   Environment: ${process.env.NODE_ENV || 'development'}
   
   📊 Features Enabled:
   ✅ Collaborative Filtering
   ✅ Content-Based Filtering  
   ✅ Hybrid Recommendations
   ✅ Neural Networks
   ✅ Trending Analysis
   ✅ A/B Testing Framework
   ✅ Real-time Analytics
   
   📚 API Documentation: 
   GET  /                           - API Information
   GET  /health                     - Health Check
   GET  /api/v1/status              - Service Status
   
   🎯 Recommendation Endpoints:
   GET  /api/v1/users/:id/recommendations          - Get Recommendations
   GET  /api/v1/users/:id/recommendations/personalized - Personalized Mix
   GET  /api/v1/users/:id/recommendations/contextual   - Contextual Recs
   GET  /api/v1/trending            - Trending Items
   GET  /api/v1/seasonal            - Seasonal Recommendations
   POST /api/v1/users/:id/interactions/:itemId     - Track Interactions
   
   🧪 A/B Testing:
   POST /api/v1/experiments         - Create Experiment
   GET  /api/v1/experiments/:id     - Get Experiment
   GET  /api/v1/experiments/:id/results - Get Results
   
   🤖 Neural Network:
   POST /api/v1/neural/train        - Train Model
   GET  /api/v1/neural/status       - Training Status
   
   📈 Analytics:
   GET  /api/v1/performance         - Algorithm Performance
   POST /api/v1/trending/analyze    - Trigger Analysis
   
   Ready to serve intelligent recommendations! 🧠✨
  `);
});

module.exports = { app, server };