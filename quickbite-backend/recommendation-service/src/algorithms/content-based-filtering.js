const { pool, redis } = require('../config/database');
const { UserPreferences, ItemFeatures, UserInteraction } = require('../models/recommendation.model');
const natural = require('natural');
const compromise = require('compromise');
const math = require('mathjs');

class ContentBasedFiltering {
  constructor(options = {}) {
    this.minScore = options.minScore || 0.1;
    this.maxRecommendations = options.maxRecommendations || 50;
    this.cacheTimeout = options.cacheTimeout || 1800; // 30 minutes
    this.tfidf = new natural.TfIdf();
  }

  // Calculate content similarity between two items
  calculateContentSimilarity(itemA, itemB, method = 'cosine') {
    try {
      const vectorA = itemA.getContentVector();
      const vectorB = itemB.getContentVector();

      if (!vectorA || !vectorB || vectorA.length !== vectorB.length) {
        return 0;
      }

      switch (method) {
        case 'euclidean':
          return this.calculateEuclideanSimilarity(vectorA, vectorB);
        case 'manhattan':
          return this.calculateManhattanSimilarity(vectorA, vectorB);
        case 'jaccard':
          return this.calculateJaccardSimilarity(vectorA, vectorB);
        default:
          return this.calculateCosineSimilarity(vectorA, vectorB);
      }
    } catch (error) {
      console.error('Error calculating content similarity:', error);
      return 0;
    }
  }

