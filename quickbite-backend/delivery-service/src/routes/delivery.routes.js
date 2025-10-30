const express = require('express');
const router = express.Router();
const DeliveryController = require('../controllers/delivery.controller');
const auth = require('../middleware/auth.middleware');

// ==================== MODERN AI-POWERED DELIVERY ROUTES ====================

// Core delivery management with intelligent features
router.post('/create', auth, DeliveryController.createDelivery);
router.put('/:deliveryId/status', auth, DeliveryController.updateDeliveryStatus);
router.get('/:deliveryId/track', DeliveryController.getDeliveryTracking); // Public endpoint for tracking
router.post('/:deliveryId/optimize-route', auth, DeliveryController.optimizeRoute);

// Advanced delivery partner management
router.post('/partners/register', DeliveryController.registerPartner);
router.put('/partners/:partnerId/status', auth, DeliveryController.updatePartnerStatus);
router.get('/partners/:partnerId/analytics', auth, DeliveryController.getPartnerAnalytics);

// Intelligent batch delivery management
router.post('/batches/create', auth, DeliveryController.createDeliveryBatch);

// Delivery zone management and optimization
router.post('/zones/create', auth, DeliveryController.createDeliveryZone);

// Comprehensive analytics and business intelligence
router.get('/analytics/dashboard', auth, DeliveryController.getDeliveryAnalytics);

// ==================== LEGACY COMPATIBILITY ROUTES ====================

// Maintain backward compatibility with deprecated endpoints
router.post('/assign', auth, DeliveryController.assign);
router.patch('/:delivery_id/status', auth, DeliveryController.updateStatus);
router.patch('/:delivery_id/location', auth, DeliveryController.updateLocation);
router.get('/:delivery_id', auth, DeliveryController.getById);

// Debug/testing route: enhanced agent management
router.get('/debug/agents', DeliveryController.listAgents);

module.exports = router;
