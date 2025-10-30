const { pool, redis } = require('../config/database');
const { UserInteraction, ItemFeatures } = require('../models/recommendation.model');

class TrendingAndSeasonalAnalysis {
  constructor(options = {}) {
    this.analysisConfig = {
      trendingWindow: options.trendingWindow || 7, // days
      seasonalWindow: options.seasonalWindow || 30, // days for seasonal patterns
      minInteractionsForTrending: options.minInteractionsForTrending || 10,
      trendingDecayFactor: options.trendingDecayFactor || 0.8,
      seasonalPatterns: options.seasonalPatterns || ['breakfast', 'lunch', 'dinner', 'snack'],
      weatherFactors: options.weatherFactors || ['temperature', 'season', 'weather_type']
    };

    this.cacheTimeout = options.cacheTimeout || 1800; // 30 minutes
    this.updateInterval = options.updateInterval || 3600; // 1 hour
    
    this.lastUpdate = null;
    this.isAnalyzing = false;
  }

  // Main method to analyze and update trending items
  async analyzeTrends() {
    if (this.isAnalyzing) {
      console.log('Trend analysis already in progress');
      return false;
    }

    try {
      this.isAnalyzing = true;
      console.log('Starting trending and seasonal analysis...');

      // Run all analyses in parallel
      const [trendingDaily, trendingWeekly, seasonalPatterns, weatherPatterns] = await Promise.all([
        this.calculateDailyTrends(),
        this.calculateWeeklyTrends(),
        this.calculateSeasonalPatterns(),
        this.calculateWeatherPatterns()
      ]);

      // Update database with results
      await this.updateTrendingItems(trendingDaily, 'day');
      await this.updateTrendingItems(trendingWeekly, 'week');
      await this.updateSeasonalPatterns(seasonalPatterns);
      await this.updateWeatherPatterns(weatherPatterns);

      this.lastUpdate = new Date();
      console.log('Trending and seasonal analysis completed successfully');
      
      return true;

    } catch (error) {
      console.error('Error analyzing trends:', error);
      return false;
    } finally {
      this.isAnalyzing = false;
    }
  }

  // Calculate daily trending items
  async calculateDailyTrends() {
    try {
      const query = `
        WITH daily_stats AS (
          SELECT 
            ui.item_id,
            DATE(ui.created_at) as interaction_date,
            COUNT(*) as interaction_count,
            COUNT(DISTINCT ui.user_id) as unique_users,
            AVG(CASE WHEN ui.interaction_type = 'rate' THEN ui.interaction_value END) as avg_rating,
            SUM(CASE WHEN ui.interaction_type = 'purchase' THEN 1 ELSE 0 END) as purchase_count,
            SUM(CASE WHEN ui.interaction_type = 'view' THEN 1 ELSE 0 END) as view_count,
            SUM(CASE WHEN ui.interaction_type = 'favorite' THEN 1 ELSE 0 END) as favorite_count
          FROM user_interactions ui
          WHERE ui.created_at >= CURRENT_DATE - INTERVAL '${this.analysisConfig.trendingWindow} days'
          GROUP BY ui.item_id, DATE(ui.created_at)
        ),
        item_trends AS (
          SELECT 
            ds.item_id,
            SUM(ds.interaction_count) as total_interactions,
            COUNT(DISTINCT ds.interaction_date) as active_days,
            SUM(ds.unique_users) as total_unique_users,
            AVG(ds.avg_rating) as avg_rating,
            SUM(ds.purchase_count) as total_purchases,
            SUM(ds.view_count) as total_views,
            SUM(ds.favorite_count) as total_favorites,
            -- Calculate trend momentum
            (SUM(ds.interaction_count * (${this.analysisConfig.trendingWindow} - (CURRENT_DATE - ds.interaction_date))) 
             / SUM(ds.interaction_count)) as momentum_score
          FROM daily_stats ds
          GROUP BY ds.item_id
          HAVING SUM(ds.interaction_count) >= ${this.analysisConfig.minInteractionsForTrending}
        )
        SELECT 
          it.*,
          if.name,
          if.category,
          if.cuisine_type,
          if.price,
          if.rating_average,
          if.popularity_score,
          -- Calculate trending score combining multiple factors
          (
            (it.total_interactions * 0.3) +
            (it.total_unique_users * 0.25) +
            (it.momentum_score * 0.2) +
            (it.total_purchases * 0.15) +
            (COALESCE(it.avg_rating, 0) * 0.1)
          ) as trending_score
        FROM item_trends it
        JOIN item_features if ON it.item_id = if.item_id
        WHERE if.availability_score > 0.5
        ORDER BY trending_score DESC
        LIMIT 100
      `;

      const result = await pool.query(query);
      
      // Normalize trending scores
      const maxScore = result.rows[0]?.trending_score || 1;
      
      return result.rows.map(row => ({
        ...row,
        trend_score: row.trending_score / maxScore,
        growth_rate: this.calculateGrowthRate(row.momentum_score),
        trend_strength: this.calculateTrendStrength(row)
      }));

    } catch (error) {
      console.error('Error calculating daily trends:', error);
      return [];
    }
  }

