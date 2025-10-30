const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

const AnalyticsController = require('./controllers/analytics.controller');
const { connectDatabases, closeDatabases } = require('./config/database');
const errorHandler = require('./middleware/error-handler');
const authMiddleware = require('./middleware/auth');

class AnalyticsApp {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });
    
    this.port = process.env.PORT || 8005;
    this.analyticsController = null;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:8000'
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression
    this.app.use(compression());

    // Request logging
    this.app.use(morgan('combined', {
      skip: (req, res) => res.statusCode < 400
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'production' ? 200 : 1000,
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use('/api', limiter);

    // Request ID middleware
    this.app.use((req, res, next) => {
      req.id = require('crypto').randomBytes(16).toString('hex');
      res.set('X-Request-ID', req.id);
      next();
    });

    // Request timing
    this.app.use((req, res, next) => {
      req.startTime = Date.now();
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint (no auth required)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date(),
        service: 'analytics-service',
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime()
      });
    });

    // Metrics endpoint for monitoring
    this.app.get('/metrics', (req, res) => {
      const memUsage = process.memoryUsage();
      res.json({
        memory: {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)} MB`
        },
        uptime: process.uptime(),
        timestamp: new Date()
      });
    });

    // Analytics API routes (with auth)
    this.app.use('/api/analytics', authMiddleware, (req, res, next) => {
      if (!this.analyticsController) {
        return res.status(503).json({
          error: 'Analytics service not ready',
          message: 'The analytics controller is not initialized yet'
        });
      }
      next();
    }, (req, res, next) => {
      this.analyticsController.getRouter()(req, res, next);
    });

    // API documentation endpoint
    this.app.get('/api/docs', (req, res) => {
      res.json({
        title: 'QuickBite Analytics Service API',
        version: '1.0.0',
        description: 'Comprehensive analytics and business intelligence API for QuickBite platform',
        endpoints: {
          'Real-time Analytics': {
            'GET /api/analytics/realtime/metrics': 'Get real-time analytics metrics',
            'GET /api/analytics/realtime/orders': 'Get real-time order metrics',
            'GET /api/analytics/realtime/revenue': 'Get real-time revenue data',
            'GET /api/analytics/realtime/users': 'Get real-time user activity',
            'GET /api/analytics/realtime/restaurants': 'Get real-time restaurant metrics',
            'GET /api/analytics/realtime/delivery': 'Get real-time delivery metrics'
          },
          'Business Intelligence': {
            'GET /api/analytics/insights/business': 'Generate comprehensive business insights',
            'GET /api/analytics/insights/revenue': 'Get revenue analysis and trends',
            'GET /api/analytics/insights/customers': 'Get customer behavior insights',
            'GET /api/analytics/insights/restaurants': 'Get restaurant performance insights',
            'GET /api/analytics/insights/operations': 'Get operational efficiency insights'
          },
          'KPI Dashboard': {
            'GET /api/analytics/dashboard/kpis': 'Get comprehensive KPI dashboard',
            'GET /api/analytics/dashboard/financial': 'Get financial KPIs',
            'GET /api/analytics/dashboard/operational': 'Get operational KPIs',
            'GET /api/analytics/dashboard/performance': 'Get performance KPIs',
            'GET /api/analytics/dashboard/growth': 'Get growth KPIs'
          },
          'Forecasting': {
            'POST /api/analytics/forecasting/models': 'Create forecasting model',
            'GET /api/analytics/forecasting/models': 'List forecasting models',
            'POST /api/analytics/forecasting/models/:id/predict': 'Generate predictions',
            'GET /api/analytics/forecasting/predictions/:id': 'Get model predictions'
          },
          'Data Processing': {
            'POST /api/analytics/processing/bulk': 'Start bulk data processing',
            'GET /api/analytics/processing/status/:jobId': 'Get processing job status',
            'POST /api/analytics/processing/aggregate': 'Perform real-time aggregation'
          },
          'Data Export': {
            'POST /api/analytics/export': 'Export analytics data',
            'GET /api/analytics/export/:exportId': 'Get export status',
            'GET /api/analytics/export/:exportId/download': 'Download exported data'
          }
        }
      });
    });

    // Catch-all route
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        message: `The requested route ${req.originalUrl} does not exist`,
        availableRoutes: [
          'GET /health',
          'GET /metrics',
          'GET /api/docs',
          'POST /api/analytics/*'
        ]
      });
    });
  }

  setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Handle analytics subscriptions
      socket.on('subscribe_analytics', (subscriptionData) => {
        const { types = [], timeWindow = '1h' } = subscriptionData;
        
        console.log(`Client ${socket.id} subscribed to analytics:`, types);
        
        // Join rooms for specific analytics types
        types.forEach(type => {
          socket.join(`analytics:${type}`);
        });

        // Send initial data
        this.sendInitialAnalyticsData(socket, types, timeWindow);
      });

      // Handle dashboard subscriptions
      socket.on('subscribe_dashboard', (dashboardType) => {
        console.log(`Client ${socket.id} subscribed to dashboard: ${dashboardType}`);
        socket.join(`dashboard:${dashboardType}`);
        
        // Send initial dashboard data
        this.sendInitialDashboardData(socket, dashboardType);
      });

      // Handle real-time KPI subscriptions
      socket.on('subscribe_kpis', (kpiTypes) => {
        console.log(`Client ${socket.id} subscribed to KPIs:`, kpiTypes);
        socket.join('kpis');
        
        // Send initial KPI data
        this.sendInitialKPIData(socket, kpiTypes);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error(`Socket error for client ${socket.id}:`, error);
      });
    });

    // Set up real-time data broadcasting
    this.setupRealTimeBroadcasting();
  }

  setupRealTimeBroadcasting() {
    // Broadcast real-time analytics updates every 30 seconds
    setInterval(async () => {
      try {
        if (this.analyticsController) {
          // Get latest real-time metrics
          const metrics = await this.analyticsController.getAllRealTimeMetrics('5m');
          
          // Broadcast to subscribed clients
          this.io.to('analytics:orders').emit('realtime_update', {
            type: 'orders',
            data: metrics.orders,
            timestamp: new Date()
          });

          this.io.to('analytics:revenue').emit('realtime_update', {
            type: 'revenue',
            data: metrics.revenue,
            timestamp: new Date()
          });

          this.io.to('analytics:users').emit('realtime_update', {
            type: 'users',
            data: metrics.users,
            timestamp: new Date()
          });

          this.io.to('analytics:restaurants').emit('realtime_update', {
            type: 'restaurants',
            data: metrics.restaurants,
            timestamp: new Date()
          });

          this.io.to('analytics:delivery').emit('realtime_update', {
            type: 'delivery',
            data: metrics.delivery,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error broadcasting real-time updates:', error);
      }
    }, 30000); // 30 seconds

    // Broadcast KPI updates every 2 minutes
    setInterval(async () => {
      try {
        if (this.analyticsController) {
          const kpis = await this.analyticsController.analyticsService.generateKPIDashboard();
          
          this.io.to('kpis').emit('kpi_update', {
            data: kpis,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error broadcasting KPI updates:', error);
      }
    }, 120000); // 2 minutes
  }

  setupErrorHandling() {
    // Error handling middleware
    this.app.use(errorHandler);

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.gracefulShutdown('SIGTERM', 1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown('SIGTERM', 1);
    });

    // Handle process termination
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM', 0));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT', 0));
  }

  async sendInitialAnalyticsData(socket, types, timeWindow) {
    try {
      for (const type of types) {
        // Get initial data for each subscribed type
        let data;
        switch (type) {
          case 'orders':
            data = await this.analyticsController.dataProcessingService
              .performRealTimeAggregation('order_metrics', { timeWindow });
            break;
          case 'revenue':
            data = await this.analyticsController.dataProcessingService
              .performRealTimeAggregation('revenue_metrics', { timeWindow });
            break;
          // Add more cases as needed
        }

        socket.emit('initial_data', {
          type,
          data,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error sending initial analytics data:', error);
      socket.emit('error', { message: 'Failed to load initial analytics data' });
    }
  }

  async sendInitialDashboardData(socket, dashboardType) {
    try {
      // Send initial dashboard data based on type
      const dashboardData = await this.analyticsController.analyticsService
        .generateKPIDashboard();

      socket.emit('initial_dashboard', {
        type: dashboardType,
        data: dashboardData[dashboardType] || dashboardData,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error sending initial dashboard data:', error);
      socket.emit('error', { message: 'Failed to load initial dashboard data' });
    }
  }

  async sendInitialKPIData(socket, kpiTypes) {
    try {
      const kpis = await this.analyticsController.analyticsService
        .generateKPIDashboard();

      socket.emit('initial_kpis', {
        data: kpis,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error sending initial KPI data:', error);
      socket.emit('error', { message: 'Failed to load initial KPI data' });
    }
  }

  async initialize() {
    try {
      console.log('Initializing Analytics Service...');

      // Connect to databases
      await connectDatabases();
      console.log('✓ Database connections established');

      // Initialize analytics controller
      this.analyticsController = new AnalyticsController();
      console.log('✓ Analytics controller initialized');

      console.log('✓ Analytics Service initialization complete');

    } catch (error) {
      console.error('Failed to initialize Analytics Service:', error);
      process.exit(1);
    }
  }

  async start() {
    try {
      await this.initialize();

      this.server.listen(this.port, () => {
        console.log('\n🚀 QuickBite Analytics Service Started Successfully!');
        console.log(`📊 Server running on port ${this.port}`);
        console.log(`🌐 Health check: http://localhost:${this.port}/health`);
        console.log(`📖 API docs: http://localhost:${this.port}/api/docs`);
        console.log(`🔗 WebSocket: ws://localhost:${this.port}`);
        console.log(`📈 Analytics API: http://localhost:${this.port}/api/analytics`);
        console.log(`⚡ Real-time analytics and business intelligence ready!\n`);
      });

    } catch (error) {
      console.error('Failed to start Analytics Service:', error);
      process.exit(1);
    }
  }

  async gracefulShutdown(signal, exitCode) {
    console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

    // Close server
    if (this.server) {
      this.server.close(() => {
        console.log('✓ HTTP server closed');
      });
    }

    // Close WebSocket connections
    if (this.io) {
      this.io.close(() => {
        console.log('✓ WebSocket server closed');
      });
    }

    // Close database connections
    try {
      await closeDatabases();
      console.log('✓ Database connections closed');
    } catch (error) {
      console.error('Error closing databases:', error);
    }

    console.log('✓ Analytics Service shutdown complete');
    process.exit(exitCode);
  }
}

module.exports = AnalyticsApp;

// Start the application if this file is run directly
if (require.main === module) {
  const analyticsApp = new AnalyticsApp();
  analyticsApp.start();
}