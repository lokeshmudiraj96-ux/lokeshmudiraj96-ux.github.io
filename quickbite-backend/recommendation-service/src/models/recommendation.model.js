const { pool, redis } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// User Preferences Model
class UserPreferences {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id || data.userId;
    this.cuisinePreferences = data.cuisine_preferences || {};
    this.dietaryRestrictions = data.dietary_restrictions || [];
    this.spiceLevel = data.spice_level || 3;
    this.priceSensitivity = data.price_sensitivity || 0.5;
    this.favoriteCategories = data.favorite_categories || [];
    this.dislikedCategories = data.disliked_categories || [];
    this.preferredMealTimes = data.preferred_meal_times || {};
    this.portionSizePreference = data.portion_size_preference || 'medium';
    this.healthConsciousnessScore = data.health_consciousness_score || 0.5;
    this.adventurousnessScore = data.adventurousness_score || 0.5;
    this.budgetRange = data.budget_range || { min: 0, max: 1000 };
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  static async create(userData) {
    const id = uuidv4();
    const query = `
      INSERT INTO user_preferences (
        id, user_id, cuisine_preferences, dietary_restrictions, spice_level,
        price_sensitivity, favorite_categories, disliked_categories,
        preferred_meal_times, portion_size_preference, health_consciousness_score,
        adventurousness_score, budget_range
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const values = [
      id,
      userData.userId,
      JSON.stringify(userData.cuisinePreferences || {}),
      userData.dietaryRestrictions || [],
      userData.spiceLevel || 3,
      userData.priceSensitivity || 0.5,
      userData.favoriteCategories || [],
      userData.dislikedCategories || [],
      JSON.stringify(userData.preferredMealTimes || {}),
      userData.portionSizePreference || 'medium',
      userData.healthConsciousnessScore || 0.5,
      userData.adventurousnessScore || 0.5,
      JSON.stringify(userData.budgetRange || { min: 0, max: 1000 })
    ];

    const result = await pool.query(query, values);
    return new UserPreferences(result.rows[0]);
  }

  static async findByUserId(userId) {
    const cacheKey = `user_preferences:${userId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return new UserPreferences(JSON.parse(cached));
    }

    const query = 'SELECT * FROM user_preferences WHERE user_id = $1';
    const result = await pool.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const preferences = new UserPreferences(result.rows[0]);
    
    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(preferences));
    
