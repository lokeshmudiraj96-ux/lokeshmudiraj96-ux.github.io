const tf = require('@tensorflow/tfjs-node');
const { pool, redis } = require('../config/database');
const { UserInteraction, ItemFeatures, UserPreferences } = require('../models/recommendation.model');

class NeuralRecommendationEngine {
  constructor(options = {}) {
    this.modelConfig = {
      embeddingDim: options.embeddingDim || 50,
      hiddenLayers: options.hiddenLayers || [128, 64, 32],
      dropoutRate: options.dropoutRate || 0.3,
      learningRate: options.learningRate || 0.001,
      batchSize: options.batchSize || 256,
      epochs: options.epochs || 100,
      validationSplit: options.validationSplit || 0.2
    };

    this.model = null;
    this.userEncoder = null;
    this.itemEncoder = null;
    this.featureScaler = null;
    
    this.maxUsers = options.maxUsers || 10000;
    this.maxItems = options.maxItems || 5000;
    this.cacheTimeout = options.cacheTimeout || 3600; // 1 hour
    
    this.isTraining = false;
    this.lastTraining = null;
    this.modelVersion = 1;
  }

  // Initialize or load the neural network model
  async initializeModel() {
    try {
      // Try to load existing model
      const modelExists = await this.checkModelExists();
      
      if (modelExists) {
        await this.loadModel();
        console.log('Loaded existing neural recommendation model');
      } else {
        await this.createModel();
        console.log('Created new neural recommendation model');
      }

      return true;

    } catch (error) {
      console.error('Error initializing neural model:', error);
      return false;
    }
  }

  // Create new neural network architecture
  async createModel() {
    try {
      // Get vocabulary sizes
      const { maxUserId, maxItemId } = await this.getVocabularySizes();
      
      // User embedding branch
      const userInput = tf.input({ shape: [1], name: 'user_input', dtype: 'int32' });
      const userEmbedding = tf.layers.embedding({
        inputDim: maxUserId + 1,
        outputDim: this.modelConfig.embeddingDim,
        name: 'user_embedding'
      }).apply(userInput);
      const userFlat = tf.layers.flatten().apply(userEmbedding);

      // Item embedding branch
      const itemInput = tf.input({ shape: [1], name: 'item_input', dtype: 'int32' });
      const itemEmbedding = tf.layers.embedding({
        inputDim: maxItemId + 1,
        outputDim: this.modelConfig.embeddingDim,
        name: 'item_embedding'
      }).apply(itemInput);
      const itemFlat = tf.layers.flatten().apply(itemEmbedding);

      // Item features branch
      const featureInput = tf.input({ shape: [20], name: 'feature_input' }); // Adjust based on feature count
      
      // Concatenate all inputs
      const concat = tf.layers.concatenate().apply([userFlat, itemFlat, featureInput]);
      
      // Deep neural network layers
      let dense = concat;
      
      for (let i = 0; i < this.modelConfig.hiddenLayers.length; i++) {
        dense = tf.layers.dense({
          units: this.modelConfig.hiddenLayers[i],
          activation: 'relu',
          name: `dense_${i + 1}`
        }).apply(dense);
        
        dense = tf.layers.dropout({
          rate: this.modelConfig.dropoutRate,
          name: `dropout_${i + 1}`
        }).apply(dense);
      }

      // Output layers
      const ratingOutput = tf.layers.dense({
        units: 1,
        activation: 'sigmoid',
        name: 'rating_output'
      }).apply(dense);

      const categoryOutput = tf.layers.dense({
        units: 10, // Number of food categories
        activation: 'softmax',
        name: 'category_output'
      }).apply(dense);

      // Create model
      this.model = tf.model({
        inputs: [userInput, itemInput, featureInput],
        outputs: [ratingOutput, categoryOutput],
        name: 'neural_recommendation_model'
      });

      // Compile model
      this.model.compile({
        optimizer: tf.train.adam(this.modelConfig.learningRate),
        loss: {
          rating_output: 'meanSquaredError',
          category_output: 'categoricalCrossentropy'
        },
        lossWeights: {
          rating_output: 1.0,
          category_output: 0.5
        },
        metrics: ['mae', 'accuracy']
      });

      console.log('Neural recommendation model created successfully');
      return true;

    } catch (error) {
      console.error('Error creating neural model:', error);
      return false;
    }
  }