  // Calculate weekly trending patterns
  async calculateWeeklyTrends() {
    try {
      const query = `
        WITH weekly_stats AS (
          SELECT 
            ui.item_id,
            EXTRACT(DOW FROM ui.created_at) as day_of_week,
            EXTRACT(HOUR FROM ui.created_at) as hour_of_day,
            COUNT(*) as interaction_count,
            COUNT(DISTINCT ui.user_id) as unique_users
          FROM user_interactions ui
          WHERE ui.created_at >= CURRENT_DATE - INTERVAL '${this.analysisConfig.seasonalWindow} days'
          GROUP BY ui.item_id, EXTRACT(DOW FROM ui.created_at), EXTRACT(HOUR FROM ui.created_at)
        ),
        weekly_trends AS (
          SELECT 
            ws.item_id,
            ws.day_of_week,
            SUM(ws.interaction_count) as total_interactions,
            AVG(ws.interaction_count) as avg_hourly_interactions,
            COUNT(DISTINCT ws.hour_of_day) as active_hours
          FROM weekly_stats ws
          GROUP BY ws.item_id, ws.day_of_week
        )
        SELECT 
          wt.*,
          if.name,
          if.category,
          if.cuisine_type,
          -- Calculate day-specific trending score
          (wt.total_interactions * wt.active_hours / 24.0) as day_trend_score
        FROM weekly_trends wt
        JOIN item_features if ON wt.item_id = if.item_id
        WHERE wt.total_interactions >= 5
        ORDER BY wt.day_of_week, day_trend_score DESC
      `;

      const result = await pool.query(query);
      return this.groupByDayOfWeek(result.rows);

    } catch (error) {
      console.error('Error calculating weekly trends:', error);
      return {};
    }
  }

  // Calculate seasonal patterns
  async calculateSeasonalPatterns() {
    try {
      const currentMonth = new Date().getMonth() + 1;
      const currentSeason = this.getSeason(currentMonth);

      const query = `
        WITH seasonal_data AS (
          SELECT 
            ui.item_id,
            EXTRACT(MONTH FROM ui.created_at) as month,
            EXTRACT(HOUR FROM ui.created_at) as hour,
            COUNT(*) as interaction_count,
            AVG(CASE WHEN ui.interaction_type = 'rate' THEN ui.interaction_value END) as avg_rating
          FROM user_interactions ui
          WHERE ui.created_at >= CURRENT_DATE - INTERVAL '365 days'
          GROUP BY ui.item_id, EXTRACT(MONTH FROM ui.created_at), EXTRACT(HOUR FROM ui.created_at)
        ),
        seasonal_patterns AS (
          SELECT 
            sd.item_id,
            sd.month,
            CASE 
              WHEN sd.hour BETWEEN 6 AND 10 THEN 'breakfast'
              WHEN sd.hour BETWEEN 11 AND 15 THEN 'lunch' 
              WHEN sd.hour BETWEEN 18 AND 22 THEN 'dinner'
              ELSE 'snack'
            END as meal_period,
            SUM(sd.interaction_count) as period_interactions,
            AVG(sd.avg_rating) as period_rating
          FROM seasonal_data sd
          GROUP BY sd.item_id, sd.month, 
            CASE 
              WHEN sd.hour BETWEEN 6 AND 10 THEN 'breakfast'
              WHEN sd.hour BETWEEN 11 AND 15 THEN 'lunch' 
              WHEN sd.hour BETWEEN 18 AND 22 THEN 'dinner'
              ELSE 'snack'
            END
        ),
        current_season_items AS (
          SELECT 
            sp.item_id,
            sp.meal_period,
            SUM(sp.period_interactions) as seasonal_interactions,
            AVG(sp.period_rating) as seasonal_rating
          FROM seasonal_patterns sp
          WHERE sp.month IN (${this.getSeasonMonths(currentSeason).join(',')})
          GROUP BY sp.item_id, sp.meal_period
          HAVING SUM(sp.period_interactions) >= 10
        )
        SELECT 
          csi.*,
          if.name,
          if.category,
          if.cuisine_type,
          if.price,
          if.rating_average,
          -- Calculate seasonal relevance score
          (csi.seasonal_interactions * COALESCE(csi.seasonal_rating / 5.0, 0.5)) as seasonal_score
        FROM current_season_items csi
        JOIN item_features if ON csi.item_id = if.item_id
        WHERE if.availability_score > 0.5
        ORDER BY csi.meal_period, seasonal_score DESC
      `;

      const result = await pool.query(query);
      return this.groupByMealPeriod(result.rows);

    } catch (error) {
      console.error('Error calculating seasonal patterns:', error);
      return {};
    }
  }

