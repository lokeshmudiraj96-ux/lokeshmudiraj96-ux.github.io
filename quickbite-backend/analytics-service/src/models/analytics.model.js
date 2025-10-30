const { pool, redis } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class AnalyticsEvent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.eventType = data.eventType;
    this.eventName = data.eventName;
    this.userId = data.userId;
    this.sessionId = data.sessionId;
    this.restaurantId = data.restaurantId;
    this.orderId = data.orderId;
    this.itemId = data.itemId;
    this.properties = data.properties || {};
    this.timestamp = data.timestamp || new Date();
    this.ipAddress = data.ipAddress;
    this.userAgent = data.userAgent;
    this.referrer = data.referrer;
    this.deviceType = data.deviceType;
    this.platform = data.platform;
    this.browser = data.browser;
    this.locationData = data.locationData;
  }

  // Save analytics event to database
  async save() {
    try {
      const query = `
        INSERT INTO analytics_events (
          id, event_type, event_name, user_id, session_id, restaurant_id, 
          order_id, item_id, properties, timestamp, ip_address, user_agent, 
          referrer, device_type, platform, browser, location_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *
      `;

      const values = [
        this.id, this.eventType, this.eventName, this.userId, this.sessionId,
        this.restaurantId, this.orderId, this.itemId, JSON.stringify(this.properties),
        this.timestamp, this.ipAddress, this.userAgent, this.referrer,
        this.deviceType, this.platform, this.browser, JSON.stringify(this.locationData)
      ];

      const result = await pool.query(query, values);
      
      // Cache recent events in Redis for real-time processing
      await this.cacheEvent();
      
      return result.rows[0];

    } catch (error) {
      console.error('Error saving analytics event:', error);
      throw error;
    }
  }

  // Cache event in Redis for real-time processing
  async cacheEvent() {
    try {
      const cacheKey = `analytics:events:${this.eventType}:${Date.now()}`;
      const eventData = {
        id: this.id,
        eventType: this.eventType,
        eventName: this.eventName,
        userId: this.userId,
        timestamp: this.timestamp,
        properties: this.properties
      };

      await redis.zadd('analytics:recent_events', Date.now(), JSON.stringify(eventData));
      await redis.setex(cacheKey, 3600, JSON.stringify(eventData)); // 1 hour TTL

      // Update real-time counters
      await this.updateRealtimeCounters();

    } catch (error) {
      console.error('Error caching analytics event:', error);
    }
  }

  // Update real-time counters
  async updateRealtimeCounters() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const hour = new Date().getHours();

      // Update hourly counters
      await redis.hincrby(`analytics:hourly:${today}`, `${this.eventType}:${hour}`, 1);
      
      // Update daily counters
      await redis.hincrby(`analytics:daily:${today}`, this.eventType, 1);

      // Update user activity
      if (this.userId) {
        await redis.sadd(`analytics:active_users:${today}`, this.userId);
        await redis.setex(`analytics:user_activity:${this.userId}`, 86400, Date.now());
      }

      // Update restaurant activity
      if (this.restaurantId) {
        await redis.hincrby(`analytics:restaurant_activity:${today}`, this.restaurantId, 1);
      }

      // Set expiry for counters (7 days)
      await redis.expire(`analytics:hourly:${today}`, 604800);
      await redis.expire(`analytics:daily:${today}`, 604800);
      await redis.expire(`analytics:active_users:${today}`, 604800);
      await redis.expire(`analytics:restaurant_activity:${today}`, 604800);

    } catch (error) {
      console.error('Error updating real-time counters:', error);
    }
  }

  // Get events by filters
  static async getEvents(filters = {}) {
    try {
      let query = 'SELECT * FROM analytics_events WHERE 1=1';
      const values = [];
      let paramCount = 0;

      if (filters.eventType) {
        values.push(filters.eventType);
        query += ` AND event_type = $${++paramCount}`;
      }

      if (filters.userId) {
        values.push(filters.userId);
        query += ` AND user_id = $${++paramCount}`;
      }

      if (filters.restaurantId) {
        values.push(filters.restaurantId);
        query += ` AND restaurant_id = $${++paramCount}`;
      }

      if (filters.startDate) {
        values.push(filters.startDate);
        query += ` AND timestamp >= $${++paramCount}`;
      }

      if (filters.endDate) {
        values.push(filters.endDate);
        query += ` AND timestamp <= $${++paramCount}`;
      }

      query += ' ORDER BY timestamp DESC';

      if (filters.limit) {
        values.push(filters.limit);
        query += ` LIMIT $${++paramCount}`;
      }

      const result = await pool.query(query, values);
      return result.rows;

    } catch (error) {
      console.error('Error getting analytics events:', error);
      throw error;
    }
  }

  // Get event aggregations
  static async getEventAggregations(filters = {}) {
    try {
      const {
        groupBy = 'event_type',
        startDate,
        endDate,
        interval = 'hour'
      } = filters;

      let timetrunc = 'date_trunc(\'hour\', timestamp)';
      if (interval === 'day') timetrunc = 'date_trunc(\'day\', timestamp)';
      if (interval === 'week') timetrunc = 'date_trunc(\'week\', timestamp)';
      if (interval === 'month') timetrunc = 'date_trunc(\'month\', timestamp)';

      let query = `
        SELECT 
          ${timetrunc} as time_period,
          ${groupBy},
          COUNT(*) as event_count,
          COUNT(DISTINCT user_id) as unique_users
        FROM analytics_events 
        WHERE 1=1
      `;

      const values = [];
      let paramCount = 0;

      if (startDate) {
        values.push(startDate);
        query += ` AND timestamp >= $${++paramCount}`;
      }

      if (endDate) {
        values.push(endDate);
        query += ` AND timestamp <= $${++paramCount}`;
      }

      query += ` GROUP BY time_period, ${groupBy} ORDER BY time_period DESC, event_count DESC`;

      const result = await pool.query(query, values);
      return result.rows;

    } catch (error) {
      console.error('Error getting event aggregations:', error);
      throw error;
    }
  }
}

