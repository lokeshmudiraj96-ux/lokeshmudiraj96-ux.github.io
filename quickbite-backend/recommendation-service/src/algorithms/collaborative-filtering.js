const { pool, redis } = require('../config/database');
const { UserInteraction, ItemFeatures } = require('../models/recommendation.model');
const math = require('mathjs');

class CollaborativeFiltering {
  constructor(options = {}) {
    this.minSimilarity = options.minSimilarity || 0.1;
    this.minCommonItems = options.minCommonItems || 3;
    this.maxNeighbors = options.maxNeighbors || 50;
    this.cacheTimeout = options.cacheTimeout || 3600; // 1 hour
  }

  // Calculate cosine similarity between two users
  calculateCosineSimilarity(userA, userB) {
    const itemsA = Object.keys(userA);
    const itemsB = Object.keys(userB);
    const commonItems = itemsA.filter(item => itemsB.includes(item));

    if (commonItems.length < this.minCommonItems) {
      return 0;
    }

    const vectorA = commonItems.map(item => userA[item]);
    const vectorB = commonItems.map(item => userB[item]);

    try {
      const dotProduct = math.dot(vectorA, vectorB);
      const magnitudeA = math.norm(vectorA);
      const magnitudeB = math.norm(vectorB);

      if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
      }

      return dotProduct / (magnitudeA * magnitudeB);
    } catch (error) {
      console.error('Error calculating cosine similarity:', error);
      return 0;
    }
  }

  // Calculate Pearson correlation coefficient
  calculatePearsonCorrelation(userA, userB) {
    const itemsA = Object.keys(userA);
    const itemsB = Object.keys(userB);
    const commonItems = itemsA.filter(item => itemsB.includes(item));

    if (commonItems.length < this.minCommonItems) {
      return 0;
    }

    const ratingsA = commonItems.map(item => userA[item]);
    const ratingsB = commonItems.map(item => userB[item]);

    const meanA = ratingsA.reduce((sum, rating) => sum + rating, 0) / ratingsA.length;
    const meanB = ratingsB.reduce((sum, rating) => sum + rating, 0) / ratingsB.length;

    let numerator = 0;
    let sumSquareA = 0;
    let sumSquareB = 0;

    for (let i = 0; i < ratingsA.length; i++) {
      const diffA = ratingsA[i] - meanA;
      const diffB = ratingsB[i] - meanB;
      
      numerator += diffA * diffB;
      sumSquareA += diffA * diffA;
      sumSquareB += diffB * diffB;
    }

    const denominator = Math.sqrt(sumSquareA * sumSquareB);
    
    if (denominator === 0) {
      return 0;
    }

    return numerator / denominator;
  }

  // Calculate Jaccard similarity for binary preferences
  calculateJaccardSimilarity(userA, userB) {
    const itemsA = new Set(Object.keys(userA));
    const itemsB = new Set(Object.keys(userB));
    
    const intersection = new Set([...itemsA].filter(x => itemsB.has(x)));
    const union = new Set([...itemsA, ...itemsB]);

    if (union.size === 0) {
      return 0;
    }

    return intersection.size / union.size;
  }

  // Find similar users for a given user
  async findSimilarUsers(userId, similarityType = 'cosine') {
    const cacheKey = `similar_users:${userId}:${similarityType}`;
    
    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get user's interaction data
    const targetUserData = await UserInteraction.getUserSimilarityData(userId);
    
    if (Object.keys(targetUserData).length === 0) {
      return [];
    }

    // Get all other users with interactions
    const query = `
      SELECT DISTINCT user_id
      FROM user_interactions 
      WHERE user_id != $1
      AND created_at > CURRENT_TIMESTAMP - INTERVAL '90 days'
    `;
    
    const result = await pool.query(query, [userId]);
    const otherUsers = result.rows.map(row => row.user_id);

    const similarities = [];

    // Calculate similarity with each user
    for (const otherUserId of otherUsers) {
      const otherUserData = await UserInteraction.getUserSimilarityData(otherUserId);
      
      let similarity;
      switch (similarityType) {
        case 'pearson':
          similarity = this.calculatePearsonCorrelation(targetUserData, otherUserData);
          break;
        case 'jaccard':
          similarity = this.calculateJaccardSimilarity(targetUserData, otherUserData);
          break;
        default:
          similarity = this.calculateCosineSimilarity(targetUserData, otherUserData);
      }

      if (similarity >= this.minSimilarity) {
        similarities.push({
          userId: otherUserId,
          similarity: similarity
        });
      }
    }

    // Sort by similarity and limit results
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topSimilar = similarities.slice(0, this.maxNeighbors);

    // Cache results
    await redis.setex(cacheKey, this.cacheTimeout, JSON.stringify(topSimilar));

    return topSimilar;
  }

  // Generate collaborative filtering recommendations
  async generateRecommendations(userId, options = {}) {
    const {
      limit = 10,
      excludeInteracted = true,
      similarityType = 'cosine',
      minScore = 0.1
    } = options;

    try {
      // Get similar users
      const similarUsers = await this.findSimilarUsers(userId, similarityType);
      
      if (similarUsers.length === 0) {
        return [];
      }

      // Get items the target user has already interacted with (to exclude)
      let excludedItems = [];
      if (excludeInteracted) {
        const userInteractions = await UserInteraction.getByUserId(userId, 1000);
        excludedItems = userInteractions.map(interaction => interaction.itemId);
      }

      // Get recommendations from similar users
      const itemScores = {};
      const itemDetails = {};

      for (const { userId: similarUserId, similarity } of similarUsers) {
        const similarUserInteractions = await UserInteraction.getByUserId(similarUserId, 100);
        
        for (const interaction of similarUserInteractions) {
          const itemId = interaction.itemId;
          
          // Skip if user already interacted with this item
          if (excludedItems.includes(itemId)) {
            continue;
          }

          // Calculate weighted score
          const implicitRating = interaction.getImplicitRating();
          const weightedScore = similarity * implicitRating;
          
          if (!itemScores[itemId]) {
            itemScores[itemId] = {
              totalScore: 0,
              totalWeight: 0,
              count: 0
            };
          }
          
          itemScores[itemId].totalScore += weightedScore;
          itemScores[itemId].totalWeight += similarity;
          itemScores[itemId].count += 1;

          // Store item details
          if (!itemDetails[itemId] && interaction.item_features) {
            itemDetails[itemId] = interaction.item_features;
          }
        }
      }

      // Calculate final scores and create recommendations
      const recommendations = [];
      
      for (const [itemId, scores] of Object.entries(itemScores)) {
        if (scores.totalWeight > 0) {
          const finalScore = scores.totalScore / scores.totalWeight;
          
          if (finalScore >= minScore) {
            recommendations.push({
              itemId,
              score: finalScore,
              confidence: Math.min(1, scores.count / 5), // Confidence based on number of similar users who liked it
              recommendationType: 'collaborative',
              algorithm: `collaborative_${similarityType}`,
              explanation: `Recommended based on ${scores.count} similar users who liked this item`,
              itemDetails: itemDetails[itemId]
            });
          }
        }
      }

      // Sort by score and limit results
      recommendations.sort((a, b) => b.score - a.score);
      return recommendations.slice(0, limit);

    } catch (error) {
      console.error('Error generating collaborative filtering recommendations:', error);
      return [];
    }
  }

  // Matrix factorization using SVD (simplified version)
  async generateMatrixFactorizationRecommendations(userId, options = {}) {
    const {
      limit = 10,
      factors = 50,
      iterations = 100,
      learningRate = 0.01,
      regularization = 0.01
    } = options;

    try {
      // Get user-item interaction matrix
      const query = `
        SELECT DISTINCT user_id FROM user_interactions 
        WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
        LIMIT 1000
      `;
      
      const usersResult = await pool.query(query);
      const userIds = usersResult.rows.map(row => row.user_id);

      const itemsQuery = `
        SELECT DISTINCT item_id FROM user_interactions ui
        JOIN item_features if ON ui.item_id = if.item_id
        WHERE ui.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
        AND if.availability_score > 0.5
        LIMIT 1000
      `;
      
      const itemsResult = await pool.query(itemsQuery);
      const itemIds = itemsResult.rows.map(row => row.item_id);

      // Get interaction matrix
      const matrix = await UserInteraction.getInteractionMatrix(userIds, itemIds);

      // Create user and item index mappings
      const userIndex = {};
      const itemIndex = {};
      userIds.forEach((id, index) => { userIndex[id] = index; });
      itemIds.forEach((id, index) => { itemIndex[id] = index; });

      // Initialize factor matrices
      const userFactors = this.initializeMatrix(userIds.length, factors);
      const itemFactors = this.initializeMatrix(itemIds.length, factors);

      // Matrix factorization using stochastic gradient descent
      for (let iter = 0; iter < iterations; iter++) {
        for (const userId of userIds) {
          if (!matrix[userId]) continue;
          
          const userIdx = userIndex[userId];
          
          for (const [itemId, rating] of Object.entries(matrix[userId])) {
            const itemIdx = itemIndex[itemId];
            if (itemIdx === undefined) continue;

            // Predict rating
            let prediction = 0;
            for (let f = 0; f < factors; f++) {
              prediction += userFactors[userIdx][f] * itemFactors[itemIdx][f];
            }

            const error = rating - prediction;

            // Update factors
            for (let f = 0; f < factors; f++) {
              const userFactor = userFactors[userIdx][f];
              const itemFactor = itemFactors[itemIdx][f];

              userFactors[userIdx][f] += learningRate * (error * itemFactor - regularization * userFactor);
              itemFactors[itemIdx][f] += learningRate * (error * userFactor - regularization * itemFactor);
            }
          }
        }
      }

      // Generate recommendations for the target user
      const targetUserIdx = userIndex[userId];
      if (targetUserIdx === undefined) {
        return [];
      }

      const recommendations = [];
      const userInteractedItems = matrix[userId] ? Object.keys(matrix[userId]) : [];

      for (let itemIdx = 0; itemIdx < itemIds.length; itemIdx++) {
        const itemId = itemIds[itemIdx];
        
        // Skip items user already interacted with
        if (userInteractedItems.includes(itemId)) {
          continue;
        }

        // Calculate predicted rating
        let prediction = 0;
        for (let f = 0; f < factors; f++) {
          prediction += userFactors[targetUserIdx][f] * itemFactors[itemIdx][f];
        }

        if (prediction > 0) {
          recommendations.push({
            itemId,
            score: Math.min(5, Math.max(0, prediction)),
            confidence: 0.8, // Matrix factorization typically has good confidence
            recommendationType: 'collaborative',
            algorithm: 'matrix_factorization',
            explanation: 'Recommended using collaborative filtering with matrix factorization'
          });
        }
      }

      // Sort and limit results
      recommendations.sort((a, b) => b.score - a.score);
      return recommendations.slice(0, limit);

    } catch (error) {
      console.error('Error generating matrix factorization recommendations:', error);
      return [];
    }
  }

  // Initialize matrix with small random values
  initializeMatrix(rows, cols) {
    const matrix = [];
    for (let i = 0; i < rows; i++) {
      matrix[i] = [];
      for (let j = 0; j < cols; j++) {
        matrix[i][j] = (Math.random() - 0.5) * 0.1; // Small random values
      }
    }
    return matrix;
  }

  // Update user similarity matrix (batch job)
  async updateUserSimilarityMatrix() {
    console.log('🔄 Updating user similarity matrix...');
    
    try {
      // Get all active users
      const query = `
        SELECT DISTINCT user_id FROM user_interactions 
        WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '90 days'
      `;
      
      const result = await pool.query(query);
      const userIds = result.rows.map(row => row.user_id);

      console.log(`Processing ${userIds.length} users...`);

      // Calculate similarities for all user pairs
      const similarities = [];
      
      for (let i = 0; i < userIds.length; i++) {
        const userA = userIds[i];
        const userDataA = await UserInteraction.getUserSimilarityData(userA);
        
        for (let j = i + 1; j < userIds.length; j++) {
          const userB = userIds[j];
          const userDataB = await UserInteraction.getUserSimilarityData(userB);
          
          // Calculate different similarity types
          const cosine = this.calculateCosineSimilarity(userDataA, userDataB);
          const pearson = this.calculatePearsonCorrelation(userDataA, userDataB);
          const jaccard = this.calculateJaccardSimilarity(userDataA, userDataB);
          
          if (cosine >= this.minSimilarity) {
            similarities.push([userA, userB, cosine, 'cosine']);
            similarities.push([userB, userA, cosine, 'cosine']); // Symmetric
          }
          
          if (pearson >= this.minSimilarity) {
            similarities.push([userA, userB, pearson, 'pearson']);
            similarities.push([userB, userA, pearson, 'pearson']);
          }
          
          if (jaccard >= this.minSimilarity) {
            similarities.push([userA, userB, jaccard, 'jaccard']);
            similarities.push([userB, userA, jaccard, 'jaccard']);
          }
        }

        // Progress logging
        if (i % 100 === 0) {
          console.log(`Processed ${i}/${userIds.length} users`);
        }
      }

      // Batch insert similarities
      if (similarities.length > 0) {
        // Clear old similarities
        await pool.query('DELETE FROM user_similarity WHERE calculated_at < CURRENT_TIMESTAMP - INTERVAL \'7 days\'');
        
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
            INSERT INTO user_similarity (user_id_1, user_id_2, similarity_score, similarity_type)
            VALUES ${values}
            ON CONFLICT (user_id_1, user_id_2, similarity_type) 
            DO UPDATE SET 
              similarity_score = EXCLUDED.similarity_score,
              calculated_at = CURRENT_TIMESTAMP
          `;
          
          await pool.query(insertQuery, flatValues);
        }
      }

      console.log(`✅ Updated ${similarities.length} user similarity pairs`);

    } catch (error) {
      console.error('❌ Error updating user similarity matrix:', error);
      throw error;
    }
  }

  // Get collaborative filtering performance metrics
  async getPerformanceMetrics(userId, testInteractions) {
    try {
      const recommendations = await this.generateRecommendations(userId, { limit: 20 });
      const recommendedItems = recommendations.map(r => r.itemId);
      const actualItems = testInteractions.map(i => i.itemId);

      // Calculate precision, recall, and F1-score
      const truePositives = recommendedItems.filter(item => actualItems.includes(item)).length;
      const precision = recommendedItems.length > 0 ? truePositives / recommendedItems.length : 0;
      const recall = actualItems.length > 0 ? truePositives / actualItems.length : 0;
      const f1Score = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

      // Calculate NDCG (Normalized Discounted Cumulative Gain)
      let dcg = 0;
      let idcg = 0;

      for (let i = 0; i < Math.min(recommendedItems.length, 10); i++) {
        const relevance = actualItems.includes(recommendedItems[i]) ? 1 : 0;
        dcg += relevance / Math.log2(i + 2);
      }

      for (let i = 0; i < Math.min(actualItems.length, 10); i++) {
        idcg += 1 / Math.log2(i + 2);
      }

      const ndcg = idcg > 0 ? dcg / idcg : 0;

      return {
        precision,
        recall,
        f1Score,
        ndcg,
        coverage: recommendedItems.length / recommendations.length,
        diversity: this.calculateDiversity(recommendations)
      };

    } catch (error) {
      console.error('Error calculating performance metrics:', error);
      return null;
    }
  }

  calculateDiversity(recommendations) {
    // Calculate diversity based on category spread
    const categories = recommendations
      .map(r => r.itemDetails?.category)
      .filter(Boolean);
    
    const uniqueCategories = new Set(categories);
    return uniqueCategories.size / Math.max(categories.length, 1);
  }
}

module.exports = CollaborativeFiltering;