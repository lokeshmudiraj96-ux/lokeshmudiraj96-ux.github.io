const { UserPreferences, PREFERENCE_CATEGORIES } = require('../models/user.model');
const Joi = require('joi');

class PreferencesController {
  // Get all user preferences
  static async getPreferences(req, res) {
    try {
      const userId = req.user.id;
      const { category } = req.query;

      const preferences = await UserPreferences.getByUserId(userId, category);

      // Organize preferences by category
      const organizedPrefs = preferences.reduce((acc, pref) => {
        if (!acc[pref.category]) {
          acc[pref.category] = {};
        }
        acc[pref.category][pref.preference_key] = {
          value: pref.preference_value,
          strength: pref.preference_strength,
          source: pref.source,
          confidenceScore: pref.confidence_score,
          updatedAt: pref.updated_at
        };
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          preferences: organizedPrefs,
          availableCategories: Object.values(PREFERENCE_CATEGORIES)
        }
      });
    } catch (error) {
      console.error('Error getting preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update user preferences
  static async updatePreferences(req, res) {
    try {
      const userId = req.user.id;
      const { preferences } = req.body;

      // Validate input structure
      const schema = Joi.object({
        preferences: Joi.array().items(
          Joi.object({
            category: Joi.string().valid(...Object.values(PREFERENCE_CATEGORIES)).required(),
            preferenceKey: Joi.string().required(),
            preferenceValue: Joi.alternatives().try(
              Joi.string(),
              Joi.number(),
              Joi.boolean(),
              Joi.array(),
              Joi.object()
            ).required(),
            preferenceStrength: Joi.number().min(0).max(1).default(1),
            source: Joi.string().default('USER_INPUT')
          })
        ).required()
      });

      const { error } = schema.validate({ preferences });
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.details.map(detail => detail.message)
        });
      }

      // Update preferences
      const success = await UserPreferences.updatePreferences(userId, preferences);

      if (success) {
        // Get updated preferences to return
        const updatedPreferences = await UserPreferences.getByUserId(userId);

        res.json({
          success: true,
          message: 'Preferences updated successfully',
          data: updatedPreferences
        });
      } else {
        throw new Error('Failed to update preferences');
      }
    } catch (error) {
      console.error('Error updating preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Set dietary preferences
  static async setDietaryPreferences(req, res) {
    try {
      const userId = req.user.id;
      const {
        dietaryRestrictions = [],
        allergies = [],
        cuisinePreferences = [],
        spiceLevel = 'MEDIUM',
        sweetTooth = 0.5,
        healthGoals = []
      } = req.body;

      const dietaryPrefs = [
        {
          category: PREFERENCE_CATEGORIES.DIETARY,
          preferenceKey: 'restrictions',
          preferenceValue: dietaryRestrictions,
          source: 'USER_INPUT'
        },
        {
          category: PREFERENCE_CATEGORIES.DIETARY,
          preferenceKey: 'allergies',
          preferenceValue: allergies,
          source: 'USER_INPUT'
        },
        {
          category: PREFERENCE_CATEGORIES.FOOD,
          preferenceKey: 'cuisines',
          preferenceValue: cuisinePreferences,
          source: 'USER_INPUT'
        },
        {
          category: PREFERENCE_CATEGORIES.FOOD,
          preferenceKey: 'spice_level',
          preferenceValue: spiceLevel,
          source: 'USER_INPUT'
        },
        {
          category: PREFERENCE_CATEGORIES.FOOD,
          preferenceKey: 'sweet_tooth',
          preferenceValue: sweetTooth,
          source: 'USER_INPUT'
        },
        {
          category: PREFERENCE_CATEGORIES.HEALTH,
          preferenceKey: 'goals',
          preferenceValue: healthGoals,
          source: 'USER_INPUT'
        }
      ];

      await UserPreferences.updatePreferences(userId, dietaryPrefs);

      res.json({
        success: true,
        message: 'Dietary preferences updated successfully'
      });
    } catch (error) {
      console.error('Error setting dietary preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Set delivery preferences
  static async setDeliveryPreferences(req, res) {
    try {
      const userId = req.user.id;
      const {
        preferredTimeSlots = [],
        deliveryInstructions = '',
        contactlessDelivery = false,
        preferredDeliverySpeed = 'STANDARD',
        maxDeliveryRadius = 10, // km
        ecoFriendlyPackaging = true
      } = req.body;

      const deliveryPrefs = [
        {
          category: PREFERENCE_CATEGORIES.DELIVERY,
          preferenceKey: 'time_slots',
          preferenceValue: preferredTimeSlots,
          source: 'USER_INPUT'
        },
        {
          category: PREFERENCE_CATEGORIES.DELIVERY,
          preferenceKey: 'instructions',
          preferenceValue: deliveryInstructions,
          source: 'USER_INPUT'
        },
        {
          category: PREFERENCE_CATEGORIES.DELIVERY,
          preferenceKey: 'contactless',
          preferenceValue: contactlessDelivery,
          source: 'USER_INPUT'
        },
        {
          category: PREFERENCE_CATEGORIES.DELIVERY,
          preferenceKey: 'speed_preference',
          preferenceValue: preferredDeliverySpeed,
          source: 'USER_INPUT'
        },
        {
          category: PREFERENCE_CATEGORIES.DELIVERY,
          preferenceKey: 'max_radius',
          preferenceValue: maxDeliveryRadius,
          source: 'USER_INPUT'
        },
        {
          category: PREFERENCE_CATEGORIES.DELIVERY,
          preferenceKey: 'eco_packaging',
          preferenceValue: ecoFriendlyPackaging,
          source: 'USER_INPUT'
        }
      ];

      await UserPreferences.updatePreferences(userId, deliveryPrefs);

      res.json({
        success: true,
        message: 'Delivery preferences updated successfully'
      });
    } catch (error) {
      console.error('Error setting delivery preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Set notification preferences
  static async setNotificationPreferences(req, res) {
    try {
      const userId = req.user.id;
      const {
        orderUpdates = true,
        promotionalOffers = true,
        loyaltyUpdates = true,
        socialActivity = true,
        weeklyDigest = true,
        pushNotifications = true,
        emailNotifications = true,
        smsNotifications = false,
        marketingEmails = false
      } = req.body;

      const { pool } = require('../config/database');

      // Update notification preferences table
      const query = `
        INSERT INTO notification_preferences (
          id, user_id, order_updates, promotional_offers, loyalty_updates,
          social_activity, weekly_digest, push_notifications, email_notifications,
          sms_notifications, marketing_emails
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
          order_updates = EXCLUDED.order_updates,
          promotional_offers = EXCLUDED.promotional_offers,
          loyalty_updates = EXCLUDED.loyalty_updates,
          social_activity = EXCLUDED.social_activity,
          weekly_digest = EXCLUDED.weekly_digest,
          push_notifications = EXCLUDED.push_notifications,
          email_notifications = EXCLUDED.email_notifications,
          sms_notifications = EXCLUDED.sms_notifications,
          marketing_emails = EXCLUDED.marketing_emails,
          updated_at = CURRENT_TIMESTAMP
      `;

      const { v4: uuidv4 } = require('uuid');
      await pool.query(query, [
        uuidv4(), userId, orderUpdates, promotionalOffers, loyaltyUpdates,
        socialActivity, weeklyDigest, pushNotifications, emailNotifications,
        smsNotifications, marketingEmails
      ]);

      res.json({
        success: true,
        message: 'Notification preferences updated successfully'
      });
    } catch (error) {
      console.error('Error setting notification preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get personalized recommendations based on preferences
  static async getPersonalizedRecommendations(req, res) {
    try {
      const userId = req.user.id;
      const { type = 'restaurants', limit = 10 } = req.query;

      // Get user preferences
      const preferences = await UserPreferences.getByUserId(userId);
      
      // Group preferences by category for easier processing
      const prefsByCategory = preferences.reduce((acc, pref) => {
        if (!acc[pref.category]) acc[pref.category] = {};
        acc[pref.category][pref.preference_key] = pref.preference_value;
        return acc;
      }, {});

      let recommendations = [];

      if (type === 'restaurants') {
        recommendations = await PreferencesController.getRestaurantRecommendations(
          userId, prefsByCategory, limit
        );
      } else if (type === 'dishes') {
        recommendations = await PreferencesController.getDishRecommendations(
          userId, prefsByCategory, limit
        );
      } else if (type === 'offers') {
        recommendations = await PreferencesController.getOfferRecommendations(
          userId, prefsByCategory, limit
        );
      }

      res.json({
        success: true,
        data: {
          type,
          recommendations,
          basedOnPreferences: Object.keys(prefsByCategory)
        }
      });
    } catch (error) {
      console.error('Error getting personalized recommendations:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Learn from user behavior (called when user makes orders, rates, etc.)
  static async learnFromBehavior(req, res) {
    try {
      const userId = req.user.id;
      const {
        orderId,
        rating,
        cuisineType,
        dishCategories = [],
        restaurantId,
        orderTime,
        spiceLevel,
        price,
        deliveryTime
      } = req.body;

      // Infer preferences from behavior
      const learntPreferences = [];

      // Cuisine preference learning
      if (cuisineType && rating >= 4) {
        learntPreferences.push({
          category: PREFERENCE_CATEGORIES.FOOD,
          preferenceKey: 'preferred_cuisines',
          preferenceValue: cuisineType,
          preferenceStrength: rating / 5,
          source: 'BEHAVIOR_LEARNING'
        });
      }

      // Time preference learning
      if (orderTime) {
        const hour = new Date(orderTime).getHours();
        let timeSlot = 'LUNCH';
        if (hour < 11) timeSlot = 'BREAKFAST';
        else if (hour > 15 && hour < 19) timeSlot = 'SNACKS';
        else if (hour >= 19) timeSlot = 'DINNER';

        learntPreferences.push({
          category: PREFERENCE_CATEGORIES.ORDERING,
          preferenceKey: 'preferred_time_slot',
          preferenceValue: timeSlot,
          preferenceStrength: 0.7,
          source: 'BEHAVIOR_LEARNING'
        });
      }

      // Price preference learning
      if (price) {
        let priceRange = 'BUDGET';
        if (price > 50000) priceRange = 'PREMIUM'; // >₹500
        else if (price > 25000) priceRange = 'MODERATE'; // >₹250

        learntPreferences.push({
          category: PREFERENCE_CATEGORIES.ORDERING,
          preferenceKey: 'price_range',
          preferenceValue: priceRange,
          preferenceStrength: 0.6,
          source: 'BEHAVIOR_LEARNING'
        });
      }

      // Save learnt preferences
      if (learntPreferences.length > 0) {
        await UserPreferences.updatePreferences(userId, learntPreferences);
      }

      res.json({
        success: true,
        message: 'Preferences updated from behavior',
        data: {
          learntPreferences: learntPreferences.length
        }
      });
    } catch (error) {
      console.error('Error learning from behavior:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Helper method for restaurant recommendations
  static async getRestaurantRecommendations(userId, preferences, limit) {
    try {
      const { pool } = require('../config/database');
      
      // Mock implementation - in real scenario, use recommendation engine
      const query = `
        SELECT 
          r.id,
          r.name,
          r.cuisine_type,
          r.average_rating,
          r.delivery_time_minutes,
          r.delivery_fee_cents,
          'Matches your preferences' as reason
        FROM restaurants r
        WHERE r.is_active = true
        ORDER BY r.average_rating DESC
        LIMIT $1
      `;

      const result = await pool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      console.error('Error getting restaurant recommendations:', error);
      return [];
    }
  }

  // Helper method for dish recommendations
  static async getDishRecommendations(userId, preferences, limit) {
    try {
      // Mock implementation
      return [
        {
          id: 'dish_1',
          name: 'Recommended based on your taste',
          reason: 'Similar to your recent orders'
        }
      ];
    } catch (error) {
      console.error('Error getting dish recommendations:', error);
      return [];
    }
  }

  // Helper method for offer recommendations
  static async getOfferRecommendations(userId, preferences, limit) {
    try {
      // Mock implementation
      return [
        {
          id: 'offer_1',
          title: 'Special offer for you',
          description: 'Based on your ordering patterns',
          discountPercent: 20
        }
      ];
    } catch (error) {
      console.error('Error getting offer recommendations:', error);
      return [];
    }
  }

  // Reset preferences (clear all or by category)
  static async resetPreferences(req, res) {
    try {
      const userId = req.user.id;
      const { category } = req.body;

      const { pool } = require('../config/database');
      
      let query, params;
      if (category) {
        query = 'DELETE FROM user_preferences WHERE user_id = $1 AND category = $2';
        params = [userId, category];
      } else {
        query = 'DELETE FROM user_preferences WHERE user_id = $1';
        params = [userId];
      }

      await pool.query(query, params);

      res.json({
        success: true,
        message: `Preferences ${category ? `in category ${category}` : ''} reset successfully`
      });
    } catch (error) {
      console.error('Error resetting preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Export preferences (for data portability)
  static async exportPreferences(req, res) {
    try {
      const userId = req.user.id;
      const preferences = await UserPreferences.getByUserId(userId);

      res.json({
        success: true,
        data: {
          userId,
          exportedAt: new Date().toISOString(),
          preferences
        }
      });
    } catch (error) {
      console.error('Error exporting preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = PreferencesController;