  // Calculate weather-based patterns
  async calculateWeatherPatterns() {
    try {
      // This would integrate with weather API data
      // For now, we'll simulate based on item characteristics
      
      const query = `
        SELECT 
          item_id,
          name,
          category,
          cuisine_type,
          spice_level,
          dietary_tags,
          calories,
          -- Simulate weather preferences based on item characteristics
          CASE 
            WHEN spice_level >= 4 OR cuisine_type IN ('indian', 'thai', 'mexican') THEN 'cold_weather'
            WHEN category IN ('salad', 'smoothie', 'ice-cream') OR dietary_tags::text LIKE '%cold%' THEN 'hot_weather'
            WHEN category IN ('soup', 'hot-beverage') OR spice_level >= 3 THEN 'cold_weather'
            ELSE 'neutral'
          END as weather_preference,
          popularity_score,
          rating_average
        FROM item_features
        WHERE availability_score > 0.5
      `;

      const result = await pool.query(query);
      return this.groupByWeatherPreference(result.rows);

    } catch (error) {
      console.error('Error calculating weather patterns:', error);
      return {};
    }
  }

  // Update trending items in database
  async updateTrendingItems(trendingItems, timePeriod) {
    try {
      // Clear existing trending data for this time period
      await pool.query(
        'DELETE FROM trending_items WHERE time_period = $1',
        [timePeriod]
      );

      // Insert new trending data
      for (const item of trendingItems) {
        await pool.query(`
          INSERT INTO trending_items (
            item_id, time_period, trend_score, interaction_count, 
            unique_users, growth_rate, trend_strength, valid_until
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          item.item_id,
          timePeriod,
          item.trend_score,
          item.total_interactions,
          item.total_unique_users,
          item.growth_rate,
          item.trend_strength,
          new Date(Date.now() + this.cacheTimeout * 1000)
        ]);
      }

      console.log(`Updated ${trendingItems.length} trending items for ${timePeriod}`);

    } catch (error) {
      console.error('Error updating trending items:', error);
    }
  }

  // Update seasonal patterns
  async updateSeasonalPatterns(seasonalPatterns) {
    try {
      const serializedPatterns = JSON.stringify(seasonalPatterns);
      
      await redis.setex(
        'seasonal_patterns', 
        this.cacheTimeout * 24, // Cache for 24 hours
        serializedPatterns
      );

      console.log('Updated seasonal patterns in cache');

    } catch (error) {
      console.error('Error updating seasonal patterns:', error);
    }
  }

  // Update weather patterns
  async updateWeatherPatterns(weatherPatterns) {
    try {
      const serializedPatterns = JSON.stringify(weatherPatterns);
      
      await redis.setex(
        'weather_patterns',
        this.cacheTimeout * 12, // Cache for 12 hours
        serializedPatterns
      );

      console.log('Updated weather patterns in cache');

    } catch (error) {
      console.error('Error updating weather patterns:', error);
    }
  }

  // Get trending recommendations
  async getTrendingRecommendations(options = {}) {
    const {
      limit = 10,
      timePeriod = 'day',
      category = null,
      mealPeriod = null
    } = options;

    try {
      // Check cache first
      const cacheKey = `trending_recs:${timePeriod}:${category || 'all'}:${mealPeriod || 'all'}:${limit}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      let whereClause = '';
      const queryParams = [timePeriod];
      let paramCount = 1;

      if (category) {
        whereClause += ` AND if.category = $${++paramCount}`;
        queryParams.push(category);
      }

      // Get current meal period if not specified
      const currentMealPeriod = mealPeriod || this.getCurrentMealPeriod();
      
      const query = `
        SELECT 
          ti.*,
          if.name,
          if.category,
          if.cuisine_type,
          if.price,
          if.rating_average,
          if.popularity_score
        FROM trending_items ti
        JOIN item_features if ON ti.item_id = if.item_id
        WHERE ti.time_period = $1 
          AND ti.valid_until > CURRENT_TIMESTAMP
          ${whereClause}
        ORDER BY ti.trend_score DESC
        LIMIT ${limit}
      `;

      const result = await pool.query(query, queryParams);
      
      const recommendations = result.rows.map(row => ({
        itemId: row.item_id,
        score: row.trend_score,
        confidence: 0.8, // Trending items have good confidence
        recommendationType: 'trending',
        algorithm: 'trending_analysis',
        explanation: `Trending ${row.category} with ${row.growth_rate > 0 ? 'growing' : 'stable'} popularity`,
        itemDetails: {
          name: row.name,
          category: row.category,
          cuisine_type: row.cuisine_type,
          price: row.price,
          rating_average: row.rating_average,
          popularity_score: row.popularity_score
        },
        trendingMetrics: {
          trendScore: row.trend_score,
          interactionCount: row.interaction_count,
          uniqueUsers: row.unique_users,
          growthRate: row.growth_rate,
          trendStrength: row.trend_strength
        }
      }));

      // Cache results
      await redis.setex(cacheKey, this.cacheTimeout, JSON.stringify(recommendations));
      
      return recommendations;

    } catch (error) {
      console.error('Error getting trending recommendations:', error);
      return [];
    }
  }

  // Get seasonal recommendations
  async getSeasonalRecommendations(options = {}) {
    const {
      limit = 10,
      mealPeriod = null
    } = options;

    try {
      const currentMealPeriod = mealPeriod || this.getCurrentMealPeriod();
      
      const cacheKey = `seasonal_recs:${currentMealPeriod}:${limit}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      const seasonalPatterns = await redis.get('seasonal_patterns');
      if (!seasonalPatterns) {
        console.log('No seasonal patterns available');
        return [];
      }

      const patterns = JSON.parse(seasonalPatterns);
      const mealPeriodItems = patterns[currentMealPeriod] || [];
      
      const recommendations = mealPeriodItems.slice(0, limit).map(item => ({
        itemId: item.item_id,
        score: item.seasonal_score,
        confidence: 0.75,
        recommendationType: 'seasonal',
        algorithm: 'seasonal_analysis',
        explanation: `Perfect for ${currentMealPeriod} during this season`,
        itemDetails: {
          name: item.name,
          category: item.category,
          cuisine_type: item.cuisine_type,
          price: item.price,
          rating_average: item.rating_average
        },
        seasonalMetrics: {
          mealPeriod: item.meal_period,
          seasonalInteractions: item.seasonal_interactions,
          seasonalRating: item.seasonal_rating,
          seasonalScore: item.seasonal_score
        }
      }));

      // Cache results
      await redis.setex(cacheKey, this.cacheTimeout, JSON.stringify(recommendations));
      
      return recommendations;

    } catch (error) {
      console.error('Error getting seasonal recommendations:', error);
      return [];
    }
  }

  // Utility methods
  calculateGrowthRate(momentumScore) {
    // Convert momentum score to growth percentage
    return (momentumScore - 1) * 100;
  }

  calculateTrendStrength(trendItem) {
    const {
      total_interactions,
      total_unique_users,
      active_days,
      momentum_score
    } = trendItem;

    // Combine multiple factors for trend strength
    const consistencyScore = active_days / this.analysisConfig.trendingWindow;
    const userEngagementScore = total_unique_users / Math.max(1, total_interactions);
    const momentumStrength = Math.min(1, momentum_score / 5);

    return (consistencyScore * 0.4 + userEngagementScore * 0.3 + momentumStrength * 0.3);
  }

  getSeason(month) {
    if (month >= 12 || month <= 2) return 'winter';
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    return 'autumn';
  }

  getSeasonMonths(season) {
    const seasonMap = {
      'winter': [12, 1, 2],
      'spring': [3, 4, 5],
      'summer': [6, 7, 8],
      'autumn': [9, 10, 11]
    };
    return seasonMap[season] || [1, 2, 3];
  }

  getCurrentMealPeriod() {
    const hour = new Date().getHours();
    
    if (hour >= 6 && hour < 11) return 'breakfast';
    if (hour >= 11 && hour < 16) return 'lunch';
    if (hour >= 18 && hour < 23) return 'dinner';
    return 'snack';
  }

  groupByDayOfWeek(rows) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const grouped = {};
    
    days.forEach((day, index) => {
      grouped[day] = rows.filter(row => row.day_of_week === index);
    });
    
    return grouped;
  }

  groupByMealPeriod(rows) {
    const periods = ['breakfast', 'lunch', 'dinner', 'snack'];
    const grouped = {};
    
    periods.forEach(period => {
      grouped[period] = rows.filter(row => row.meal_period === period);
    });
    
    return grouped;
  }

  groupByWeatherPreference(rows) {
    const preferences = ['hot_weather', 'cold_weather', 'neutral'];
    const grouped = {};
    
    preferences.forEach(preference => {
      grouped[preference] = rows.filter(row => row.weather_preference === preference);
    });
    
    return grouped;
  }

  // Analysis status and scheduling
  getAnalysisStatus() {
    return {
      isAnalyzing: this.isAnalyzing,
      lastUpdate: this.lastUpdate,
      nextUpdate: this.lastUpdate ? 
        new Date(this.lastUpdate.getTime() + this.updateInterval * 1000) : null
    };
  }

  async scheduleAnalysis() {
    console.log('Starting scheduled trending analysis');
    
    setInterval(async () => {
      if (!this.isAnalyzing) {
        await this.analyzeTrends();
      }
    }, this.updateInterval * 1000);
  }

  // Real-time trend detection
  async detectRealTimeTrends() {
    try {
      // Monitor last 2 hours for sudden spikes
      const query = `
        SELECT 
          item_id,
          COUNT(*) as recent_interactions,
          COUNT(DISTINCT user_id) as recent_users
        FROM user_interactions
        WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '2 hours'
        GROUP BY item_id
        HAVING COUNT(*) >= 5
        ORDER BY recent_interactions DESC
        LIMIT 20
      `;

      const result = await pool.query(query);
      
      // Compare with historical averages
      for (const item of result.rows) {
        const isSpike = await this.detectInteractionSpike(item.item_id, item.recent_interactions);
        
        if (isSpike) {
          await this.markAsEmergingTrend(item);
        }
      }

    } catch (error) {
      console.error('Error detecting real-time trends:', error);
    }
  }

  async detectInteractionSpike(itemId, recentInteractions) {
    try {
      const avgQuery = `
        SELECT AVG(hourly_count) as avg_hourly
        FROM (
          SELECT COUNT(*) as hourly_count
          FROM user_interactions
          WHERE item_id = $1 
            AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
            AND created_at <= CURRENT_TIMESTAMP - INTERVAL '2 hours'
          GROUP BY DATE_TRUNC('hour', created_at)
        ) hourly_stats
      `;

      const result = await pool.query(avgQuery, [itemId]);
      const avgHourly = result.rows[0]?.avg_hourly || 1;
      
      // Spike detected if recent interactions > 3x average
      return recentInteractions > (avgHourly * 3);

    } catch (error) {
      console.error('Error detecting interaction spike:', error);
      return false;
    }
  }

  async markAsEmergingTrend(item) {
    try {
      await redis.sadd('emerging_trends', item.item_id);
      await redis.expire('emerging_trends', 3600); // 1 hour TTL
      
      console.log(`Marked item ${item.item_id} as emerging trend`);

    } catch (error) {
      console.error('Error marking emerging trend:', error);
    }
  }
}

module.exports = TrendingAndSeasonalAnalysis;