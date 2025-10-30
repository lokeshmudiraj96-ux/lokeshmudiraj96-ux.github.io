const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Enhanced restaurant model with advanced features
class Restaurant {
  
  // Initialize database schema
  static async ensureSchema() {
    const sql = `
      -- Enhanced restaurants table
      CREATE TABLE IF NOT EXISTS restaurants (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        cuisine_type VARCHAR(100),
        owner_id UUID,
        phone VARCHAR(20),
        email VARCHAR(255),
        
        -- Location and delivery
        address TEXT NOT NULL,
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        delivery_radius_km DECIMAL(4,2) DEFAULT 5.0,
        
        -- Business information
        operating_hours JSONB, -- {monday: {open: "09:00", close: "22:00"}, ...}
        is_open BOOLEAN DEFAULT true,
        is_accepting_orders BOOLEAN DEFAULT true,
        
        -- Ratings and reviews
        average_rating DECIMAL(3,2) DEFAULT 0.0,
        total_reviews INTEGER DEFAULT 0,
        
        -- Business metrics
        min_order_amount_cents INTEGER DEFAULT 0,
        delivery_fee_cents INTEGER DEFAULT 2000, -- ₹20 default
        estimated_delivery_time_minutes INTEGER DEFAULT 30,
        
        -- Features and capabilities
        features JSONB, -- ["live_tracking", "contactless_delivery", "bulk_orders"]
        payment_methods JSONB, -- ["cash", "card", "upi", "wallet"]
        
        -- Media
        logo_url TEXT,
        cover_image_url TEXT,
        image_gallery JSONB, -- Array of image URLs
        
        -- Status and verification
        is_verified BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        verification_documents JSONB,
        
        -- Performance tracking
        preparation_time_avg_minutes DECIMAL(5,2) DEFAULT 20.0,
        order_acceptance_rate DECIMAL(5,2) DEFAULT 95.0,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Enhanced menu categories
      CREATE TABLE IF NOT EXISTS menu_categories (
        id UUID PRIMARY KEY,
        restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Enhanced menu items with dynamic pricing
      CREATE TABLE IF NOT EXISTS menu_items (
        id UUID PRIMARY KEY,
        restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
        category_id UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        
        -- Pricing
        base_price_cents INTEGER NOT NULL,
        current_price_cents INTEGER, -- For dynamic pricing
        discount_percentage DECIMAL(5,2) DEFAULT 0.0,
        
        -- Inventory management
        is_available BOOLEAN DEFAULT true,
        stock_quantity INTEGER, -- NULL for unlimited
        daily_limit INTEGER, -- Max per day
        sold_today INTEGER DEFAULT 0,
        
        -- Item properties
        prep_time_minutes INTEGER DEFAULT 15,
        calories INTEGER,
        spice_level INTEGER, -- 1-5 scale
        is_veg BOOLEAN DEFAULT true,
        is_vegan BOOLEAN DEFAULT false,
        allergens JSONB, -- ["nuts", "dairy", "gluten"]
        
        -- Media and presentation
        image_url TEXT,
        image_gallery JSONB,
        
        -- Customization options
        customizations JSONB, -- {size: ["small", "medium", "large"], extras: [...]}
        
        -- Analytics
        popularity_score DECIMAL(5,2) DEFAULT 0.0,
        total_orders INTEGER DEFAULT 0,
        
        -- Status
        is_featured BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Dynamic pricing rules
      CREATE TABLE IF NOT EXISTS pricing_rules (
        id UUID PRIMARY KEY,
        restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
        item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
        rule_type VARCHAR(50) NOT NULL, -- "time_based", "demand_based", "weather_based"
        conditions JSONB NOT NULL, -- Rule conditions
        price_adjustment_type VARCHAR(20) NOT NULL, -- "percentage", "fixed_amount"
        price_adjustment DECIMAL(10,2) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        valid_from TIMESTAMP,
        valid_until TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Restaurant reviews and ratings
      CREATE TABLE IF NOT EXISTS restaurant_reviews (
        id UUID PRIMARY KEY,
        restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
        user_id UUID NOT NULL,
        order_id UUID,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        review_text TEXT,
        food_rating INTEGER CHECK (food_rating >= 1 AND food_rating <= 5),
        delivery_rating INTEGER CHECK (delivery_rating >= 1 AND delivery_rating <= 5),
        service_rating INTEGER CHECK (service_rating >= 1 AND service_rating <= 5),
        photos JSONB, -- Array of photo URLs
        is_verified BOOLEAN DEFAULT false,
        helpful_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Restaurant promotions and offers
      CREATE TABLE IF NOT EXISTS restaurant_promotions (
        id UUID PRIMARY KEY,
        restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        promotion_type VARCHAR(50) NOT NULL, -- "discount", "buy_one_get_one", "free_delivery"
        discount_value DECIMAL(10,2),
        discount_type VARCHAR(20), -- "percentage", "fixed_amount"
        minimum_order_amount_cents INTEGER DEFAULT 0,
        max_discount_cents INTEGER,
        usage_limit INTEGER,
        usage_count INTEGER DEFAULT 0,
        promo_code VARCHAR(50) UNIQUE,
        is_active BOOLEAN DEFAULT true,
        valid_from TIMESTAMP NOT NULL,
        valid_until TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Real-time inventory tracking
      CREATE TABLE IF NOT EXISTS inventory_logs (
        id UUID PRIMARY KEY,
        item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
        change_type VARCHAR(20) NOT NULL, -- "sale", "restock", "waste", "adjustment"
        quantity_change INTEGER NOT NULL,
        previous_quantity INTEGER,
        new_quantity INTEGER,
        reason TEXT,
        user_id UUID, -- Who made the change
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_restaurants_location ON restaurants(latitude, longitude);
      CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine ON restaurants(cuisine_type);
      CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
      CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
      CREATE INDEX IF NOT EXISTS idx_menu_items_availability ON menu_items(is_available, is_active);
      CREATE INDEX IF NOT EXISTS idx_reviews_restaurant ON restaurant_reviews(restaurant_id);
      CREATE INDEX IF NOT EXISTS idx_promotions_restaurant ON restaurant_promotions(restaurant_id, is_active);
    `;
    
    await pool.query(sql);
    console.log('Restaurant schema initialized');
  }

