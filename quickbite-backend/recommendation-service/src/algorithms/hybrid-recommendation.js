const CollaborativeFiltering = require('./collaborative-filtering');
const ContentBasedFiltering = require('./content-based-filtering');
const { pool, redis } = require('../config/database');
const { UserInteraction, ItemFeatures } = require('../models/recommendation.model');

class HybridRecommendationEngine {
  constructor(options = {}) {
    this.collaborativeFilter = new CollaborativeFiltering(options.collaborative || {});
    this.contentBasedFilter = new ContentBasedFiltering(options.contentBased || {});
    
    // Hybrid algorithm weights
    this.collaborativeWeight = options.collaborativeWeight || 0.6;
    this.contentBasedWeight = options.contentBasedWeight || 0.4;
    this.popularityWeight = options.popularityWeight || 0.1;
    
    // Cold start thresholds
    this.coldStartUserThreshold = options.coldStartUserThreshold || 5; // interactions
    this.coldStartItemThreshold = options.coldStartItemThreshold || 10; // interactions
    
    this.cacheTimeout = options.cacheTimeout || 1800; // 30 minutes
    this.maxRecommendations = options.maxRecommendations || 50;
  }

  // Main recommendation generation method
  async generateRecommendations(userId, options = {}) {
    const {
      limit = 10,
      context = {},
      includeExplanations = true,
      diversityFactor = 0.3,
      method = 'adaptive' // adaptive, weighted, switching, cascade
    } = options;

    try {
      // Check cache first
      const cacheKey = `hybrid_recommendations:${userId}:${JSON.stringify(context)}:${limit}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Analyze user to determine recommendation strategy
      const userProfile = await this.analyzeUser(userId);
      const recommendationStrategy = this.selectStrategy(userProfile, context);

      let recommendations = [];

      switch (method) {
        case 'weighted':
          recommendations = await this.generateWeightedRecommendations(userId, userProfile, options);
          break;
        case 'switching':
          recommendations = await this.generateSwitchingRecommendations(userId, userProfile, options);
          break;
        case 'cascade':
          recommendations = await this.generateCascadeRecommendations(userId, userProfile, options);
          break;
        default: // adaptive
          recommendations = await this.generateAdaptiveRecommendations(userId, userProfile, recommendationStrategy, options);
      }

      // Apply post-processing
      recommendations = await this.postProcessRecommendations(recommendations, userId, context, {
        diversityFactor,
        includeExplanations
      });

      // Cache results
      await redis.setex(cacheKey, this.cacheTimeout, JSON.stringify(recommendations));

      return recommendations.slice(0, limit);

    } catch (error) {
      console.error('Error generating hybrid recommendations:', error);
      return [];
    }
  }

  // Analyze user to determine their profile and recommendation needs
  async analyzeUser(userId) {
    try {
      // Get user interaction history
      const interactions = await UserInteraction.getByUserId(userId, 500);
      const interactionCount = interactions.length;

      // Calculate user activity metrics
      const recentInteractions = interactions.filter(i => {
        const daysSince = (Date.now() - new Date(i.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= 30;
      });

      const uniqueItems = new Set(interactions.map(i => i.itemId)).size;
      const uniqueCategories = new Set(interactions.map(i => i.item_features?.category)).filter(Boolean).size;
      const avgRating = interactions
        .filter(i => i.interactionType === 'rate')
        .reduce((sum, i) => sum + i.interactionValue, 0) / 
        Math.max(1, interactions.filter(i => i.interactionType === 'rate').length);

      // Calculate exploration vs exploitation tendency
      const explorationScore = uniqueCategories / Math.max(1, uniqueItems);
      
      // Calculate engagement level
      const engagementScore = recentInteractions.length / Math.max(1, interactionCount);

      // Determine user type
      let userType = 'new_user';
      if (interactionCount >= this.coldStartUserThreshold) {
        if (explorationScore > 0.7) {
          userType = 'explorer';
        } else if (explorationScore < 0.3) {
          userType = 'focused';
        } else if (engagementScore > 0.3) {
          userType = 'active';
        } else {
          userType = 'casual';
        }
      }

      return {
        userId,
        interactionCount,
        recentInteractionCount: recentInteractions.length,
        uniqueItems,
        uniqueCategories,
        avgRating,
        explorationScore,
        engagementScore,
        userType,
        hasCollaborativeData: interactionCount >= this.coldStartUserThreshold,
        hasContentData: uniqueItems > 0
      };

    } catch (error) {
      console.error('Error analyzing user:', error);
      return {
        userId,
        userType: 'new_user',
        hasCollaborativeData: false,
        hasContentData: false,
        interactionCount: 0
      };
    }
  }

  // Select recommendation strategy based on user profile and context
  selectStrategy(userProfile, context) {
    // Cold start handling
    if (!userProfile.hasCollaborativeData) {
      return {
        primary: 'content',
        secondary: 'popularity',
        weights: { content: 0.7, popularity: 0.3, collaborative: 0.0 }
      };
    }

    // Context-based adjustments
    if (context.isFirstVisit) {
      return {
        primary: 'popularity',
        secondary: 'content',
        weights: { popularity: 0.5, content: 0.4, collaborative: 0.1 }
      };
    }

    // User type based strategies
    switch (userProfile.userType) {
      case 'explorer':
        return {
          primary: 'content',
          secondary: 'collaborative',
          weights: { content: 0.6, collaborative: 0.3, popularity: 0.1 }
        };
        
      case 'focused':
        return {
          primary: 'collaborative',
          secondary: 'content',
          weights: { collaborative: 0.7, content: 0.2, popularity: 0.1 }
        };
        
      case 'active':
        return {
          primary: 'balanced',
          secondary: null,
          weights: { collaborative: 0.5, content: 0.4, popularity: 0.1 }
        };
        
      default: // casual, new_user
        return {
          primary: 'popularity',
          secondary: 'content',
          weights: { popularity: 0.4, content: 0.4, collaborative: 0.2 }
        };
    }
  }

  // Adaptive recommendation generation
  async generateAdaptiveRecommendations(userId, userProfile, strategy, options) {
    const recommendations = [];
    const { weights } = strategy;

    // Generate recommendations from each algorithm
    const [collaborativeRecs, contentRecs, popularityRecs] = await Promise.all([
      weights.collaborative > 0 ? this.collaborativeFilter.generateRecommendations(userId, {
        limit: this.maxRecommendations,
        ...options
      }) : [],
      
      weights.content > 0 ? this.contentBasedFilter.generateRecommendations(userId, {
        limit: this.maxRecommendations,
        ...options
      }) : [],
      
      weights.popularity > 0 ? this.generatePopularityBasedRecommendations(userId, {
        limit: this.maxRecommendations,
        ...options
      }) : []
    ]);

    // Combine recommendations with weighted scores
    const itemScores = new Map();
    
    // Process collaborative filtering recommendations
    collaborativeRecs.forEach(rec => {
      const weightedScore = rec.score * weights.collaborative;
      itemScores.set(rec.itemId, {
        itemId: rec.itemId,
        score: weightedScore,
        components: { collaborative: rec.score },
        sources: ['collaborative'],
        confidence: rec.confidence * weights.collaborative,
        itemDetails: rec.itemDetails,
        explanations: [rec.explanation]
      });
    });

    // Process content-based recommendations
    contentRecs.forEach(rec => {
      const weightedScore = rec.score * weights.content;
      
      if (itemScores.has(rec.itemId)) {
        const existing = itemScores.get(rec.itemId);
        existing.score += weightedScore;
        existing.components.content = rec.score;
        existing.sources.push('content');
        existing.confidence = Math.max(existing.confidence, rec.confidence * weights.content);
        existing.explanations.push(rec.explanation);
      } else {
        itemScores.set(rec.itemId, {
          itemId: rec.itemId,
          score: weightedScore,
          components: { content: rec.score },
          sources: ['content'],
          confidence: rec.confidence * weights.content,
          itemDetails: rec.itemDetails,
          explanations: [rec.explanation]
        });
      }
    });

    // Process popularity-based recommendations
    popularityRecs.forEach(rec => {
      const weightedScore = rec.score * weights.popularity;
      
      if (itemScores.has(rec.itemId)) {
        const existing = itemScores.get(rec.itemId);
        existing.score += weightedScore;
        existing.components.popularity = rec.score;
        existing.sources.push('popularity');
        existing.confidence = Math.max(existing.confidence, rec.confidence * weights.popularity);
        existing.explanations.push(rec.explanation);
      } else {
        itemScores.set(rec.itemId, {
          itemId: rec.itemId,
          score: weightedScore,
          components: { popularity: rec.score },
          sources: ['popularity'],
          confidence: rec.confidence * weights.popularity,
          itemDetails: rec.itemDetails,
          explanations: [rec.explanation]
        });
      }
    });

    // Convert to array and add hybrid metadata
    itemScores.forEach(rec => {
      recommendations.push({
        ...rec,
        recommendationType: 'hybrid',
        algorithm: 'adaptive_hybrid',
        hybridWeights: weights,
        sourceCount: rec.sources.length
      });
    });

    return recommendations;
  }

  // Weighted hybrid approach
  async generateWeightedRecommendations(userId, userProfile, options) {
    const [collaborativeRecs, contentRecs] = await Promise.all([
      this.collaborativeFilter.generateRecommendations(userId, options),
      this.contentBasedFilter.generateRecommendations(userId, options)
    ]);

    // Simple weighted combination
    const combinedScores = new Map();

    collaborativeRecs.forEach(rec => {
      combinedScores.set(rec.itemId, {
        ...rec,
        score: rec.score * this.collaborativeWeight,
        algorithm: 'weighted_hybrid'
      });
    });

    contentRecs.forEach(rec => {
      if (combinedScores.has(rec.itemId)) {
        const existing = combinedScores.get(rec.itemId);
        existing.score += rec.score * this.contentBasedWeight;
        existing.explanation += ` Also, ${rec.explanation}`;
      } else {
        combinedScores.set(rec.itemId, {
          ...rec,
          score: rec.score * this.contentBasedWeight,
          algorithm: 'weighted_hybrid'
        });
      }
    });

    return Array.from(combinedScores.values());
  }

  // Switching hybrid approach
  async generateSwitchingRecommendations(userId, userProfile, options) {
    // Switch between algorithms based on context
    if (!userProfile.hasCollaborativeData) {
      const recs = await this.contentBasedFilter.generateRecommendations(userId, options);
      return recs.map(rec => ({ ...rec, algorithm: 'switching_hybrid_content' }));
    }

    if (userProfile.interactionCount < 20) {
      const recs = await this.generatePopularityBasedRecommendations(userId, options);
      return recs.map(rec => ({ ...rec, algorithm: 'switching_hybrid_popularity' }));
    }

    const recs = await this.collaborativeFilter.generateRecommendations(userId, options);
    return recs.map(rec => ({ ...rec, algorithm: 'switching_hybrid_collaborative' }));
  }

  // Cascade hybrid approach
  async generateCascadeRecommendations(userId, userProfile, options) {
    let recommendations = [];
    const targetCount = options.limit || 10;

    // Start with collaborative filtering
    if (userProfile.hasCollaborativeData) {
      const collabRecs = await this.collaborativeFilter.generateRecommendations(userId, {
        ...options,
        limit: Math.ceil(targetCount * 0.6)
      });
      recommendations.push(...collabRecs.map(rec => ({ 
        ...rec, 
        algorithm: 'cascade_hybrid_collaborative' 
      })));
    }

    // Fill remaining slots with content-based
    if (recommendations.length < targetCount) {
      const contentRecs = await this.contentBasedFilter.generateRecommendations(userId, {
        ...options,
        limit: targetCount - recommendations.length,
        excludeInteracted: true
      });

      // Filter out items already recommended
      const existingItemIds = new Set(recommendations.map(r => r.itemId));
      const newContentRecs = contentRecs
        .filter(rec => !existingItemIds.has(rec.itemId))
        .map(rec => ({ ...rec, algorithm: 'cascade_hybrid_content' }));
      
      recommendations.push(...newContentRecs);
    }

    // Fill any remaining slots with popularity-based
    if (recommendations.length < targetCount) {
      const popularityRecs = await this.generatePopularityBasedRecommendations(userId, {
        ...options,
        limit: targetCount - recommendations.length
      });

      const existingItemIds = new Set(recommendations.map(r => r.itemId));
      const newPopularityRecs = popularityRecs
        .filter(rec => !existingItemIds.has(rec.itemId))
        .map(rec => ({ ...rec, algorithm: 'cascade_hybrid_popularity' }));
      
      recommendations.push(...newPopularityRecs);
    }

    return recommendations;
  }

  // Generate popularity-based recommendations
  async generatePopularityBasedRecommendations(userId, options = {}) {
    const { limit = 20, context = {} } = options;

    try {
      // Get user's interaction history to exclude
      const userInteractions = await UserInteraction.getByUserId(userId, 100);
      const excludeItemIds = userInteractions.map(i => i.itemId);

      // Build exclusion clause
      let excludeClause = '';
      let queryParams = [];
      
      if (excludeItemIds.length > 0) {
        excludeClause = `AND item_id NOT IN (${excludeItemIds.map((_, i) => `$${i + 1}`).join(',')})`;
        queryParams = excludeItemIds;
      }

      // Get trending/popular items based on context
      let orderBy = 'popularity_score DESC, rating_average DESC';
      let timeFilter = '';

      if (context.includeTrending) {
        timeFilter = `AND EXISTS (
          SELECT 1 FROM user_interactions ui 
          WHERE ui.item_id = if.item_id 
          AND ui.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
        )`;
      }

      const query = `
        SELECT if.*, 
          COALESCE(trending.trend_score, 0) as trend_score,
          (popularity_score * 0.6 + rating_average/5 * 0.3 + COALESCE(trending.trend_score, 0) * 0.1) as combined_score
        FROM item_features if
        LEFT JOIN trending_items trending ON if.item_id = trending.item_id 
          AND trending.time_period = 'day' 
          AND trending.valid_until > CURRENT_TIMESTAMP
        WHERE if.availability_score > 0.5 
          ${timeFilter}
          ${excludeClause}
        ORDER BY combined_score DESC
        LIMIT $${queryParams.length + 1}
      `;

      queryParams.push(limit);
      const result = await pool.query(query, queryParams);

      return result.rows.map((row, index) => ({
        itemId: row.item_id,
        score: Math.max(0.1, 1 - (index * 0.05)), // Decreasing score based on popularity rank
        confidence: 0.7, // Popularity has good confidence
        recommendationType: 'popularity',
        algorithm: 'popularity_based',
        explanation: `Popular ${row.category || 'item'} with ${row.rating_average}/5 rating`,
        itemDetails: {
          name: row.name,
          category: row.category,
          cuisine_type: row.cuisine_type,
          price: row.price,
          rating_average: row.rating_average,
          popularity_score: row.popularity_score
        },
        trendScore: row.trend_score
      }));

    } catch (error) {
      console.error('Error generating popularity-based recommendations:', error);
      return [];
    }
  }

  // Post-process recommendations
  async postProcessRecommendations(recommendations, userId, context, options) {
    const { diversityFactor = 0.3, includeExplanations = true } = options;

    try {
      // Sort by score initially
      recommendations.sort((a, b) => b.score - a.score);

      // Apply diversity if requested
      if (diversityFactor > 0) {
        recommendations = this.applyDiversification(recommendations, diversityFactor);
      }

      // Apply contextual adjustments
      recommendations = await this.applyContextualAdjustments(recommendations, context);

      // Generate combined explanations for hybrid recommendations
      if (includeExplanations) {
        recommendations.forEach(rec => {
          if (rec.explanations && rec.explanations.length > 1) {
            rec.explanation = this.generateHybridExplanation(rec);
          }
        });
      }

      // Add personalization score
      recommendations.forEach(rec => {
        rec.personalizationScore = this.calculatePersonalizationScore(rec);
      });

      // Re-sort after all adjustments
      recommendations.sort((a, b) => b.score - a.score);

      return recommendations;

    } catch (error) {
      console.error('Error post-processing recommendations:', error);
      return recommendations;
    }
  }

  // Apply diversification to recommendations
  applyDiversification(recommendations, diversityFactor) {
    if (recommendations.length <= 1) return recommendations;

    const diversified = [recommendations[0]]; // Keep top recommendation
    const usedCategories = new Set([recommendations[0].itemDetails?.category]);
    const usedCuisines = new Set([recommendations[0].itemDetails?.cuisine_type]);

    for (let i = 1; i < recommendations.length; i++) {
      const rec = recommendations[i];
      const category = rec.itemDetails?.category;
      const cuisine = rec.itemDetails?.cuisine_type;

      let diversityBonus = 1;
      
      // Reward diversity
      if (category && !usedCategories.has(category)) {
        diversityBonus += diversityFactor;
      }
      if (cuisine && !usedCuisines.has(cuisine)) {
        diversityBonus += diversityFactor;
      }

      // Penalize repetition
      if (category && usedCategories.has(category)) {
        diversityBonus *= (1 - diversityFactor);
      }
      if (cuisine && usedCuisines.has(cuisine)) {
        diversityBonus *= (1 - diversityFactor);
      }

      rec.score *= diversityBonus;
      diversified.push(rec);

      if (category) usedCategories.add(category);
      if (cuisine) usedCuisines.add(cuisine);
    }

    return diversified.sort((a, b) => b.score - a.score);
  }

  // Apply contextual adjustments
  async applyContextualAdjustments(recommendations, context) {
    if (!context || Object.keys(context).length === 0) {
      return recommendations;
    }

    recommendations.forEach(rec => {
      let contextBonus = 1;

      // Time-based adjustments
      if (context.timeOfDay) {
        const timeSlot = this.getTimeSlot(context.timeOfDay);
        if (this.isItemSuitableForTime(rec.itemDetails, timeSlot)) {
          contextBonus *= 1.2;
        }
      }

      // Weather-based adjustments
      if (context.weather) {
        if (this.isItemSuitableForWeather(rec.itemDetails, context.weather)) {
          contextBonus *= 1.15;
        }
      }

      // Location-based adjustments
      if (context.location && rec.itemDetails?.restaurant_id) {
        // Could implement distance-based scoring here
        contextBonus *= 1.1;
      }

      // Budget-based adjustments
      if (context.budgetRange) {
        const price = rec.itemDetails?.price || 0;
        if (price >= context.budgetRange.min && price <= context.budgetRange.max) {
          contextBonus *= 1.1;
        }
      }

      rec.score *= contextBonus;
    });

    return recommendations;
  }

  // Generate hybrid explanation
  generateHybridExplanation(rec) {
    if (!rec.explanations || rec.explanations.length <= 1) {
      return rec.explanation || 'Recommended for you';
    }

    const sources = rec.sources || [];
    let explanation = 'Recommended because ';

    if (sources.includes('collaborative') && sources.includes('content')) {
      explanation += 'users with similar taste like it and it matches your preferences';
    } else if (sources.includes('collaborative')) {
      explanation += 'users with similar taste highly rated it';
    } else if (sources.includes('content')) {
      explanation += 'it matches your food preferences';
    } else if (sources.includes('popularity')) {
      explanation += 'it\'s trending and highly rated';
    }

    // Add confidence indicator
    if (rec.confidence > 0.8) {
      explanation += ' (high confidence)';
    } else if (rec.confidence > 0.6) {
      explanation += ' (medium confidence)';
    }

    return explanation;
  }

  // Calculate personalization score
  calculatePersonalizationScore(rec) {
    let score = 0.5; // Base score

    // Higher personalization for multiple sources
    if (rec.sources && rec.sources.length > 1) {
      score += 0.2;
    }

    // Collaborative filtering is more personalized
    if (rec.sources && rec.sources.includes('collaborative')) {
      score += 0.2;
    }

    // Content-based provides good personalization
    if (rec.sources && rec.sources.includes('content')) {
      score += 0.15;
    }

    // Confidence affects personalization
    score += (rec.confidence || 0.5) * 0.15;

    return Math.min(1, score);
  }

  // Utility methods
  getTimeSlot(hour) {
    if (hour >= 6 && hour < 11) return 'breakfast';
    if (hour >= 11 && hour < 16) return 'lunch';
    if (hour >= 16 && hour < 21) return 'dinner';
    return 'snack';
  }

  isItemSuitableForTime(itemDetails, timeSlot) {
    if (!itemDetails?.category) return true;
    
    const category = itemDetails.category.toLowerCase();
    
    switch (timeSlot) {
      case 'breakfast':
        return ['breakfast', 'beverage', 'snack'].some(c => category.includes(c));
      case 'lunch':
        return ['main-course', 'salad', 'soup', 'sandwich'].some(c => category.includes(c));
      case 'dinner':
        return ['main-course', 'appetizer', 'dessert'].some(c => category.includes(c));
      default:
        return ['snack', 'beverage', 'dessert'].some(c => category.includes(c));
    }
  }

  isItemSuitableForWeather(itemDetails, weather) {
    if (!itemDetails || !weather) return true;
    
    // Simple weather-based preferences
    if (weather.temperature > 25 && itemDetails.dietary_tags?.includes('cold')) {
      return true;
    }
    
    if (weather.temperature < 15 && itemDetails.spice_level > 3) {
      return true;
    }
    
    return true; // Default to suitable
  }

  // Performance monitoring
  async getHybridPerformanceMetrics(userId, testInteractions) {
    try {
      const [adaptiveMetrics, weightedMetrics, contentMetrics, collaborativeMetrics] = await Promise.all([
        this.getAdaptiveMetrics(userId, testInteractions),
        this.getWeightedMetrics(userId, testInteractions),
        this.contentBasedFilter.getPerformanceMetrics(userId, testInteractions),
        this.collaborativeFilter.getPerformanceMetrics(userId, testInteractions)
      ]);

      return {
        adaptive: adaptiveMetrics,
        weighted: weightedMetrics,
        contentBased: contentMetrics,
        collaborative: collaborativeMetrics,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Error getting hybrid performance metrics:', error);
      return null;
    }
  }

  async getAdaptiveMetrics(userId, testInteractions) {
    const recommendations = await this.generateRecommendations(userId, { method: 'adaptive', limit: 20 });
    return this.calculateMetrics(recommendations, testInteractions);
  }

  async getWeightedMetrics(userId, testInteractions) {
    const recommendations = await this.generateRecommendations(userId, { method: 'weighted', limit: 20 });
    return this.calculateMetrics(recommendations, testInteractions);
  }

  calculateMetrics(recommendations, testInteractions) {
    const recommendedItems = recommendations.map(r => r.itemId);
    const actualItems = testInteractions.map(i => i.itemId);

    const truePositives = recommendedItems.filter(item => actualItems.includes(item)).length;
    const precision = recommendedItems.length > 0 ? truePositives / recommendedItems.length : 0;
    const recall = actualItems.length > 0 ? truePositives / actualItems.length : 0;
    const f1Score = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    return { precision, recall, f1Score };
  }
}

module.exports = HybridRecommendationEngine;