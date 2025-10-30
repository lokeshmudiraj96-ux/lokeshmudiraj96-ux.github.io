const { Pool } = require('pg');
const Redis = require('ioredis');

// PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER || 'quickbite_user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'quickbite_recommendations',
  password: process.env.DB_PASSWORD || 'your_password',
  port: process.env.DB_PORT || 5432,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close clients after 30 seconds of inactivity
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Redis connection for caching and real-time data
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  db: process.env.REDIS_DB || 2, // Use different DB for recommendations
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});

// Redis connection for model cache (separate instance)
const modelCache = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  db: process.env.REDIS_MODEL_DB || 3, // Separate DB for model storage
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});

// Database schema initialization
const initializeDatabase = async () => {
  try {
    console.log('🔄 Initializing recommendation database schema...');

    // User preferences and behavior tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        cuisine_preferences JSONB DEFAULT '{}',
        dietary_restrictions TEXT[] DEFAULT ARRAY[]::TEXT[],
        spice_level INTEGER DEFAULT 3, -- 1-5 scale
        price_sensitivity DECIMAL(3,2) DEFAULT 0.5, -- 0-1 scale
        favorite_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
        disliked_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
        preferred_meal_times JSONB DEFAULT '{}',
        portion_size_preference VARCHAR(20) DEFAULT 'medium',
        health_consciousness_score DECIMAL(3,2) DEFAULT 0.5,
        adventurousness_score DECIMAL(3,2) DEFAULT 0.5,
        budget_range JSONB DEFAULT '{"min": 0, "max": 1000}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      );
    `);

    // User interaction tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_interactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        item_id UUID NOT NULL,
        interaction_type VARCHAR(50) NOT NULL, -- view, click, add_to_cart, order, rate, review, share
        interaction_value DECIMAL(10,2), -- rating, price, quantity
        context JSONB DEFAULT '{}', -- session_id, device_type, location, time_of_day, etc.
        duration_seconds INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (user_id, created_at),
        INDEX (item_id, interaction_type),
        INDEX (interaction_type, created_at)
      );
    `);

    // Item features and metadata
    await pool.query(`
      CREATE TABLE IF NOT EXISTS item_features (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id UUID NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        category VARCHAR(100),
        subcategory VARCHAR(100),
        cuisine_type VARCHAR(100),
        ingredients TEXT[],
        nutritional_info JSONB DEFAULT '{}',
        allergens TEXT[],
        dietary_tags TEXT[], -- vegan, vegetarian, gluten-free, keto, etc.
        spice_level INTEGER DEFAULT 0,
        preparation_time INTEGER, -- minutes
        difficulty_level INTEGER, -- 1-5
        price DECIMAL(10,2),
        availability_score DECIMAL(3,2) DEFAULT 1.0,
        popularity_score DECIMAL(10,4) DEFAULT 0.0,
        rating_average DECIMAL(3,2) DEFAULT 0.0,
        rating_count INTEGER DEFAULT 0,
        restaurant_id UUID,
        image_url TEXT,
        features_vector DECIMAL(10,6)[], -- ML feature vector
        embedding_vector DECIMAL(10,6)[], -- Neural embedding
        tags TEXT[],
        seasonal_availability JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (category),
        INDEX (cuisine_type),
        INDEX (restaurant_id),
        INDEX (popularity_score DESC),
        INDEX (rating_average DESC)
      );
    `);

    // User similarity matrix for collaborative filtering
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_similarity (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id_1 UUID NOT NULL,
        user_id_2 UUID NOT NULL,
        similarity_score DECIMAL(10,6) NOT NULL,
        similarity_type VARCHAR(50) NOT NULL, -- cosine, pearson, jaccard, etc.
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        features_used JSONB DEFAULT '{}',
        UNIQUE(user_id_1, user_id_2, similarity_type),
        INDEX (user_id_1, similarity_score DESC),
        INDEX (user_id_2, similarity_score DESC)
      );
    `);

    // Item similarity matrix for content-based filtering
    await pool.query(`
      CREATE TABLE IF NOT EXISTS item_similarity (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id_1 UUID NOT NULL,
        item_id_2 UUID NOT NULL,
        similarity_score DECIMAL(10,6) NOT NULL,
        similarity_type VARCHAR(50) NOT NULL, -- content, collaborative, hybrid
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        features_used JSONB DEFAULT '{}',
        UNIQUE(item_id_1, item_id_2, similarity_type),
        INDEX (item_id_1, similarity_score DESC),
        INDEX (item_id_2, similarity_score DESC)
      );
    `);

    // Generated recommendations cache
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_recommendations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        item_id UUID NOT NULL,
        recommendation_score DECIMAL(10,6) NOT NULL,
        recommendation_type VARCHAR(50) NOT NULL, -- collaborative, content, hybrid, trending, seasonal
        algorithm_version VARCHAR(20) NOT NULL,
        context JSONB DEFAULT '{}', -- location, time, weather, etc.
        explanation TEXT, -- Why this item was recommended
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        served_count INTEGER DEFAULT 0,
        clicked_count INTEGER DEFAULT 0,
        ordered_count INTEGER DEFAULT 0,
        UNIQUE(user_id, item_id, recommendation_type),
        INDEX (user_id, recommendation_score DESC),
        INDEX (item_id, recommendation_score DESC),
        INDEX (expires_at),
        INDEX (generated_at)
      );
    `);

    // A/B testing for recommendation algorithms
    await pool.query(`
      CREATE TABLE IF NOT EXISTS recommendation_experiments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        experiment_name VARCHAR(100) NOT NULL,
        algorithm_a VARCHAR(50) NOT NULL,
        algorithm_b VARCHAR(50) NOT NULL,
        user_group_a UUID[],
        user_group_b UUID[],
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        metrics_a JSONB DEFAULT '{}',
        metrics_b JSONB DEFAULT '{}',
        winner VARCHAR(50), -- algorithm_a, algorithm_b, tie
        confidence_level DECIMAL(5,4),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (is_active, start_date),
        INDEX (experiment_name)
      );
    `);

    // Menu optimization analytics
    await pool.query(`
      CREATE TABLE IF NOT EXISTS menu_analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurant_id UUID NOT NULL,
        item_id UUID NOT NULL,
        date DATE NOT NULL,
        views INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        orders INTEGER DEFAULT 0,
        revenue DECIMAL(12,2) DEFAULT 0.0,
        profit_margin DECIMAL(5,4),
        inventory_cost DECIMAL(10,2),
        recommendation_impressions INTEGER DEFAULT 0,
        recommendation_clicks INTEGER DEFAULT 0,
        recommendation_orders INTEGER DEFAULT 0,
        seasonal_factor DECIMAL(5,4) DEFAULT 1.0,
        weather_factor DECIMAL(5,4) DEFAULT 1.0,
        day_of_week INTEGER, -- 1=Monday, 7=Sunday
        hour_of_day INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(restaurant_id, item_id, date),
        INDEX (restaurant_id, date),
        INDEX (item_id, date),
        INDEX (date, revenue DESC)
      );
    `);

    // Real-time user sessions for dynamic recommendations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL UNIQUE,
        user_id UUID,
        device_type VARCHAR(50),
        location JSONB,
        current_restaurant_id UUID,
        session_data JSONB DEFAULT '{}', -- cart, browsing_history, preferences
        recommendations_shown JSONB DEFAULT '[]',
        interactions JSONB DEFAULT '[]',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        INDEX (user_id, started_at),
        INDEX (session_id),
        INDEX (last_activity)
      );
    `);

    // Trending items calculation
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trending_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id UUID NOT NULL,
        restaurant_id UUID,
        category VARCHAR(100),
        trend_score DECIMAL(10,6) NOT NULL,
        velocity DECIMAL(10,6), -- Rate of trend change
        time_period VARCHAR(20) NOT NULL, -- hour, day, week, month
        location_context JSONB DEFAULT '{}',
        demographic_context JSONB DEFAULT '{}',
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        valid_until TIMESTAMP,
        UNIQUE(item_id, time_period, calculated_at::DATE),
        INDEX (trend_score DESC, time_period),
        INDEX (restaurant_id, trend_score DESC),
        INDEX (category, trend_score DESC)
      );
    `);

    // Machine learning model metadata
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ml_models (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        model_name VARCHAR(100) NOT NULL,
        model_type VARCHAR(50) NOT NULL, -- collaborative_filtering, content_based, neural_network, etc.
        version VARCHAR(20) NOT NULL,
        algorithm VARCHAR(100),
        parameters JSONB DEFAULT '{}',
        training_data_size INTEGER,
        training_accuracy DECIMAL(6,4),
        validation_accuracy DECIMAL(6,4),
        test_accuracy DECIMAL(6,4),
        model_file_path TEXT,
        model_size_mb DECIMAL(10,2),
        training_started_at TIMESTAMP,
        training_completed_at TIMESTAMP,
        deployed_at TIMESTAMP,
        is_active BOOLEAN DEFAULT FALSE,
        performance_metrics JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (model_name, version),
        INDEX (is_active, model_type)
      );
    `);

    console.log('✅ Recommendation database schema initialized successfully');

    // Create indexes for better performance
    console.log('🔄 Creating performance indexes...');
    
    await pool.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_interactions_user_time 
                     ON user_interactions (user_id, created_at DESC);`);
    
    await pool.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_item_features_popularity 
                     ON item_features (popularity_score DESC, rating_average DESC);`);
    
    await pool.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recommendations_user_score 
                     ON user_recommendations (user_id, recommendation_score DESC, expires_at);`);

    console.log('✅ Performance indexes created');

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

// Connection event handlers
pool.on('connect', () => {
  console.log('📊 Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('🔴 PostgreSQL connection error:', err);
});

redis.on('connect', () => {
  console.log('📦 Connected to Redis cache');
});

redis.on('error', (err) => {
  console.error('🔴 Redis connection error:', err);
});

modelCache.on('connect', () => {
  console.log('🤖 Connected to Redis model cache');
});

module.exports = {
  pool,
  redis,
  modelCache,
  initializeDatabase
};