const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Advanced menu management model
class Menu {

  // Create menu category
  static async createCategory(restaurantId, categoryData) {
    const id = uuidv4();
    const { name, description, display_order = 0 } = categoryData;

    const { rows } = await pool.query(
      `INSERT INTO menu_categories (id, restaurant_id, name, description, display_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, restaurantId, name, description, display_order]
    );

    return rows[0];
  }

  // Create menu item with advanced features
  static async createItem(restaurantId, itemData) {
    const id = uuidv4();
    const {
      category_id, name, description, base_price_cents,
      prep_time_minutes = 15, calories, spice_level = 1,
      is_veg = true, is_vegan = false, allergens = [],
      image_url, customizations = {}, stock_quantity = null,
      daily_limit = null, is_featured = false
    } = itemData;

    const { rows } = await pool.query(
      `INSERT INTO menu_items (
        id, restaurant_id, category_id, name, description, base_price_cents,
        current_price_cents, prep_time_minutes, calories, spice_level,
        is_veg, is_vegan, allergens, image_url, customizations,
        stock_quantity, daily_limit, is_featured
      ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        id, restaurantId, category_id, name, description, base_price_cents,
        prep_time_minutes, calories, spice_level, is_veg, is_vegan,
        JSON.stringify(allergens), image_url, JSON.stringify(customizations),
        stock_quantity, daily_limit, is_featured
      ]
    );

    return rows[0];
  }

  // Get full menu for restaurant with pricing
  static async getRestaurantMenu(restaurantId, options = {}) {
    const { include_unavailable = false, category_id = null } = options;

    let categoryQuery = `
      SELECT * FROM menu_categories
      WHERE restaurant_id = $1 AND is_active = true
    `;
    
    if (category_id) {
      categoryQuery += ` AND id = $2`;
    }
    
    categoryQuery += ` ORDER BY display_order, name`;

    const categoryParams = category_id ? [restaurantId, category_id] : [restaurantId];
    const { rows: categories } = await pool.query(categoryQuery, categoryParams);

    // Get items for each category
    for (const category of categories) {
      let itemQuery = `
        SELECT mi.*, 
          CASE 
            WHEN mi.stock_quantity IS NOT NULL AND mi.stock_quantity <= 0 THEN false
            WHEN mi.daily_limit IS NOT NULL AND mi.sold_today >= mi.daily_limit THEN false
            ELSE mi.is_available
          END as is_currently_available
        FROM menu_items mi
        WHERE mi.category_id = $1 AND mi.is_active = true
      `;

      if (!include_unavailable) {
        itemQuery += ` AND mi.is_available = true`;
      }

      itemQuery += ` ORDER BY mi.is_featured DESC, mi.popularity_score DESC, mi.name`;

      const { rows: items } = await pool.query(itemQuery, [category.id]);

      // Calculate dynamic pricing for each item
      for (const item of items) {
        const pricing = await this.calculateItemPricing(item.id);
        Object.assign(item, pricing);
        
        // Add customization pricing
        if (item.customizations) {
          item.customizations = await this.processCustomizationPricing(item.customizations);
        }
      }

      category.items = items;
    }

    return categories;
  }

  // Calculate dynamic pricing for menu item
  static async calculateItemPricing(itemId, currentTime = new Date()) {
    const { rows: itemRows } = await pool.query(
      `SELECT base_price_cents, current_price_cents, discount_percentage 
       FROM menu_items WHERE id = $1`,
      [itemId]
    );

    if (itemRows.length === 0) return null;

    const item = itemRows[0];
    let finalPrice = item.current_price_cents || item.base_price_cents;

    // Apply base discount
    if (item.discount_percentage > 0) {
      finalPrice = Math.round(finalPrice * (1 - item.discount_percentage / 100));
    }

    // Get and apply active pricing rules
    const { rows: rules } = await pool.query(`
      SELECT * FROM pricing_rules
      WHERE item_id = $1 AND is_active = true
        AND (valid_from IS NULL OR valid_from <= $2)
        AND (valid_until IS NULL OR valid_until >= $2)
      ORDER BY created_at
    `, [itemId, currentTime]);

    let priceAdjustments = [];
    
    for (const rule of rules) {
      if (this.evaluatePricingConditions(rule.conditions, currentTime)) {
        const adjustment = {
          rule_type: rule.rule_type,
          adjustment_type: rule.price_adjustment_type,
          value: rule.price_adjustment
        };

        if (rule.price_adjustment_type === 'percentage') {
          const adjustmentAmount = Math.round(finalPrice * (rule.price_adjustment / 100));
          finalPrice += adjustmentAmount;
          adjustment.amount_cents = adjustmentAmount;
        } else {
          const adjustmentAmount = Math.round(rule.price_adjustment * 100);
          finalPrice += adjustmentAmount;
          adjustment.amount_cents = adjustmentAmount;
        }

        priceAdjustments.push(adjustment);
      }
    }

    const totalDiscount = item.base_price_cents - finalPrice;
    
    return {
      base_price_cents: item.base_price_cents,
      final_price_cents: Math.max(finalPrice, 0),
      discount_applied: totalDiscount > 0,
      total_discount_cents: Math.max(totalDiscount, 0),
      discount_percentage: totalDiscount > 0 ? 
        Math.round((totalDiscount / item.base_price_cents) * 100) : 0,
      price_adjustments: priceAdjustments,
      surge_pricing: priceAdjustments.some(adj => adj.rule_type === 'demand_based' && adj.amount_cents > 0)
    };
  }

