const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function ensureSchema() {
  const sql = `
    -- Enhanced payments table with multi-gateway support
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY,
      order_id UUID NOT NULL,
      user_id UUID NOT NULL,
      restaurant_id UUID,
      
      -- Payment details
      method TEXT NOT NULL, -- 'UPI', 'CARD', 'WALLET', 'BNPL', 'COD'
      provider TEXT NOT NULL, -- 'RAZORPAY', 'PAYTM', 'PHONEPE', 'CASHFREE', 'INTERNAL'
      amount_cents INTEGER NOT NULL,
      tax_amount_cents INTEGER DEFAULT 0,
      delivery_fee_cents INTEGER DEFAULT 0,
      platform_fee_cents INTEGER DEFAULT 0,
      discount_amount_cents INTEGER DEFAULT 0,
      
      -- Payment status and tracking
      status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, SUCCESS, FAILED, REFUNDED, PARTIAL_REFUNDED
      gateway_transaction_id TEXT,
      gateway_order_id TEXT,
      gateway_payment_id TEXT,
      
      -- Payment method specific details
      card_details JSONB, -- {last4, brand, network, issuer}
      upi_details JSONB, -- {vpa, provider, bank}
      wallet_details JSONB, -- {provider, wallet_id, balance_used}
      bnpl_details JSONB, -- {provider, tenure, emi_amount, interest_rate}
      
      -- Risk and fraud detection
      risk_score DECIMAL(3,2) DEFAULT 0.00,
      fraud_flags JSONB, -- Array of fraud indicators
      is_flagged BOOLEAN DEFAULT false,
      
      -- Retry and failure handling
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      failure_reason TEXT,
      last_retry_at TIMESTAMP,
      
      -- Timestamps
      initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      -- Constraints
      UNIQUE(order_id),
      CHECK (amount_cents > 0),
      CHECK (risk_score >= 0 AND risk_score <= 1)
    );

    -- Enhanced refunds table
    CREATE TABLE IF NOT EXISTS refunds (
      id UUID PRIMARY KEY,
      payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      order_id UUID NOT NULL,
      
      -- Refund details
      refund_type TEXT NOT NULL, -- 'FULL', 'PARTIAL', 'CANCELLATION', 'DISPUTE'
      amount_cents INTEGER NOT NULL,
      reason TEXT NOT NULL,
      initiated_by TEXT NOT NULL, -- 'CUSTOMER', 'RESTAURANT', 'ADMIN', 'SYSTEM'
      
      -- Gateway details
      gateway_refund_id TEXT,
      gateway_transaction_id TEXT,
      
      -- Status tracking
      status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, SUCCESS, FAILED
      processed_at TIMESTAMP,
      
      -- Metadata
      notes TEXT,
      metadata JSONB,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      CHECK (amount_cents > 0)
    );

    -- Payment methods and saved instruments
    CREATE TABLE IF NOT EXISTS saved_payment_methods (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      
      -- Method details
      method_type TEXT NOT NULL, -- 'CARD', 'UPI', 'WALLET'
      provider TEXT NOT NULL,
      
      -- Encrypted/tokenized details
      token TEXT NOT NULL, -- Gateway token
      display_info JSONB NOT NULL, -- {last4, brand, expiry} for cards, {vpa} for UPI
      
      -- Preferences
      is_default BOOLEAN DEFAULT false,
      nickname TEXT,
      
      -- Status
      is_active BOOLEAN DEFAULT true,
      is_verified BOOLEAN DEFAULT false,
      verified_at TIMESTAMP,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used_at TIMESTAMP
    );

    -- Payment gateway configurations
    CREATE TABLE IF NOT EXISTS payment_gateways (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL UNIQUE, -- 'RAZORPAY', 'PAYTM', 'PHONEPE'
      display_name TEXT NOT NULL,
      
      -- Configuration
      is_active BOOLEAN DEFAULT true,
      priority INTEGER DEFAULT 1, -- Higher number = higher priority
      
      -- Supported methods
      supported_methods JSONB NOT NULL, -- ['UPI', 'CARD', 'WALLET', 'NETBANKING']
      
      -- API configuration (encrypted)
      api_config JSONB NOT NULL, -- {key_id, secret, webhook_secret, base_url}
      
      -- Fees and limits
      fee_config JSONB, -- {percentage, fixed_fee, min_amount, max_amount}
      
      -- Features
      features JSONB, -- ['instant_refunds', 'recurring', 'saved_cards']
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Payment transactions log (for audit trail)
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id UUID PRIMARY KEY,
      payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      
      -- Transaction details
      transaction_type TEXT NOT NULL, -- 'CHARGE', 'REFUND', 'WEBHOOK', 'STATUS_UPDATE'
      gateway_name TEXT NOT NULL,
      gateway_transaction_id TEXT,
      
      -- Request/Response data
      request_data JSONB,
      response_data JSONB,
      
      -- Status and timing
      status TEXT NOT NULL, -- 'SUCCESS', 'FAILED', 'PENDING'
      response_code TEXT,
      response_message TEXT,
      processing_time_ms INTEGER,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Payment analytics and metrics
    CREATE TABLE IF NOT EXISTS payment_analytics (
      id UUID PRIMARY KEY,
      
      -- Time period
      date DATE NOT NULL,
      hour INTEGER, -- For hourly aggregation
      
      -- Dimensions
      payment_method TEXT,
      gateway_name TEXT,
      restaurant_id UUID,
      
      -- Metrics
      total_transactions INTEGER DEFAULT 0,
      successful_transactions INTEGER DEFAULT 0,
      failed_transactions INTEGER DEFAULT 0,
      total_amount_cents BIGINT DEFAULT 0,
      average_transaction_value_cents INTEGER DEFAULT 0,
      
      -- Performance metrics
      avg_processing_time_ms INTEGER DEFAULT 0,
      success_rate DECIMAL(5,2) DEFAULT 0.00,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(date, hour, payment_method, gateway_name, restaurant_id)
    );

    -- Fraud detection rules
    CREATE TABLE IF NOT EXISTS fraud_rules (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      
      -- Rule configuration
      rule_type TEXT NOT NULL, -- 'VELOCITY', 'AMOUNT', 'LOCATION', 'DEVICE', 'BEHAVIOR'
      conditions JSONB NOT NULL,
      
      -- Action
      action TEXT NOT NULL, -- 'BLOCK', 'FLAG', 'REVIEW', 'STEP_UP'
      risk_score DECIMAL(3,2) NOT NULL,
      
      -- Status
      is_active BOOLEAN DEFAULT true,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
    CREATE INDEX IF NOT EXISTS idx_payments_gateway ON payments(provider, gateway_transaction_id);
    
    CREATE INDEX IF NOT EXISTS idx_refunds_payment_id ON refunds(payment_id);
    CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
    
    CREATE INDEX IF NOT EXISTS idx_saved_methods_user ON saved_payment_methods(user_id, is_active);
    
    CREATE INDEX IF NOT EXISTS idx_transactions_payment ON payment_transactions(payment_id, created_at);
    
    CREATE INDEX IF NOT EXISTS idx_analytics_date ON payment_analytics(date, gateway_name);
  `;
  await pool.query(sql);
  console.log('✅ Payment service schema initialized');
}

