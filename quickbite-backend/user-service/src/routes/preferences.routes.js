const express = require('express');
const router = express.Router();
const PreferencesController = require('../controllers/preferences.controller');
const { authenticateToken, validateRequest } = require('../middleware');
const Joi = require('joi');
const { PREFERENCE_CATEGORIES } = require('../models/user.model');

// Validation schemas
const updatePreferencesSchema = Joi.object({
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

const dietaryPreferencesSchema = Joi.object({
  dietaryRestrictions: Joi.array().items(Joi.string()).default([]),
  allergies: Joi.array().items(Joi.string()).default([]),
  cuisinePreferences: Joi.array().items(Joi.string()).default([]),
  spiceLevel: Joi.string().valid('NONE', 'LOW', 'MEDIUM', 'HIGH', 'EXTRA_HIGH').default('MEDIUM'),
  sweetTooth: Joi.number().min(0).max(1).default(0.5),
  healthGoals: Joi.array().items(Joi.string()).default([])
});

const deliveryPreferencesSchema = Joi.object({
  preferredTimeSlots: Joi.array().items(Joi.string()).default([]),
  deliveryInstructions: Joi.string().allow('').max(500),
  contactlessDelivery: Joi.boolean().default(false),
  preferredDeliverySpeed: Joi.string().valid('EXPRESS', 'STANDARD', 'SCHEDULED').default('STANDARD'),
  maxDeliveryRadius: Joi.number().min(1).max(50).default(10),
  ecoFriendlyPackaging: Joi.boolean().default(true)
});

const notificationPreferencesSchema = Joi.object({
  orderUpdates: Joi.boolean().default(true),
  promotionalOffers: Joi.boolean().default(true),
  loyaltyUpdates: Joi.boolean().default(true),
  socialActivity: Joi.boolean().default(true),
  weeklyDigest: Joi.boolean().default(true),
  pushNotifications: Joi.boolean().default(true),
  emailNotifications: Joi.boolean().default(true),
  smsNotifications: Joi.boolean().default(false),
  marketingEmails: Joi.boolean().default(false)
});

const learnBehaviorSchema = Joi.object({
  orderId: Joi.string().required(),
  rating: Joi.number().min(1).max(5).required(),
  cuisineType: Joi.string(),
  dishCategories: Joi.array().items(Joi.string()).default([]),
  restaurantId: Joi.string(),
  orderTime: Joi.date(),
  spiceLevel: Joi.string(),
  price: Joi.number(),
  deliveryTime: Joi.number()
});

const resetPreferencesSchema = Joi.object({
  category: Joi.string().valid(...Object.values(PREFERENCE_CATEGORIES)).optional()
});

// Routes

// GET /api/preferences - Get all user preferences
router.get('/', 
  authenticateToken,
  PreferencesController.getPreferences
);

// PUT /api/preferences - Update user preferences
router.put('/', 
  authenticateToken,
  validateRequest(updatePreferencesSchema),
  PreferencesController.updatePreferences
);

// PUT /api/preferences/dietary - Set dietary preferences
router.put('/dietary', 
  authenticateToken,
  validateRequest(dietaryPreferencesSchema),
  PreferencesController.setDietaryPreferences
);

// PUT /api/preferences/delivery - Set delivery preferences
router.put('/delivery', 
  authenticateToken,
  validateRequest(deliveryPreferencesSchema),
  PreferencesController.setDeliveryPreferences
);

// PUT /api/preferences/notifications - Set notification preferences
router.put('/notifications', 
  authenticateToken,
  validateRequest(notificationPreferencesSchema),
  PreferencesController.setNotificationPreferences
);

// GET /api/preferences/recommendations - Get personalized recommendations
router.get('/recommendations', 
  authenticateToken,
  PreferencesController.getPersonalizedRecommendations
);

// POST /api/preferences/learn - Learn from user behavior
router.post('/learn', 
  authenticateToken,
  validateRequest(learnBehaviorSchema),
  PreferencesController.learnFromBehavior
);

// POST /api/preferences/reset - Reset preferences
router.post('/reset', 
  authenticateToken,
  validateRequest(resetPreferencesSchema),
  PreferencesController.resetPreferences
);

// GET /api/preferences/export - Export preferences (data portability)
router.get('/export', 
  authenticateToken,
  PreferencesController.exportPreferences
);

module.exports = router;