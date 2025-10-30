const { Pool } = require('pg');
const Redis = require('ioredis');
const mongoose = require('mongoose');

// PostgreSQL connection for transactional data
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'quickbite_analytics',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis connection for caching and real-time data
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  db: process.env.REDIS_DB || 0,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// MongoDB connection for time-series and large analytics data
const connectMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/quickbite_analytics', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      bufferCommands: false,
      bufferMaxEntries: 0,
    });
    console.log('MongoDB connected for analytics data');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
};

// Initialize database schema
const initializeSchema = async () => {
  try {
    // Analytics Events Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(100) NOT NULL,
        event_name VARCHAR(200) NOT NULL,
        user_id UUID,
        session_id VARCHAR(100),
        restaurant_id UUID,
        order_id UUID,
        item_id UUID,
        properties JSONB NOT NULL DEFAULT '{}',
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        ip_address INET,
        user_agent TEXT,
        referrer TEXT,
        device_type VARCHAR(50),
        platform VARCHAR(50),
        browser VARCHAR(100),
        location_data JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User Behavior Analytics
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_behavior_analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        date DATE NOT NULL,
        session_count INTEGER DEFAULT 0,
        page_views INTEGER DEFAULT 0,
        time_spent_seconds INTEGER DEFAULT 0,
        orders_placed INTEGER DEFAULT 0,
        items_viewed INTEGER DEFAULT 0,
        items_added_to_cart INTEGER DEFAULT 0,
        searches_performed INTEGER DEFAULT 0,
        revenue_generated DECIMAL(10,2) DEFAULT 0,
        average_order_value DECIMAL(10,2) DEFAULT 0,
        conversion_rate DECIMAL(5,4) DEFAULT 0,
        bounce_rate DECIMAL(5,4) DEFAULT 0,
        device_types JSONB DEFAULT '{}',
        popular_categories JSONB DEFAULT '{}',
        peak_hours JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date)
      )
    `);

    // Restaurant Performance Metrics
    await pool.query(`
      CREATE TABLE IF NOT EXISTS restaurant_performance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurant_id UUID NOT NULL,
        date DATE NOT NULL,
        total_orders INTEGER DEFAULT 0,
        total_revenue DECIMAL(12,2) DEFAULT 0,
        average_order_value DECIMAL(10,2) DEFAULT 0,
        average_preparation_time INTEGER DEFAULT 0,
        average_delivery_time INTEGER DEFAULT 0,
        customer_rating DECIMAL(3,2) DEFAULT 0,
        rating_count INTEGER DEFAULT 0,
        menu_item_sales JSONB DEFAULT '{}',
        peak_hours JSONB DEFAULT '{}',
        cancellation_rate DECIMAL(5,4) DEFAULT 0,
        repeat_customer_rate DECIMAL(5,4) DEFAULT 0,
        profit_margin DECIMAL(5,4) DEFAULT 0,
        inventory_turnover DECIMAL(8,2) DEFAULT 0,
        cost_per_order DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(restaurant_id, date)
      )
    `);

    // Sales Analytics
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales_analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE NOT NULL,
        hour INTEGER CHECK (hour >= 0 AND hour <= 23),
        total_sales DECIMAL(12,2) DEFAULT 0,
        order_count INTEGER DEFAULT 0,
        average_order_value DECIMAL(10,2) DEFAULT 0,
        unique_customers INTEGER DEFAULT 0,
        new_customers INTEGER DEFAULT 0,
        returning_customers INTEGER DEFAULT 0,
        sales_by_category JSONB DEFAULT '{}',
        sales_by_restaurant JSONB DEFAULT '{}',
        payment_methods JSONB DEFAULT '{}',
        discount_usage DECIMAL(10,2) DEFAULT 0,
        tax_collected DECIMAL(10,2) DEFAULT 0,
        commission_earned DECIMAL(10,2) DEFAULT 0,
        refunds_processed DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, hour)
      )
    `);

    // Delivery Performance Analytics
    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE NOT NULL,
        total_deliveries INTEGER DEFAULT 0,
        completed_deliveries INTEGER DEFAULT 0,
        cancelled_deliveries INTEGER DEFAULT 0,
        average_delivery_time INTEGER DEFAULT 0,
        average_distance DECIMAL(8,2) DEFAULT 0,
        delivery_success_rate DECIMAL(5,4) DEFAULT 0,
        driver_utilization DECIMAL(5,4) DEFAULT 0,
        fuel_cost DECIMAL(10,2) DEFAULT 0,
        delivery_zones JSONB DEFAULT '{}',
        peak_delivery_hours JSONB DEFAULT '{}',
        weather_impact JSONB DEFAULT '{}',
        customer_satisfaction DECIMAL(3,2) DEFAULT 0,
        tips_collected DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date)
      )
    `);

    // Marketing Campaign Analytics
    await pool.query(`
      CREATE TABLE IF NOT EXISTS marketing_analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id VARCHAR(100) NOT NULL,
        campaign_name VARCHAR(200) NOT NULL,
        campaign_type VARCHAR(100) NOT NULL,
        date DATE NOT NULL,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        cost DECIMAL(10,2) DEFAULT 0,
        revenue DECIMAL(12,2) DEFAULT 0,
        click_through_rate DECIMAL(5,4) DEFAULT 0,
        conversion_rate DECIMAL(5,4) DEFAULT 0,
        cost_per_click DECIMAL(8,2) DEFAULT 0,
        cost_per_acquisition DECIMAL(10,2) DEFAULT 0,
        return_on_ad_spend DECIMAL(8,2) DEFAULT 0,
        audience_demographics JSONB DEFAULT '{}',
        device_breakdown JSONB DEFAULT '{}',
        geographic_performance JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(campaign_id, date)
      )
    `);

    // KPI Dashboard Metrics
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kpi_metrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        metric_name VARCHAR(100) NOT NULL,
        metric_category VARCHAR(100) NOT NULL,
        date DATE NOT NULL,
        hour INTEGER CHECK (hour >= 0 AND hour <= 23),
        value DECIMAL(15,4) NOT NULL,
        target_value DECIMAL(15,4),
        variance_percentage DECIMAL(8,4),
        trend_direction VARCHAR(20) CHECK (trend_direction IN ('up', 'down', 'stable')),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        INDEX (metric_name, date),
        INDEX (metric_category, date)
      )
    `);

    // Forecasting Models
    await pool.query(`
      CREATE TABLE IF NOT EXISTS forecasting_models (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        model_name VARCHAR(100) NOT NULL UNIQUE,
        model_type VARCHAR(50) NOT NULL,
        target_metric VARCHAR(100) NOT NULL,
        model_parameters JSONB NOT NULL DEFAULT '{}',
        training_data_start DATE NOT NULL,
        training_data_end DATE NOT NULL,
        accuracy_metrics JSONB DEFAULT '{}',
        model_artifact_path TEXT,
        is_active BOOLEAN DEFAULT true,
        last_trained TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Forecasting Predictions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS forecasting_predictions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        model_id UUID NOT NULL REFERENCES forecasting_models(id),
        prediction_date DATE NOT NULL,
        predicted_value DECIMAL(15,4) NOT NULL,
        confidence_interval_lower DECIMAL(15,4),
        confidence_interval_upper DECIMAL(15,4),
        prediction_horizon INTEGER NOT NULL,
        actual_value DECIMAL(15,4),
        prediction_error DECIMAL(15,4),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        INDEX (model_id, prediction_date),
        INDEX (prediction_date)
      )
    `);

    // Real-time Metrics Cache
    await pool.query(`
      CREATE TABLE IF NOT EXISTS realtime_metrics_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        metric_key VARCHAR(200) NOT NULL UNIQUE,
        metric_value JSONB NOT NULL,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expiry_time TIMESTAMP WITH TIME ZONE,
        INDEX (metric_key),
        INDEX (last_updated)
      )
    `);

    // Data Quality Monitoring
    await pool.query(`
      CREATE TABLE IF NOT EXISTS data_quality_metrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_name VARCHAR(100) NOT NULL,
        check_type VARCHAR(100) NOT NULL,
        check_date DATE NOT NULL,
        total_records INTEGER DEFAULT 0,
        valid_records INTEGER DEFAULT 0,
        invalid_records INTEGER DEFAULT 0,
        null_values INTEGER DEFAULT 0,
        duplicate_records INTEGER DEFAULT 0,
        data_quality_score DECIMAL(5,4) DEFAULT 0,
        issues JSONB DEFAULT '[]',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        INDEX (table_name, check_date),
        INDEX (check_type, check_date)
      )
    `);

    // Create indexes for performance optimization
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_restaurant_id ON analytics_events(restaurant_id);
      
      CREATE INDEX IF NOT EXISTS idx_user_behavior_date ON user_behavior_analytics(date);
      CREATE INDEX IF NOT EXISTS idx_user_behavior_user_id ON user_behavior_analytics(user_id);
      
      CREATE INDEX IF NOT EXISTS idx_restaurant_performance_date ON restaurant_performance(date);
      CREATE INDEX IF NOT EXISTS idx_restaurant_performance_restaurant_id ON restaurant_performance(restaurant_id);
      
      CREATE INDEX IF NOT EXISTS idx_sales_analytics_date ON sales_analytics(date);
      CREATE INDEX IF NOT EXISTS idx_sales_analytics_hour ON sales_analytics(date, hour);
      
      CREATE INDEX IF NOT EXISTS idx_delivery_analytics_date ON delivery_analytics(date);
      
      CREATE INDEX IF NOT EXISTS idx_marketing_analytics_campaign_id ON marketing_analytics(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_marketing_analytics_date ON marketing_analytics(date);
    `);

    // Create partitions for large tables (by month)
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    for (let i = 0; i < 12; i++) {
      const month = ((currentMonth + i - 1) % 12) + 1;
      const year = currentYear + Math.floor((currentMonth + i - 1) / 12);
      const partitionName = `analytics_events_${year}_${month.toString().padStart(2, '0')}`;
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${partitionName} (
          LIKE analytics_events INCLUDING ALL,
          CHECK (EXTRACT(YEAR FROM timestamp) = ${year} AND EXTRACT(MONTH FROM timestamp) = ${month})
        ) INHERITS (analytics_events);
      `).catch(() => {}); // Ignore if partition already exists
    }

    console.log('Analytics database schema initialized successfully');

  } catch (error) {
    console.error('Error initializing database schema:', error);
    throw error;
  }
};

// Connection health check
const checkConnections = async () => {
  try {
    // Test PostgreSQL
    await pool.query('SELECT 1');
    console.log('PostgreSQL connection: ✓');

    // Test Redis
    await redis.ping();
    console.log('Redis connection: ✓');

    // Test MongoDB
    if (mongoose.connection.readyState === 1) {
      console.log('MongoDB connection: ✓');
    } else {
      console.log('MongoDB connection: ✗');
    }

    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
};

// Graceful shutdown
const closeConnections = async () => {
  try {
    await pool.end();
    await redis.quit();
    await mongoose.connection.close();
    console.log('All database connections closed');
  } catch (error) {
    console.error('Error closing database connections:', error);
  }
};

module.exports = {
  pool,
  redis,
  mongoose,
  connectMongoDB,
  initializeSchema,
  checkConnections,
  closeConnections
};