class UserBehaviorAnalytics {
  constructor(data) {
    this.userId = data.userId;
    this.date = data.date;
    this.sessionCount = data.sessionCount || 0;
    this.pageViews = data.pageViews || 0;
    this.timeSpentSeconds = data.timeSpentSeconds || 0;
    this.ordersPlaced = data.ordersPlaced || 0;
    this.itemsViewed = data.itemsViewed || 0;
    this.itemsAddedToCart = data.itemsAddedToCart || 0;
    this.searchesPerformed = data.searchesPerformed || 0;
    this.revenueGenerated = data.revenueGenerated || 0;
    this.averageOrderValue = data.averageOrderValue || 0;
    this.conversionRate = data.conversionRate || 0;
    this.bounceRate = data.bounceRate || 0;
    this.deviceTypes = data.deviceTypes || {};
    this.popularCategories = data.popularCategories || {};
    this.peakHours = data.peakHours || {};
  }

  // Save or update user behavior analytics
  async save() {
    try {
      const query = `
        INSERT INTO user_behavior_analytics (
          user_id, date, session_count, page_views, time_spent_seconds,
          orders_placed, items_viewed, items_added_to_cart, searches_performed,
          revenue_generated, average_order_value, conversion_rate, bounce_rate,
          device_types, popular_categories, peak_hours, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (user_id, date) DO UPDATE SET
          session_count = EXCLUDED.session_count,
          page_views = EXCLUDED.page_views,
          time_spent_seconds = EXCLUDED.time_spent_seconds,
          orders_placed = EXCLUDED.orders_placed,
          items_viewed = EXCLUDED.items_viewed,
          items_added_to_cart = EXCLUDED.items_added_to_cart,
          searches_performed = EXCLUDED.searches_performed,
          revenue_generated = EXCLUDED.revenue_generated,
          average_order_value = EXCLUDED.average_order_value,
          conversion_rate = EXCLUDED.conversion_rate,
          bounce_rate = EXCLUDED.bounce_rate,
          device_types = EXCLUDED.device_types,
          popular_categories = EXCLUDED.popular_categories,
          peak_hours = EXCLUDED.peak_hours,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `;

      const values = [
        this.userId, this.date, this.sessionCount, this.pageViews, this.timeSpentSeconds,
        this.ordersPlaced, this.itemsViewed, this.itemsAddedToCart, this.searchesPerformed,
        this.revenueGenerated, this.averageOrderValue, this.conversionRate, this.bounceRate,
        JSON.stringify(this.deviceTypes), JSON.stringify(this.popularCategories),
        JSON.stringify(this.peakHours), new Date()
      ];

      const result = await pool.query(query, values);
      return result.rows[0];

    } catch (error) {
      console.error('Error saving user behavior analytics:', error);
      throw error;
    }
  }