    return preferences;
  }

  async save() {
    const query = `
      UPDATE user_preferences SET
        cuisine_preferences = $2,
        dietary_restrictions = $3,
        spice_level = $4,
        price_sensitivity = $5,
        favorite_categories = $6,
        disliked_categories = $7,
        preferred_meal_times = $8,
        portion_size_preference = $9,
        health_consciousness_score = $10,
        adventurousness_score = $11,
        budget_range = $12,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `;

    const values = [
      this.userId,
      JSON.stringify(this.cuisinePreferences),
      this.dietaryRestrictions,
      this.spiceLevel,
      this.priceSensitivity,
      this.favoriteCategories,
      this.dislikedCategories,
      JSON.stringify(this.preferredMealTimes),
      this.portionSizePreference,
      this.healthConsciousnessScore,
      this.adventurousnessScore,
      JSON.stringify(this.budgetRange)
    ];

    const result = await pool.query(query, values);
    Object.assign(this, result.rows[0]);

    // Update cache
    const cacheKey = `user_preferences:${this.userId}`;
    await redis.setex(cacheKey, 3600, JSON.stringify(this));

    return this;
  }

  async updateFromInteractions(interactions) {
    // Analyze user interactions to update preferences
    const categoryFrequency = {};
    const cuisineFrequency = {};
    let totalRating = 0;
    let ratingCount = 0;
    let spiceLevelSum = 0;
    let spiceLevelCount = 0;

    for (const interaction of interactions) {
      if (interaction.item_features) {
        const item = interaction.item_features;
        
        // Update category preferences
        if (item.category) {
          categoryFrequency[item.category] = (categoryFrequency[item.category] || 0) + 1;
        }
        
        // Update cuisine preferences
        if (item.cuisine_type) {
          cuisineFrequency[item.cuisine_type] = (cuisineFrequency[item.cuisine_type] || 0) + 1;
        }
        
        // Update spice level preference
        if (item.spice_level !== null && interaction.interaction_type === 'rate' && interaction.interaction_value >= 4) {
          spiceLevelSum += item.spice_level;
          spiceLevelCount++;
        }
        
        // Update ratings
        if (interaction.interaction_type === 'rate') {
          totalRating += interaction.interaction_value;
          ratingCount++;
        }
      }
    }

    // Update favorite categories based on frequency
    const topCategories = Object.entries(categoryFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category]) => category);
    
    this.favoriteCategories = [...new Set([...this.favoriteCategories, ...topCategories])];

    // Update cuisine preferences
    const totalInteractions = interactions.length;
    Object.entries(cuisineFrequency).forEach(([cuisine, count]) => {
      const preference = count / totalInteractions;
      this.cuisinePreferences[cuisine] = (this.cuisinePreferences[cuisine] || 0) * 0.8 + preference * 0.2;
    });

    // Update spice level preference
    if (spiceLevelCount > 0) {
      const avgSpiceLevel = spiceLevelSum / spiceLevelCount;
      this.spiceLevel = Math.round(this.spiceLevel * 0.8 + avgSpiceLevel * 0.2);
    }

    // Update adventurousness based on variety of orders
    const uniqueItems = new Set(interactions.map(i => i.item_id)).size;
    if (interactions.length > 0) {
      const variety = uniqueItems / interactions.length;
      this.adventurousnessScore = Math.min(1.0, this.adventurousnessScore * 0.9 + variety * 0.1);
    }

    await this.save();
    return this;
  }

  getPreferenceVector() {
    // Create a numerical vector representation of user preferences
    const vector = [];
    
    // Cuisine preferences (top 20 cuisines)
    const topCuisines = ['indian', 'chinese', 'italian', 'american', 'mexican', 'thai', 'japanese', 'mediterranean', 'french', 'korean', 'vietnamese', 'greek', 'spanish', 'lebanese', 'turkish', 'brazilian', 'ethiopian', 'moroccan', 'german', 'british'];
    topCuisines.forEach(cuisine => {
      vector.push(this.cuisinePreferences[cuisine] || 0);
    });
    
    // Basic preferences
    vector.push(this.spiceLevel / 5); // Normalize to 0-1
    vector.push(this.priceSensitivity);
    vector.push(this.healthConsciousnessScore);
    vector.push(this.adventurousnessScore);
    
    // Portion size (encoded)
    const portionSizes = ['small', 'medium', 'large'];
    portionSizes.forEach(size => {
      vector.push(this.portionSizePreference === size ? 1 : 0);
    });
    
    // Time preferences
    const timeSlots = ['breakfast', 'lunch', 'dinner', 'snack'];
    timeSlots.forEach(slot => {
      vector.push(this.preferredMealTimes[slot] || 0);
    });

    return vector;
  }
}

