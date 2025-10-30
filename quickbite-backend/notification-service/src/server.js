const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

dotenv.config();

const routes = require('./routes/notification.routes');
const { ensureSchema } = require('./models/notification.model');
const NotificationService = require('./services/notification.service');

const app = express();
const server = http.createServer(app);

// Initialize notification service
const notificationService = new NotificationService();

// Middleware
app.use(helmet());
app.use(cors({ 
  origin: process.env.FRONTEND_URL || '*',
  credentials: true 
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// Health check with comprehensive status
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    const { pool } = require('./config/database');
    await pool.query('SELECT 1');
    
    // Check Redis connection (if available)
    let redisStatus = 'not_configured';
    try {
      const redis = require('redis');
      const client = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      });
      await client.ping();
      redisStatus = 'connected';
      client.quit();
    } catch (error) {
      redisStatus = 'disconnected';
    }

    // Get queue stats
    const queueStats = await notificationService.getQueueStats();
    
    // WebSocket connection count
    const wsStats = notificationService.webSocketService.getConnectionStats();

    res.json({ 
      status: 'ok', 
      service: 'notification-service',
      version: '2.0.0',
      time: new Date().toISOString(),
      database: 'connected',
      redis: redisStatus,
      websocket: {
        initialized: notificationService.webSocketService.initialized,
        connections: wsStats.totalConnections,
        userTypes: wsStats.userTypes
      },
      queue: queueStats,
      features: {
        push: true,
        email: true,
        sms: !!process.env.TWILIO_ACCOUNT_SID,
        whatsapp: !!process.env.TWILIO_WHATSAPP_NUMBER,
        websocket: true,
        templates: true,
        campaigns: true,
        analytics: true
      }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'error', 
      service: 'notification-service',
      error: error.message,
      time: new Date().toISOString()
    });
  }
});

// API routes
app.use('/api/notifications', routes);

// Initialize WebSocket service
notificationService.initializeWebSocket(server);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

const PORT = process.env.PORT || 3007;

// Initialize database schema and start server
ensureSchema()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`🔔 QuickBite Notification Service v2.0.0`);
      console.log(`📡 Server running on port ${PORT}`);
      console.log(`🌐 WebSocket enabled on same port`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`📱 Features enabled: Push, Email, SMS, WhatsApp, WebSocket, Templates, Analytics`);
      console.log(`🚀 Service ready to send notifications!`);
    });
  })
  .catch((error) => {
    console.error('❌ Failed to initialize notification service:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('💤 Notification service shut down successfully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('💤 Notification service shut down successfully');
    process.exit(0);
  });
});

module.exports = app;