  // Train the neural network model
  async trainModel(options = {}) {
    if (this.isTraining) {
      console.log('Model training already in progress');
      return false;
    }

    try {
      this.isTraining = true;
      console.log('Starting neural model training...');

      // Prepare training data
      const trainingData = await this.prepareTrainingData();
      
      if (!trainingData || trainingData.inputs.user.shape[0] < 100) {
        console.log('Insufficient training data');
        return false;
      }

      // Create validation split
      const totalSamples = trainingData.inputs.user.shape[0];
      const trainSamples = Math.floor(totalSamples * (1 - this.modelConfig.validationSplit));

      const trainInputs = {
        user_input: trainingData.inputs.user.slice([0], [trainSamples]),
        item_input: trainingData.inputs.item.slice([0], [trainSamples]),
        feature_input: trainingData.inputs.features.slice([0], [trainSamples])
      };

      const trainTargets = {
        rating_output: trainingData.targets.ratings.slice([0], [trainSamples]),
        category_output: trainingData.targets.categories.slice([0], [trainSamples])
      };

      const valInputs = {
        user_input: trainingData.inputs.user.slice([trainSamples]),
        item_input: trainingData.inputs.item.slice([trainSamples]),
        feature_input: trainingData.inputs.features.slice([trainSamples])
      };

      const valTargets = {
        rating_output: trainingData.targets.ratings.slice([trainSamples]),
        category_output: trainingData.targets.categories.slice([trainSamples])
      };

      // Training callbacks
      const callbacks = {
        onEpochEnd: (epoch, logs) => {
          console.log(`Epoch ${epoch + 1}/${this.modelConfig.epochs}: loss=${logs.loss.toFixed(4)}, val_loss=${logs.val_loss?.toFixed(4) || 'N/A'}`);
        },
        
        onBatchEnd: (batch, logs) => {
          if (batch % 100 === 0) {
            console.log(`Batch ${batch}: loss=${logs.loss.toFixed(4)}`);
          }
        }
      };

      // Train the model
      const history = await this.model.fit(trainInputs, trainTargets, {
        epochs: this.modelConfig.epochs,
        batchSize: this.modelConfig.batchSize,
        validationData: [valInputs, valTargets],
        callbacks: callbacks,
        shuffle: true,
        verbose: 0
      });

      // Save the trained model
      await this.saveModel();
      
      this.lastTraining = new Date();
      this.modelVersion++;
      
      console.log('Neural model training completed successfully');
      
      // Clean up tensors
      Object.values(trainInputs).forEach(tensor => tensor.dispose());
      Object.values(trainTargets).forEach(tensor => tensor.dispose());
      Object.values(valInputs).forEach(tensor => tensor.dispose());
      Object.values(valTargets).forEach(tensor => tensor.dispose());
      
      return true;

    } catch (error) {
      console.error('Error training neural model:', error);
      return false;
    } finally {
      this.isTraining = false;
    }
  }

