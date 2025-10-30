const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/order.controller');
const auth = require('../middleware/auth.middleware');

// Core order management
router.post('/orders', auth, ctrl.create);
router.get('/orders/:id', auth, ctrl.getById);
router.get('/orders', auth, ctrl.getUserOrders);
router.patch('/orders/:id/status', auth, ctrl.updateStatus);

// Real-time tracking endpoints
router.get('/orders/:id/tracking', auth, ctrl.getOrderTracking);
router.get('/orders/:id/location', auth, ctrl.getDriverLocation);
router.post('/orders/:id/estimate', auth, ctrl.estimateDeliveryTime);

// Driver management
router.post('/orders/:id/assign-driver', auth, ctrl.assignDriver);
router.post('/orders/:id/driver-location', auth, ctrl.updateDriverLocation);

// Payment integration
router.post('/orders/:id/payment/confirm', auth, ctrl.confirmPayment);
router.post('/orders/:id/payment/failed', auth, ctrl.handlePaymentFailure);

// Restaurant integration
router.post('/orders/:id/restaurant/accept', auth, ctrl.restaurantAccept);
router.post('/orders/:id/restaurant/ready', auth, ctrl.markFoodReady);

// Delivery events
router.post('/orders/:id/delivery/pickup', auth, ctrl.markOrderPickedUp);
router.post('/orders/:id/delivery/complete', auth, ctrl.markOrderDelivered);
router.post('/orders/:id/delivery/issue', auth, ctrl.reportDeliveryIssue);

// Customer actions
router.post('/orders/:id/cancel', auth, ctrl.cancelOrder);
router.post('/orders/:id/rating', auth, ctrl.rateOrder);

module.exports = router;