  // Get user behavior trends
  static async getUserBehaviorTrends(userId, days = 30) {
    try {
      const query = `
        SELECT * FROM user_behavior_analytics
        WHERE user_id = $1 
        AND date >= CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY date DESC
      `;

      const result = await pool.query(query, [userId]);
      return result.rows;

    } catch (error) {
      console.error('Error getting user behavior trends:', error);
      throw error;
    }
  }

  // Get cohort analysis
  static async getCohortAnalysis(startDate, endDate) {
    try {
      const query = `
        WITH user_cohorts AS (
          SELECT 
            user_id,
            MIN(date) as first_order_date,
            date_trunc('month', MIN(date)) as cohort_month
          FROM user_behavior_analytics
          WHERE orders_placed > 0
          GROUP BY user_id
        ),
        cohort_data AS (
          SELECT 
            uc.cohort_month,
            uba.date,
            COUNT(DISTINCT uba.user_id) as users,
            SUM(uba.revenue_generated) as revenue,
            AVG(uba.orders_placed) as avg_orders
          FROM user_cohorts uc
          JOIN user_behavior_analytics uba ON uc.user_id = uba.user_id
          WHERE uba.date BETWEEN $1 AND $2
          GROUP BY uc.cohort_month, uba.date
        )
        SELECT 
          cohort_month,
          date,
          users,
          revenue,
          avg_orders,
          EXTRACT(MONTH FROM age(date, cohort_month)) as month_number
        FROM cohort_data
        ORDER BY cohort_month, date
      `;

      const result = await pool.query(query, [startDate, endDate]);
      return result.rows;

    } catch (error) {
      console.error('Error getting cohort analysis:', error);
      throw error;
    }
  }
}

class SalesAnalytics {
  constructor(data) {
    this.date = data.date;
    this.hour = data.hour;
    this.totalSales = data.totalSales || 0;
    this.orderCount = data.orderCount || 0;
    this.averageOrderValue = data.averageOrderValue || 0;
    this.uniqueCustomers = data.uniqueCustomers || 0;
    this.newCustomers = data.newCustomers || 0;
    this.returningCustomers = data.returningCustomers || 0;
    this.salesByCategory = data.salesByCategory || {};
    this.salesByRestaurant = data.salesByRestaurant || {};
    this.paymentMethods = data.paymentMethods || {};
    this.discountUsage = data.discountUsage || 0;
    this.taxCollected = data.taxCollected || 0;
    this.commissionEarned = data.commissionEarned || 0;
    this.refundsProcessed = data.refundsProcessed || 0;
  }

