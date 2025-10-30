const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

dotenv.config();

const routes = require('./routes/payment.routes');
const { ensureSchema } = require('./models/payment.model');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com", "https://securegw.paytm.in"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.razorpay.com", "https://securegw.paytm.in", "https://api.phonepe.com"]
    }
  }
}));

// CORS configuration
app.use(cors({ 
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Razorpay-Signature', 'X-Verify']
}));

app.use(compression());

// Body parsing middleware with different limits for different routes
app.use('/api/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global rate limiting
const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later'
  }
});
app.use(globalRateLimit);

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'payment-service',
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    features: [
      'multi_gateway_support',
      'fraud_detection',
      'advanced_analytics',
      'real_time_webhooks',
      'saved_payment_methods'
    ],
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/payments', routes);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Payment Service Error:', error);
  
  // Handle specific error types
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: Object.values(error.errors).map(err => err.message)
    });
  }
  
  if (error.code === '23505') { // PostgreSQL unique constraint
    return res.status(409).json({
      success: false,
      message: 'Resource already exists',
      error: 'Duplicate entry'
    });
  }
  
  if (error.code === '23503') { // PostgreSQL foreign key constraint
    return res.status(400).json({
      success: false,
      message: 'Invalid reference',
      error: 'Referenced resource not found'
    });
  }
  
  // Default error response
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Handle 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  server.close(() => {
    console.log('💳 Payment Service shut down gracefully');
    process.exit(0);
  });
  
  setTimeout(() => {
    console.log('Forcefully shutting down Payment Service');
    process.exit(1);
  }, 10000);
};

// Initialize database and start server
const PORT = process.env.PORT || 3005;
let server;

ensureSchema().then(() => {
  server = app.listen(PORT, () => {
    console.log(`💳 Enhanced Payment Service running on port ${PORT}`);
    console.log(`🔐 Security features: Helmet, CORS, Rate limiting`);
    console.log(`🏦 Payment gateways: Razorpay, Paytm, PhonePe`);
    console.log(`📊 Features: Fraud detection, Analytics, Webhooks`);
  });
  
  // Handle graceful shutdown
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
}).catch((error) => {
  console.error('❌ Failed to initialize Payment Service:', error.message);
  process.exit(1);
});

module.exports = app;