// User Interaction Model
class UserInteraction {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id || data.userId;
    this.itemId = data.item_id || data.itemId;
    this.interactionType = data.interaction_type || data.interactionType;
    this.interactionValue = data.interaction_value || data.interactionValue;
    this.context = data.context || {};
    this.durationSeconds = data.duration_seconds || data.durationSeconds;
    this.createdAt = data.created_at || data.createdAt;
  }

  static async create(interactionData) {
    const id = uuidv4();
    const query = `
      INSERT INTO user_interactions (
        id, user_id, item_id, interaction_type, interaction_value, 
        context, duration_seconds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      id,
      interactionData.userId,
      interactionData.itemId,
      interactionData.interactionType,
      interactionData.interactionValue,
      JSON.stringify(interactionData.context || {}),
      interactionData.durationSeconds
    ];

    const result = await pool.query(query, values);
    const interaction = new UserInteraction(result.rows[0]);

    // Update real-time cache for recent interactions
    const cacheKey = `recent_interactions:${interactionData.userId}`;
    const recentInteractions = await redis.lrange(cacheKey, 0, 99) || [];
    await redis.lpush(cacheKey, JSON.stringify(interaction));
    await redis.ltrim(cacheKey, 0, 99); // Keep only last 100 interactions
    await redis.expire(cacheKey, 86400); // 24 hours

    return interaction;
  }

  static async getByUserId(userId, limit = 100, offset = 0) {
    const query = `
      SELECT ui.*, if.name, if.category, if.cuisine_type, if.price, if.spice_level
      FROM user_interactions ui
      LEFT JOIN item_features if ON ui.item_id = if.item_id
      WHERE ui.user_id = $1
      ORDER BY ui.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [userId, limit, offset]);
    return result.rows.map(row => ({
      ...new UserInteraction(row),
      item_features: {
        name: row.name,
        category: row.category,
        cuisine_type: row.cuisine_type,
        price: row.price,
        spice_level: row.spice_level
      }
    }));
  }

  static async getInteractionMatrix(userIds, itemIds) {
    // Get interaction matrix for collaborative filtering
    const query = `
      SELECT user_id, item_id, 
        CASE interaction_type
          WHEN 'view' THEN 1
          WHEN 'click' THEN 2
          WHEN 'add_to_cart' THEN 3
          WHEN 'order' THEN 5
          WHEN 'rate' THEN interaction_value
          ELSE 1
        END as weight
      FROM user_interactions
      WHERE user_id = ANY($1) AND item_id = ANY($2)
      ORDER BY user_id, item_id
    `;

    const result = await pool.query(query, [userIds, itemIds]);
    
    // Convert to matrix format
    const matrix = {};
    result.rows.forEach(row => {
      if (!matrix[row.user_id]) {
        matrix[row.user_id] = {};
      }
      matrix[row.user_id][row.item_id] = (matrix[row.user_id][row.item_id] || 0) + row.weight;
    });

    return matrix;
  }

  static async getUserSimilarityData(userId) {
    // Get data for calculating user similarity
    const query = `
      SELECT 
        item_id,
        AVG(CASE interaction_type
          WHEN 'view' THEN 1
          WHEN 'click' THEN 2
          WHEN 'add_to_cart' THEN 3
          WHEN 'order' THEN 5
          WHEN 'rate' THEN interaction_value
          ELSE 1
        END) as avg_weight
      FROM user_interactions
      WHERE user_id = $1
      GROUP BY item_id
    `;

    const result = await pool.query(query, [userId]);
    return result.rows.reduce((acc, row) => {
      acc[row.item_id] = row.avg_weight;
      return acc;
    }, {});
  }

  getImplicitRating() {
    // Convert interaction to implicit rating
    const typeWeights = {
      'view': 1,
      'click': 2,
      'add_to_cart': 3,
      'order': 5,
      'rate': this.interactionValue || 0,
      'review': 4,
      'share': 3
    };

    let baseRating = typeWeights[this.interactionType] || 1;
    
    // Adjust based on duration for view/click interactions
    if (['view', 'click'].includes(this.interactionType) && this.durationSeconds) {
      const durationBonus = Math.min(2, this.durationSeconds / 30); // Max 2 points for 30+ seconds
      baseRating += durationBonus;
    }

    return Math.min(5, baseRating);
  }
}