  // Prepare training data from database
  async prepareTrainingData() {
    try {
      console.log('Preparing neural network training data...');

      // Get interaction data with item features
      const query = `
        SELECT 
          ui.user_id,
          ui.item_id,
          ui.interaction_type,
          ui.interaction_value,
          ui.rating,
          if.price,
          if.rating_average,
          if.rating_count,
          if.popularity_score,
          if.availability_score,
          if.spice_level,
          if.dietary_tags,
          if.cuisine_type,
          if.category,
          if.preparation_time,
          if.calories,
          if.protein,
          if.carbs,
          if.fat,
          if.fiber,
          if.sodium
        FROM user_interactions ui
        JOIN item_features if ON ui.item_id = if.item_id
        WHERE ui.interaction_value IS NOT NULL
          AND if.availability_score > 0
        ORDER BY ui.created_at DESC
        LIMIT 50000
      `;

      const result = await pool.query(query);
      const interactions = result.rows;

      if (interactions.length < 100) {
        console.log('Insufficient interaction data for training');
        return null;
      }

      // Create user and item encoders
      const uniqueUsers = [...new Set(interactions.map(i => i.user_id))];
      const uniqueItems = [...new Set(interactions.map(i => i.item_id))];

      this.userEncoder = new Map(uniqueUsers.map((id, index) => [id, index]));
      this.itemEncoder = new Map(uniqueItems.map((id, index) => [id, index]));

      // Prepare features
      const userIds = [];
      const itemIds = [];
      const features = [];
      const ratings = [];
      const categories = [];

      // Category mapping
      const categoryMap = new Map();
      let categoryIndex = 0;

      for (const interaction of interactions) {
        // Encode user and item
        const userIdx = this.userEncoder.get(interaction.user_id);
        const itemIdx = this.itemEncoder.get(interaction.item_id);

        if (userIdx === undefined || itemIdx === undefined) continue;

        userIds.push(userIdx);
        itemIds.push(itemIdx);

        // Prepare item features
        const itemFeatures = [
          this.normalizeFeature(interaction.price, 0, 100),
          this.normalizeFeature(interaction.rating_average, 1, 5),
          this.normalizeFeature(interaction.rating_count, 0, 1000),
          this.normalizeFeature(interaction.popularity_score, 0, 1),
          this.normalizeFeature(interaction.availability_score, 0, 1),
          this.normalizeFeature(interaction.spice_level, 0, 5),
          this.normalizeFeature(interaction.preparation_time, 0, 120),
          this.normalizeFeature(interaction.calories, 0, 2000),
          this.normalizeFeature(interaction.protein, 0, 100),
          this.normalizeFeature(interaction.carbs, 0, 200),
          this.normalizeFeature(interaction.fat, 0, 100),
          this.normalizeFeature(interaction.fiber, 0, 50),
          this.normalizeFeature(interaction.sodium, 0, 5000)
        ];

        // Add binary features for dietary tags
        const dietaryFeatures = this.encodeDietaryTags(interaction.dietary_tags);
        itemFeatures.push(...dietaryFeatures);

        // Pad or truncate to fixed size
        while (itemFeatures.length < 20) itemFeatures.push(0);
        features.push(itemFeatures.slice(0, 20));

        // Prepare target rating (normalized)
        const rating = this.normalizeFeature(
          interaction.rating || interaction.interaction_value, 
          0, 5
        );
        ratings.push(rating);

        // Prepare category target (one-hot encoded)
        const category = interaction.category || 'unknown';
        if (!categoryMap.has(category)) {
          categoryMap.set(category, categoryIndex++);
        }
        
        const categoryOneHot = new Array(10).fill(0);
        const catIdx = categoryMap.get(category);
        if (catIdx < 10) {
          categoryOneHot[catIdx] = 1;
        }
        categories.push(categoryOneHot);
      }

      console.log(`Prepared ${userIds.length} training samples`);

      // Convert to tensors
      return {
        inputs: {
          user: tf.tensor2d(userIds.map(id => [id])),
          item: tf.tensor2d(itemIds.map(id => [id])),
          features: tf.tensor2d(features)
        },
        targets: {
          ratings: tf.tensor2d(ratings.map(r => [r])),
          categories: tf.tensor2d(categories)
        }
      };

    } catch (error) {
      console.error('Error preparing training data:', error);
      return null;
    }
  }