  // Save sales analytics
  async save() {
    try {
      const query = `
        INSERT INTO sales_analytics (
          date, hour, total_sales, order_count, average_order_value,
          unique_customers, new_customers, returning_customers,
          sales_by_category, sales_by_restaurant, payment_methods,
          discount_usage, tax_collected, commission_earned, refunds_processed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (date, hour) DO UPDATE SET
          total_sales = EXCLUDED.total_sales,
          order_count = EXCLUDED.order_count,
          average_order_value = EXCLUDED.average_order_value,
          unique_customers = EXCLUDED.unique_customers,
          new_customers = EXCLUDED.new_customers,
          returning_customers = EXCLUDED.returning_customers,
          sales_by_category = EXCLUDED.sales_by_category,
          sales_by_restaurant = EXCLUDED.sales_by_restaurant,
          payment_methods = EXCLUDED.payment_methods,
          discount_usage = EXCLUDED.discount_usage,
          tax_collected = EXCLUDED.tax_collected,
          commission_earned = EXCLUDED.commission_earned,
          refunds_processed = EXCLUDED.refunds_processed
        RETURNING *
      `;

      const values = [
        this.date, this.hour, this.totalSales, this.orderCount, this.averageOrderValue,
        this.uniqueCustomers, this.newCustomers, this.returningCustomers,
        JSON.stringify(this.salesByCategory), JSON.stringify(this.salesByRestaurant),
        JSON.stringify(this.paymentMethods), this.discountUsage, this.taxCollected,
        this.commissionEarned, this.refundsProcessed
      ];

      const result = await pool.query(query, values);
      return result.rows[0];

    } catch (error) {
      console.error('Error saving sales analytics:', error);
      throw error;
    }
  }

  // Get sales trends
  static async getSalesTrends(startDate, endDate, interval = 'day') {
    try {
      let groupBy = 'date';
      if (interval === 'hour') groupBy = 'date, hour';
      if (interval === 'week') groupBy = 'date_trunc(\'week\', date)';
      if (interval === 'month') groupBy = 'date_trunc(\'month\', date)';

      const query = `
        SELECT 
          ${groupBy} as period,
          SUM(total_sales) as total_sales,
          SUM(order_count) as total_orders,
          AVG(average_order_value) as avg_order_value,
          SUM(unique_customers) as unique_customers
        FROM sales_analytics
        WHERE date BETWEEN $1 AND $2
        GROUP BY ${groupBy}
        ORDER BY period
      `;

      const result = await pool.query(query, [startDate, endDate]);
      return result.rows;

    } catch (error) {
      console.error('Error getting sales trends:', error);
      throw error;
    }
  }
}

class KPIMetrics {
  constructor(data) {
    this.metricName = data.metricName;
    this.metricCategory = data.metricCategory;
    this.date = data.date;
    this.hour = data.hour;
    this.value = data.value;
    this.targetValue = data.targetValue;
    this.variancePercentage = data.variancePercentage;
    this.trendDirection = data.trendDirection;
    this.metadata = data.metadata || {};
  }

  // Save KPI metric
  async save() {
    try {
      const query = `
        INSERT INTO kpi_metrics (
          metric_name, metric_category, date, hour, value, target_value,
          variance_percentage, trend_direction, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const values = [
        this.metricName, this.metricCategory, this.date, this.hour,
        this.value, this.targetValue, this.variancePercentage,
        this.trendDirection, JSON.stringify(this.metadata)
      ];

      const result = await pool.query(query, values);
      return result.rows[0];

    } catch (error) {
      console.error('Error saving KPI metric:', error);
      throw error;
    }
  }

  // Get KPI dashboard data
  static async getKPIDashboard(date = null) {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];

      const query = `
        SELECT 
          metric_name,
          metric_category,
          value,
          target_value,
          variance_percentage,
          trend_direction,
          metadata
        FROM kpi_metrics
        WHERE date = $1
        ORDER BY metric_category, metric_name
      `;

      const result = await pool.query(query, [targetDate]);
      
      // Group by category
      const dashboard = {};
      result.rows.forEach(row => {
        if (!dashboard[row.metric_category]) {
          dashboard[row.metric_category] = [];
        }
        dashboard[row.metric_category].push(row);
      });

      return dashboard;

    } catch (error) {
      console.error('Error getting KPI dashboard:', error);
      throw error;
    }
  }
}

module.exports = {
  AnalyticsEvent,
  UserBehaviorAnalytics,
  SalesAnalytics,
  KPIMetrics
};