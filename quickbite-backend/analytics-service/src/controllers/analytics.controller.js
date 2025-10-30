const express = require('express');
const AnalyticsService = require('../services/analytics.service');
const DataProcessingService = require('../services/data-processing.service');
const ForecastingEngine = require('../forecasting/forecasting-engine');
const { redis } = require('../config/database');
const rateLimit = require('express-rate-limit');

class AnalyticsController {
  constructor() {
    this.router = express.Router();
    this.analyticsService = new AnalyticsService();
    this.dataProcessingService = new DataProcessingService();
    this.forecastingEngine = new ForecastingEngine();

    // Rate limiting for analytics endpoints
    this.rateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many analytics requests, please try again later'
    });

    this.setupRoutes();
    this.setupRealTimeListeners();
  }

  setupRoutes() {
    // Apply rate limiting to all routes
    this.router.use(this.rateLimiter);

    // Real-time analytics endpoints
    this.router.get('/realtime/metrics', this.getRealTimeMetrics.bind(this));
    this.router.get('/realtime/orders', this.getRealTimeOrderMetrics.bind(this));
    this.router.get('/realtime/revenue', this.getRealTimeRevenue.bind(this));
    this.router.get('/realtime/users', this.getRealTimeUserActivity.bind(this));
    this.router.get('/realtime/restaurants', this.getRealTimeRestaurantMetrics.bind(this));
    this.router.get('/realtime/delivery', this.getRealTimeDeliveryMetrics.bind(this));

    // Business intelligence endpoints
    this.router.get('/insights/business', this.getBusinessInsights.bind(this));
    this.router.get('/insights/revenue', this.getRevenueInsights.bind(this));
    this.router.get('/insights/customers', this.getCustomerInsights.bind(this));
    this.router.get('/insights/restaurants', this.getRestaurantInsights.bind(this));
    this.router.get('/insights/operations', this.getOperationalInsights.bind(this));

    // KPI dashboard endpoints
    this.router.get('/dashboard/kpis', this.getKPIDashboard.bind(this));
    this.router.get('/dashboard/financial', this.getFinancialKPIs.bind(this));
    this.router.get('/dashboard/operational', this.getOperationalKPIs.bind(this));
    this.router.get('/dashboard/performance', this.getPerformanceKPIs.bind(this));
    this.router.get('/dashboard/growth', this.getGrowthKPIs.bind(this));

    // Forecasting endpoints
    this.router.post('/forecasting/models', this.createForecastingModel.bind(this));
    this.router.get('/forecasting/models', this.getForecastingModels.bind(this));
    this.router.get('/forecasting/models/:modelId', this.getForecastingModel.bind(this));
    this.router.post('/forecasting/models/:modelId/predict', this.generateForecasts.bind(this));
    this.router.get('/forecasting/predictions/:modelId', this.getForecastingPredictions.bind(this));

    // Data processing endpoints
    this.router.post('/processing/bulk', this.processBulkData.bind(this));
    this.router.get('/processing/status/:jobId', this.getProcessingStatus.bind(this));
    this.router.post('/processing/aggregate', this.performAggregation.bind(this));

    // Data export endpoints
    this.router.post('/export', this.exportAnalyticsData.bind(this));
    this.router.get('/export/:exportId', this.getExportStatus.bind(this));
    this.router.get('/export/:exportId/download', this.downloadExportedData.bind(this));

    // Data quality endpoints
    this.router.get('/quality/:dataSource', this.getDataQuality.bind(this));
    this.router.post('/quality/:dataSource/check', this.performDataQualityCheck.bind(this));

    // Custom analytics endpoints
    this.router.post('/custom/query', this.executeCustomAnalytics.bind(this));
    this.router.post('/custom/report', this.generateCustomReport.bind(this));

    // Health and monitoring
    this.router.get('/health', this.getHealthStatus.bind(this));
    this.router.get('/stats', this.getAnalyticsStats.bind(this));
  }

  setupRealTimeListeners() {
    // Listen for real-time updates from analytics service
    this.analyticsService.on('real_time_update', (data) => {
      // Broadcast to connected clients (WebSocket implementation would go here)
      this.broadcastRealTimeUpdate(data);
    });

    // Listen for processing updates
    this.dataProcessingService.on('processing_update', (data) => {
      this.broadcastProcessingUpdate(data);
    });
  }

  // Real-time Analytics Endpoints
  async getRealTimeMetrics(req, res) {
    try {
      const { category, timeWindow = '1h' } = req.query;

      // Check cache first
      const cacheKey = `realtime:metrics:${category}:${timeWindow}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return res.json({
          success: true,
          data: JSON.parse(cached),
          fromCache: true,
          timestamp: new Date()
        });
      }

      // Get real-time metrics based on category
      let metrics;
      switch (category) {
        case 'orders':
          metrics = await this.analyticsService.processOrderEvent();
          break;
        case 'revenue':
          metrics = await this.getRealTimeRevenueData(timeWindow);
          break;
        case 'users':
          metrics = await this.getRealTimeUserData(timeWindow);
          break;
        default:
          metrics = await this.getAllRealTimeMetrics(timeWindow);
      }

      // Cache results for 30 seconds
      await redis.setex(cacheKey, 30, JSON.stringify(metrics));

      res.json({
        success: true,
        data: metrics,
        fromCache: false,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error getting real-time metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve real-time metrics',
        message: error.message
      });
    }
  }

  async getRealTimeOrderMetrics(req, res) {
    try {
      const { timeWindow = '1h' } = req.query;

      const orderMetrics = await this.dataProcessingService.performRealTimeAggregation('order_metrics', {
        timeWindow,
        metrics: ['count', 'revenue', 'avg_value', 'cancellation_rate']
      });

      res.json({
        success: true,
        data: orderMetrics,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error getting real-time order metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve order metrics',
        message: error.message
      });
    }
  }

  async getRealTimeRevenue(req, res) {
    try {
      const { timeWindow = '1h', groupBy } = req.query;

      const revenueMetrics = await this.dataProcessingService.performRealTimeAggregation('revenue_metrics', {
        timeWindow,
        groupBy: groupBy ? groupBy.split(',') : ['hour'],
        metrics: ['total', 'average', 'peak', 'volatility']
      });

      res.json({
        success: true,
        data: revenueMetrics,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error getting real-time revenue:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve revenue metrics',
        message: error.message
      });
    }
  }

  // Business Intelligence Endpoints
  async getBusinessInsights(req, res) {
    try {
      const { timeRange = '24h' } = req.query;

      // Check cache for business insights
      const cacheKey = `insights:business:${timeRange}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        return res.json({
          success: true,
          data: JSON.parse(cached),
          fromCache: true
        });
      }

      const insights = await this.analyticsService.generateBusinessInsights(timeRange);

      // Cache for 10 minutes
      await redis.setex(cacheKey, 600, JSON.stringify(insights));

      res.json({
        success: true,
        data: insights,
        fromCache: false,
        generatedAt: new Date()
      });

    } catch (error) {
      console.error('Error getting business insights:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate business insights',
        message: error.message
      });
    }
  }

  async getCustomerInsights(req, res) {
    try {
      const { timeRange = '7d', segment } = req.query;

      const customerInsights = await this.analyticsService.analyzeCustomerBehavior(timeRange);

      // Filter by segment if specified
      if (segment && customerInsights.customer_segments) {
        customerInsights.customer_segments = customerInsights.customer_segments
          .filter(s => s.segment.toLowerCase() === segment.toLowerCase());
      }

      res.json({
        success: true,
        data: customerInsights,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error getting customer insights:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve customer insights',
        message: error.message
      });
    }
  }

  // KPI Dashboard Endpoints
  async getKPIDashboard(req, res) {
    try {
      const { refresh = false } = req.query;

      if (!refresh) {
        // Try to get from cache first
        const cached = await redis.get('dashboard:kpis');
        if (cached) {
          return res.json({
            success: true,
            data: JSON.parse(cached),
            fromCache: true
          });
        }
      }

      const kpiDashboard = await this.analyticsService.generateKPIDashboard();

      res.json({
        success: true,
        data: kpiDashboard,
        fromCache: false,
        generatedAt: new Date()
      });

    } catch (error) {
      console.error('Error getting KPI dashboard:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve KPI dashboard',
        message: error.message
      });
    }
  }

  // Forecasting Endpoints
  async createForecastingModel(req, res) {
    try {
      const {
        modelName,
        modelType,
        targetMetric,
        trainingDataQuery,
        parameters = {}
      } = req.body;

      // Validate required fields
      if (!modelName || !modelType || !targetMetric || !trainingDataQuery) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: modelName, modelType, targetMetric, trainingDataQuery'
        });
      }

      const modelResult = await this.forecastingEngine.createForecastingModel({
        modelName,
        modelType,
        targetMetric,
        trainingDataQuery,
        parameters
      });

      res.status(201).json({
        success: true,
        data: modelResult,
        message: 'Forecasting model created successfully'
      });

    } catch (error) {
      console.error('Error creating forecasting model:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create forecasting model',
        message: error.message
      });
    }
  }

  async generateForecasts(req, res) {
    try {
      const { modelId } = req.params;
      const { forecastHorizon = 7 } = req.body;

      const predictions = await this.forecastingEngine.generateForecasts(
        modelId, 
        parseInt(forecastHorizon)
      );

      res.json({
        success: true,
        data: {
          modelId,
          forecastHorizon: parseInt(forecastHorizon),
          predictions,
          generatedAt: new Date()
        }
      });

    } catch (error) {
      console.error('Error generating forecasts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate forecasts',
        message: error.message
      });
    }
  }

  // Data Processing Endpoints
  async processBulkData(req, res) {
    try {
      const {
        dataSource,
        processingOptions = {}
      } = req.body;

      if (!dataSource) {
        return res.status(400).json({
          success: false,
          error: 'dataSource is required'
        });
      }

      // Start bulk processing (async)
      const processingJob = this.dataProcessingService.processBulkAnalyticsData(
        dataSource, 
        processingOptions
      );

      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store job reference
      await redis.setex(`processing:job:${jobId}`, 3600, JSON.stringify({
        status: 'started',
        dataSource,
        processingOptions,
        startedAt: new Date()
      }));

      // Process and update status
      processingJob.then(async (result) => {
        await redis.setex(`processing:job:${jobId}`, 3600, JSON.stringify({
          status: 'completed',
          result,
          completedAt: new Date()
        }));
      }).catch(async (error) => {
        await redis.setex(`processing:job:${jobId}`, 3600, JSON.stringify({
          status: 'failed',
          error: error.message,
          failedAt: new Date()
        }));
      });

      res.status(202).json({
        success: true,
        jobId,
        message: 'Bulk processing started',
        statusUrl: `/api/analytics/processing/status/${jobId}`
      });

    } catch (error) {
      console.error('Error starting bulk data processing:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start bulk processing',
        message: error.message
      });
    }
  }

  async getProcessingStatus(req, res) {
    try {
      const { jobId } = req.params;

      const jobData = await redis.get(`processing:job:${jobId}`);

      if (!jobData) {
        return res.status(404).json({
          success: false,
          error: 'Job not found'
        });
      }

      res.json({
        success: true,
        data: JSON.parse(jobData)
      });

    } catch (error) {
      console.error('Error getting processing status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve processing status',
        message: error.message
      });
    }
  }

  // Data Export Endpoints
  async exportAnalyticsData(req, res) {
    try {
      const exportConfig = req.body;

      if (!exportConfig.dataSource) {
        return res.status(400).json({
          success: false,
          error: 'dataSource is required'
        });
      }

      const exportResult = await this.dataProcessingService.exportAnalyticsData(exportConfig);

      res.json({
        success: true,
        data: exportResult,
        message: 'Data exported successfully'
      });

    } catch (error) {
      console.error('Error exporting analytics data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export data',
        message: error.message
      });
    }
  }

  // Custom Analytics Endpoints
  async executeCustomAnalytics(req, res) {
    try {
      const {
        query,
        parameters = {},
        cacheResults = true,
        cacheDuration = 300
      } = req.body;

      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'query is required'
        });
      }

      // Generate cache key
      const cacheKey = `custom:query:${Buffer.from(JSON.stringify({ query, parameters })).toString('base64')}`;

      // Check cache if enabled
      if (cacheResults) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return res.json({
            success: true,
            data: JSON.parse(cached),
            fromCache: true
          });
        }
      }

      // Execute custom analytics query
      const result = await this.executeCustomQuery(query, parameters);

      // Cache results if enabled
      if (cacheResults) {
        await redis.setex(cacheKey, cacheDuration, JSON.stringify(result));
      }

      res.json({
        success: true,
        data: result,
        fromCache: false,
        executedAt: new Date()
      });

    } catch (error) {
      console.error('Error executing custom analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute custom analytics',
        message: error.message
      });
    }
  }

  // Health and Monitoring
  async getHealthStatus(req, res) {
    try {
      const healthStatus = {
        status: 'healthy',
        timestamp: new Date(),
        services: {
          analytics: 'healthy',
          database: 'healthy',
          redis: 'healthy',
          workers: 'healthy'
        },
        metrics: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          activeWorkers: this.dataProcessingService.workers.size,
          processingStats: this.dataProcessingService.processingStats
        }
      };

      // Check service health
      try {
        await redis.ping();
      } catch (error) {
        healthStatus.services.redis = 'unhealthy';
        healthStatus.status = 'degraded';
      }

      res.json({
        success: true,
        data: healthStatus
      });

    } catch (error) {
      console.error('Error getting health status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve health status',
        message: error.message
      });
    }
  }

  // Helper Methods
  async getAllRealTimeMetrics(timeWindow) {
    return {
      orders: await this.dataProcessingService.performRealTimeAggregation('order_metrics', { timeWindow }),
      revenue: await this.dataProcessingService.performRealTimeAggregation('revenue_metrics', { timeWindow }),
      users: await this.dataProcessingService.performRealTimeAggregation('user_activity', { timeWindow }),
      restaurants: await this.dataProcessingService.performRealTimeAggregation('restaurant_performance', { timeWindow }),
      delivery: await this.dataProcessingService.performRealTimeAggregation('delivery_analytics', { timeWindow })
    };
  }

  async executeCustomQuery(query, parameters) {
    // Implement secure custom query execution
    // This would include query validation, parameter sanitization, etc.
    // For now, returning a placeholder
    return {
      message: 'Custom query execution not implemented in this demo',
      query,
      parameters
    };
  }

  broadcastRealTimeUpdate(data) {
    // WebSocket broadcasting would be implemented here
    console.log('Broadcasting real-time update:', data.type);
  }

  broadcastProcessingUpdate(data) {
    // WebSocket broadcasting for processing updates
    console.log('Broadcasting processing update:', data);
  }

  getRouter() {
    return this.router;
  }
}

module.exports = AnalyticsController;