  // Generate recommendations using neural network
  async generateRecommendations(userId, options = {}) {
    const {
      limit = 10,
      excludeInteracted = true,
      includeExplanations = true
    } = options;

    try {
      if (!this.model || !this.userEncoder || !this.itemEncoder) {
        console.log('Neural model not initialized');
        return [];
      }

      // Check cache
      const cacheKey = `neural_recs:${userId}:${limit}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Get user interactions for exclusion
      let excludeItemIds = [];
      if (excludeInteracted) {
        const userInteractions = await UserInteraction.getByUserId(userId, 500);
        excludeItemIds = userInteractions.map(i => i.itemId);
      }

      // Get user encoding
      const userIdx = this.userEncoder.get(userId);
      if (userIdx === undefined) {
        console.log('User not found in neural model');
        return [];
      }

      // Get candidate items
      const candidateItems = await this.getCandidateItems(excludeItemIds, limit * 5);

      if (candidateItems.length === 0) {
        return [];
      }

      // Prepare prediction inputs
      const userInputs = candidateItems.map(() => userIdx);
      const itemInputs = candidateItems.map(item => this.itemEncoder.get(item.item_id)).filter(idx => idx !== undefined);
      const featureInputs = candidateItems.map(item => this.prepareItemFeatures(item));

      if (itemInputs.length === 0) {
        return [];
      }

      // Create tensors
      const userTensor = tf.tensor2d(userInputs.map(u => [u]));
      const itemTensor = tf.tensor2d(itemInputs.map(i => [i]));
      const featureTensor = tf.tensor2d(featureInputs);

      // Make predictions
      const predictions = await this.model.predict([userTensor, itemTensor, featureTensor]);
      
      // Extract rating predictions
      const ratingPredictions = await predictions[0].data();
      const categoryPredictions = await predictions[1].data();

      // Combine predictions with items
      const recommendations = [];
      
      for (let i = 0; i < candidateItems.length && i < itemInputs.length; i++) {
        const item = candidateItems[i];
        const ratingScore = ratingPredictions[i];
        const categoryConfidence = Math.max(...categoryPredictions.slice(i * 10, (i + 1) * 10));

        recommendations.push({
          itemId: item.item_id,
          score: ratingScore,
          confidence: (ratingScore + categoryConfidence) / 2,
          recommendationType: 'neural',
          algorithm: 'deep_neural_network',
          explanation: includeExplanations ? 
            `AI predicts ${(ratingScore * 5).toFixed(1)}/5 rating for this ${item.category}` : 
            null,
          itemDetails: {
            name: item.name,
            category: item.category,
            cuisine_type: item.cuisine_type,
            price: item.price,
            rating_average: item.rating_average,
            popularity_score: item.popularity_score
          },
          neuralScore: ratingScore,
          categoryConfidence: categoryConfidence
        });
      }

      // Sort by score and limit results
      recommendations.sort((a, b) => b.score - a.score);
      const finalRecommendations = recommendations.slice(0, limit);

      // Cache results
      await redis.setex(cacheKey, this.cacheTimeout, JSON.stringify(finalRecommendations));

      // Clean up tensors
      userTensor.dispose();
      itemTensor.dispose();
      featureTensor.dispose();
      predictions[0].dispose();
      predictions[1].dispose();

      return finalRecommendations;

    } catch (error) {
      console.error('Error generating neural recommendations:', error);
      return [];
    }
  }

  // Get candidate items for recommendation
  async getCandidateItems(excludeItemIds = [], limit = 100) {
    try {
      let excludeClause = '';
      let queryParams = [];
      
      if (excludeItemIds.length > 0) {
        excludeClause = `WHERE item_id NOT IN (${excludeItemIds.map((_, i) => `$${i + 1}`).join(',')})`;
        queryParams = excludeItemIds;
      }

      const query = `
        SELECT * FROM item_features 
        ${excludeClause}
        ${excludeClause ? 'AND' : 'WHERE'} availability_score > 0.5
        ORDER BY popularity_score DESC, rating_average DESC
        LIMIT $${queryParams.length + 1}
      `;

      queryParams.push(limit);
      const result = await pool.query(query, queryParams);
      return result.rows;

    } catch (error) {
      console.error('Error getting candidate items:', error);
      return [];
    }
  }

  // Prepare item features for neural network input
  prepareItemFeatures(item) {
    const features = [
      this.normalizeFeature(item.price, 0, 100),
      this.normalizeFeature(item.rating_average, 1, 5),
      this.normalizeFeature(item.rating_count, 0, 1000),
      this.normalizeFeature(item.popularity_score, 0, 1),
      this.normalizeFeature(item.availability_score, 0, 1),
      this.normalizeFeature(item.spice_level, 0, 5),
      this.normalizeFeature(item.preparation_time, 0, 120),
      this.normalizeFeature(item.calories, 0, 2000),
      this.normalizeFeature(item.protein, 0, 100),
      this.normalizeFeature(item.carbs, 0, 200),
      this.normalizeFeature(item.fat, 0, 100),
      this.normalizeFeature(item.fiber, 0, 50),
      this.normalizeFeature(item.sodium, 0, 5000)
    ];

    // Add binary features for dietary tags
    const dietaryFeatures = this.encodeDietaryTags(item.dietary_tags);
    features.push(...dietaryFeatures);

    // Pad or truncate to fixed size
    while (features.length < 20) features.push(0);
    return features.slice(0, 20);
  }

  // Utility methods
  normalizeFeature(value, min, max) {
    if (value === null || value === undefined) return 0;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  encodeDietaryTags(tags) {
    const knownTags = ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 'halal', 'kosher'];
    const tagArray = Array.isArray(tags) ? tags : (tags ? tags.split(',') : []);
    
    return knownTags.map(tag => tagArray.includes(tag) ? 1 : 0);
  }

  async getVocabularySizes() {
    try {
      const [userResult, itemResult] = await Promise.all([
        pool.query('SELECT MAX(user_id) as max_id FROM user_interactions'),
        pool.query('SELECT MAX(item_id) as max_id FROM item_features')
      ]);

      return {
        maxUserId: userResult.rows[0].max_id || this.maxUsers,
        maxItemId: itemResult.rows[0].max_id || this.maxItems
      };
    } catch (error) {
      console.error('Error getting vocabulary sizes:', error);
      return { maxUserId: this.maxUsers, maxItemId: this.maxItems };
    }
  }

  // Model persistence
  async saveModel() {
    try {
      const modelPath = `file://./models/neural-recommendation-v${this.modelVersion}`;
      await this.model.save(modelPath);
      
      // Save metadata
      const metadata = {
        version: this.modelVersion,
        lastTraining: this.lastTraining,
        userEncoder: Array.from(this.userEncoder.entries()),
        itemEncoder: Array.from(this.itemEncoder.entries()),
        config: this.modelConfig
      };

      await redis.set('neural_model_metadata', JSON.stringify(metadata));
      console.log('Neural model saved successfully');
      
    } catch (error) {
      console.error('Error saving neural model:', error);
    }
  }

