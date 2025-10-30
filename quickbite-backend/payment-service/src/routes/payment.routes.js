const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/payment.controller');
const auth = require('../middleware/auth.middleware');
const rateLimit = require('express-rate-limit');

// Rate limiting for payment operations
const paymentRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 payment requests per windowMs
  message: {
    success: false,
    message: 'Too many payment requests, please try again later'
  }
});

const refundRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 refund requests per hour
  message: {
    success: false,
    message: 'Too many refund requests, please try again later'
  }
});

// Payment operations
router.post('/initiate', paymentRateLimit, auth, PaymentController.initiatePayment);
router.get('/status/:payment_id', auth, PaymentController.getPaymentStatus);
router.post('/retry/:payment_id', auth, PaymentController.retryPayment);

// Refund operations
router.post('/refund', refundRateLimit, auth, PaymentController.processRefund);

// Saved payment methods
router.get('/users/:user_id/saved-methods', auth, PaymentController.getSavedPaymentMethods);

// Analytics (admin/restaurant access)
router.get('/analytics', auth, PaymentController.getPaymentAnalytics);

// Webhook endpoints (no auth required but signature verification)
router.post('/webhook/:gateway', express.raw({ type: 'application/json' }), PaymentController.handleWebhook);

// Gateway-specific callback endpoints
router.post('/callback/razorpay', PaymentController.handleWebhook);
router.post('/callback/paytm', PaymentController.handleWebhook);
router.post('/callback/phonepe', PaymentController.handleWebhook);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'payment-service',
    version: '2.0.0',
    features: [
      'multi_gateway_support',
      'fraud_detection',
      'dynamic_routing',
      'advanced_analytics',
      'saved_payment_methods',
      'bnpl_integration',
      'real_time_webhooks'
    ],
    gateways: ['RAZORPAY', 'PAYTM', 'PHONEPE'],
    payment_methods: ['UPI', 'CARD', 'WALLET', 'NETBANKING', 'BNPL', 'COD'],
    timestamp: new Date().toISOString()
  });
});

// Legacy routes for backward compatibility
router.post('/pay', paymentRateLimit, auth, PaymentController.initiatePayment);
router.get('/status/:payment_id', auth, PaymentController.getPaymentStatus);

module.exports = router;
