const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { 
  Payment, 
  Refund, 
  SavedPaymentMethod, 
  FraudDetection, 
  PaymentAnalytics 
} = require('../models/payment.model');
const {
  RazorpayGateway,
  PaytmGateway,
  PhonePeGateway,
  GatewayManager
} = require('../models/gateway.model');

// Initialize gateway manager
const gatewayManager = new GatewayManager();

// Register gateways (would be loaded from database in production)
if (process.env.RAZORPAY_KEY_ID) {
  gatewayManager.registerGateway('RAZORPAY', new RazorpayGateway({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
    webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET
  }));
}

if (process.env.PAYTM_MERCHANT_ID) {
  gatewayManager.registerGateway('PAYTM', new PaytmGateway({
    merchant_id: process.env.PAYTM_MERCHANT_ID,
    merchant_key: process.env.PAYTM_MERCHANT_KEY
  }));
}

if (process.env.PHONEPE_MERCHANT_ID) {
  gatewayManager.registerGateway('PHONEPE', new PhonePeGateway({
    merchant_id: process.env.PHONEPE_MERCHANT_ID,
    salt_key: process.env.PHONEPE_SALT_KEY,
    salt_index: process.env.PHONEPE_SALT_INDEX
  }));
}

// Enhanced validation schemas
const initiatePaymentSchema = Joi.object({
  order_id: Joi.string().guid({ version: 'uuidv4' }).required(),
  user_id: Joi.string().guid({ version: 'uuidv4' }).required(),
  restaurant_id: Joi.string().guid({ version: 'uuidv4' }).optional(),
  method: Joi.string().valid('UPI', 'CARD', 'WALLET', 'BNPL', 'COD', 'NETBANKING').required(),
  provider: Joi.string().valid('RAZORPAY', 'PAYTM', 'PHONEPE', 'CASHFREE').optional(),
  amount_cents: Joi.number().integer().min(100).required(), // Min ₹1
  
  // Breakdown
  tax_amount_cents: Joi.number().integer().min(0).default(0),
  delivery_fee_cents: Joi.number().integer().min(0).default(0),
  platform_fee_cents: Joi.number().integer().min(0).default(0),
  discount_amount_cents: Joi.number().integer().min(0).default(0),
  
  // Payment method specific data
  card_details: Joi.object({
    save_card: Joi.boolean().default(false),
    saved_card_id: Joi.string().guid().optional()
  }).when('method', { is: 'CARD', then: Joi.optional() }),
  
  upi_details: Joi.object({
    vpa: Joi.string().optional(),
    save_vpa: Joi.boolean().default(false)
  }).when('method', { is: 'UPI', then: Joi.optional() }),
  
  wallet_details: Joi.object({
    wallet_provider: Joi.string().valid('PAYTM', 'PHONEPE', 'MOBIKWIK', 'FREECHARGE').optional()
  }).when('method', { is: 'WALLET', then: Joi.optional() }),
  
  bnpl_details: Joi.object({
    provider: Joi.string().valid('SIMPL', 'LAZYPAY', 'POSTPE').required(),
    tenure: Joi.number().integer().valid(0, 15, 30).default(15) // days
  }).when('method', { is: 'BNPL', then: Joi.required() }),
  
  // Device and risk data
  device_info: Joi.object({
    ip_address: Joi.string().ip().optional(),
    user_agent: Joi.string().optional(),
    device_fingerprint: Joi.string().optional()
  }).default({}),
  
  // Callback URLs
  success_url: Joi.string().uri().optional(),
  failure_url: Joi.string().uri().optional()
});

const refundSchema = Joi.object({
  payment_id: Joi.string().guid({ version: 'uuidv4' }).required(),
  refund_type: Joi.string().valid('FULL', 'PARTIAL', 'CANCELLATION', 'DISPUTE').required(),
  amount_cents: Joi.number().integer().min(100).required(),
  reason: Joi.string().max(500).required(),
  initiated_by: Joi.string().valid('CUSTOMER', 'RESTAURANT', 'ADMIN', 'SYSTEM').required(),
  notes: Joi.string().max(1000).optional()
});

// Utility functions
async function fetchOrderDetails(orderId) {
  try {
    // In production, this would call the order service
    // For now, we'll return mock data or skip validation
    return {
      order_id: orderId,
      total_amount_cents: 50000, // Mock ₹500
      status: 'CONFIRMED',
      user_id: uuidv4(),
      restaurant_id: uuidv4()
    };
  } catch (error) {
    throw new Error('Failed to fetch order details');
  }
}