  async loadModel() {
    try {
      // Load metadata
      const metadataStr = await redis.get('neural_model_metadata');
      if (!metadataStr) {
        console.log('No neural model metadata found');
        return false;
      }

      const metadata = JSON.parse(metadataStr);
      
      // Restore encoders
      this.userEncoder = new Map(metadata.userEncoder);
      this.itemEncoder = new Map(metadata.itemEncoder);
      this.modelVersion = metadata.version;
      this.lastTraining = new Date(metadata.lastTraining);
      
      // Load model
      const modelPath = `file://./models/neural-recommendation-v${this.modelVersion}`;
      this.model = await tf.loadLayersModel(modelPath);
      
      console.log('Neural model loaded successfully');
      return true;
      
    } catch (error) {
      console.error('Error loading neural model:', error);
      return false;
    }
  }

  async checkModelExists() {
    try {
      const metadata = await redis.get('neural_model_metadata');
      return !!metadata;
    } catch (error) {
      return false;
    }
  }

  // Performance evaluation
  async evaluateModel(testUserId, testInteractions) {
    try {
      const recommendations = await this.generateRecommendations(testUserId, { limit: 20 });
      
      if (recommendations.length === 0 || testInteractions.length === 0) {
        return null;
      }

      const recommendedItems = recommendations.map(r => r.itemId);
      const actualItems = testInteractions.map(i => i.itemId);

      const truePositives = recommendedItems.filter(item => actualItems.includes(item)).length;
      const precision = recommendedItems.length > 0 ? truePositives / recommendedItems.length : 0;
      const recall = actualItems.length > 0 ? truePositives / actualItems.length : 0;
      const f1Score = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

      // Calculate RMSE for rating predictions
      let rmse = 0;
      let ratingCount = 0;
      
      for (const interaction of testInteractions) {
        const rec = recommendations.find(r => r.itemId === interaction.itemId);
        if (rec && interaction.rating) {
          const predictedRating = rec.neuralScore * 5;
          const actualRating = interaction.rating;
          rmse += Math.pow(predictedRating - actualRating, 2);
          ratingCount++;
        }
      }
      
      rmse = ratingCount > 0 ? Math.sqrt(rmse / ratingCount) : 0;

      return {
        precision,
        recall,
        f1Score,
        rmse,
        sampleSize: testInteractions.length,
        recommendationCount: recommendations.length
      };

    } catch (error) {
      console.error('Error evaluating neural model:', error);
      return null;
    }
  }

  // Get model training status
  getTrainingStatus() {
    return {
      isTraining: this.isTraining,
      lastTraining: this.lastTraining,
      modelVersion: this.modelVersion,
      hasModel: !!this.model,
      hasEncoders: !!(this.userEncoder && this.itemEncoder)
    };
  }

  // Schedule periodic retraining
  async scheduleRetraining(intervalHours = 24) {
    setInterval(async () => {
      if (!this.isTraining) {
        console.log('Starting scheduled neural model retraining');
        await this.trainModel();
      }
    }, intervalHours * 60 * 60 * 1000);
  }
}

module.exports = NeuralRecommendationEngine;