const Restaurant = require('../models/restaurant.model');
const Menu = require('../models/menu.model');

class CatalogController {

  // Initialize database schemas
  static async initialize(req, res) {
    try {
      await Restaurant.ensureSchema();
      res.json({ 
        success: true, 
        message: 'Catalog service database schema initialized successfully' 
      });
    } catch (error) {
      console.error('Schema initialization error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to initialize database schema',
        error: error.message 
      });
    }
  }

  // Create new restaurant
  static async createRestaurant(req, res) {
    try {
      const restaurantData = req.body;
      
      // Validate required fields
      const requiredFields = ['name', 'address', 'latitude', 'longitude', 'cuisine_type'];
      for (const field of requiredFields) {
        if (!restaurantData[field]) {
          return res.status(400).json({
            success: false,
            message: `Missing required field: ${field}`
          });
        }
      }

      // Set default values
      restaurantData.features = restaurantData.features || ['online_ordering', 'contactless_delivery'];
      restaurantData.payment_methods = restaurantData.payment_methods || ['cash', 'card', 'upi'];
      restaurantData.operating_hours = restaurantData.operating_hours || {
        monday: { open: '09:00', close: '22:00', is_open: true },
        tuesday: { open: '09:00', close: '22:00', is_open: true },
        wednesday: { open: '09:00', close: '22:00', is_open: true },
        thursday: { open: '09:00', close: '22:00', is_open: true },
        friday: { open: '09:00', close: '22:00', is_open: true },
        saturday: { open: '09:00', close: '22:00', is_open: true },
        sunday: { open: '10:00', close: '21:00', is_open: true }
      };

      const restaurant = await Restaurant.create(restaurantData);
      
      res.status(201).json({
        success: true,
        message: 'Restaurant created successfully',
        data: restaurant
      });

    } catch (error) {
      console.error('Create restaurant error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create restaurant',
        error: error.message
      });
    }
  }

  // Get restaurant details by ID
  static async getRestaurant(req, res) {
    try {
      const { id } = req.params;
      const restaurant = await Restaurant.getById(id);
      
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant not found'
        });
      }

      res.json({
        success: true,
        data: restaurant
      });

    } catch (error) {
      console.error('Get restaurant error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch restaurant details',
        error: error.message
      });
    }
  }

  // Search restaurants with advanced filtering
  static async searchRestaurants(req, res) {
    try {
      const filters = {
        latitude: parseFloat(req.query.latitude),
        longitude: parseFloat(req.query.longitude),
        radius: parseFloat(req.query.radius) || 5,
        cuisine_type: req.query.cuisine_type,
        min_rating: parseFloat(req.query.min_rating) || 0,
        is_open: req.query.is_open !== 'false',
        delivery_fee_max: req.query.delivery_fee_max ? parseInt(req.query.delivery_fee_max) : null,
        min_order_max: req.query.min_order_max ? parseInt(req.query.min_order_max) : null,
        search_query: req.query.q,
        sort_by: req.query.sort_by || 'distance',
        limit: Math.min(parseInt(req.query.limit) || 20, 100),
        offset: parseInt(req.query.offset) || 0
      };

      const restaurants = await Restaurant.search(filters);
      
      res.json({
        success: true,
        data: restaurants,
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
          has_more: restaurants.length === filters.limit
        },
        filters_applied: filters
      });

    } catch (error) {
      console.error('Search restaurants error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search restaurants',
        error: error.message
      });
    }
  }

  // Get restaurant menu with dynamic pricing
  static async getRestaurantMenu(req, res) {
    try {
      const { id } = req.params;
      const options = {
        include_unavailable: req.query.include_unavailable === 'true',
        category_id: req.query.category_id
      };

      // Verify restaurant exists
      const restaurant = await Restaurant.getById(id);
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant not found'
        });
      }

      const menu = await Menu.getRestaurantMenu(id, options);
      
      res.json({
        success: true,
        data: {
          restaurant: {
            id: restaurant.id,
            name: restaurant.name,
            cuisine_type: restaurant.cuisine_type,
            is_open: restaurant.is_open,
            estimated_delivery_time_minutes: restaurant.estimated_delivery_time_minutes,
            delivery_fee_cents: restaurant.delivery_fee_cents,
            min_order_amount_cents: restaurant.min_order_amount_cents
          },
          menu: menu
        }
      });

    } catch (error) {
      console.error('Get menu error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch restaurant menu',
        error: error.message
      });
    }
  }

  // Create menu category
  static async createMenuCategory(req, res) {
    try {
      const { restaurantId } = req.params;
      const categoryData = req.body;

      // Validate required fields
      if (!categoryData.name) {
        return res.status(400).json({
          success: false,
          message: 'Category name is required'
        });
      }

      const category = await Menu.createCategory(restaurantId, categoryData);
      
      res.status(201).json({
        success: true,
        message: 'Menu category created successfully',
        data: category
      });

    } catch (error) {
      console.error('Create menu category error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create menu category',
        error: error.message
      });
    }
  }

  // Create menu item
  static async createMenuItem(req, res) {
    try {
      const { restaurantId } = req.params;
      const itemData = req.body;

      // Validate required fields
      const requiredFields = ['name', 'base_price_cents'];
      for (const field of requiredFields) {
        if (!itemData[field]) {
          return res.status(400).json({
            success: false,
            message: `Missing required field: ${field}`
          });
        }
      }

      const item = await Menu.createItem(restaurantId, itemData);
      
      res.status(201).json({
        success: true,
        message: 'Menu item created successfully',
        data: item
      });

    } catch (error) {
      console.error('Create menu item error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create menu item',
        error: error.message
      });
    }
  }

  // Get item pricing with dynamic calculations
  static async getItemPricing(req, res) {
    try {
      const { itemId } = req.params;
      const currentTime = req.query.time ? new Date(req.query.time) : new Date();

      const pricing = await Menu.calculateItemPricing(itemId, currentTime);
      
      if (!pricing) {
        return res.status(404).json({
          success: false,
          message: 'Menu item not found'
        });
      }

      res.json({
        success: true,
        data: pricing,
        calculated_at: currentTime.toISOString()
      });

    } catch (error) {
      console.error('Get item pricing error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate item pricing',
        error: error.message
      });
    }
  }

  // Create dynamic pricing rule
  static async createPricingRule(req, res) {
    try {
      const ruleData = req.body;

      // Validate required fields
      const requiredFields = ['restaurant_id', 'rule_type', 'conditions', 'price_adjustment_type', 'price_adjustment'];
      for (const field of requiredFields) {
        if (!ruleData[field]) {
          return res.status(400).json({
            success: false,
            message: `Missing required field: ${field}`
          });
        }
      }

      const rule = await Menu.createPricingRule(ruleData);
      
      res.status(201).json({
        success: true,
        message: 'Pricing rule created successfully',
        data: rule
      });

    } catch (error) {
      console.error('Create pricing rule error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create pricing rule',
        error: error.message
      });
    }
  }

  // Update restaurant operating status
  static async updateOperatingStatus(req, res) {
    try {
      const { id } = req.params;
      const { is_open, operating_hours } = req.body;

      if (typeof is_open !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'is_open must be a boolean value'
        });
      }

      const restaurant = await Restaurant.updateOperatingStatus(id, is_open, operating_hours);
      
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant not found'
        });
      }

      res.json({
        success: true,
        message: 'Operating status updated successfully',
        data: restaurant
      });

    } catch (error) {
      console.error('Update operating status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update operating status',
        error: error.message
      });
    }
  }

  // Bulk update menu item availability
  static async bulkUpdateAvailability(req, res) {
    try {
      const { restaurantId } = req.params;
      const { updates } = req.body;

      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Updates array is required and cannot be empty'
        });
      }

      const results = await Menu.bulkUpdateAvailability(restaurantId, updates);
      
      res.json({
        success: true,
        message: 'Menu items updated successfully',
        data: results
      });

    } catch (error) {
      console.error('Bulk update availability error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update menu items',
        error: error.message
      });
    }
  }

  // Update inventory for menu item
  static async updateInventory(req, res) {
    try {
      const { itemId } = req.params;
      const { change_type, quantity_change, reason, user_id } = req.body;

      // Validate required fields
      if (!change_type || typeof quantity_change !== 'number') {
        return res.status(400).json({
          success: false,
          message: 'change_type and quantity_change are required'
        });
      }

      const validChangeTypes = ['sale', 'restock', 'waste', 'adjustment'];
      if (!validChangeTypes.includes(change_type)) {
        return res.status(400).json({
          success: false,
          message: `Invalid change_type. Must be one of: ${validChangeTypes.join(', ')}`
        });
      }

      const result = await Restaurant.updateInventory(itemId, change_type, quantity_change, reason, user_id);
      
      res.json({
        success: true,
        message: 'Inventory updated successfully',
        data: result
      });

    } catch (error) {
      console.error('Update inventory error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update inventory',
        error: error.message
      });
    }
  }

  // Get popular menu items
  static async getPopularItems(req, res) {
    try {
      const { restaurantId } = req.params;
      const timeframe = req.query.timeframe || '7d';
      const limit = Math.min(parseInt(req.query.limit) || 10, 50);

      const items = await Menu.getPopularItems(restaurantId, timeframe, limit);
      
      res.json({
        success: true,
        data: items,
        timeframe,
        limit
      });

    } catch (error) {
      console.error('Get popular items error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch popular items',
        error: error.message
      });
    }
  }

  // Get menu analytics
  static async getMenuAnalytics(req, res) {
    try {
      const { restaurantId } = req.params;
      const timeframe = req.query.timeframe || '7d';

      const analytics = await Menu.getMenuAnalytics(restaurantId, timeframe);
      
      res.json({
        success: true,
        data: analytics,
        timeframe
      });

    } catch (error) {
      console.error('Get menu analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch menu analytics',
        error: error.message
      });
    }
  }

  // Get low stock alerts
  static async getLowStockAlerts(req, res) {
    try {
      const { restaurantId } = req.params;
      const threshold = parseInt(req.query.threshold) || 5;

      const alerts = await Menu.getLowStockAlerts(restaurantId, threshold);
      
      res.json({
        success: true,
        data: alerts,
        threshold,
        alert_count: alerts.length
      });

    } catch (error) {
      console.error('Get low stock alerts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch low stock alerts',
        error: error.message
      });
    }
  }

  // Reset daily counters (typically called by cron job)
  static async resetDailyCounters(req, res) {
    try {
      const { restaurantId } = req.params;
      
      const result = await Menu.resetDailyCounters(restaurantId);
      
      res.json({
        success: true,
        message: 'Daily counters reset successfully',
        data: result
      });

    } catch (error) {
      console.error('Reset daily counters error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset daily counters',
        error: error.message
      });
    }
  }

  // Update popularity scores (typically called by cron job)
  static async updatePopularityScores(req, res) {
    try {
      const { restaurantId } = req.params;
      
      const results = await Menu.updatePopularityScores(restaurantId);
      
      res.json({
        success: true,
        message: 'Popularity scores updated successfully',
        data: results
      });

    } catch (error) {
      console.error('Update popularity scores error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update popularity scores',
        error: error.message
      });
    }
  }

  // Get restaurant dashboard data (for restaurant owners)
  static async getRestaurantDashboard(req, res) {
    try {
      const { restaurantId } = req.params;
      const timeframe = req.query.timeframe || '7d';

      // Get basic restaurant info
      const restaurant = await Restaurant.getById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant not found'
        });
      }

      // Get analytics data
      const [
        menuAnalytics,
        popularItems,
        lowStockAlerts
      ] = await Promise.all([
        Menu.getMenuAnalytics(restaurantId, timeframe),
        Menu.getPopularItems(restaurantId, timeframe, 5),
        Menu.getLowStockAlerts(restaurantId, 5)
      ]);

      // Calculate summary metrics
      const totalRevenue = menuAnalytics.reduce((sum, cat) => sum + parseInt(cat.total_revenue_cents), 0);
      const totalOrders = menuAnalytics.reduce((sum, cat) => sum + parseInt(cat.total_orders), 0);
      const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

      res.json({
        success: true,
        data: {
          restaurant: {
            id: restaurant.id,
            name: restaurant.name,
            is_open: restaurant.is_open,
            is_accepting_orders: restaurant.is_accepting_orders,
            average_rating: restaurant.avg_rating || restaurant.average_rating,
            total_reviews: restaurant.total_reviews
          },
          summary: {
            total_revenue_cents: totalRevenue,
            total_orders: totalOrders,
            average_order_value_cents: avgOrderValue,
            low_stock_alerts: lowStockAlerts.length
          },
          menu_analytics: menuAnalytics,
          popular_items: popularItems,
          low_stock_alerts: lowStockAlerts,
          timeframe
        }
      });

    } catch (error) {
      console.error('Get restaurant dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch restaurant dashboard data',
        error: error.message
      });
    }
  }
}

module.exports = CatalogController;