class PaymentController {

  // Initialize payment with advanced fraud detection and gateway routing
  static async initiatePayment(req, res) {
    try {
      const { error, value } = initiatePaymentSchema.validate(req.body, { abortEarly: false });
      if (error) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid request', 
          errors: error.details.map(d => d.message)
        });
      }

      const paymentData = value;
      
      // Validate order exists (mock for now)
      const order = await fetchOrderDetails(paymentData.order_id);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      // Check for existing payment
      const existingPayment = await Payment.findByOrderId(paymentData.order_id);
      if (existingPayment && existingPayment.status !== 'FAILED') {
        return res.status(200).json({
          success: true,
          payment_id: existingPayment.id,
          status: existingPayment.status,
          message: 'Payment already exists for this order'
        });
      }

      // Fraud detection
      const riskAssessment = await FraudDetection.calculateRiskScore(paymentData);
      paymentData.risk_score = riskAssessment.risk_score;
      paymentData.fraud_flags = riskAssessment.fraud_flags;
      paymentData.is_flagged = riskAssessment.is_flagged;

      // Block high-risk payments
      if (riskAssessment.is_flagged) {
        return res.status(403).json({
          success: false,
          message: 'Payment blocked due to risk assessment',
          risk_flags: riskAssessment.fraud_flags
        });
      }

      // Route to appropriate gateway
      const { gateway, gateway_name } = await gatewayManager.routePayment(paymentData);
      paymentData.provider = gateway_name;

      // Create payment record
      const payment = await Payment.create(paymentData);

      // Process payment based on method
      let gatewayResponse;
      
      if (paymentData.method === 'COD') {
        // Cash on Delivery - mark as pending
        gatewayResponse = {
          success: true,
          payment_id: payment.id,
          status: 'PENDING',
          message: 'Cash on Delivery payment created'
        };
      } else {
        // Process through gateway
        gatewayResponse = await this.processGatewayPayment(gateway, payment, paymentData);
      }

      // Update payment with gateway response
      if (gatewayResponse.success) {
        await Payment.updateStatus(payment.id, {
          status: gatewayResponse.status || 'PROCESSING',
          gateway_transaction_id: gatewayResponse.gateway_transaction_id,
          gateway_order_id: gatewayResponse.gateway_order_id,
          provider: gateway_name
        });
      }

      // Update analytics
      PaymentAnalytics.updateDailyAnalytics({
        method: paymentData.method,
        provider: gateway_name,
        restaurant_id: paymentData.restaurant_id,
        amount_cents: paymentData.amount_cents,
        status: gatewayResponse.success ? 'SUCCESS' : 'FAILED'
      }).catch(console.error);

      return res.status(201).json({
        success: true,
        payment_id: payment.id,
        gateway_response: gatewayResponse,
        risk_score: riskAssessment.risk_score,
        fees: Payment.calculateFees(paymentData.amount_cents, paymentData.method, gateway_name)
      });

    } catch (error) {
      console.error('Payment initiation failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Process payment through gateway
  static async processGatewayPayment(gateway, payment, paymentData) {
    try {
      switch (paymentData.method) {
        case 'UPI':
        case 'CARD':
        case 'WALLET':
        case 'NETBANKING':
          // Create gateway order
          const orderResponse = await gateway.createOrder({
            amount_cents: paymentData.amount_cents,
            currency: 'INR',
            receipt: payment.id,
            notes: {
              order_id: paymentData.order_id,
              user_id: paymentData.user_id,
              restaurant_id: paymentData.restaurant_id
            }
          });

          if (orderResponse.success) {
            return {
              success: true,
              gateway_order_id: orderResponse.order_id,
              status: 'PROCESSING',
              payment_url: orderResponse.payment_url,
              message: 'Gateway order created successfully'
            };
          } else {
            return {
              success: false,
              error: orderResponse.error,
              status: 'FAILED'
            };
          }

        case 'BNPL':
          // BNPL processing would involve partner API integration
          return {
            success: true,
            status: 'PROCESSING',
            message: 'BNPL payment initiated',
            approval_url: `${process.env.BASE_URL}/bnpl/approve/${payment.id}`
          };

        default:
          return {
            success: false,
            error: 'Unsupported payment method',
            status: 'FAILED'
          };
      }
    } catch (error) {
      console.error('Gateway processing error:', error);
      return {
        success: false,
        error: error.message,
        status: 'FAILED'
      };
    }
  }

  // Get payment status with detailed information
  static async getPaymentStatus(req, res) {
    try {
      const { payment_id } = req.params;
      
      const payment = await Payment.findById(payment_id);
      if (!payment) {
        return res.status(404).json({ 
          success: false, 
          message: 'Payment not found' 
        });
      }

      // Get refunds if any
      const refunds = await Refund.findByPaymentId(payment_id);
      
      // Calculate refundable amount
      const totalRefunded = refunds
        .filter(r => r.status === 'SUCCESS')
        .reduce((sum, r) => sum + r.amount_cents, 0);
      
      const refundableAmount = payment.amount_cents - totalRefunded;

      return res.json({
        success: true,
        data: {
          payment_id: payment.id,
          order_id: payment.order_id,
          status: payment.status,
          method: payment.method,
          provider: payment.provider,
          amount_cents: payment.amount_cents,
          created_at: payment.created_at,
          completed_at: payment.completed_at,
          
          // Breakdown
          tax_amount_cents: payment.tax_amount_cents,
          delivery_fee_cents: payment.delivery_fee_cents,
          platform_fee_cents: payment.platform_fee_cents,
          discount_amount_cents: payment.discount_amount_cents,
          
          // Risk assessment
          risk_score: payment.risk_score,
          is_flagged: payment.is_flagged,
          
          // Refund information
          refunds: refunds,
          total_refunded_cents: totalRefunded,
          refundable_amount_cents: refundableAmount,
          
          // Retry information
          retry_count: payment.retry_count,
          max_retries: payment.max_retries,
          can_retry: payment.retry_count < payment.max_retries && payment.status === 'FAILED'
        }
      });

    } catch (error) {
      console.error('Get payment status failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Process refund with gateway integration
  static async processRefund(req, res) {
    try {
      const { error, value } = refundSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid request',
          errors: error.details.map(d => d.message)
        });
      }

      const { payment_id, refund_type, amount_cents, reason, initiated_by, notes } = value;
      
      // Get payment details
      const payment = await Payment.findById(payment_id);
      if (!payment) {
        return res.status(404).json({ 
          success: false, 
          message: 'Payment not found' 
        });
      }

      // Validate payment status
      if (payment.status !== 'SUCCESS') {
        return res.status(400).json({
          success: false,
          message: 'Only successful payments can be refunded'
        });
      }

      // Check refund amount
      const existingRefunds = await Refund.findByPaymentId(payment_id);
      const totalRefunded = existingRefunds
        .filter(r => r.status === 'SUCCESS')
        .reduce((sum, r) => sum + r.amount_cents, 0);
      
      const availableAmount = payment.amount_cents - totalRefunded;
      
      if (amount_cents > availableAmount) {
        return res.status(400).json({
          success: false,
          message: `Refund amount exceeds available amount. Available: ₹${availableAmount / 100}`
        });
      }

      // Create refund record
      const refund = await Refund.create({
        payment_id,
        order_id: payment.order_id,
        refund_type,
        amount_cents,
        reason,
        initiated_by,
        notes
      });

      // Process refund through gateway
      let gatewayResponse = { success: true, status: 'PROCESSING' };
      
      if (payment.method !== 'COD' && payment.gateway_payment_id) {
        const gateway = gatewayManager.getGateway(payment.provider);
        if (gateway) {
          gatewayResponse = await gateway.createRefund(payment.gateway_payment_id, {
            amount_cents,
            notes: { refund_id: refund.id, reason }
          });
        }
      }

      // Update refund status
      const refundStatus = gatewayResponse.success ? 'PROCESSING' : 'FAILED';
      await Refund.updateStatus(
        refund.id, 
        refundStatus, 
        gatewayResponse.refund_id,
        gatewayResponse.success ? new Date() : null
      );

      return res.status(201).json({
        success: true,
        refund_id: refund.id,
        status: refundStatus,
        amount_cents,
        estimated_processing_time: '3-5 business days',
        gateway_response: gatewayResponse
      });

    } catch (error) {
      console.error('Refund processing failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Retry failed payment
  static async retryPayment(req, res) {
    try {
      const { payment_id } = req.params;
      
      const payment = await Payment.findById(payment_id);
      if (!payment) {
        return res.status(404).json({ 
          success: false, 
          message: 'Payment not found' 
        });
      }

      if (payment.status !== 'FAILED') {
        return res.status(400).json({
          success: false,
          message: 'Only failed payments can be retried'
        });
      }

      if (payment.retry_count >= payment.max_retries) {
        return res.status(400).json({
          success: false,
          message: 'Maximum retry attempts exceeded'
        });
      }

      // Retry payment
      const retriedPayment = await Payment.retry(payment_id);
      
      // Process through gateway again
      const gateway = gatewayManager.getGateway(payment.provider);
      if (gateway) {
        const gatewayResponse = await this.processGatewayPayment(gateway, retriedPayment, {
          method: payment.method,
          amount_cents: payment.amount_cents,
          order_id: payment.order_id,
          user_id: payment.user_id
        });

        await Payment.updateStatus(payment_id, {
          status: gatewayResponse.success ? 'PROCESSING' : 'FAILED',
          gateway_transaction_id: gatewayResponse.gateway_transaction_id
        });
      }

      return res.json({
        success: true,
        message: 'Payment retry initiated',
        retry_count: retriedPayment.retry_count,
        status: retriedPayment.status
      });

    } catch (error) {
      console.error('Payment retry failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get saved payment methods for user
  static async getSavedPaymentMethods(req, res) {
    try {
      const { user_id } = req.params;
      
      const savedMethods = await SavedPaymentMethod.findByUserId(user_id);
      
      return res.json({
        success: true,
        data: savedMethods.map(method => ({
          id: method.id,
          method_type: method.method_type,
          provider: method.provider,
          display_info: method.display_info,
          nickname: method.nickname,
          is_default: method.is_default,
          last_used_at: method.last_used_at,
          created_at: method.created_at
        }))
      });

    } catch (error) {
      console.error('Get saved payment methods failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get payment analytics
  static async getPaymentAnalytics(req, res) {
    try {
      const filters = {
        start_date: req.query.start_date,
        end_date: req.query.end_date,
        restaurant_id: req.query.restaurant_id,
        payment_method: req.query.payment_method,
        gateway_name: req.query.gateway_name
      };

      const analytics = await PaymentAnalytics.getAnalytics(filters);
      
      // Calculate summary metrics
      const summary = analytics.reduce((acc, row) => {
        acc.total_transactions += parseInt(row.total_transactions);
        acc.successful_transactions += parseInt(row.successful_transactions);
        acc.failed_transactions += parseInt(row.failed_transactions);
        acc.total_amount_cents += parseInt(row.total_amount_cents);
        return acc;
      }, {
        total_transactions: 0,
        successful_transactions: 0,
        failed_transactions: 0,
        total_amount_cents: 0
      });

      summary.success_rate = summary.total_transactions > 0 
        ? (summary.successful_transactions / summary.total_transactions * 100).toFixed(2)
        : 0;
      
      summary.average_transaction_value = summary.successful_transactions > 0
        ? Math.round(summary.total_amount_cents / summary.successful_transactions)
        : 0;

      return res.json({
        success: true,
        summary,
        analytics,
        filters
      });

    } catch (error) {
      console.error('Get payment analytics failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Handle webhook from payment gateway
  static async handleWebhook(req, res) {
    try {
      const gatewayName = req.params.gateway.toUpperCase();
      const gateway = gatewayManager.getGateway(gatewayName);
      
      if (!gateway) {
        return res.status(404).json({
          success: false,
          message: 'Gateway not found'
        });
      }

      // Verify webhook signature
      const signature = req.headers['x-razorpay-signature'] || req.headers['x-verify'];
      const isValid = gateway.verifyWebhookSignature(JSON.stringify(req.body), signature);
      
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid webhook signature'
        });
      }

      // Parse webhook event
      const event = gateway.parseWebhookEvent(JSON.stringify(req.body));
      
      // Process event
      await this.processWebhookEvent(event);
      
      return res.json({ success: true, message: 'Webhook processed' });

    } catch (error) {
      console.error('Webhook processing failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Webhook processing failed'
      });
    }
  }

  // Process webhook events
  static async processWebhookEvent(event) {
    try {
      switch (event.type) {
        case 'PAYMENT_SUCCESS':
          await Payment.updateStatus(event.payment_id, {
            status: 'SUCCESS',
            gateway_payment_id: event.payment_id,
            completed_at: new Date()
          });
          break;

        case 'PAYMENT_FAILED':
          await Payment.updateStatus(event.payment_id, {
            status: 'FAILED',
            failure_reason: event.error_reason
          });
          break;

        case 'REFUND_SUCCESS':
          // Find refund by gateway refund ID and update status
          // This would require additional lookup logic
          break;

        default:
          console.log('Unhandled webhook event type:', event.type);
      }
    } catch (error) {
      console.error('Webhook event processing failed:', error);
    }
  }
}

module.exports = PaymentController;
