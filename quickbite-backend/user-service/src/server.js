const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { testConnection, initializeDatabase } = require('./config/database');

// Import middleware
const {
  cors,
  securityHeaders,
  compressionMiddleware,
  requestLogger,
  errorHandler,
  trackActivity,
  apiRateLimit
} = require('./middleware');

// Import routes
const userRoutes = require('./routes/user.routes');
const addressRoutes = require('./routes/address.routes');
const socialRoutes = require('./routes/social.routes');
const { loyaltyRouter, referralRouter } = require('./routes/loyalty.routes');
const preferencesRoutes = require('./routes/preferences.routes');

// Create Express app
const app = express();

// Trust proxy (for rate limiting and IP detection)
app.set('trust proxy', 1);

// Security and CORS middleware
app.use(securityHeaders);
app.use(cors);

// Request parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compressionMiddleware);

// Request logging
if (config.server.env !== 'test') {
  app.use(requestLogger);
}

// Rate limiting
app.use('/api', apiRateLimit);

// Activity tracking
app.use(trackActivity);

// Serve static files (uploads)
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: config.app.name,
    version: config.app.version,
    environment: config.server.env,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    service: config.app.name,
    version: config.app.version,
    description: 'Advanced User Management Service for QuickBite Food Delivery Platform',
    features: [
      'User Profile Management',
      'Address Management',
      'Social Connections',
      'Loyalty Program',
      'Referral System',
      'User Preferences',
      'Advanced Analytics',
      'Real-time Notifications'
    ],
    endpoints: {
      users: '/api/users',
      addresses: '/api/addresses',
      social: '/api/social',
      loyalty: '/api/loyalty',
      referrals: '/api/referrals',
      preferences: '/api/preferences'
    },
    documentation: 'https://docs.quickbite.app/user-service'
  });
});

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/loyalty', loyaltyRouter);
app.use('/api/referrals', referralRouter);
app.use('/api/preferences', preferencesRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server function
async function startServer() {
  try {
    // Test database connection
    console.log('🔗 Testing database connection...');
    await testConnection();

    // Initialize database schema
    console.log('📋 Initializing database schema...');
    await initializeDatabase();

    // Start HTTP server
    const server = app.listen(config.server.port, config.server.host, () => {
      console.log('\n🚀 QuickBite User Service Started!');
      console.log('================================================');
      console.log(`📍 Environment: ${config.server.env}`);
      console.log(`🌐 Server: http://${config.server.host}:${config.server.port}`);
      console.log(`📊 Health Check: http://${config.server.host}:${config.server.port}/health`);
      console.log(`📚 API Docs: http://${config.server.host}:${config.server.port}/api`);
      console.log('================================================');
      console.log('\n✨ Features Enabled:');
      console.log(`   🤝 Social Features: ${config.features.socialFeatures ? '✅' : '❌'}`);
      console.log(`   🏆 Loyalty Program: ${config.features.loyaltyProgram ? '✅' : '❌'}`);
      console.log(`   🎁 Referral Program: ${config.features.referralProgram ? '✅' : '❌'}`);
      console.log(`   📊 Advanced Analytics: ${config.features.advancedAnalytics ? '✅' : '❌'}`);
      console.log(`   🔔 Real-time Notifications: ${config.features.realTimeNotifications ? '✅' : '❌'}`);
      console.log('\n⚡ Service is ready to handle requests!\n');
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n📴 Received SIGINT. Shutting down gracefully...');
      server.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      console.log('\n📴 Received SIGTERM. Shutting down gracefully...');
      server.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
      });
    });

    return server;

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  startServer().catch(error => {
    console.error('❌ Startup error:', error);
    process.exit(1);
  });
}

module.exports = { app, startServer };