// Enhanced payment operations
class Payment {
  
  // Create a new payment with comprehensive details
  static async create(paymentData) {
    const id = uuidv4();
    const {
      order_id, user_id, restaurant_id, method, provider,
      amount_cents, tax_amount_cents = 0, delivery_fee_cents = 0,
      platform_fee_cents = 0, discount_amount_cents = 0,
      card_details = null, upi_details = null, wallet_details = null, bnpl_details = null
    } = paymentData;

    const { rows } = await pool.query(`
      INSERT INTO payments (
        id, order_id, user_id, restaurant_id, method, provider,
        amount_cents, tax_amount_cents, delivery_fee_cents, platform_fee_cents, discount_amount_cents,
        card_details, upi_details, wallet_details, bnpl_details, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'PENDING')
      RETURNING *
    `, [
      id, order_id, user_id, restaurant_id, method, provider,
      amount_cents, tax_amount_cents, delivery_fee_cents, platform_fee_cents, discount_amount_cents,
      JSON.stringify(card_details), JSON.stringify(upi_details), 
      JSON.stringify(wallet_details), JSON.stringify(bnpl_details)
    ]);

    return rows[0];
  }

  // Find payment by ID with full details
  static async findById(id) {
    const { rows } = await pool.query(`
      SELECT p.*, 
        COUNT(r.id) as refund_count,
        COALESCE(SUM(r.amount_cents), 0) as total_refunded_cents
      FROM payments p
      LEFT JOIN refunds r ON p.id = r.payment_id AND r.status = 'SUCCESS'
      WHERE p.id = $1
      GROUP BY p.id
    `, [id]);

    return rows[0] || null;
  }

