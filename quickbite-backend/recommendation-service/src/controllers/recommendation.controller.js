const RecommendationService = require('../services/recommendation.service');
const ABTestingFramework = require('../testing/ab-testing');
const { validateRequest, handleAsyncErrors } = require('../middleware/validation');

class RecommendationController {
  constructor() {
    this.recommendationService = new RecommendationService({
      enableABTesting: true,
      enableNeuralNetwork: true,
      enableTrending: true,
      defaultAlgorithm: 'hybrid'
    });

    this.abTesting = new ABTestingFramework();
    
    // Initialize service
    this.recommendationService.initialize().catch(console.error);
  }

  // Get personalized recommendations for a user
  getRecommendations = handleAsyncErrors(async (req, res) => {
    const { userId } = req.params;
    const {
      limit = 10,
      algorithm = null,
      context = {},
      includeExplanations = true,
      diversityFactor = 0.3,
      excludeInteracted = true
    } = req.query;

    try {
      // Validate parameters
      if (!userId) {
        return res.status(400).json({
          error: 'User ID is required',
          code: 'MISSING_USER_ID'
        });
      }

      if (limit > 50) {
        return res.status(400).json({
          error: 'Limit cannot exceed 50 recommendations',
          code: 'LIMIT_EXCEEDED'
        });
      }

      // Parse context if provided as string
      let parsedContext = {};
      if (typeof context === 'string') {
        try {
          parsedContext = JSON.parse(context);
        } catch (error) {
          return res.status(400).json({
            error: 'Invalid context JSON format',
            code: 'INVALID_CONTEXT'
          });
        }
      } else {
        parsedContext = context;
      }

      // Add request metadata to context
      parsedContext.requestTime = new Date();
      parsedContext.userAgent = req.headers['user-agent'];
      parsedContext.ipAddress = req.ip;

      // Get recommendations
      const result = await this.recommendationService.getRecommendations(userId, {
        limit: parseInt(limit),
        algorithm,
        context: parsedContext,
        includeExplanations: includeExplanations === 'true',
        diversityFactor: parseFloat(diversityFactor),
        excludeInteracted: excludeInteracted === 'true'
      });

      res.json({
        success: true,
        data: result,
        meta: {
          userId,
          requestTime: parsedContext.requestTime,
          algorithm: result.algorithm,
          totalRecommendations: result.totalGenerated
        }
      });

    } catch (error) {
      console.error('Error in getRecommendations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate recommendations',
        code: 'RECOMMENDATION_ERROR',
        message: error.message
      });
    }
  });

  // Get personalized mixed recommendations
  getPersonalizedRecommendations = handleAsyncErrors(async (req, res) => {
    const { userId } = req.params;
    const { limit = 10, context = {} } = req.query;

    try {
      if (!userId) {
        return res.status(400).json({
          error: 'User ID is required',
          code: 'MISSING_USER_ID'
        });
      }

      let parsedContext = typeof context === 'string' ? JSON.parse(context) : context;
      
      const result = await this.recommendationService.getPersonalizedRecommendations(userId, {
        limit: parseInt(limit),
        context: parsedContext
      });

      res.json({
        success: true,
        data: result,
        meta: {
          userId,
          requestTime: new Date(),
          recommendationType: 'personalized_mixed'
        }
      });

    } catch (error) {
      console.error('Error in getPersonalizedRecommendations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate personalized recommendations',
        code: 'PERSONALIZED_RECOMMENDATION_ERROR'
      });
    }
  });

  // Get contextual recommendations
  getContextualRecommendations = handleAsyncErrors(async (req, res) => {
    const { userId } = req.params;
    const { context, limit = 10 } = req.query;

    try {
      if (!userId || !context) {
        return res.status(400).json({
          error: 'User ID and context are required',
          code: 'MISSING_PARAMETERS'
        });
      }

      const parsedContext = typeof context === 'string' ? JSON.parse(context) : context;
      
      const result = await this.recommendationService.getContextualRecommendations(
        userId, 
        parsedContext, 
        { limit: parseInt(limit) }
      );

      res.json({
        success: true,
        data: result,
        meta: {
          userId,
          context: parsedContext,
          requestTime: new Date()
        }
      });

    } catch (error) {
      console.error('Error in getContextualRecommendations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate contextual recommendations',
        code: 'CONTEXTUAL_RECOMMENDATION_ERROR'
      });
    }
  });

  // Get trending recommendations
  getTrendingRecommendations = handleAsyncErrors(async (req, res) => {
    const {
      limit = 10,
      timePeriod = 'day',
      category = null,
      mealPeriod = null
    } = req.query;

    try {
      const result = await this.recommendationService.trendingAnalysis.getTrendingRecommendations({
        limit: parseInt(limit),
        timePeriod,
        category,
        mealPeriod
      });

      res.json({
        success: true,
        data: {
          recommendations: result,
          algorithm: 'trending_analysis',
          totalGenerated: result.length
        },
        meta: {
          timePeriod,
          category,
          mealPeriod,
          requestTime: new Date()
        }
      });

    } catch (error) {
      console.error('Error in getTrendingRecommendations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get trending recommendations',
        code: 'TRENDING_RECOMMENDATION_ERROR'
      });
    }
  });

  // Get seasonal recommendations
  getSeasonalRecommendations = handleAsyncErrors(async (req, res) => {
    const {
      limit = 10,
      mealPeriod = null
    } = req.query;

    try {
      const result = await this.recommendationService.trendingAnalysis.getSeasonalRecommendations({
        limit: parseInt(limit),
        mealPeriod
      });

      res.json({
        success: true,
        data: {
          recommendations: result,
          algorithm: 'seasonal_analysis',
          totalGenerated: result.length
        },
        meta: {
          mealPeriod,
          requestTime: new Date()
        }
      });

    } catch (error) {
      console.error('Error in getSeasonalRecommendations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get seasonal recommendations',
        code: 'SEASONAL_RECOMMENDATION_ERROR'
      });
    }
  });

  // Track user interaction with recommendations
  trackInteraction = handleAsyncErrors(async (req, res) => {
    const { userId, itemId } = req.params;
    const { interactionType, metadata = {} } = req.body;

    try {
      if (!userId || !itemId || !interactionType) {
        return res.status(400).json({
          error: 'User ID, item ID, and interaction type are required',
          code: 'MISSING_PARAMETERS'
        });
      }

      // Validate interaction type
      const validInteractionTypes = ['view', 'click', 'purchase', 'favorite', 'share', 'rate'];
      if (!validInteractionTypes.includes(interactionType)) {
        return res.status(400).json({
          error: 'Invalid interaction type',
          code: 'INVALID_INTERACTION_TYPE',
          validTypes: validInteractionTypes
        });
      }

      // Track the interaction
      await this.recommendationService.trackInteraction(userId, itemId, interactionType, metadata);

      res.json({
        success: true,
        message: 'Interaction tracked successfully',
        data: {
          userId,
          itemId,
          interactionType,
          trackedAt: new Date()
        }
      });

    } catch (error) {
      console.error('Error in trackInteraction:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to track interaction',
        code: 'TRACK_INTERACTION_ERROR'
      });
    }
  });

  // A/B Testing Management

  // Create new A/B test experiment
  createExperiment = handleAsyncErrors(async (req, res) => {
    const {
      name,
      description,
      controlAlgorithm,
      treatmentAlgorithm,
      trafficSplit = 0.5,
      targetMetrics = ['ctr', 'conversion_rate'],
      segmentFilters = {},
      duration = 14
    } = req.body;

    try {
      if (!name || !controlAlgorithm || !treatmentAlgorithm) {
        return res.status(400).json({
          error: 'Name, control algorithm, and treatment algorithm are required',
          code: 'MISSING_EXPERIMENT_PARAMETERS'
        });
      }

      const experimentId = await this.abTesting.createExperiment({
        name,
        description,
        controlAlgorithm,
        treatmentAlgorithm,
        trafficSplit,
        targetMetrics,
        segmentFilters,
        duration
      });

      res.status(201).json({
        success: true,
        data: {
          experimentId,
          name,
          status: 'created'
        },
        message: 'Experiment created successfully'
      });

    } catch (error) {
      console.error('Error in createExperiment:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create experiment',
        code: 'CREATE_EXPERIMENT_ERROR',
        message: error.message
      });
    }
  });

  // Get experiment results
  getExperimentResults = handleAsyncErrors(async (req, res) => {
    const { experimentId } = req.params;

    try {
      if (!experimentId) {
        return res.status(400).json({
          error: 'Experiment ID is required',
          code: 'MISSING_EXPERIMENT_ID'
        });
      }

      const results = await this.abTesting.analyzeExperiment(experimentId);
      
      if (!results) {
        return res.status(404).json({
          error: 'Experiment not found',
          code: 'EXPERIMENT_NOT_FOUND'
        });
      }

      res.json({
        success: true,
        data: results,
        meta: {
          experimentId,
          analyzedAt: results.analyzedAt
        }
      });

    } catch (error) {
      console.error('Error in getExperimentResults:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get experiment results',
        code: 'EXPERIMENT_RESULTS_ERROR'
      });
    }
  });

  // Get experiment summary
  getExperimentSummary = handleAsyncErrors(async (req, res) => {
    const { experimentId } = req.params;

    try {
      const summary = await this.abTesting.getExperimentSummary(experimentId);
      
      if (!summary) {
        return res.status(404).json({
          error: 'Experiment not found',
          code: 'EXPERIMENT_NOT_FOUND'
        });
      }

      res.json({
        success: true,
        data: summary,
        meta: {
          experimentId,
          requestTime: new Date()
        }
      });

    } catch (error) {
      console.error('Error in getExperimentSummary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get experiment summary',
        code: 'EXPERIMENT_SUMMARY_ERROR'
      });
    }
  });

  // Stop experiment
  stopExperiment = handleAsyncErrors(async (req, res) => {
    const { experimentId } = req.params;

    try {
      await this.abTesting.stopExperiment(experimentId);

      res.json({
        success: true,
        message: 'Experiment stopped successfully',
        data: {
          experimentId,
          stoppedAt: new Date()
        }
      });

    } catch (error) {
      console.error('Error in stopExperiment:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to stop experiment',
        code: 'STOP_EXPERIMENT_ERROR'
      });
    }
  });

  // Performance and Analytics

  // Get service status
  getServiceStatus = handleAsyncErrors(async (req, res) => {
    try {
      const status = await this.recommendationService.getServiceStatus();

      res.json({
        success: true,
        data: status,
        meta: {
          requestTime: new Date(),
          version: process.env.npm_package_version || '1.0.0'
        }
      });

    } catch (error) {
      console.error('Error in getServiceStatus:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get service status',
        code: 'SERVICE_STATUS_ERROR'
      });
    }
  });

  // Get algorithm performance metrics
  getAlgorithmPerformance = handleAsyncErrors(async (req, res) => {
    try {
      const metrics = await this.recommendationService.getAlgorithmPerformanceMetrics();

      res.json({
        success: true,
        data: metrics,
        meta: {
          requestTime: new Date(),
          algorithmsTracked: Object.keys(metrics).length
        }
      });

    } catch (error) {
      console.error('Error in getAlgorithmPerformance:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get algorithm performance',
        code: 'ALGORITHM_PERFORMANCE_ERROR'
      });
    }
  });

  // Neural Network Management

  // Train neural network model
  trainNeuralModel = handleAsyncErrors(async (req, res) => {
    try {
      if (!this.recommendationService.config.enableNeuralNetwork) {
        return res.status(400).json({
          error: 'Neural network is not enabled',
          code: 'NEURAL_NETWORK_DISABLED'
        });
      }

      // Check if training is already in progress
      const status = this.recommendationService.neuralEngine.getTrainingStatus();
      if (status.isTraining) {
        return res.status(409).json({
          error: 'Neural model training already in progress',
          code: 'TRAINING_IN_PROGRESS',
          data: status
        });
      }

      // Start training (async)
      this.recommendationService.neuralEngine.trainModel().then(success => {
        console.log(`Neural model training completed: ${success ? 'success' : 'failed'}`);
      }).catch(error => {
        console.error('Neural model training error:', error);
      });

      res.json({
        success: true,
        message: 'Neural model training started',
        data: {
          trainingStarted: true,
          startTime: new Date()
        }
      });

    } catch (error) {
      console.error('Error in trainNeuralModel:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start neural model training',
        code: 'NEURAL_TRAINING_ERROR'
      });
    }
  });

  // Get neural model status
  getNeuralModelStatus = handleAsyncErrors(async (req, res) => {
    try {
      if (!this.recommendationService.config.enableNeuralNetwork) {
        return res.status(400).json({
          error: 'Neural network is not enabled',
          code: 'NEURAL_NETWORK_DISABLED'
        });
      }

      const status = this.recommendationService.neuralEngine.getTrainingStatus();

      res.json({
        success: true,
        data: status,
        meta: {
          requestTime: new Date()
        }
      });

    } catch (error) {
      console.error('Error in getNeuralModelStatus:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get neural model status',
        code: 'NEURAL_STATUS_ERROR'
      });
    }
  });

  // Trending Analysis Management

  // Trigger trending analysis
  analyzeTrends = handleAsyncErrors(async (req, res) => {
    try {
      if (!this.recommendationService.config.enableTrending) {
        return res.status(400).json({
          error: 'Trending analysis is not enabled',
          code: 'TRENDING_DISABLED'
        });
      }

      // Start analysis (async)
      this.recommendationService.trendingAnalysis.analyzeTrends().then(success => {
        console.log(`Trending analysis completed: ${success ? 'success' : 'failed'}`);
      }).catch(error => {
        console.error('Trending analysis error:', error);
      });

      res.json({
        success: true,
        message: 'Trending analysis started',
        data: {
          analysisStarted: true,
          startTime: new Date()
        }
      });

    } catch (error) {
      console.error('Error in analyzeTrends:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start trending analysis',
        code: 'TRENDING_ANALYSIS_ERROR'
      });
    }
  });

  // Get trending analysis status
  getTrendingStatus = handleAsyncErrors(async (req, res) => {
    try {
      if (!this.recommendationService.config.enableTrending) {
        return res.status(400).json({
          error: 'Trending analysis is not enabled',
          code: 'TRENDING_DISABLED'
        });
      }

      const status = this.recommendationService.trendingAnalysis.getAnalysisStatus();

      res.json({
        success: true,
        data: status,
        meta: {
          requestTime: new Date()
        }
      });

    } catch (error) {
      console.error('Error in getTrendingStatus:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get trending status',
        code: 'TRENDING_STATUS_ERROR'
      });
    }
  });

  // Health check endpoint
  healthCheck = handleAsyncErrors(async (req, res) => {
    try {
      const status = await this.recommendationService.getServiceStatus();
      
      res.json({
        success: true,
        status: 'healthy',
        data: {
          isInitialized: status.isInitialized,
          timestamp: new Date(),
          uptime: process.uptime()
        }
      });

    } catch (error) {
      console.error('Error in healthCheck:', error);
      res.status(503).json({
        success: false,
        status: 'unhealthy',
        error: 'Service health check failed',
        timestamp: new Date()
      });
    }
  });
}

module.exports = RecommendationController;