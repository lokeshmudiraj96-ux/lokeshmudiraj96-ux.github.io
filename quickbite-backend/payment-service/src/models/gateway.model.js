const crypto = require('crypto');
const axios = require('axios');

// Razorpay Gateway Integration
class RazorpayGateway {
  
  constructor(config) {
    this.keyId = config.key_id;
    this.keySecret = config.key_secret;
    this.baseURL = config.base_url || 'https://api.razorpay.com/v1';
    this.webhookSecret = config.webhook_secret;
  }

  // Create order for payment
  async createOrder(orderData) {
    const { amount_cents, currency = 'INR', receipt, notes = {} } = orderData;
    
    try {
      const response = await axios.post(`${this.baseURL}/orders`, {
        amount: amount_cents, // Razorpay expects paise
        currency,
        receipt,
        notes
      }, {
        auth: {
          username: this.keyId,
          password: this.keySecret
        }
      });

      return {
        success: true,
        order_id: response.data.id,
        amount: response.data.amount,
        currency: response.data.currency,
        status: response.data.status
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  // Capture payment
  async capturePayment(paymentId, amount_cents) {
    try {
      const response = await axios.post(
        `${this.baseURL}/payments/${paymentId}/capture`,
        { amount: amount_cents },
        {
          auth: {
            username: this.keyId,
            password: this.keySecret
          }
        }
      );

      return {
        success: true,
        payment_id: response.data.id,
        amount: response.data.amount,
        status: response.data.status,
        method: response.data.method,
        captured: response.data.captured
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  // Create refund
  async createRefund(paymentId, refundData) {
    const { amount_cents, notes = {} } = refundData;
    
    try {
      const response = await axios.post(
        `${this.baseURL}/payments/${paymentId}/refunds`,
        { amount: amount_cents, notes },
        {
          auth: {
            username: this.keyId,
            password: this.keySecret
          }
        }
      );

      return {
        success: true,
        refund_id: response.data.id,
        amount: response.data.amount,
        status: response.data.status,
        payment_id: response.data.payment_id
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  // Get payment status
  async getPaymentStatus(paymentId) {
    try {
      const response = await axios.get(`${this.baseURL}/payments/${paymentId}`, {
        auth: {
          username: this.keyId,
          password: this.keySecret
        }
      });

      return {
        success: true,
        payment_id: response.data.id,
        status: response.data.status,
        amount: response.data.amount,
        method: response.data.method,
        captured: response.data.captured,
        created_at: response.data.created_at
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(payload, signature) {
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');
    
    return expectedSignature === signature;
  }

  // Parse webhook event
  parseWebhookEvent(payload) {
    try {
      const event = JSON.parse(payload);
      
      switch (event.event) {
        case 'payment.captured':
          return {
            type: 'PAYMENT_SUCCESS',
            payment_id: event.payload.payment.entity.id,
            order_id: event.payload.payment.entity.order_id,
            amount: event.payload.payment.entity.amount,
            method: event.payload.payment.entity.method,
            status: 'SUCCESS'
          };
          
        case 'payment.failed':
          return {
            type: 'PAYMENT_FAILED',
            payment_id: event.payload.payment.entity.id,
            order_id: event.payload.payment.entity.order_id,
            error_reason: event.payload.payment.entity.error_reason,
            status: 'FAILED'
          };
          
        case 'refund.processed':
          return {
            type: 'REFUND_SUCCESS',
            refund_id: event.payload.refund.entity.id,
            payment_id: event.payload.refund.entity.payment_id,
            amount: event.payload.refund.entity.amount,
            status: 'SUCCESS'
          };
          
        default:
          return { type: 'UNKNOWN', event: event.event };
      }
    } catch (error) {
      return { type: 'PARSE_ERROR', error: error.message };
    }
  }
}

// Paytm Gateway Integration
class PaytmGateway {
  
  constructor(config) {
    this.merchantId = config.merchant_id;
    this.merchantKey = config.merchant_key;
    this.website = config.website || 'WEBSTAGING';
    this.industryType = config.industry_type || 'Retail';
    this.baseURL = config.base_url || 'https://securegw-stage.paytm.in';
  }

  // Generate checksum for Paytm
  generateChecksum(params) {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((result, key) => {
        result[key] = params[key];
        return result;
      }, {});

    const paramStr = Object.entries(sortedParams)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return crypto
      .createHash('sha256')
      .update(paramStr + this.merchantKey)
      .digest('hex');
  }

  // Create payment request
  async createPaymentRequest(orderData) {
    const { order_id, amount_cents, customer_id, mobile, email } = orderData;
    
    const params = {
      MID: this.merchantId,
      WEBSITE: this.website,
      INDUSTRY_TYPE_ID: this.industryType,
      ORDER_ID: order_id,
      CUST_ID: customer_id,
      TXN_AMOUNT: (amount_cents / 100).toFixed(2),
      CHANNEL_ID: 'WEB',
      MOBILE_NO: mobile,
      EMAIL: email,
      CALLBACK_URL: `${process.env.BASE_URL}/api/payments/paytm/callback`
    };

    params.CHECKSUMHASH = this.generateChecksum(params);

    return {
      success: true,
      payment_url: `${this.baseURL}/theia/processTransaction`,
      form_params: params
    };
  }

  // Verify payment response
  async verifyPayment(responseData) {
    const { ORDERID, TXNID, STATUS, CHECKSUMHASH, ...otherParams } = responseData;
    
    // Verify checksum
    const calculatedChecksum = this.generateChecksum(otherParams);
    
    if (calculatedChecksum !== CHECKSUMHASH) {
      return {
        success: false,
        error: 'Checksum verification failed'
      };
    }

    // Query transaction status
    return await this.getTransactionStatus(ORDERID);
  }

  // Get transaction status
  async getTransactionStatus(orderId) {
    const params = {
      MID: this.merchantId,
      ORDERID: orderId
    };

    params.CHECKSUMHASH = this.generateChecksum(params);

    try {
      const response = await axios.post(
        `${this.baseURL}/merchant-status/getTxnStatus`,
        params
      );

      const result = response.data;
      
      return {
        success: true,
        order_id: result.ORDERID,
        txn_id: result.TXNID,
        status: result.STATUS === 'TXN_SUCCESS' ? 'SUCCESS' : 'FAILED',
        amount: parseFloat(result.TXNAMOUNT) * 100, // Convert to paise
        payment_mode: result.PAYMENTMODE,
        txn_date: result.TXNDATE
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Create refund
  async createRefund(refundData) {
    const { txn_id, order_id, amount_cents, refund_id } = refundData;
    
    const params = {
      MID: this.merchantId,
      TXNTYPE: 'REFUND',
      ORDERID: order_id,
      TXNID: txn_id,
      REFUNDAMOUNT: (amount_cents / 100).toFixed(2),
      REFID: refund_id
    };

    params.CHECKSUMHASH = this.generateChecksum(params);

    try {
      const response = await axios.post(
        `${this.baseURL}/refund/apply`,
        params
      );

      return {
        success: true,
        refund_id: response.data.REFID,
        status: response.data.RESULTMSG === 'Refund Successfull' ? 'SUCCESS' : 'PENDING',
        txn_id: response.data.TXNID
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// PhonePe Gateway Integration
class PhonePeGateway {
  
  constructor(config) {
    this.merchantId = config.merchant_id;
    this.saltKey = config.salt_key;
    this.saltIndex = config.salt_index || 1;
    this.baseURL = config.base_url || 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  }

  // Generate checksum for PhonePe
  generateChecksum(payload) {
    const dataToHash = payload + '/pg/v1/pay' + this.saltKey;
    return crypto.createHash('sha256').update(dataToHash).digest('hex') + '###' + this.saltIndex;
  }

  // Create payment request
  async createPaymentRequest(orderData) {
    const { order_id, amount_cents, user_id, mobile, redirect_url } = orderData;
    
    const paymentPayload = {
      merchantId: this.merchantId,
      merchantTransactionId: order_id,
      merchantUserId: user_id,
      amount: amount_cents,
      redirectUrl: redirect_url,
      redirectMode: 'POST',
      callbackUrl: `${process.env.BASE_URL}/api/payments/phonepe/callback`,
      mobileNumber: mobile,
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    };

    const payload = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
    const checksum = this.generateChecksum(payload);

    try {
      const response = await axios.post(
        `${this.baseURL}/pg/v1/pay`,
        {
          request: payload
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-VERIFY': checksum
          }
        }
      );

      return {
        success: true,
        payment_url: response.data.data.instrumentResponse.redirectInfo.url,
        merchant_transaction_id: order_id
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // Check payment status
  async checkPaymentStatus(merchantTransactionId) {
    const checksum = crypto
      .createHash('sha256')
      .update(`/pg/v1/status/${this.merchantId}/${merchantTransactionId}` + this.saltKey)
      .digest('hex') + '###' + this.saltIndex;

    try {
      const response = await axios.get(
        `${this.baseURL}/pg/v1/status/${this.merchantId}/${merchantTransactionId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-VERIFY': checksum,
            'X-MERCHANT-ID': this.merchantId
          }
        }
      );

      const result = response.data;
      
      return {
        success: true,
        merchant_transaction_id: result.data.merchantTransactionId,
        transaction_id: result.data.transactionId,
        status: result.data.state === 'COMPLETED' ? 'SUCCESS' : 'FAILED',
        amount: result.data.amount,
        response_code: result.data.responseCode,
        payment_instrument: result.data.paymentInstrument
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // Verify callback
  verifyCallback(headers, body) {
    const receivedChecksum = headers['x-verify'];
    const payload = body.response;
    
    const calculatedChecksum = crypto
      .createHash('sha256')
      .update(payload + '/pg/v1/pay' + this.saltKey)
      .digest('hex') + '###' + this.saltIndex;

    return receivedChecksum === calculatedChecksum;
  }
}

// Gateway Manager - Routes requests to appropriate gateway
class GatewayManager {
  
  constructor() {
    this.gateways = new Map();
  }

  // Register gateway
  registerGateway(name, gateway) {
    this.gateways.set(name.toUpperCase(), gateway);
  }

  // Get gateway instance
  getGateway(name) {
    return this.gateways.get(name.toUpperCase());
  }

  // Route payment request to best gateway
  async routePayment(paymentData) {
    const { method, amount_cents, user_preferences = {} } = paymentData;
    
    // Gateway selection logic based on method and preferences
    let preferredGateway = 'RAZORPAY'; // Default
    
    if (method === 'UPI') {
      // PhonePe has better UPI success rates
      preferredGateway = user_preferences.gateway || 'PHONEPE';
    } else if (method === 'WALLET') {
      // Paytm for wallet payments
      preferredGateway = 'PAYTM';
    } else if (amount_cents > 500000) { // > ₹5000
      // Razorpay for high-value transactions
      preferredGateway = 'RAZORPAY';
    }

    const gateway = this.getGateway(preferredGateway);
    if (!gateway) {
      throw new Error(`Gateway ${preferredGateway} not available`);
    }

    return { gateway, gateway_name: preferredGateway };
  }

  // Get gateway fees comparison
  getGatewayFees(amount_cents, method) {
    const fees = {
      RAZORPAY: this.calculateRazorpayFees(amount_cents, method),
      PAYTM: this.calculatePaytmFees(amount_cents, method),
      PHONEPE: this.calculatePhonePeFees(amount_cents, method)
    };

    return fees;
  }

  calculateRazorpayFees(amount_cents, method) {
    const rates = {
      'UPI': 0,
      'CARD': 2.0,
      'WALLET': 1.5,
      'NETBANKING': 1.9
    };
    
    const rate = rates[method] || 2.0;
    return Math.round((amount_cents * rate) / 100);
  }

  calculatePaytmFees(amount_cents, method) {
    const rates = {
      'UPI': 0,
      'CARD': 1.95,
      'WALLET': 1.0
    };
    
    const rate = rates[method] || 1.95;
    return Math.round((amount_cents * rate) / 100);
  }

  calculatePhonePeFees(amount_cents, method) {
    const rates = {
      'UPI': 0,
      'CARD': 2.1
    };
    
    const rate = rates[method] || 2.1;
    return Math.round((amount_cents * rate) / 100);
  }
}

module.exports = {
  RazorpayGateway,
  PaytmGateway,
  PhonePeGateway,
  GatewayManager
};