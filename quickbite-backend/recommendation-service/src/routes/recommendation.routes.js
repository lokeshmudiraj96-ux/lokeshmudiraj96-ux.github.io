const express = require('express');
const RecommendationController = require('../controllers/recommendation.controller');
const { authMiddleware, rateLimitMiddleware, validateApiKey } = require('../middleware/auth');
const { validateUserId, validateExperimentId } = require('../middleware/validation');

const router = express.Router();
const recommendationController = new RecommendationController();

// Middleware
router.use(validateApiKey); // Validate API key for all routes
router.use(rateLimitMiddleware); // Rate limiting

// Health and Status Routes
router.get('/health', recommendationController.healthCheck);
router.get('/status', authMiddleware, recommendationController.getServiceStatus);
router.get('/performance', authMiddleware, recommendationController.getAlgorithmPerformance);

// User Recommendation Routes
router.get('/users/:userId/recommendations', 
  validateUserId,
  recommendationController.getRecommendations
);

router.get('/users/:userId/recommendations/personalized',
  validateUserId, 
  recommendationController.getPersonalizedRecommendations
);

router.get('/users/:userId/recommendations/contextual',
  validateUserId,
  recommendationController.getContextualRecommendations
);

// Trending and Seasonal Routes
router.get('/trending', recommendationController.getTrendingRecommendations);
router.get('/seasonal', recommendationController.getSeasonalRecommendations);

// Interaction Tracking
router.post('/users/:userId/interactions/:itemId',
  validateUserId,
  recommendationController.trackInteraction
);

// A/B Testing Routes
router.post('/experiments', 
  authMiddleware,
  recommendationController.createExperiment
);

router.get('/experiments/:experimentId',
  authMiddleware,
  validateExperimentId,
  recommendationController.getExperimentSummary
);

router.get('/experiments/:experimentId/results',
  authMiddleware,
  validateExperimentId,
  recommendationController.getExperimentResults
);

router.put('/experiments/:experimentId/stop',
  authMiddleware,
  validateExperimentId,
  recommendationController.stopExperiment
);

// Neural Network Management Routes
router.post('/neural/train',
  authMiddleware,
  recommendationController.trainNeuralModel
);

router.get('/neural/status',
  authMiddleware,
  recommendationController.getNeuralModelStatus
);

// Trending Analysis Management Routes
router.post('/trending/analyze',
  authMiddleware,
  recommendationController.analyzeTrends
);

router.get('/trending/status',
  authMiddleware,
  recommendationController.getTrendingStatus
);

module.exports = router;