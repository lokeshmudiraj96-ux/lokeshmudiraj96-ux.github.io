const CollaborativeFiltering = require('../algorithms/collaborative-filtering');
const ContentBasedFiltering = require('../algorithms/content-based-filtering');
const HybridRecommendationEngine = require('../algorithms/hybrid-recommendation');
const NeuralRecommendationEngine = require('../algorithms/neural-recommendation');
const TrendingAndSeasonalAnalysis = require('../algorithms/trending-seasonal');
const ABTestingFramework = require('../testing/ab-testing');
const { redis } = require('../config/database');

class RecommendationService {
  constructor(options = {}) {
    // Initialize all recommendation algorithms
    this.collaborative = new CollaborativeFiltering({
      minSimilarUsers: options.minSimilarUsers || 5,
      minCommonItems: options.minCommonItems || 3
    });

    this.contentBased = new ContentBasedFiltering({
      minContentSimilarity: options.minContentSimilarity || 0.1,
      diversityFactor: options.diversityFactor || 0.2
    });

    this.hybridEngine = new HybridRecommendationEngine({
      collaborativeWeight: options.collaborativeWeight || 0.6,
      contentBasedWeight: options.contentBasedWeight || 0.4,
      popularityWeight: options.popularityWeight || 0.1
    });

    this.neuralEngine = new NeuralRecommendationEngine({
      embeddingDim: options.embeddingDim || 50,
      hiddenLayers: options.hiddenLayers || [128, 64, 32]
    });

    this.trendingAnalysis = new TrendingAndSeasonalAnalysis({
      trendingWindow: options.trendingWindow || 7,
      minInteractionsForTrending: options.minInteractionsForTrending || 10
    });

    this.abTesting = new ABTestingFramework({
      defaultTrafficSplit: options.defaultTrafficSplit || 0.5,
      minSampleSize: options.minSampleSize || 100
    });

    // Service configuration
    this.config = {
      defaultAlgorithm: options.defaultAlgorithm || 'hybrid',
      cacheTimeout: options.cacheTimeout || 1800,
      maxRecommendations: options.maxRecommendations || 50,
      enableABTesting: options.enableABTesting !== false,
      enableNeuralNetwork: options.enableNeuralNetwork !== false,
      enableTrending: options.enableTrending !== false
    };

    this.isInitialized = false;
    this.algorithmPerformance = new Map();
  }

  // Initialize the recommendation service
  async initialize() {
    try {
      console.log('Initializing Recommendation Service...');

      // Initialize neural network if enabled
      if (this.config.enableNeuralNetwork) {
        console.log('Initializing neural recommendation engine...');
        const neuralInitialized = await this.neuralEngine.initializeModel();
        if (neuralInitialized) {
          console.log('Neural engine initialized successfully');
        } else {
          console.log('Neural engine initialization failed, using fallback algorithms');
          this.config.enableNeuralNetwork = false;
        }
      }

      // Start trending analysis if enabled
      if (this.config.enableTrending) {
        console.log('Starting trending analysis...');
        await this.trendingAnalysis.analyzeTrends();
        this.trendingAnalysis.scheduleAnalysis();
      }

      // Schedule neural model retraining
      if (this.config.enableNeuralNetwork) {
        this.neuralEngine.scheduleRetraining(24); // Every 24 hours
      }

      this.isInitialized = true;
      console.log('Recommendation Service initialized successfully');
      
      return true;

    } catch (error) {
      console.error('Error initializing recommendation service:', error);
      return false;
    }
  }