  // Find payment by order ID
  static async findByOrderId(orderId) {
    const { rows } = await pool.query('SELECT * FROM payments WHERE order_id = $1', [orderId]);
    return rows[0] || null;
  }

  // Update payment status with gateway response
  static async updateStatus(id, statusData) {
    const {
      status, gateway_transaction_id, gateway_payment_id,
      failure_reason, completed_at, response_data = null
    } = statusData;

    const { rows } = await pool.query(`
      UPDATE payments 
      SET status = $2, gateway_transaction_id = $3, gateway_payment_id = $4,
          failure_reason = $5, completed_at = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id, status, gateway_transaction_id, gateway_payment_id, failure_reason, completed_at]);

    // Log transaction
    if (rows[0]) {
      await this.logTransaction(id, 'STATUS_UPDATE', statusData.provider || 'UNKNOWN', {
        status, gateway_transaction_id, response_data
      });
    }

    return rows[0];
  }

  // Process payment retry
  static async retry(id) {
    const payment = await this.findById(id);
    if (!payment) return null;

    if (payment.retry_count >= payment.max_retries) {
      throw new Error('Maximum retry attempts exceeded');
    }

    const { rows } = await pool.query(`
      UPDATE payments 
      SET retry_count = retry_count + 1, 
          last_retry_at = CURRENT_TIMESTAMP,
          status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    return rows[0];
  }

  // Calculate payment fees
  static calculateFees(amount_cents, method, provider) {
    const feeStructures = {
      'RAZORPAY': {
        'UPI': { percentage: 0, fixed: 0 },
        'CARD': { percentage: 2.0, fixed: 0 },
        'WALLET': { percentage: 1.5, fixed: 0 },
        'NETBANKING': { percentage: 1.9, fixed: 0 }
      },
      'PAYTM': {
        'UPI': { percentage: 0, fixed: 0 },
        'CARD': { percentage: 1.95, fixed: 0 },
        'WALLET': { percentage: 1.0, fixed: 0 }
      },
      'PHONEPE': {
        'UPI': { percentage: 0, fixed: 0 },
        'CARD': { percentage: 2.1, fixed: 0 }
      }
    };

    const structure = feeStructures[provider]?.[method] || { percentage: 2.0, fixed: 0 };
    const percentage_fee = Math.round((amount_cents * structure.percentage) / 100);
    const total_fee = percentage_fee + structure.fixed;

    return {
      percentage_fee,
      fixed_fee: structure.fixed,
      total_fee,
      net_amount: amount_cents - total_fee
    };
  }

  // Log payment transaction for audit trail
  static async logTransaction(payment_id, transaction_type, gateway_name, data) {
    const id = uuidv4();
    
    await pool.query(`
      INSERT INTO payment_transactions (
        id, payment_id, transaction_type, gateway_name,
        gateway_transaction_id, request_data, response_data, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
    `, [
      id, payment_id, transaction_type, gateway_name,
      data.gateway_transaction_id || null,
      JSON.stringify(data.request || {}),
      JSON.stringify(data.response || {}),
      data.status || 'SUCCESS'
    ]);
  }
}

// Enhanced refund operations
class Refund {
  
