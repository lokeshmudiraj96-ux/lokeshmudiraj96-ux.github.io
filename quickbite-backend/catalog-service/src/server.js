const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const dotenv = require('dotenv');

dotenv.config();

// Import routes
const catalogRoutes = require('./routes/catalog.routes');
const merchantsRoutes = require('./routes/merchants.routes');

const app = express();

// Security and performance middleware
app.use(helmet());
app.use(cors({ 
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'catalog-service', 
    version: '2.0.0',
    features: [
      'advanced_restaurant_management',
      'dynamic_pricing',
      'inventory_management',
      'real_time_analytics'
    ],
    timestamp: new Date().toISOString() 
  });
});

// API routes
app.use('/api/catalog', catalogRoutes);
app.use('/api/catalog/legacy', merchantsRoutes); // Keep legacy routes for backward compatibility

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Catalog Service Error:', error);
  
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

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`📚 Catalog Service running on port ${PORT}`);
});

module.exports = app;