  // Main recommendation method
  async getRecommendations(userId, options = {}) {
    const {
      limit = 10,
      algorithm = null,
      context = {},
      includeExplanations = true,
      diversityFactor = 0.3,
      excludeInteracted = true
    } = options;

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Get algorithm assignment (A/B testing or default)
      const algorithmAssignment = await this.getAlgorithmAssignment(userId, algorithm);
      
      console.log(`Generating recommendations for user ${userId} using ${algorithmAssignment.algorithm}`);

      // Generate recommendations based on assigned algorithm
      let recommendations = [];
      
      switch (algorithmAssignment.algorithm) {
        case 'collaborative':
          recommendations = await this.collaborative.generateRecommendations(userId, {
            limit: this.config.maxRecommendations,
            includeExplanations,
            excludeInteracted
          });
          break;

        case 'content_based':
          recommendations = await this.contentBased.generateRecommendations(userId, {
            limit: this.config.maxRecommendations,
            includeExplanations,
            excludeInteracted,
            diversityFactor
          });
          break;

        case 'neural':
          if (this.config.enableNeuralNetwork) {
            recommendations = await this.neuralEngine.generateRecommendations(userId, {
              limit: this.config.maxRecommendations,
              excludeInteracted,
              includeExplanations
            });
          } else {
            // Fallback to hybrid
            recommendations = await this.hybridEngine.generateRecommendations(userId, {
              limit: this.config.maxRecommendations,
              context,
              includeExplanations,
              diversityFactor
            });
          }
          break;

        case 'trending':
          if (this.config.enableTrending) {
            recommendations = await this.trendingAnalysis.getTrendingRecommendations({
              limit: this.config.maxRecommendations,
              category: context.category,
              mealPeriod: context.mealPeriod
            });
          } else {
            recommendations = await this.hybridEngine.generateRecommendations(userId, options);
          }
          break;

        default: // hybrid or custom
          recommendations = await this.hybridEngine.generateRecommendations(userId, {
            limit: this.config.maxRecommendations,
            context,
            includeExplanations,
            diversityFactor,
            method: algorithmAssignment.algorithm === 'adaptive_hybrid' ? 'adaptive' : 'weighted'
          });
      }

      // Apply post-processing
      recommendations = await this.postProcessRecommendations(
        recommendations, 
        userId, 
        context, 
        algorithmAssignment
      );

      // Track experiment interaction if applicable
      if (algorithmAssignment.isExperiment) {
        await this.trackExperimentRecommendations(userId, recommendations, algorithmAssignment);
      }

      // Update algorithm performance metrics
      await this.updateAlgorithmPerformance(algorithmAssignment.algorithm, recommendations);

      // Return final recommendations
      const finalRecommendations = recommendations.slice(0, limit);
      
      console.log(`Generated ${finalRecommendations.length} recommendations for user ${userId}`);
      
      return {
        recommendations: finalRecommendations,
        algorithm: algorithmAssignment.algorithm,
        totalGenerated: recommendations.length,
        experimentInfo: algorithmAssignment.isExperiment ? {
          experimentId: algorithmAssignment.experimentId,
          variant: algorithmAssignment.variant
        } : null,
        context: {
          userId,
          generatedAt: new Date(),
          options: { limit, context, includeExplanations, diversityFactor }
        }
      };

    } catch (error) {
      console.error('Error generating recommendations:', error);
      
      // Fallback to simple popularity-based recommendations
      return this.getFallbackRecommendations(userId, limit);
    }
  }

  // Get personalized recommendations with mixed algorithms
  async getPersonalizedRecommendations(userId, options = {}) {
    const { limit = 10, context = {} } = options;

    try {
      // Get recommendations from multiple algorithms
      const [hybridRecs, trendingRecs, seasonalRecs] = await Promise.all([
        this.hybridEngine.generateRecommendations(userId, {
          limit: Math.ceil(limit * 0.6),
          context,
          method: 'adaptive'
        }),
        
        this.config.enableTrending ? 
          this.trendingAnalysis.getTrendingRecommendations({
            limit: Math.ceil(limit * 0.3),
            category: context.category
          }) : [],
          
        this.config.enableTrending ?
          this.trendingAnalysis.getSeasonalRecommendations({
            limit: Math.ceil(limit * 0.2),
            mealPeriod: context.mealPeriod
          }) : []
      ]);

      // Combine and deduplicate recommendations
      const combinedRecs = this.combineRecommendations([
        { recs: hybridRecs, weight: 0.6, source: 'personalized' },
        { recs: trendingRecs, weight: 0.3, source: 'trending' },
        { recs: seasonalRecs, weight: 0.2, source: 'seasonal' }
      ]);

      // Apply diversity and limit
      const diverseRecs = this.applyDiversity(combinedRecs, 0.4);
      
      return {
        recommendations: diverseRecs.slice(0, limit),
        algorithm: 'personalized_mixed',
        sources: ['personalized', 'trending', 'seasonal']
      };

    } catch (error) {
      console.error('Error generating personalized recommendations:', error);
      return this.getFallbackRecommendations(userId, limit);
    }
  }

  // Get contextual recommendations based on situation
  async getContextualRecommendations(userId, context, options = {}) {
    const { limit = 10 } = options;

    try {
      let recommendationStrategy = 'hybrid';
      let contextualOptions = { ...options, context };

      // Determine strategy based on context
      if (context.isFirstVisit) {
        recommendationStrategy = 'trending';
        contextualOptions.includePopular = true;
      } else if (context.isExploring) {
        recommendationStrategy = 'content_based';
        contextualOptions.diversityFactor = 0.5;
      } else if (context.timeOfDay) {
        // Time-based recommendations
        const seasonal = await this.trendingAnalysis.getSeasonalRecommendations({
          limit: limit * 2,
          mealPeriod: this.getMealPeriodFromTime(context.timeOfDay)
        });
        
        if (seasonal.length > 0) {
          return {
            recommendations: seasonal.slice(0, limit),
            algorithm: 'seasonal_contextual',
            context: { mealPeriod: this.getMealPeriodFromTime(context.timeOfDay) }
          };
        }
      }

      return this.getRecommendations(userId, {
        ...contextualOptions,
        algorithm: recommendationStrategy,
        limit
      });

    } catch (error) {
      console.error('Error generating contextual recommendations:', error);
      return this.getFallbackRecommendations(userId, limit);
    }
  }

  // Get algorithm assignment (with A/B testing)
  async getAlgorithmAssignment(userId, requestedAlgorithm) {
    try {
      // If specific algorithm requested, use it
      if (requestedAlgorithm) {
        return {
          algorithm: requestedAlgorithm,
          isExperiment: false,
          experimentId: null,
          variant: null
        };
      }

      // Check A/B testing assignment if enabled
      if (this.config.enableABTesting) {
        const assignment = await this.abTesting.getUserAlgorithm(userId, this.config.defaultAlgorithm);
        return assignment;
      }

      // Default algorithm
      return {
        algorithm: this.config.defaultAlgorithm,
        isExperiment: false,
        experimentId: null,
        variant: null
      };

    } catch (error) {
      console.error('Error getting algorithm assignment:', error);
      return {
        algorithm: this.config.defaultAlgorithm,
        isExperiment: false,
        experimentId: null,
        variant: null
      };
    }
  }

  // Post-process recommendations
  async postProcessRecommendations(recommendations, userId, context, algorithmAssignment) {
    try {
      // Add metadata
      recommendations.forEach(rec => {
        rec.userId = userId;
        rec.generatedAt = new Date();
        rec.algorithmUsed = algorithmAssignment.algorithm;
        
        if (algorithmAssignment.isExperiment) {
          rec.experimentId = algorithmAssignment.experimentId;
          rec.variant = algorithmAssignment.variant;
        }
      });

      // Apply business rules
      recommendations = await this.applyBusinessRules(recommendations, context);

      // Apply final ranking adjustments
      recommendations = this.applyRankingAdjustments(recommendations, context);

      return recommendations;

    } catch (error) {
      console.error('Error post-processing recommendations:', error);
      return recommendations;
    }
  }

  // Apply business rules (availability, promotions, etc.)
  async applyBusinessRules(recommendations, context) {
    try {
      // Filter unavailable items
      const availableRecs = recommendations.filter(rec => 
        !rec.itemDetails || rec.itemDetails.availability_score > 0.5
      );

      // Apply promotional boosts
      if (context.promotionalItems) {
        availableRecs.forEach(rec => {
          if (context.promotionalItems.includes(rec.itemId)) {
            rec.score *= 1.2; // 20% boost for promotional items
            rec.isPromotional = true;
          }
        });
      }

      // Apply location-based filtering
      if (context.location && context.maxDistance) {
        // This would filter by restaurant location distance
        // Implementation depends on restaurant location data structure
      }

      return availableRecs;

    } catch (error) {
      console.error('Error applying business rules:', error);
      return recommendations;
    }
  }

  // Apply ranking adjustments
  applyRankingAdjustments(recommendations, context) {
    try {
      // Boost recently updated items
      const now = new Date();
      recommendations.forEach(rec => {
        if (rec.itemDetails && rec.itemDetails.updated_at) {
          const daysSinceUpdate = (now - new Date(rec.itemDetails.updated_at)) / (1000 * 60 * 60 * 24);
          if (daysSinceUpdate < 7) {
            rec.score *= (1 + (7 - daysSinceUpdate) * 0.02);
          }
        }
      });

      // Re-sort after adjustments
      recommendations.sort((a, b) => b.score - a.score);

      return recommendations;

    } catch (error) {
      console.error('Error applying ranking adjustments:', error);
      return recommendations;
    }
  }

  // Combine recommendations from multiple sources
  combineRecommendations(sources) {
    const itemScores = new Map();

    sources.forEach(({ recs, weight, source }) => {
      recs.forEach((rec, index) => {
        const positionPenalty = index * 0.05; // Slight penalty for lower positions
        const adjustedScore = rec.score * weight * (1 - positionPenalty);

        if (itemScores.has(rec.itemId)) {
          const existing = itemScores.get(rec.itemId);
          existing.score += adjustedScore;
          existing.sources.push(source);
        } else {
          itemScores.set(rec.itemId, {
            ...rec,
            score: adjustedScore,
            sources: [source]
          });
        }
      });
    });

    return Array.from(itemScores.values()).sort((a, b) => b.score - a.score);
  }

  // Apply diversity to recommendations
  applyDiversity(recommendations, diversityFactor) {
    if (recommendations.length <= 1 || diversityFactor <= 0) {
      return recommendations;
    }

    const diversified = [recommendations[0]]; // Keep top recommendation
    const usedCategories = new Set();
    const usedCuisines = new Set();

    if (recommendations[0].itemDetails) {
      if (recommendations[0].itemDetails.category) {
        usedCategories.add(recommendations[0].itemDetails.category);
      }
      if (recommendations[0].itemDetails.cuisine_type) {
        usedCuisines.add(recommendations[0].itemDetails.cuisine_type);
      }
    }

    for (let i = 1; i < recommendations.length; i++) {
      const rec = recommendations[i];
      const category = rec.itemDetails?.category;
      const cuisine = rec.itemDetails?.cuisine_type;

      let diversityBonus = 1;

      // Reward category diversity
      if (category && !usedCategories.has(category)) {
        diversityBonus += diversityFactor;
        usedCategories.add(category);
      }

      // Reward cuisine diversity
      if (cuisine && !usedCuisines.has(cuisine)) {
        diversityBonus += diversityFactor * 0.5;
        usedCuisines.add(cuisine);
      }

      rec.score *= diversityBonus;
      diversified.push(rec);
    }

    return diversified.sort((a, b) => b.score - a.score);
  }

  // Track experiment recommendations
  async trackExperimentRecommendations(userId, recommendations, algorithmAssignment) {
    try {
      if (!algorithmAssignment.isExperiment || recommendations.length === 0) {
        return;
      }

      // Track that recommendations were shown
      await redis.incr(`metrics:${algorithmAssignment.experimentId}:${algorithmAssignment.variant}:recommendations_shown`);

      // Store recommendations for later interaction tracking
      const cacheKey = `user_recs:${userId}:${algorithmAssignment.experimentId}`;
      const recData = {
        recommendations: recommendations.map(r => ({
          itemId: r.itemId,
          score: r.score,
          algorithm: r.algorithm
        })),
        shownAt: new Date(),
        experimentId: algorithmAssignment.experimentId,
        variant: algorithmAssignment.variant
      };

      await redis.setex(cacheKey, 3600, JSON.stringify(recData)); // 1 hour cache

    } catch (error) {
      console.error('Error tracking experiment recommendations:', error);
    }
  }

  // Track user interaction (for experiments and performance monitoring)
  async trackInteraction(userId, itemId, interactionType, metadata = {}) {
    try {
      // Get experiment context if user has active recommendations
      const activeExperiments = await this.abTesting.getActiveExperiments();
      
      for (const experiment of activeExperiments) {
        const recCacheKey = `user_recs:${userId}:${experiment.id}`;
        const cachedRecs = await redis.get(recCacheKey);
        
        if (cachedRecs) {
          const recData = JSON.parse(cachedRecs);
          const recommendedItem = recData.recommendations.find(r => r.itemId === itemId);
          
          if (recommendedItem) {
            // Track interaction for experiment
            await this.abTesting.trackInteraction(userId, itemId, interactionType, {
              experimentId: experiment.id,
              variant: recData.variant,
              algorithm: recommendedItem.algorithm
            });
            
            console.log(`Tracked ${interactionType} for experiment ${experiment.id}, variant ${recData.variant}`);
          }
        }
      }

      // Track for general performance monitoring
      await this.updateInteractionMetrics(userId, itemId, interactionType, metadata);

    } catch (error) {
      console.error('Error tracking interaction:', error);
    }
  }

  // Get fallback recommendations
  async getFallbackRecommendations(userId, limit) {
    try {
      console.log(`Generating fallback recommendations for user ${userId}`);
      
      // Use simple popularity-based recommendations
      const recommendations = await this.hybridEngine.generatePopularityBasedRecommendations(userId, { limit });
      
      return {
        recommendations: recommendations.slice(0, limit),
        algorithm: 'fallback_popularity',
        totalGenerated: recommendations.length,
        experimentInfo: null,
        isFallback: true
      };

    } catch (error) {
      console.error('Error generating fallback recommendations:', error);
      return {
        recommendations: [],
        algorithm: 'fallback_empty',
        totalGenerated: 0,
        experimentInfo: null,
        isFallback: true
      };
    }
  }

  // Utility methods
  getMealPeriodFromTime(timeOfDay) {
    const hour = typeof timeOfDay === 'string' ? parseInt(timeOfDay.split(':')[0]) : timeOfDay;
    
    if (hour >= 6 && hour < 11) return 'breakfast';
    if (hour >= 11 && hour < 16) return 'lunch';
    if (hour >= 18 && hour < 23) return 'dinner';
    return 'snack';
  }

  async updateAlgorithmPerformance(algorithm, recommendations) {
    try {
      const performanceKey = `algorithm_performance:${algorithm}`;
      const currentPerformance = await redis.get(performanceKey);
      
      let performance = currentPerformance ? JSON.parse(currentPerformance) : {
        totalRecommendations: 0,
        averageScore: 0,
        lastUpdated: new Date()
      };

      // Update metrics
      const avgScore = recommendations.reduce((sum, rec) => sum + rec.score, 0) / recommendations.length;
      performance.totalRecommendations += recommendations.length;
      performance.averageScore = (performance.averageScore + avgScore) / 2;
      performance.lastUpdated = new Date();

      await redis.setex(performanceKey, this.config.cacheTimeout * 24, JSON.stringify(performance));

    } catch (error) {
      console.error('Error updating algorithm performance:', error);
    }
  }

  async updateInteractionMetrics(userId, itemId, interactionType, metadata) {
    try {
      const metricsKey = `interaction_metrics:${interactionType}`;
      await redis.incr(metricsKey);
      await redis.expire(metricsKey, this.config.cacheTimeout * 24);

    } catch (error) {
      console.error('Error updating interaction metrics:', error);
    }
  }

  // Service management
  async getServiceStatus() {
    return {
      isInitialized: this.isInitialized,
      enabledAlgorithms: {
        collaborative: true,
        contentBased: true,
        hybrid: true,
        neural: this.config.enableNeuralNetwork,
        trending: this.config.enableTrending,
        abTesting: this.config.enableABTesting
      },
      neuralModelStatus: this.config.enableNeuralNetwork ? 
        this.neuralEngine.getTrainingStatus() : null,
      trendingStatus: this.config.enableTrending ?
        this.trendingAnalysis.getAnalysisStatus() : null
    };
  }

  async getAlgorithmPerformanceMetrics() {
    try {
      const algorithms = ['collaborative', 'content_based', 'hybrid', 'neural', 'trending'];
      const metrics = {};

      for (const algorithm of algorithms) {
        const performanceKey = `algorithm_performance:${algorithm}`;
        const performance = await redis.get(performanceKey);
        
        if (performance) {
          metrics[algorithm] = JSON.parse(performance);
        }
      }

      return metrics;

    } catch (error) {
      console.error('Error getting algorithm performance metrics:', error);
      return {};
    }
  }
}

module.exports = RecommendationService;