// Item Features Model
class ItemFeatures {
  constructor(data = {}) {
    this.id = data.id;
    this.itemId = data.item_id || data.itemId;
    this.name = data.name;
    this.description = data.description;
    this.category = data.category;
    this.subcategory = data.subcategory;
    this.cuisineType = data.cuisine_type || data.cuisineType;
    this.ingredients = data.ingredients || [];
    this.nutritionalInfo = data.nutritional_info || {};
    this.allergens = data.allergens || [];
    this.dietaryTags = data.dietary_tags || [];
    this.spiceLevel = data.spice_level || 0;
    this.preparationTime = data.preparation_time || 0;
    this.difficultyLevel = data.difficulty_level || 1;
    this.price = data.price;
    this.availabilityScore = data.availability_score || 1.0;
    this.popularityScore = data.popularity_score || 0.0;
    this.ratingAverage = data.rating_average || 0.0;
    this.ratingCount = data.rating_count || 0;
    this.restaurantId = data.restaurant_id || data.restaurantId;
    this.imageUrl = data.image_url || data.imageUrl;
    this.featuresVector = data.features_vector || [];
    this.embeddingVector = data.embedding_vector || [];
    this.tags = data.tags || [];
    this.seasonalAvailability = data.seasonal_availability || {};
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  static async create(itemData) {
    const id = uuidv4();
    const featuresVector = ItemFeatures.generateFeaturesVector(itemData);
    
    const query = `
      INSERT INTO item_features (
        id, item_id, name, description, category, subcategory, cuisine_type,
        ingredients, nutritional_info, allergens, dietary_tags, spice_level,
        preparation_time, difficulty_level, price, restaurant_id, image_url,
        features_vector, tags, seasonal_availability
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `;

    const values = [
      id,
      itemData.itemId,
      itemData.name,
      itemData.description,
      itemData.category,
      itemData.subcategory,
      itemData.cuisineType,
      itemData.ingredients || [],
      JSON.stringify(itemData.nutritionalInfo || {}),
      itemData.allergens || [],
      itemData.dietaryTags || [],
      itemData.spiceLevel || 0,
      itemData.preparationTime || 0,
      itemData.difficultyLevel || 1,
      itemData.price,
      itemData.restaurantId,
      itemData.imageUrl,
      featuresVector,
      itemData.tags || [],
      JSON.stringify(itemData.seasonalAvailability || {})
    ];

    const result = await pool.query(query, values);
    return new ItemFeatures(result.rows[0]);
  }

  static async findByItemId(itemId) {
    const cacheKey = `item_features:${itemId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return new ItemFeatures(JSON.parse(cached));
    }

    const query = 'SELECT * FROM item_features WHERE item_id = $1';
    const result = await pool.query(query, [itemId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const item = new ItemFeatures(result.rows[0]);
    
    // Cache for 6 hours
    await redis.setex(cacheKey, 21600, JSON.stringify(item));
    
    return item;
  }

  static async findByCategory(category, limit = 50) {
    const query = `
      SELECT * FROM item_features 
      WHERE category = $1 
      ORDER BY popularity_score DESC, rating_average DESC
      LIMIT $2
    `;
    
    const result = await pool.query(query, [category, limit]);
    return result.rows.map(row => new ItemFeatures(row));
  }

  static async findSimilarItems(itemId, limit = 10) {
    const query = `
      SELECT if2.*, ism.similarity_score
      FROM item_similarity ism
      JOIN item_features if2 ON ism.item_id_2 = if2.item_id
      WHERE ism.item_id_1 = $1
      ORDER BY ism.similarity_score DESC
      LIMIT $2
    `;
    
    const result = await pool.query(query, [itemId, limit]);
    return result.rows.map(row => ({
      item: new ItemFeatures(row),
      similarity: row.similarity_score
    }));
  }

  static generateFeaturesVector(itemData) {
    const vector = [];
    
    // Price category (normalized to 0-1)
    const price = itemData.price || 0;
    vector.push(Math.min(1, price / 1000)); // Assuming max price is 1000
    
    // Spice level (0-1)
    vector.push((itemData.spiceLevel || 0) / 5);
    
    // Preparation time (normalized)
    vector.push(Math.min(1, (itemData.preparationTime || 0) / 120)); // Max 2 hours
    
    // Difficulty level (0-1)
    vector.push((itemData.difficultyLevel || 1) / 5);
    
    // Dietary tags (one-hot encoding for common tags)
    const commonDietaryTags = ['vegan', 'vegetarian', 'gluten-free', 'keto', 'low-carb', 'high-protein'];
    commonDietaryTags.forEach(tag => {
      vector.push((itemData.dietaryTags || []).includes(tag) ? 1 : 0);
    });
    
    // Category encoding (one-hot for top categories)
    const topCategories = ['appetizer', 'main-course', 'dessert', 'beverage', 'snack'];
    topCategories.forEach(cat => {
      vector.push(itemData.category === cat ? 1 : 0);
    });
    
    // Nutritional features (if available)
    const nutrition = itemData.nutritionalInfo || {};
    vector.push(Math.min(1, (nutrition.calories || 0) / 1000));
    vector.push(Math.min(1, (nutrition.protein || 0) / 100));
    vector.push(Math.min(1, (nutrition.carbs || 0) / 200));
    vector.push(Math.min(1, (nutrition.fat || 0) / 100));

    return vector;
  }

  async updatePopularityScore() {
    // Calculate popularity based on recent interactions
    const query = `
      SELECT 
        COUNT(*) as total_interactions,
        COUNT(CASE WHEN interaction_type = 'order' THEN 1 END) as orders,
        COUNT(CASE WHEN interaction_type = 'view' THEN 1 END) as views,
        AVG(CASE WHEN interaction_type = 'rate' THEN interaction_value END) as avg_rating
      FROM user_interactions 
      WHERE item_id = $1 
      AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
    `;

    const result = await pool.query(query, [this.itemId]);
    const stats = result.rows[0];

    // Calculate popularity score (0-1)
    const orderWeight = 0.5;
    const viewWeight = 0.2;
    const ratingWeight = 0.3;

    const normalizedOrders = Math.min(1, stats.orders / 100); // Max 100 orders for full score
    const normalizedViews = Math.min(1, stats.views / 1000); // Max 1000 views for full score
    const normalizedRating = (stats.avg_rating || 0) / 5;

    this.popularityScore = orderWeight * normalizedOrders + 
                          viewWeight * normalizedViews + 
                          ratingWeight * normalizedRating;

    // Update in database
    const updateQuery = `
      UPDATE item_features 
      SET popularity_score = $1, updated_at = CURRENT_TIMESTAMP
      WHERE item_id = $2
    `;
    
    await pool.query(updateQuery, [this.popularityScore, this.itemId]);

    // Clear cache
    await redis.del(`item_features:${this.itemId}`);
  }

  getContentVector() {
    // Return feature vector for content-based filtering
    return this.featuresVector.length > 0 ? this.featuresVector : ItemFeatures.generateFeaturesVector(this);
  }

  matchesUserPreferences(userPreferences) {
    let score = 0;
    let maxScore = 0;

    // Check cuisine preference
    if (this.cuisineType && userPreferences.cuisinePreferences[this.cuisineType]) {
      score += userPreferences.cuisinePreferences[this.cuisineType] * 3;
    }
    maxScore += 3;

    // Check spice level preference
    const spiceDiff = Math.abs(this.spiceLevel - userPreferences.spiceLevel);
    score += Math.max(0, 2 - spiceDiff); // Max 2 points for perfect match
    maxScore += 2;

    // Check dietary restrictions
    const hasRestrictedIngredients = userPreferences.dietaryRestrictions.some(restriction => 
      this.allergens.includes(restriction) || 
      !this.dietaryTags.includes(restriction)
    );
    if (!hasRestrictedIngredients) {
      score += 2;
    }
    maxScore += 2;

    // Check price sensitivity
    const priceScore = userPreferences.priceSensitivity;
    const itemPriceCategory = this.price < 200 ? 0.2 : this.price < 500 ? 0.5 : this.price < 800 ? 0.7 : 1.0;
    if (Math.abs(priceScore - itemPriceCategory) < 0.3) {
      score += 1;
    }
    maxScore += 1;

    // Check category preferences
    if (userPreferences.favoriteCategories.includes(this.category)) {
      score += 2;
    } else if (userPreferences.dislikedCategories.includes(this.category)) {
      score -= 1;
    }
    maxScore += 2;

    return maxScore > 0 ? score / maxScore : 0;
  }
}

module.exports = {
  UserPreferences,
  UserInteraction,
  ItemFeatures
};