  calculateCosineSimilarity(vectorA, vectorB) {
    try {
      const dotProduct = math.dot(vectorA, vectorB);
      const magnitudeA = math.norm(vectorA);
      const magnitudeB = math.norm(vectorB);

      if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
      }

      return dotProduct / (magnitudeA * magnitudeB);
    } catch (error) {
      return 0;
    }
  }

  calculateEuclideanSimilarity(vectorA, vectorB) {
    let sumSquaredDiffs = 0;
    for (let i = 0; i < vectorA.length; i++) {
      sumSquaredDiffs += Math.pow(vectorA[i] - vectorB[i], 2);
    }
    const distance = Math.sqrt(sumSquaredDiffs);
    return 1 / (1 + distance); // Convert distance to similarity
  }

  calculateManhattanSimilarity(vectorA, vectorB) {
    let sumAbsDiffs = 0;
    for (let i = 0; i < vectorA.length; i++) {
      sumAbsDiffs += Math.abs(vectorA[i] - vectorB[i]);
    }
    return 1 / (1 + sumAbsDiffs);
  }

  calculateJaccardSimilarity(vectorA, vectorB) {
    // Convert to binary vectors (0/1) for Jaccard
    const binaryA = vectorA.map(v => v > 0 ? 1 : 0);
    const binaryB = vectorB.map(v => v > 0 ? 1 : 0);
    
    let intersection = 0;
    let union = 0;
    
    for (let i = 0; i < binaryA.length; i++) {
      if (binaryA[i] === 1 && binaryB[i] === 1) {
        intersection++;
      }
      if (binaryA[i] === 1 || binaryB[i] === 1) {
        union++;
      }
    }
    
    return union === 0 ? 0 : intersection / union;
  }

  // Calculate text similarity using TF-IDF
  calculateTextSimilarity(textA, textB) {
    try {
      // Preprocess texts
      const processedA = this.preprocessText(textA);
      const processedB = this.preprocessText(textB);

      // Add documents to TF-IDF
      this.tfidf.addDocument(processedA);
      this.tfidf.addDocument(processedB);

      // Get TF-IDF vectors
      const vectorA = [];
      const vectorB = [];

      // Get all terms from both documents
      const allTerms = new Set([
        ...processedA.split(' '),
        ...processedB.split(' ')
      ]);

      allTerms.forEach(term => {
        vectorA.push(this.tfidf.tfidf(term, 0));
        vectorB.push(this.tfidf.tfidf(term, 1));
      });

      return this.calculateCosineSimilarity(vectorA, vectorB);
    } catch (error) {
      console.error('Error calculating text similarity:', error);
      return 0;
    }
  }

  preprocessText(text) {
    if (!text) return '';
    
    // Use compromise for better text processing
    const doc = compromise(text);
    
    // Normalize and extract meaningful terms
    return doc
      .normalize()
      .nouns()
      .adjectives()
      .out('text')
      .toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Generate content-based recommendations for a user
  async generateRecommendations(userId, options = {}) {
    const {
      limit = 10,
      excludeInteracted = true,
      includeTextSimilarity = true,
      diversityFactor = 0.3
    } = options;

    try {
      // Get user preferences
      const userPreferences = await UserPreferences.findByUserId(userId);
      if (!userPreferences) {
        return [];
      }

      // Get user's interaction history for content analysis
      const userInteractions = await UserInteraction.getByUserId(userId, 100);
      const interactedItemIds = userInteractions.map(i => i.itemId);

      // Build user content profile from liked items
      const userProfile = await this.buildUserContentProfile(userId, userInteractions);

      // Get available items (exclude already interacted if specified)
      let excludeClause = '';
      let queryParams = [];
      
      if (excludeInteracted && interactedItemIds.length > 0) {
        excludeClause = `AND item_id NOT IN (${interactedItemIds.map((_, i) => `$${i + 1}`).join(',')})`;
        queryParams = interactedItemIds;
      }

      const itemsQuery = `
        SELECT * FROM item_features 
        WHERE availability_score > 0.5 
        ${excludeClause}
        ORDER BY popularity_score DESC, rating_average DESC
        LIMIT ${this.maxRecommendations}
      `;

      const itemsResult = await pool.query(itemsQuery, queryParams);
      const items = itemsResult.rows.map(row => new ItemFeatures(row));

      if (items.length === 0) {
        return [];
      }

      // Score each item based on content similarity
      const recommendations = [];

      for (const item of items) {
        // Calculate content-based score
        let contentScore = this.calculateItemScore(item, userPreferences, userProfile);

        // Add text similarity if enabled
        if (includeTextSimilarity && userProfile.textProfile) {
          const textSim = this.calculateTextSimilarity(
            userProfile.textProfile,
            `${item.name} ${item.description} ${item.ingredients.join(' ')}`
          );
          contentScore = contentScore * 0.7 + textSim * 0.3;
        }

        if (contentScore >= this.minScore) {
          recommendations.push({
            itemId: item.itemId,
            score: contentScore,
            confidence: this.calculateConfidence(item, userPreferences),
            recommendationType: 'content',
            algorithm: 'content_based',
            explanation: this.generateExplanation(item, userPreferences),
            itemDetails: {
              name: item.name,
              category: item.category,
              cuisine_type: item.cuisineType,
              price: item.price,
              spice_level: item.spiceLevel,
              dietary_tags: item.dietaryTags
            }
          });
        }
      }

      // Apply diversity if requested
      let finalRecommendations = recommendations;
      if (diversityFactor > 0) {
        finalRecommendations = this.applyDiversification(recommendations, diversityFactor);
      }

      // Sort by score and limit results
      finalRecommendations.sort((a, b) => b.score - a.score);
      return finalRecommendations.slice(0, limit);

    } catch (error) {
      console.error('Error generating content-based recommendations:', error);
      return [];
    }
  }

  // Build user content profile from interaction history
  async buildUserContentProfile(userId, interactions) {
    try {
      const profile = {
        categoryWeights: {},
        cuisineWeights: {},
        featureVector: new Array(30).fill(0), // Fixed size feature vector
        textProfile: '',
        avgPrice: 0,
        avgSpiceLevel: 0,
        preferredDietaryTags: {},
        timePreferences: {}
      };

      if (interactions.length === 0) {
        return profile;
      }

      let totalWeight = 0;
      let priceSum = 0;
      let spiceLevelSum = 0;
      let priceCount = 0;
      let spiceLevelCount = 0;
      const textTerms = [];

      for (const interaction of interactions) {
        const weight = interaction.getImplicitRating();
        totalWeight += weight;

        // Get item features
        const item = await ItemFeatures.findByItemId(interaction.itemId);
        if (!item) continue;

        // Update category weights
        if (item.category) {
          profile.categoryWeights[item.category] = 
            (profile.categoryWeights[item.category] || 0) + weight;
        }

        // Update cuisine weights
        if (item.cuisineType) {
          profile.cuisineWeights[item.cuisineType] = 
            (profile.cuisineWeights[item.cuisineType] || 0) + weight;
        }

        // Update feature vector
        const itemVector = item.getContentVector();
        if (itemVector && itemVector.length === profile.featureVector.length) {
          for (let i = 0; i < itemVector.length; i++) {
            profile.featureVector[i] += itemVector[i] * weight;
          }
        }

        // Collect text terms
        if (item.name) textTerms.push(item.name);
        if (item.description) textTerms.push(item.description);
        if (item.ingredients) textTerms.push(...item.ingredients);

        // Update price and spice preferences
        if (item.price) {
          priceSum += item.price * weight;
          priceCount += weight;
        }

        if (item.spiceLevel !== null) {
          spiceLevelSum += item.spiceLevel * weight;
          spiceLevelCount += weight;
        }

        // Update dietary tag preferences
        if (item.dietaryTags) {
          item.dietaryTags.forEach(tag => {
            profile.preferredDietaryTags[tag] = 
              (profile.preferredDietaryTags[tag] || 0) + weight;
          });
        }

        // Update time preferences based on interaction context
        if (interaction.context && interaction.context.hour) {
          const hour = interaction.context.hour;
          const timeSlot = this.getTimeSlot(hour);
          profile.timePreferences[timeSlot] = 
            (profile.timePreferences[timeSlot] || 0) + weight;
        }
      }

      // Normalize weights
      if (totalWeight > 0) {
        Object.keys(profile.categoryWeights).forEach(category => {
          profile.categoryWeights[category] /= totalWeight;
        });

        Object.keys(profile.cuisineWeights).forEach(cuisine => {
          profile.cuisineWeights[cuisine] /= totalWeight;
        });

        for (let i = 0; i < profile.featureVector.length; i++) {
          profile.featureVector[i] /= totalWeight;
        }

        Object.keys(profile.preferredDietaryTags).forEach(tag => {
          profile.preferredDietaryTags[tag] /= totalWeight;
        });

        Object.keys(profile.timePreferences).forEach(slot => {
          profile.timePreferences[slot] /= totalWeight;
        });
      }

      // Set averages
      profile.avgPrice = priceCount > 0 ? priceSum / priceCount : 0;
      profile.avgSpiceLevel = spiceLevelCount > 0 ? spiceLevelSum / spiceLevelCount : 0;

      // Create text profile
      profile.textProfile = this.preprocessText(textTerms.join(' '));

      return profile;
    } catch (error) {
      console.error('Error building user content profile:', error);
      return {};
    }
  }

  // Calculate item score based on content similarity to user profile
  calculateItemScore(item, userPreferences, userProfile) {
    let score = 0;
    let maxScore = 0;

    // Category preference
    if (item.category && userProfile.categoryWeights) {
      const categoryWeight = userProfile.categoryWeights[item.category] || 0;
      score += categoryWeight * 3;
    }
    maxScore += 3;

    // Cuisine preference
    if (item.cuisineType && userProfile.cuisineWeights) {
      const cuisineWeight = userProfile.cuisineWeights[item.cuisineType] || 0;
      score += cuisineWeight * 3;
    }
    maxScore += 3;

    // Feature vector similarity
    if (userProfile.featureVector && item.getContentVector()) {
      const similarity = this.calculateCosineSimilarity(
        userProfile.featureVector,
        item.getContentVector()
      );
      score += similarity * 2;
    }
    maxScore += 2;

    // Price preference
    if (userProfile.avgPrice > 0 && item.price) {
      const priceDiff = Math.abs(item.price - userProfile.avgPrice) / userProfile.avgPrice;
      const priceScore = Math.max(0, 1 - priceDiff);
      score += priceScore * 1;
    }
    maxScore += 1;

    // Spice level preference
    if (userProfile.avgSpiceLevel > 0 && item.spiceLevel !== null) {
      const spiceDiff = Math.abs(item.spiceLevel - userProfile.avgSpiceLevel);
      const spiceScore = Math.max(0, 1 - spiceDiff / 5);
      score += spiceScore * 1;
    }
    maxScore += 1;

    // Dietary tags match
    if (item.dietaryTags && userProfile.preferredDietaryTags) {
      let dietaryScore = 0;
      item.dietaryTags.forEach(tag => {
        dietaryScore += userProfile.preferredDietaryTags[tag] || 0;
      });
      score += Math.min(1, dietaryScore) * 2;
    }
    maxScore += 2;

    // User preference compatibility
    const prefCompatibility = item.matchesUserPreferences(userPreferences);
    score += prefCompatibility * 2;
    maxScore += 2;

    // Popularity and rating boost
    const popularityBoost = (item.popularityScore || 0) * 0.5;
    const ratingBoost = ((item.ratingAverage || 0) / 5) * 0.5;
    score += popularityBoost + ratingBoost;
    maxScore += 1;

    return maxScore > 0 ? Math.min(1, score / maxScore) : 0;
  }

  // Calculate confidence score for a recommendation
  calculateConfidence(item, userPreferences) {
    let confidence = 0;
    let factors = 0;

    // Rating count indicates reliability
    if (item.ratingCount > 0) {
      confidence += Math.min(1, item.ratingCount / 50); // Max confidence at 50 ratings
      factors++;
    }

    // Availability score
    confidence += item.availabilityScore || 0;
    factors++;

    // User preference match strength
    const prefMatch = item.matchesUserPreferences(userPreferences);
    confidence += prefMatch;
    factors++;

    return factors > 0 ? confidence / factors : 0.5;
  }

  // Generate explanation for recommendation
  generateExplanation(item, userPreferences) {
    const reasons = [];

    // Check cuisine preference
    if (item.cuisineType && userPreferences.cuisinePreferences[item.cuisineType] > 0.3) {
      reasons.push(`you enjoy ${item.cuisineType} cuisine`);
    }

    // Check category preference
    if (userPreferences.favoriteCategories.includes(item.category)) {
      reasons.push(`you like ${item.category}s`);
    }

    // Check spice level match
    const spiceDiff = Math.abs(item.spiceLevel - userPreferences.spiceLevel);
    if (spiceDiff <= 1) {
      reasons.push(`it matches your spice preference`);
    }

    // Check dietary tags
    const matchedTags = item.dietaryTags.filter(tag => 
      userPreferences.favoriteCategories.includes(tag)
    );
    if (matchedTags.length > 0) {
      reasons.push(`it's ${matchedTags.join(' and ')}`);
    }

    // Check rating
    if (item.ratingAverage >= 4.0) {
      reasons.push(`it's highly rated (${item.ratingAverage}/5)`);
    }

    if (reasons.length === 0) {
      return 'Based on your food preferences and browsing history';
    }

    return `Recommended because ${reasons.slice(0, 3).join(', ')}`;
  }

  // Apply diversification to recommendations
  applyDiversification(recommendations, diversityFactor) {
    if (recommendations.length <= 1) {
      return recommendations;
    }

    const diversified = [recommendations[0]]; // Always include top recommendation
    const usedCategories = new Set([recommendations[0].itemDetails?.category]);
    const usedCuisines = new Set([recommendations[0].itemDetails?.cuisine_type]);

    for (let i = 1; i < recommendations.length; i++) {
      const rec = recommendations[i];
      const category = rec.itemDetails?.category;
      const cuisine = rec.itemDetails?.cuisine_type;

      // Calculate diversity score
      let diversityScore = 1;
      if (usedCategories.has(category)) diversityScore *= (1 - diversityFactor);
      if (usedCuisines.has(cuisine)) diversityScore *= (1 - diversityFactor);

      // Adjust recommendation score
      rec.score = rec.score * diversityScore;

      diversified.push(rec);
      
      if (category) usedCategories.add(category);
      if (cuisine) usedCuisines.add(cuisine);
    }

    return diversified;
  }

  // Get time slot from hour
  getTimeSlot(hour) {
    if (hour >= 6 && hour < 11) return 'breakfast';
    if (hour >= 11 && hour < 16) return 'lunch';
    if (hour >= 16 && hour < 21) return 'dinner';
    return 'snack';
  }

  // Update item similarity matrix (batch job)
  async updateItemSimilarityMatrix() {
    console.log('🔄 Updating item similarity matrix...');
    
    try {
      // Get all available items
      const query = `
        SELECT * FROM item_features 
        WHERE availability_score > 0.5
        ORDER BY popularity_score DESC
        LIMIT 2000
      `;
      
      const result = await pool.query(query);
      const items = result.rows.map(row => new ItemFeatures(row));

      console.log(`Processing ${items.length} items...`);

      const similarities = [];
      
      // Calculate content similarities for all item pairs
      for (let i = 0; i < items.length; i++) {
        const itemA = items[i];
        
        for (let j = i + 1; j < items.length; j++) {
          const itemB = items[j];
          
          // Calculate content similarity
          const contentSim = this.calculateContentSimilarity(itemA, itemB);
          
          if (contentSim >= 0.1) {
            similarities.push([itemA.itemId, itemB.itemId, contentSim, 'content']);
            similarities.push([itemB.itemId, itemA.itemId, contentSim, 'content']);
          }

          // Calculate text similarity for items with descriptions
          if (itemA.description && itemB.description) {
            const textSim = this.calculateTextSimilarity(
              `${itemA.name} ${itemA.description}`,
              `${itemB.name} ${itemB.description}`
            );
            
            if (textSim >= 0.2) {
              similarities.push([itemA.itemId, itemB.itemId, textSim, 'text']);
              similarities.push([itemB.itemId, itemA.itemId, textSim, 'text']);
            }
          }
        }

        // Progress logging
        if (i % 100 === 0) {
          console.log(`Processed ${i}/${items.length} items`);
        }
      }

      // Batch insert similarities
      if (similarities.length > 0) {
        // Clear old content similarities
        await pool.query(`
          DELETE FROM item_similarity 
          WHERE similarity_type IN ('content', 'text')
          AND calculated_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
        `);
        
        // Insert new similarities in batches
        const batchSize = 1000;
        for (let i = 0; i < similarities.length; i += batchSize) {
          const batch = similarities.slice(i, i + batchSize);
          
          const values = batch.map((sim, index) => {
            const baseIndex = i + index;
            return `($${baseIndex * 4 + 1}, $${baseIndex * 4 + 2}, $${baseIndex * 4 + 3}, $${baseIndex * 4 + 4})`;
          }).join(',');
          
          const flatValues = batch.flat();
          
          const insertQuery = `
            INSERT INTO item_similarity (item_id_1, item_id_2, similarity_score, similarity_type)
            VALUES ${values}
            ON CONFLICT (item_id_1, item_id_2, similarity_type) 
            DO UPDATE SET 
              similarity_score = EXCLUDED.similarity_score,
              calculated_at = CURRENT_TIMESTAMP
          `;
          
          await pool.query(insertQuery, flatValues);
        }
      }

      console.log(`✅ Updated ${similarities.length} item similarity pairs`);

    } catch (error) {
      console.error('❌ Error updating item similarity matrix:', error);
      throw error;
    }
  }

  // Get content-based filtering performance metrics
  async getPerformanceMetrics(userId, testInteractions) {
    try {
      const recommendations = await this.generateRecommendations(userId, { limit: 20 });
      const recommendedItems = recommendations.map(r => r.itemId);
      const actualItems = testInteractions.map(i => i.itemId);

      // Calculate metrics similar to collaborative filtering
      const truePositives = recommendedItems.filter(item => actualItems.includes(item)).length;
      const precision = recommendedItems.length > 0 ? truePositives / recommendedItems.length : 0;
      const recall = actualItems.length > 0 ? truePositives / actualItems.length : 0;
      const f1Score = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

      // Calculate diversity
      const categories = recommendations
        .map(r => r.itemDetails?.category)
        .filter(Boolean);
      const uniqueCategories = new Set(categories);
      const diversity = uniqueCategories.size / Math.max(categories.length, 1);

      // Calculate novelty (how different from user's history)
      const userInteractions = await UserInteraction.getByUserId(userId, 100);
      const userCategories = new Set(
        userInteractions
          .map(i => i.item_features?.category)
          .filter(Boolean)
      );
      
      const novelItems = recommendations.filter(r => 
        !userCategories.has(r.itemDetails?.category)
      );
      const novelty = novelItems.length / recommendations.length;

      return {
        precision,
        recall,
        f1Score,
        diversity,
        novelty,
        coverage: recommendedItems.length / recommendations.length
      };

    } catch (error) {
      console.error('Error calculating content-based performance metrics:', error);
      return null;
    }
  }
}

module.exports = ContentBasedFiltering;