  // Create new restaurant
  static async create(restaurantData) {
    const id = uuidv4();
    const {
      name, description, cuisine_type, owner_id, phone, email, address,
      latitude, longitude, delivery_radius_km, operating_hours,
      min_order_amount_cents, delivery_fee_cents, estimated_delivery_time_minutes,
      features, payment_methods, logo_url, cover_image_url
    } = restaurantData;

    const { rows } = await pool.query(
      `INSERT INTO restaurants (
        id, name, description, cuisine_type, owner_id, phone, email, address,
        latitude, longitude, delivery_radius_km, operating_hours,
        min_order_amount_cents, delivery_fee_cents, estimated_delivery_time_minutes,
        features, payment_methods, logo_url, cover_image_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        id, name, description, cuisine_type, owner_id, phone, email, address,
        latitude, longitude, delivery_radius_km, JSON.stringify(operating_hours),
        min_order_amount_cents, delivery_fee_cents, estimated_delivery_time_minutes,
        JSON.stringify(features), JSON.stringify(payment_methods), logo_url, cover_image_url
      ]
    );

    return rows[0];
  }

  // Get restaurant by ID with full details
  static async getById(id) {
    const { rows } = await pool.query(`
      SELECT r.*, 
        COUNT(rv.id) as total_reviews,
        COALESCE(AVG(rv.rating), 0) as avg_rating
      FROM restaurants r
      LEFT JOIN restaurant_reviews rv ON r.id = rv.restaurant_id
      WHERE r.id = $1 AND r.is_active = true
      GROUP BY r.id
    `, [id]);

    if (rows.length === 0) return null;

    const restaurant = rows[0];
    
    // Get menu categories and items
    restaurant.menu_categories = await this.getMenuCategories(id);
    restaurant.active_promotions = await this.getActivePromotions(id);
    
    return restaurant;
  }

  // Search restaurants with advanced filtering
  static async search(filters = {}) {
    const {
      latitude, longitude, radius = 5,
      cuisine_type, min_rating = 0, is_open = true,
      delivery_fee_max, min_order_max,
      search_query, sort_by = 'distance',
      limit = 20, offset = 0
    } = filters;

    let query = `
      SELECT r.*, 
        COUNT(rv.id) as total_reviews,
        COALESCE(AVG(rv.rating), 0) as avg_rating,
        ${latitude && longitude ? `
          (6371 * acos(cos(radians($1)) * cos(radians(r.latitude)) * 
           cos(radians(r.longitude) - radians($2)) + 
           sin(radians($1)) * sin(radians(r.latitude)))) AS distance
        ` : '0 as distance'}
      FROM restaurants r
      LEFT JOIN restaurant_reviews rv ON r.id = rv.restaurant_id
      WHERE r.is_active = true
    `;

    const params = [];
    let paramIndex = latitude && longitude ? 3 : 1;

    if (latitude && longitude) {
      params.push(latitude, longitude);
    }

    if (latitude && longitude && radius) {
      query += ` AND (6371 * acos(cos(radians($1)) * cos(radians(r.latitude)) * 
                 cos(radians(r.longitude) - radians($2)) + 
                 sin(radians($1)) * sin(radians(r.latitude)))) <= $${paramIndex}`;
      params.push(radius);
      paramIndex++;
    }

    if (cuisine_type) {
      query += ` AND r.cuisine_type = $${paramIndex}`;
      params.push(cuisine_type);
      paramIndex++;
    }

    if (is_open !== undefined) {
      query += ` AND r.is_open = $${paramIndex}`;
      params.push(is_open);
      paramIndex++;
    }

    if (search_query) {
      query += ` AND (r.name ILIKE $${paramIndex} OR r.description ILIKE $${paramIndex})`;
      params.push(`%${search_query}%`);
      paramIndex++;
    }

    query += ` GROUP BY r.id`;

    if (min_rating > 0) {
      query += ` HAVING COALESCE(AVG(rv.rating), 0) >= $${paramIndex}`;
      params.push(min_rating);
      paramIndex++;
    }

    // Sorting
    const sortOptions = {
      distance: 'distance ASC',
      rating: 'avg_rating DESC',
      delivery_fee: 'r.delivery_fee_cents ASC',
      delivery_time: 'r.estimated_delivery_time_minutes ASC',
      popularity: 'r.total_reviews DESC'
    };

    query += ` ORDER BY ${sortOptions[sort_by] || sortOptions.distance}`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);
    return rows;
  }

  // Get menu categories for a restaurant
  static async getMenuCategories(restaurantId) {
    const { rows } = await pool.query(`
      SELECT mc.*, 
        COUNT(mi.id) as item_count
      FROM menu_categories mc
      LEFT JOIN menu_items mi ON mc.id = mi.category_id AND mi.is_active = true
      WHERE mc.restaurant_id = $1 AND mc.is_active = true
      GROUP BY mc.id
      ORDER BY mc.display_order, mc.name
    `, [restaurantId]);

    // Get items for each category
    for (const category of rows) {
      category.items = await this.getCategoryItems(category.id);
    }

    return rows;
  }

  // Get items for a specific category
  static async getCategoryItems(categoryId) {
    const { rows } = await pool.query(`
      SELECT * FROM menu_items
      WHERE category_id = $1 AND is_active = true AND is_available = true
      ORDER BY is_featured DESC, popularity_score DESC, name
    `, [categoryId]);

    return rows;
  }

  // Get active promotions for a restaurant
  static async getActivePromotions(restaurantId) {
    const { rows } = await pool.query(`
      SELECT * FROM restaurant_promotions
      WHERE restaurant_id = $1 AND is_active = true
        AND valid_from <= CURRENT_TIMESTAMP
        AND valid_until >= CURRENT_TIMESTAMP
      ORDER BY created_at DESC
    `, [restaurantId]);

    return rows;
  }

  // Update restaurant operating hours and status
  static async updateOperatingStatus(id, isOpen, operatingHours = null) {
    const params = [isOpen, id];
    let query = 'UPDATE restaurants SET is_open = $1, updated_at = CURRENT_TIMESTAMP';
    
    if (operatingHours) {
      query += ', operating_hours = $3';
      params.splice(1, 0, JSON.stringify(operatingHours));
    }
    
    query += ' WHERE id = $' + params.length + ' RETURNING *';
    
    const { rows } = await pool.query(query, params);
    return rows[0];
  }

  // Calculate dynamic pricing for an item
  static async calculateDynamicPrice(itemId, currentTime = new Date()) {
    const { rows: itemRows } = await pool.query(
      'SELECT base_price_cents, current_price_cents FROM menu_items WHERE id = $1',
      [itemId]
    );

    if (itemRows.length === 0) return null;

    const item = itemRows[0];
    let finalPrice = item.current_price_cents || item.base_price_cents;

    // Get active pricing rules
    const { rows: rules } = await pool.query(`
      SELECT * FROM pricing_rules
      WHERE item_id = $1 AND is_active = true
        AND (valid_from IS NULL OR valid_from <= $2)
        AND (valid_until IS NULL OR valid_until >= $2)
      ORDER BY created_at
    `, [itemId, currentTime]);

    for (const rule of rules) {
      if (this.evaluatePricingRule(rule, currentTime)) {
        if (rule.price_adjustment_type === 'percentage') {
          finalPrice = Math.round(finalPrice * (1 + rule.price_adjustment / 100));
        } else {
          finalPrice += Math.round(rule.price_adjustment * 100); // Convert to cents
        }
      }
    }

    return {
      base_price_cents: item.base_price_cents,
      current_price_cents: finalPrice,
      discount_applied: finalPrice < item.base_price_cents,
      discount_percentage: finalPrice < item.base_price_cents ? 
        Math.round(((item.base_price_cents - finalPrice) / item.base_price_cents) * 100) : 0
    };
  }

  // Evaluate pricing rule conditions
  static evaluatePricingRule(rule, currentTime) {
    const conditions = rule.conditions;
    const hour = currentTime.getHours();
    const day = currentTime.getDay(); // 0 = Sunday

    switch (rule.rule_type) {
      case 'time_based':
        if (conditions.hours) {
          return hour >= conditions.hours.start && hour <= conditions.hours.end;
        }
        if (conditions.days) {
          return conditions.days.includes(day);
        }
        break;
      
      case 'demand_based':
        // This would require real-time demand data
        // For now, return true if it's peak hours (12-2 PM, 7-9 PM)
        return (hour >= 12 && hour <= 14) || (hour >= 19 && hour <= 21);
      
      case 'weather_based':
        // This would require weather API integration
        // For demo, apply during typical rain hours
        return hour >= 16 && hour <= 18;
      
      default:
        return false;
    }
  }

  // Update inventory for menu item
  static async updateInventory(itemId, changeType, quantityChange, reason = '', userId = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current quantity
      const { rows: itemRows } = await client.query(
        'SELECT stock_quantity, sold_today FROM menu_items WHERE id = $1',
        [itemId]
      );
      
      if (itemRows.length === 0) throw new Error('Item not found');
      
      const currentQuantity = itemRows[0].stock_quantity || 0;
      const soldToday = itemRows[0].sold_today || 0;
      
      let newQuantity = currentQuantity;
      let newSoldToday = soldToday;
      
      if (changeType === 'sale') {
        newQuantity = Math.max(0, currentQuantity - Math.abs(quantityChange));
        newSoldToday = soldToday + Math.abs(quantityChange);
      } else if (changeType === 'restock') {
        newQuantity = currentQuantity + Math.abs(quantityChange);
      } else if (changeType === 'waste' || changeType === 'adjustment') {
        newQuantity = currentQuantity + quantityChange; // Can be negative for waste
      }
      
      // Update menu item
      await client.query(
        `UPDATE menu_items 
         SET stock_quantity = $2, sold_today = $3, is_available = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [itemId, newQuantity, newSoldToday, newQuantity > 0]
      );
      
      // Log inventory change
      const logId = uuidv4();
      await client.query(
        `INSERT INTO inventory_logs (id, item_id, change_type, quantity_change, previous_quantity, new_quantity, reason, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [logId, itemId, changeType, quantityChange, currentQuantity, newQuantity, reason, userId]
      );
      
      await client.query('COMMIT');
      return { success: true, new_quantity: newQuantity };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = Restaurant;