  // Process customization options with pricing
  static async processCustomizationPricing(customizations) {
    if (!customizations || typeof customizations !== 'object') {
      return customizations;
    }

    const processed = { ...customizations };

    // Add pricing to customization options
    Object.keys(processed).forEach(key => {
      if (Array.isArray(processed[key])) {
        processed[key] = processed[key].map(option => {
          if (typeof option === 'string') {
            return { name: option, price_cents: 0 };
          }
          return option;
        });
      }
    });

    return processed;
  }

  // Evaluate dynamic pricing conditions
  static evaluatePricingConditions(conditions, currentTime) {
    const hour = currentTime.getHours();
    const day = currentTime.getDay();
    const minute = currentTime.getMinutes();

    // Time-based conditions
    if (conditions.time_range) {
      const { start_hour, end_hour, start_minute = 0, end_minute = 59 } = conditions.time_range;
      const currentMinutes = hour * 60 + minute;
      const startMinutes = start_hour * 60 + start_minute;
      const endMinutes = end_hour * 60 + end_minute;
      
      if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
        return false;
      }
    }

    // Day-based conditions
    if (conditions.days && !conditions.days.includes(day)) {
      return false;
    }

    // Weather conditions (mock implementation)
    if (conditions.weather) {
      // In real implementation, this would check weather API
      return this.mockWeatherCondition(conditions.weather);
    }

    // Demand-based conditions
    if (conditions.demand_threshold) {
      // In real implementation, this would check current demand metrics
      return this.mockDemandCondition(conditions.demand_threshold, currentTime);
    }

