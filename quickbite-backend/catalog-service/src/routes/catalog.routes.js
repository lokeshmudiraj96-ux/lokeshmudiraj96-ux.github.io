const express = require('express');
const CatalogController = require('../controllers/catalog.controller');

const router = express.Router();

// System routes
router.post('/init', CatalogController.initialize);

// Restaurant management routes
router.post('/restaurants', CatalogController.createRestaurant);
router.get('/restaurants/search', CatalogController.searchRestaurants);
router.get('/restaurants/:id', CatalogController.getRestaurant);
router.patch('/restaurants/:id/operating-status', CatalogController.updateOperatingStatus);
router.get('/restaurants/:restaurantId/dashboard', CatalogController.getRestaurantDashboard);

// Menu management routes
router.get('/restaurants/:id/menu', CatalogController.getRestaurantMenu);
router.post('/restaurants/:restaurantId/menu/categories', CatalogController.createMenuCategory);
router.post('/restaurants/:restaurantId/menu/items', CatalogController.createMenuItem);
router.patch('/restaurants/:restaurantId/menu/availability', CatalogController.bulkUpdateAvailability);

// Dynamic pricing routes
router.get('/menu-items/:itemId/pricing', CatalogController.getItemPricing);
router.post('/pricing-rules', CatalogController.createPricingRule);

// Inventory management routes
router.patch('/menu-items/:itemId/inventory', CatalogController.updateInventory);
router.get('/restaurants/:restaurantId/low-stock-alerts', CatalogController.getLowStockAlerts);

// Analytics routes
router.get('/restaurants/:restaurantId/popular-items', CatalogController.getPopularItems);
router.get('/restaurants/:restaurantId/menu-analytics', CatalogController.getMenuAnalytics);

// System maintenance routes (typically for cron jobs)
router.post('/restaurants/:restaurantId/reset-daily-counters', CatalogController.resetDailyCounters);
router.post('/restaurants/:restaurantId/update-popularity-scores', CatalogController.updatePopularityScores);

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    service: 'catalog-service', 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;