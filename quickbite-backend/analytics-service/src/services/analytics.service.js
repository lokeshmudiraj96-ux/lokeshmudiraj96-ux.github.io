const { pool, redis, mongodb } = require('../config/database');
const AnalyticsModel = require('../models/analytics.model');
const ForecastingEngine = require('../forecasting/forecasting-engine');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class AnalyticsService extends EventEmitter {
  constructor() {
    super();
    this.forecastingEngine = new ForecastingEngine();
    this.realTimeProcessors = new Map();
    this.kpiCalculators = new Map();
    this.dashboardUpdaters = new Map();
    
    // Initialize real-time processors
    this.initializeRealTimeProcessing();
  }

  // Real-time Analytics Processing
  async initializeRealTimeProcessing() {
    console.log('Initializing real-time analytics processing...');

    // Order analytics processor
    this.realTimeProcessors.set('orders', {
      process: this.processOrderEvent.bind(this),
      aggregationWindow: 60000, // 1 minute
      lastProcessed: Date.now()
    });

    // User behavior processor
    this.realTimeProcessors.set('user_behavior', {
      process: this.processUserBehaviorEvent.bind(this),
      aggregationWindow: 30000, // 30 seconds
      lastProcessed: Date.now()
    });

    // Restaurant performance processor
    this.realTimeProcessors.set('restaurant_performance', {
      process: this.processRestaurantEvent.bind(this),
      aggregationWindow: 120000, // 2 minutes
      lastProcessed: Date.now()
    });

    // Delivery analytics processor
    this.realTimeProcessors.set('delivery_analytics', {
      process: this.processDeliveryEvent.bind(this),
      aggregationWindow: 90000, // 1.5 minutes
      lastProcessed: Date.now()
    });

    // Start real-time processing loops
    this.startRealTimeProcessing();
  }

  startRealTimeProcessing() {
    for (const [processorName, processor] of this.realTimeProcessors) {
      setInterval(async () => {
        try {
          await processor.process();
        } catch (error) {
          console.error(`Error in real-time processor ${processorName}:`, error);
        }
      }, processor.aggregationWindow);
    }
  }

  // Event Processing Methods
  async processOrderEvent() {
    try {
      const cutoffTime = new Date(Date.now() - this.realTimeProcessors.get('orders').aggregationWindow);
      
      // Get recent order events
      const query = `
        SELECT 
          COUNT(*) as order_count,
          SUM(total_amount) as total_revenue,
          AVG(total_amount) as avg_order_value,
          COUNT(DISTINCT user_id) as unique_customers,
          COUNT(DISTINCT restaurant_id) as active_restaurants
        FROM analytics_events 
        WHERE event_type = 'order_placed' 
        AND created_at > $1
      `;

      const result = await pool.query(query, [cutoffTime]);
      const metrics = result.rows[0];

      // Update real-time counters in Redis
      await this.updateRealTimeCounters('orders', {
        orders_per_minute: parseInt(metrics.order_count),
        revenue_per_minute: parseFloat(metrics.total_revenue || 0),
        avg_order_value: parseFloat(metrics.avg_order_value || 0),
        active_customers: parseInt(metrics.unique_customers),
        active_restaurants: parseInt(metrics.active_restaurants),
        timestamp: new Date()
      });

      // Emit real-time event for dashboards
      this.emit('real_time_update', {
        type: 'order_metrics',
        data: metrics,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error processing order events:', error);
      throw error;
    }
  }

  async processUserBehaviorEvent() {
    try {
      const cutoffTime = new Date(Date.now() - this.realTimeProcessors.get('user_behavior').aggregationWindow);

      // Analyze user behavior patterns
      const behaviorQuery = `
        SELECT 
          event_data->>'action' as action,
          COUNT(*) as action_count,
          COUNT(DISTINCT user_id) as unique_users,
          AVG((event_data->>'session_duration')::numeric) as avg_session_duration
        FROM analytics_events 
        WHERE event_type = 'user_action' 
        AND created_at > $1
        GROUP BY event_data->>'action'
      `;

      const behaviorResult = await pool.query(behaviorQuery, [cutoffTime]);

      // Calculate engagement metrics
      const engagementMetrics = {
        total_actions: behaviorResult.rows.reduce((sum, row) => sum + parseInt(row.action_count), 0),
        unique_active_users: new Set(behaviorResult.rows.map(row => row.unique_users)).size,
        avg_session_duration: behaviorResult.rows.reduce((sum, row) => sum + parseFloat(row.avg_session_duration || 0), 0) / behaviorResult.rows.length,
        action_breakdown: behaviorResult.rows.reduce((acc, row) => {
          acc[row.action] = parseInt(row.action_count);
          return acc;
        }, {}),
        timestamp: new Date()
      };

      // Store in Redis for real-time access
      await redis.setex(
        `real_time:user_behavior:${Date.now()}`,
        300, // 5 minutes TTL
        JSON.stringify(engagementMetrics)
      );

      // Emit for real-time dashboards
      this.emit('real_time_update', {
        type: 'user_behavior',
        data: engagementMetrics,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error processing user behavior events:', error);
      throw error;
    }
  }

  async processRestaurantEvent() {
    try {
      const cutoffTime = new Date(Date.now() - this.realTimeProcessors.get('restaurant_performance').aggregationWindow);

      // Calculate restaurant performance metrics
      const performanceQuery = `
        SELECT 
          restaurant_id,
          COUNT(CASE WHEN event_type = 'order_placed' THEN 1 END) as orders_received,
          AVG(CASE WHEN event_type = 'order_preparation_time' 
              THEN (event_data->>'preparation_time')::numeric END) as avg_prep_time,
          COUNT(CASE WHEN event_type = 'order_cancelled' THEN 1 END) as cancelled_orders,
          AVG((event_data->>'rating')::numeric) as avg_rating
        FROM analytics_events 
        WHERE restaurant_id IS NOT NULL
        AND created_at > $1
        GROUP BY restaurant_id
      `;

      const performanceResult = await pool.query(performanceQuery, [cutoffTime]);

      // Process each restaurant's metrics
      for (const restaurant of performanceResult.rows) {
        const metrics = {
          restaurant_id: restaurant.restaurant_id,
          orders_per_interval: parseInt(restaurant.orders_received || 0),
          avg_preparation_time: parseFloat(restaurant.avg_prep_time || 0),
          cancellation_rate: restaurant.cancelled_orders / Math.max(restaurant.orders_received, 1),
          avg_rating: parseFloat(restaurant.avg_rating || 0),
          performance_score: this.calculateRestaurantPerformanceScore(restaurant),
          timestamp: new Date()
        };

        // Cache restaurant performance
        await redis.setex(
          `restaurant_performance:${restaurant.restaurant_id}`,
          180, // 3 minutes TTL
          JSON.stringify(metrics)
        );
      }

      // Emit aggregated restaurant performance
      this.emit('real_time_update', {
        type: 'restaurant_performance',
        data: performanceResult.rows,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error processing restaurant events:', error);
      throw error;
    }
  }

  async processDeliveryEvent() {
    try {
      const cutoffTime = new Date(Date.now() - this.realTimeProcessors.get('delivery_analytics').aggregationWindow);

      // Analyze delivery performance
      const deliveryQuery = `
        SELECT 
          AVG((event_data->>'delivery_time')::numeric) as avg_delivery_time,
          COUNT(CASE WHEN event_type = 'delivery_completed' THEN 1 END) as completed_deliveries,
          COUNT(CASE WHEN event_type = 'delivery_delayed' THEN 1 END) as delayed_deliveries,
          AVG((event_data->>'delivery_rating')::numeric) as avg_delivery_rating,
          COUNT(DISTINCT event_data->>'delivery_partner_id') as active_delivery_partners
        FROM analytics_events 
        WHERE event_type LIKE 'delivery_%'
        AND created_at > $1
      `;

      const deliveryResult = await pool.query(deliveryQuery, [cutoffTime]);
      const metrics = deliveryResult.rows[0];

      // Calculate delivery KPIs
      const deliveryKPIs = {
        avg_delivery_time: parseFloat(metrics.avg_delivery_time || 0),
        completed_deliveries: parseInt(metrics.completed_deliveries || 0),
        delayed_deliveries: parseInt(metrics.delayed_deliveries || 0),
        on_time_delivery_rate: metrics.completed_deliveries / (parseInt(metrics.completed_deliveries) + parseInt(metrics.delayed_deliveries)),
        avg_delivery_rating: parseFloat(metrics.avg_delivery_rating || 0),
        active_delivery_partners: parseInt(metrics.active_delivery_partners || 0),
        delivery_efficiency_score: this.calculateDeliveryEfficiencyScore(metrics),
        timestamp: new Date()
      };

      // Store delivery analytics
      await this.updateRealTimeCounters('delivery', deliveryKPIs);

      // Emit delivery analytics
      this.emit('real_time_update', {
        type: 'delivery_analytics',
        data: deliveryKPIs,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error processing delivery events:', error);
      throw error;
    }
  }

  // Business Intelligence Services
  async generateBusinessInsights(timeRange = '24h') {
    try {
      console.log(`Generating business insights for ${timeRange}...`);

      const insights = {};

      // Revenue insights
      insights.revenue = await this.analyzeRevenuePatterns(timeRange);

      // Customer insights
      insights.customers = await this.analyzeCustomerBehavior(timeRange);

      // Restaurant insights
      insights.restaurants = await this.analyzeRestaurantPerformance(timeRange);

      // Delivery insights
      insights.delivery = await this.analyzeDeliveryOperations(timeRange);

      // Market insights
      insights.market = await this.analyzeMarketTrends(timeRange);

      // Operational insights
      insights.operations = await this.analyzeOperationalEfficiency(timeRange);

      return insights;

    } catch (error) {
      console.error('Error generating business insights:', error);
      throw error;
    }
  }

  async analyzeRevenuePatterns(timeRange) {
    try {
      const timeCondition = this.getTimeCondition(timeRange);

      const revenueQuery = `
        WITH revenue_by_hour AS (
          SELECT 
            DATE_TRUNC('hour', created_at) as hour,
            SUM((event_data->>'total_amount')::numeric) as revenue,
            COUNT(*) as order_count
          FROM analytics_events 
          WHERE event_type = 'order_placed'
          ${timeCondition}
          GROUP BY DATE_TRUNC('hour', created_at)
          ORDER BY hour
        ),
        revenue_trends AS (
          SELECT 
            *,
            LAG(revenue) OVER (ORDER BY hour) as prev_revenue,
            revenue - LAG(revenue) OVER (ORDER BY hour) as revenue_change
          FROM revenue_by_hour
        )
        SELECT 
          COUNT(*) as total_periods,
          SUM(revenue) as total_revenue,
          AVG(revenue) as avg_hourly_revenue,
          MAX(revenue) as peak_revenue,
          MIN(revenue) as lowest_revenue,
          AVG(revenue_change) as avg_revenue_change,
          STDDEV(revenue) as revenue_volatility
        FROM revenue_trends
        WHERE prev_revenue IS NOT NULL
      `;

      const revenueResult = await pool.query(revenueQuery);
      const revenueMetrics = revenueResult.rows[0];

      // Peak hours analysis
      const peakHoursQuery = `
        SELECT 
          EXTRACT(hour FROM created_at) as hour,
          SUM((event_data->>'total_amount')::numeric) as revenue,
          COUNT(*) as order_count
        FROM analytics_events 
        WHERE event_type = 'order_placed'
        ${timeCondition}
        GROUP BY EXTRACT(hour FROM created_at)
        ORDER BY revenue DESC
        LIMIT 5
      `;

      const peakHoursResult = await pool.query(peakHoursQuery);

      return {
        total_revenue: parseFloat(revenueMetrics.total_revenue || 0),
        avg_hourly_revenue: parseFloat(revenueMetrics.avg_hourly_revenue || 0),
        peak_revenue: parseFloat(revenueMetrics.peak_revenue || 0),
        revenue_growth_rate: parseFloat(revenueMetrics.avg_revenue_change || 0),
        revenue_volatility: parseFloat(revenueMetrics.revenue_volatility || 0),
        peak_hours: peakHoursResult.rows,
        revenue_stability_score: this.calculateRevenueStabilityScore(revenueMetrics)
      };

    } catch (error) {
      console.error('Error analyzing revenue patterns:', error);
      throw error;
    }
  }

  async analyzeCustomerBehavior(timeRange) {
    try {
      const timeCondition = this.getTimeCondition(timeRange);

      // Customer segmentation analysis
      const segmentationQuery = `
        WITH customer_metrics AS (
          SELECT 
            user_id,
            COUNT(CASE WHEN event_type = 'order_placed' THEN 1 END) as order_count,
            SUM(CASE WHEN event_type = 'order_placed' 
                THEN (event_data->>'total_amount')::numeric ELSE 0 END) as total_spent,
            MAX(created_at) as last_order_date,
            MIN(created_at) as first_order_date
          FROM analytics_events 
          WHERE user_id IS NOT NULL
          ${timeCondition}
          GROUP BY user_id
        ),
        customer_segments AS (
          SELECT 
            CASE 
              WHEN order_count >= 10 AND total_spent >= 500 THEN 'VIP'
              WHEN order_count >= 5 AND total_spent >= 200 THEN 'Loyal'
              WHEN order_count >= 2 THEN 'Regular'
              ELSE 'New'
            END as segment,
            COUNT(*) as customer_count,
            AVG(total_spent) as avg_customer_value,
            AVG(order_count) as avg_orders_per_customer
          FROM customer_metrics
          GROUP BY 1
        )
        SELECT * FROM customer_segments
      `;

      const segmentationResult = await pool.query(segmentationQuery);

      // Customer lifetime value analysis
      const clvQuery = `
        SELECT 
          AVG(total_spent) as avg_customer_lifetime_value,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_spent) as median_clv,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_spent) as top_5_percent_clv
        FROM (
          SELECT 
            user_id,
            SUM((event_data->>'total_amount')::numeric) as total_spent
          FROM analytics_events 
          WHERE event_type = 'order_placed'
          AND user_id IS NOT NULL
          ${timeCondition}
          GROUP BY user_id
        ) customer_values
      `;

      const clvResult = await pool.query(clvQuery);

      // Churn analysis
      const churnQuery = `
        SELECT 
          COUNT(CASE WHEN days_since_last_order > 30 THEN 1 END) as at_risk_customers,
          COUNT(CASE WHEN days_since_last_order > 60 THEN 1 END) as churned_customers,
          COUNT(*) as total_customers
        FROM (
          SELECT 
            user_id,
            EXTRACT(days FROM NOW() - MAX(created_at)) as days_since_last_order
          FROM analytics_events 
          WHERE event_type = 'order_placed'
          AND user_id IS NOT NULL
          GROUP BY user_id
        ) customer_activity
      `;

      const churnResult = await pool.query(churnQuery);
      const churnMetrics = churnResult.rows[0];

      return {
        customer_segments: segmentationResult.rows,
        avg_customer_lifetime_value: parseFloat(clvResult.rows[0].avg_customer_lifetime_value || 0),
        median_customer_value: parseFloat(clvResult.rows[0].median_clv || 0),
        top_customer_value: parseFloat(clvResult.rows[0].top_5_percent_clv || 0),
        churn_risk_rate: parseInt(churnMetrics.at_risk_customers) / parseInt(churnMetrics.total_customers),
        churn_rate: parseInt(churnMetrics.churned_customers) / parseInt(churnMetrics.total_customers),
        customer_retention_score: this.calculateCustomerRetentionScore(churnMetrics)
      };

    } catch (error) {
      console.error('Error analyzing customer behavior:', error);
      throw error;
    }
  }

  async analyzeRestaurantPerformance(timeRange) {
    try {
      const timeCondition = this.getTimeCondition(timeRange);

      // Restaurant performance metrics
      const performanceQuery = `
        WITH restaurant_metrics AS (
          SELECT 
            restaurant_id,
            COUNT(CASE WHEN event_type = 'order_placed' THEN 1 END) as total_orders,
            SUM(CASE WHEN event_type = 'order_placed' 
                THEN (event_data->>'total_amount')::numeric ELSE 0 END) as total_revenue,
            AVG(CASE WHEN event_type = 'order_preparation_time' 
                THEN (event_data->>'preparation_time')::numeric END) as avg_prep_time,
            AVG(CASE WHEN event_data->>'rating' IS NOT NULL 
                THEN (event_data->>'rating')::numeric END) as avg_rating,
            COUNT(CASE WHEN event_type = 'order_cancelled' THEN 1 END) as cancelled_orders
          FROM analytics_events 
          WHERE restaurant_id IS NOT NULL
          ${timeCondition}
          GROUP BY restaurant_id
        )
        SELECT 
          COUNT(*) as total_restaurants,
          AVG(total_orders) as avg_orders_per_restaurant,
          AVG(total_revenue) as avg_revenue_per_restaurant,
          AVG(avg_prep_time) as overall_avg_prep_time,
          AVG(avg_rating) as overall_avg_rating,
          SUM(cancelled_orders) / NULLIF(SUM(total_orders), 0) as overall_cancellation_rate
        FROM restaurant_metrics
      `;

      const performanceResult = await pool.query(performanceQuery);

      // Top performing restaurants
      const topPerformersQuery = `
        SELECT 
          restaurant_id,
          COUNT(CASE WHEN event_type = 'order_placed' THEN 1 END) as orders,
          SUM(CASE WHEN event_type = 'order_placed' 
              THEN (event_data->>'total_amount')::numeric ELSE 0 END) as revenue,
          AVG(CASE WHEN event_data->>'rating' IS NOT NULL 
              THEN (event_data->>'rating')::numeric END) as rating
        FROM analytics_events 
        WHERE restaurant_id IS NOT NULL
        ${timeCondition}
        GROUP BY restaurant_id
        HAVING COUNT(CASE WHEN event_type = 'order_placed' THEN 1 END) > 0
        ORDER BY revenue DESC, rating DESC
        LIMIT 10
      `;

      const topPerformersResult = await pool.query(topPerformersQuery);

      return {
        total_active_restaurants: parseInt(performanceResult.rows[0].total_restaurants || 0),
        avg_orders_per_restaurant: parseFloat(performanceResult.rows[0].avg_orders_per_restaurant || 0),
        avg_revenue_per_restaurant: parseFloat(performanceResult.rows[0].avg_revenue_per_restaurant || 0),
        avg_preparation_time: parseFloat(performanceResult.rows[0].overall_avg_prep_time || 0),
        avg_restaurant_rating: parseFloat(performanceResult.rows[0].overall_avg_rating || 0),
        cancellation_rate: parseFloat(performanceResult.rows[0].overall_cancellation_rate || 0),
        top_performers: topPerformersResult.rows
      };

    } catch (error) {
      console.error('Error analyzing restaurant performance:', error);
      throw error;
    }
  }

  // KPI Dashboard Services
  async generateKPIDashboard() {
    try {
      console.log('Generating comprehensive KPI dashboard...');

      const kpis = {};

      // Financial KPIs
      kpis.financial = await this.calculateFinancialKPIs();

      // Operational KPIs
      kpis.operational = await this.calculateOperationalKPIs();

      // Customer KPIs
      kpis.customer = await this.calculateCustomerKPIs();

      // Performance KPIs
      kpis.performance = await this.calculatePerformanceKPIs();

      // Growth KPIs
      kpis.growth = await this.calculateGrowthKPIs();

      // Store in Redis for fast dashboard access
      await redis.setex('dashboard:kpis', 300, JSON.stringify(kpis));

      return kpis;

    } catch (error) {
      console.error('Error generating KPI dashboard:', error);
      throw error;
    }
  }

  async calculateFinancialKPIs() {
    try {
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Daily revenue
      const dailyRevenueQuery = `
        SELECT 
          SUM((event_data->>'total_amount')::numeric) as today_revenue,
          (SELECT SUM((event_data->>'total_amount')::numeric) 
           FROM analytics_events 
           WHERE event_type = 'order_placed' 
           AND created_at >= $2 AND created_at < $1) as yesterday_revenue
        FROM analytics_events 
        WHERE event_type = 'order_placed' 
        AND created_at >= $1
      `;

      const revenueResult = await pool.query(dailyRevenueQuery, [today, yesterday]);
      const revenue = revenueResult.rows[0];

      return {
        daily_revenue: parseFloat(revenue.today_revenue || 0),
        daily_revenue_change: this.calculatePercentageChange(
          parseFloat(revenue.today_revenue || 0),
          parseFloat(revenue.yesterday_revenue || 0)
        ),
        weekly_revenue_target: 50000, // Example target
        monthly_revenue_target: 200000 // Example target
      };

    } catch (error) {
      console.error('Error calculating financial KPIs:', error);
      throw error;
    }
  }

  // Utility Methods
  async updateRealTimeCounters(category, data) {
    try {
      const key = `real_time:${category}:${Date.now()}`;
      await redis.setex(key, 300, JSON.stringify(data)); // 5 minutes TTL

      // Also update latest counter
      await redis.setex(`real_time:${category}:latest`, 300, JSON.stringify(data));

    } catch (error) {
      console.error('Error updating real-time counters:', error);
      throw error;
    }
  }

  calculateRestaurantPerformanceScore(restaurantData) {
    const ordersWeight = 0.3;
    const prepTimeWeight = 0.2;
    const ratingWeight = 0.3;
    const cancellationWeight = 0.2;

    const ordersScore = Math.min(parseInt(restaurantData.orders_received || 0) / 10, 1) * 100;
    const prepTimeScore = Math.max(0, (30 - parseFloat(restaurantData.avg_prep_time || 30)) / 30) * 100;
    const ratingScore = (parseFloat(restaurantData.avg_rating || 0) / 5) * 100;
    const cancellationScore = Math.max(0, (1 - (parseInt(restaurantData.cancelled_orders || 0) / Math.max(parseInt(restaurantData.orders_received || 1), 1)))) * 100;

    return (ordersScore * ordersWeight + 
            prepTimeScore * prepTimeWeight + 
            ratingScore * ratingWeight + 
            cancellationScore * cancellationWeight).toFixed(2);
  }

  calculateDeliveryEfficiencyScore(deliveryData) {
    const timeWeight = 0.4;
    const ratingWeight = 0.3;
    const completionWeight = 0.3;

    const timeScore = Math.max(0, (60 - parseFloat(deliveryData.avg_delivery_time || 60)) / 60) * 100;
    const ratingScore = (parseFloat(deliveryData.avg_delivery_rating || 0) / 5) * 100;
    const completionScore = (parseInt(deliveryData.completed_deliveries || 0) / 
                           Math.max(parseInt(deliveryData.completed_deliveries || 0) + parseInt(deliveryData.delayed_deliveries || 0), 1)) * 100;

    return (timeScore * timeWeight + 
            ratingScore * ratingWeight + 
            completionScore * completionWeight).toFixed(2);
  }

  getTimeCondition(timeRange) {
    const now = new Date();
    let startTime;

    switch (timeRange) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return `AND created_at >= '${startTime.toISOString()}'`;
  }

  calculatePercentageChange(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous * 100).toFixed(2);
  }

  calculateRevenueStabilityScore(revenueMetrics) {
    const volatility = parseFloat(revenueMetrics.revenue_volatility || 0);
    const avgRevenue = parseFloat(revenueMetrics.avg_hourly_revenue || 0);
    
    if (avgRevenue === 0) return 0;
    
    const coefficientOfVariation = volatility / avgRevenue;
    return Math.max(0, (1 - coefficientOfVariation) * 100).toFixed(2);
  }

  calculateCustomerRetentionScore(churnMetrics) {
    const totalCustomers = parseInt(churnMetrics.total_customers || 0);
    const atRiskCustomers = parseInt(churnMetrics.at_risk_customers || 0);
    const churnedCustomers = parseInt(churnMetrics.churned_customers || 0);

    if (totalCustomers === 0) return 0;

    const retainedCustomers = totalCustomers - churnedCustomers;
    const retentionRate = retainedCustomers / totalCustomers;
    
    return (retentionRate * 100).toFixed(2);
  }
}

module.exports = AnalyticsService;