  // Create refund request
  static async create(refundData) {
    const id = uuidv4();
    const {
      payment_id, order_id, refund_type, amount_cents,
      reason, initiated_by, notes = null
    } = refundData;

    const { rows } = await pool.query(`
      INSERT INTO refunds (
        id, payment_id, order_id, refund_type, amount_cents,
        reason, initiated_by, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
      RETURNING *
    `, [id, payment_id, order_id, refund_type, amount_cents, reason, initiated_by, notes]);

    return rows[0];
  }

  // Update refund status
  static async updateStatus(id, status, gateway_refund_id = null, processed_at = null) {
    const { rows } = await pool.query(`
      UPDATE refunds 
      SET status = $2, gateway_refund_id = $3, processed_at = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id, status, gateway_refund_id, processed_at]);

    return rows[0];
  }

  // Get refunds for payment
  static async findByPaymentId(paymentId) {
    const { rows } = await pool.query(`
      SELECT * FROM refunds 
      WHERE payment_id = $1 
      ORDER BY created_at DESC
    `, [paymentId]);

    return rows;
  }
}

// Saved payment methods management
class SavedPaymentMethod {
  
  // Save payment method for user
  static async save(methodData) {
    const id = uuidv4();
    const {
      user_id, method_type, provider, token, display_info,
      nickname = null, is_default = false
    } = methodData;

    // If this is set as default, unset others
    if (is_default) {
      await pool.query(
        'UPDATE saved_payment_methods SET is_default = false WHERE user_id = $1',
        [user_id]
      );
    }

    const { rows } = await pool.query(`
      INSERT INTO saved_payment_methods (
        id, user_id, method_type, provider, token, display_info, nickname, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [id, user_id, method_type, provider, token, JSON.stringify(display_info), nickname, is_default]);

    return rows[0];
  }

  // Get saved methods for user
  static async findByUserId(userId) {
    const { rows } = await pool.query(`
      SELECT * FROM saved_payment_methods 
      WHERE user_id = $1 AND is_active = true
      ORDER BY is_default DESC, last_used_at DESC NULLS LAST, created_at DESC
    `, [userId]);

    return rows;
  }

  // Update last used timestamp
  static async updateLastUsed(id) {
    await pool.query(`
      UPDATE saved_payment_methods 
      SET last_used_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [id]);
  }
}

// Fraud detection system
class FraudDetection {
  
  // Calculate risk score for payment
  static async calculateRiskScore(paymentData) {
    const { user_id, amount_cents, method, device_info = {} } = paymentData;
    
    let riskScore = 0.0;
    const flags = [];

    // Check velocity (multiple transactions in short time)
    const recentPayments = await pool.query(`
      SELECT COUNT(*) as count, SUM(amount_cents) as total_amount
      FROM payments 
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 hour'
    `, [user_id]);

    if (recentPayments.rows[0].count >= 5) {
      riskScore += 0.3;
      flags.push('HIGH_VELOCITY');
    }

    // Check large amount
    if (amount_cents >= 500000) { // > ₹5000
      riskScore += 0.2;
      flags.push('LARGE_AMOUNT');
    }

    // Check new payment method
    if (method !== 'COD') {
      const existingMethods = await pool.query(`
        SELECT COUNT(*) as count FROM payments 
        WHERE user_id = $1 AND status = 'SUCCESS'
      `, [user_id]);

      if (existingMethods.rows[0].count === 0) {
        riskScore += 0.1;
        flags.push('NEW_USER');
      }
    }

    // Check unusual time (late night transactions)
    const hour = new Date().getHours();
    if (hour >= 23 || hour <= 5) {
      riskScore += 0.1;
      flags.push('UNUSUAL_TIME');
    }

    return {
      risk_score: Math.min(riskScore, 1.0),
      fraud_flags: flags,
      is_flagged: riskScore > 0.7
    };
  }

  // Apply fraud rules
  static async applyRules(paymentData) {
    const { rows: rules } = await pool.query(`
      SELECT * FROM fraud_rules WHERE is_active = true ORDER BY risk_score DESC
    `);

    let totalRiskScore = 0;
    const appliedRules = [];
    
    for (const rule of rules) {
      const ruleResult = this.evaluateRule(rule, paymentData);
      if (ruleResult.triggered) {
        totalRiskScore += rule.risk_score;
        appliedRules.push({
          rule_id: rule.id,
          rule_name: rule.name,
          action: rule.action,
          risk_score: rule.risk_score
        });
      }
    }

    return {
      total_risk_score: Math.min(totalRiskScore, 1.0),
      applied_rules: appliedRules,
      recommended_action: this.getRecommendedAction(totalRiskScore)
    };
  }

  static evaluateRule(rule, paymentData) {
    // Simplified rule evaluation - in production this would be more sophisticated
    const conditions = rule.conditions;
    
    switch (rule.rule_type) {
      case 'AMOUNT':
        return {
          triggered: paymentData.amount_cents > (conditions.threshold_cents || 1000000)
        };
      case 'VELOCITY':
        // This would check actual velocity from database
        return { triggered: false };
      case 'LOCATION':
        // This would check IP geolocation
        return { triggered: false };
      default:
        return { triggered: false };
    }
  }

  static getRecommendedAction(riskScore) {
    if (riskScore >= 0.8) return 'BLOCK';
    if (riskScore >= 0.6) return 'REVIEW';
    if (riskScore >= 0.4) return 'STEP_UP';
    return 'ALLOW';
  }
}

// Analytics and reporting
class PaymentAnalytics {
  
  // Update daily analytics
  static async updateDailyAnalytics(paymentData) {
    const { method, provider, restaurant_id, amount_cents, status } = paymentData;
    const date = new Date().toISOString().split('T')[0];

    await pool.query(`
      INSERT INTO payment_analytics (
        id, date, payment_method, gateway_name, restaurant_id,
        total_transactions, successful_transactions, failed_transactions, total_amount_cents
      ) VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8)
      ON CONFLICT (date, hour, payment_method, gateway_name, restaurant_id)
      DO UPDATE SET
        total_transactions = payment_analytics.total_transactions + 1,
        successful_transactions = payment_analytics.successful_transactions + $6,
        failed_transactions = payment_analytics.failed_transactions + $7,
        total_amount_cents = payment_analytics.total_amount_cents + $8,
        updated_at = CURRENT_TIMESTAMP
    `, [
      uuidv4(), date, method, provider, restaurant_id,
      status === 'SUCCESS' ? 1 : 0,
      status === 'FAILED' ? 1 : 0,
      status === 'SUCCESS' ? amount_cents : 0
    ]);
  }

  // Get payment analytics for period
  static async getAnalytics(filters = {}) {
    const {
      start_date, end_date, restaurant_id, payment_method, gateway_name
    } = filters;

    let query = `
      SELECT 
        date,
        payment_method,
        gateway_name,
        SUM(total_transactions) as total_transactions,
        SUM(successful_transactions) as successful_transactions,
        SUM(failed_transactions) as failed_transactions,
        SUM(total_amount_cents) as total_amount_cents,
        AVG(success_rate) as avg_success_rate
      FROM payment_analytics 
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (start_date) {
      query += ` AND date >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND date <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    if (restaurant_id) {
      query += ` AND restaurant_id = $${paramIndex}`;
      params.push(restaurant_id);
      paramIndex++;
    }

    if (payment_method) {
      query += ` AND payment_method = $${paramIndex}`;
      params.push(payment_method);
      paramIndex++;
    }

    if (gateway_name) {
      query += ` AND gateway_name = $${paramIndex}`;
      params.push(gateway_name);
      paramIndex++;
    }

    query += ` GROUP BY date, payment_method, gateway_name ORDER BY date DESC`;

    const { rows } = await pool.query(query, params);
    return rows;
  }
}

module.exports = { 
  ensureSchema, 
  Payment, 
  Refund, 
  SavedPaymentMethod, 
  FraudDetection, 
  PaymentAnalytics 
};