    return true;
  }

  // Mock weather condition check
  static mockWeatherCondition(weatherCondition) {
    const hour = new Date().getHours();
    
    switch (weatherCondition) {
      case 'rain':
        // Simulate rain probability during afternoon
        return hour >= 14 && hour <= 18 && Math.random() > 0.7;
      case 'hot':
        // Simulate hot weather during midday
        return hour >= 11 && hour <= 15;
      case 'cold':
        // Simulate cold weather during early morning/evening
        return hour <= 8 || hour >= 20;
      default:
        return false;
    }
  }

  // Mock demand condition check
  static mockDemandCondition(threshold, currentTime) {
    const hour = currentTime.getHours();
    const day = currentTime.getDay();
    
    // Peak hours: lunch (12-2 PM) and dinner (7-9 PM)
    const isPeakHour = (hour >= 12 && hour <= 14) || (hour >= 19 && hour <= 21);
    
    // Weekend multiplier
    const isWeekend = day === 0 || day === 6;
    
    // Simple demand simulation
    let demandScore = 50; // Base demand
    if (isPeakHour) demandScore += 30;
    if (isWeekend) demandScore += 20;
    
    return demandScore >= threshold;
  }

  // Create dynamic pricing rule
  static async createPricingRule(ruleData) {
    const id = uuidv4();
    const {
      restaurant_id, item_id, rule_type, conditions,
      price_adjustment_type, price_adjustment,
      valid_from, valid_until
    } = ruleData;

    const { rows } = await pool.query(
      `INSERT INTO pricing_rules (
        id, restaurant_id, item_id, rule_type, conditions,
        price_adjustment_type, price_adjustment, valid_from, valid_until
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        id, restaurant_id, item_id, rule_type, JSON.stringify(conditions),
        price_adjustment_type, price_adjustment, valid_from, valid_until
      ]
    );

    return rows[0];
  }

  // Bulk update item availability
  static async bulkUpdateAvailability(restaurantId, updates) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const results = [];
      
      for (const update of updates) {
        const { item_id, is_available, stock_quantity } = update;
        
        let query = `UPDATE menu_items SET is_available = $2, updated_at = CURRENT_TIMESTAMP`;
        let params = [item_id, is_available];
        
        if (stock_quantity !== undefined) {
          query += `, stock_quantity = $3`;
          params.push(stock_quantity);
        }
        
        query += ` WHERE id = $1 AND restaurant_id = $${params.length + 1} RETURNING *`;
        params.push(restaurantId);
        
        const { rows } = await client.query(query, params);
        results.push(rows[0]);
      }
      
      await client.query('COMMIT');
      return results;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get popular items analytics
  static async getPopularItems(restaurantId, timeframe = '7d', limit = 10) {
    const timeCondition = this.getTimeCondition(timeframe);
    
    const { rows } = await pool.query(`
      SELECT 
        mi.id, mi.name, mi.base_price_cents, mi.image_url,
        mi.total_orders, mi.popularity_score,
        COUNT(ol.quantity) as recent_orders,
        SUM(ol.quantity) as recent_quantity,
        AVG(ol.price_cents) as avg_selling_price
      FROM menu_items mi
      LEFT JOIN order_items ol ON mi.id = ol.item_id
      LEFT JOIN orders o ON ol.order_id = o.id
      WHERE mi.restaurant_id = $1 
        AND mi.is_active = true
        ${timeCondition ? 'AND o.created_at >= ' + timeCondition : ''}
      GROUP BY mi.id, mi.name, mi.base_price_cents, mi.image_url, mi.total_orders, mi.popularity_score
      ORDER BY recent_orders DESC, mi.popularity_score DESC
      LIMIT $2
    `, [restaurantId, limit]);

    return rows;
  }

  // Get time condition for analytics
  static getTimeCondition(timeframe) {
    const now = new Date();
    
    switch (timeframe) {
      case '1d':
        return `CURRENT_TIMESTAMP - INTERVAL '1 day'`;
      case '7d':
        return `CURRENT_TIMESTAMP - INTERVAL '7 days'`;
      case '30d':
        return `CURRENT_TIMESTAMP - INTERVAL '30 days'`;
      case '90d':
        return `CURRENT_TIMESTAMP - INTERVAL '90 days'`;
      default:
        return null;
    }
  }

  // Get menu performance analytics
  static async getMenuAnalytics(restaurantId, timeframe = '7d') {
    const timeCondition = this.getTimeCondition(timeframe);
    
    const { rows } = await pool.query(`
      SELECT 
        mc.id as category_id,
        mc.name as category_name,
        COUNT(DISTINCT mi.id) as total_items,
        COUNT(DISTINCT CASE WHEN mi.is_available THEN mi.id END) as available_items,
        SUM(CASE WHEN ol.id IS NOT NULL THEN ol.quantity ELSE 0 END) as total_orders,
        SUM(CASE WHEN ol.id IS NOT NULL THEN ol.price_cents * ol.quantity ELSE 0 END) as total_revenue_cents,
        AVG(mi.popularity_score) as avg_popularity_score
      FROM menu_categories mc
      LEFT JOIN menu_items mi ON mc.id = mi.category_id AND mi.is_active = true
      LEFT JOIN order_items ol ON mi.id = ol.item_id
      LEFT JOIN orders o ON ol.order_id = o.id
      WHERE mc.restaurant_id = $1 AND mc.is_active = true
        ${timeCondition ? 'AND (o.created_at >= ' + timeCondition + ' OR o.id IS NULL)' : ''}
      GROUP BY mc.id, mc.name
      ORDER BY total_revenue_cents DESC
    `, [restaurantId]);

    return rows;
  }

  // Reset daily counters (for daily limits)
  static async resetDailyCounters(restaurantId = null) {
    let query = `UPDATE menu_items SET sold_today = 0, updated_at = CURRENT_TIMESTAMP`;
    const params = [];
    
    if (restaurantId) {
      query += ` WHERE restaurant_id = $1`;
      params.push(restaurantId);
    }
    
    const { rowCount } = await pool.query(query, params);
    return { updated_items: rowCount };
  }

  // Get low stock alerts
  static async getLowStockAlerts(restaurantId, threshold = 5) {
    const { rows } = await pool.query(`
      SELECT 
        mi.id, mi.name, mi.stock_quantity, mi.daily_limit, mi.sold_today,
        mc.name as category_name
      FROM menu_items mi
      JOIN menu_categories mc ON mi.category_id = mc.id
      WHERE mi.restaurant_id = $1 
        AND mi.is_active = true
        AND (
          (mi.stock_quantity IS NOT NULL AND mi.stock_quantity <= $2)
          OR (mi.daily_limit IS NOT NULL AND (mi.daily_limit - mi.sold_today) <= $2)
        )
      ORDER BY mi.stock_quantity ASC, (mi.daily_limit - mi.sold_today) ASC
    `, [restaurantId, threshold]);

    return rows.map(item => ({
      ...item,
      alert_type: item.stock_quantity <= threshold ? 'low_stock' : 'approaching_daily_limit',
      remaining_quantity: item.stock_quantity || (item.daily_limit - item.sold_today)
    }));
  }

  // Update item popularity score based on orders
  static async updatePopularityScores(restaurantId) {
    const { rows } = await pool.query(`
      UPDATE menu_items 
      SET popularity_score = (
        SELECT COALESCE(
          (COUNT(ol.id) * 0.7) + 
          (AVG(CASE WHEN o.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 1 ELSE 0 END) * COUNT(ol.id) * 0.3),
          0
        )
        FROM order_items ol
        JOIN orders o ON ol.order_id = o.id
        WHERE ol.item_id = menu_items.id
      )
      WHERE restaurant_id = $1
      RETURNING id, name, popularity_score
    `, [restaurantId]);

    return rows;
  }
}

module.exports = Menu;