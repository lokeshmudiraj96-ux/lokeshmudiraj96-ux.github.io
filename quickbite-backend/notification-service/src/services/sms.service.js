const twilio = require('twilio');
const { NOTIFICATION_CHANNELS } = require('../models/notification.model');

class SMSService {
  constructor() {
    this.twilioClient = null;
    this.initialized = false;
    this.initializeTwilio();
  }

  initializeTwilio() {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !phoneNumber) {
        console.warn('⚠️ Twilio SMS credentials not configured');
        return;
      }

      this.twilioClient = twilio(accountSid, authToken);
      this.fromNumber = phoneNumber;
      this.initialized = true;
      console.log('✅ SMS service initialized');
    } catch (error) {
      console.error('❌ SMS service initialization failed:', error);
    }
  }

  async sendSMS(notification, recipient) {
    try {
      if (!this.initialized) {
        throw new Error('SMS service not initialized');
      }

      // Prepare SMS content
      const smsContent = await this.prepareSMSContent(notification);
      
      const messageOptions = {
        body: smsContent.message,
        from: this.fromNumber,
        to: this.formatPhoneNumber(recipient.phone),
        statusCallback: `${process.env.APP_BASE_URL}/api/notifications/sms/status`,
        statusCallbackMethod: 'POST'
      };

      // Add media for rich SMS (MMS)
      if (smsContent.mediaUrl) {
        messageOptions.mediaUrl = smsContent.mediaUrl;
      }

      const result = await this.twilioClient.messages.create(messageOptions);

      // Log successful delivery
      await this.logDelivery(notification.id, 'SMS', 'SENT', {
        messageSid: result.sid,
        status: result.status,
        to: result.to,
        from: result.from
      });

      return {
        success: true,
        messageSid: result.sid,
        recipient: recipient.phone,
        status: result.status
      };
    } catch (error) {
      console.error('Error sending SMS:', error);
      
      // Log failure
      await this.logDelivery(notification.id, 'SMS', 'FAILED', null, error.message);
      
      throw error;
    }
  }

  async prepareSMSContent(notification) {
    try {
      // Get SMS template if exists
      let template = null;
      if (notification.templateId) {
        const { NotificationTemplate } = require('../models/template.model');
        template = await NotificationTemplate.findById(notification.templateId);
      }

      // If no template, try to find one by type and channel
      if (!template) {
        const { NotificationTemplate } = require('../models/template.model');
        template = await NotificationTemplate.findByTypeAndChannel(notification.type, 'SMS');
      }

      if (template) {
        const rendered = await template.render({
          ...notification.data,
          notification: {
            title: notification.title,
            message: notification.message,
            type: notification.type
          },
          user: notification.data.user || {},
          order: notification.data.order || {},
          restaurant: notification.data.restaurant || {}
        });

        return {
          message: this.truncateSMSMessage(rendered.body),
          mediaUrl: notification.data.mediaUrl
        };
      }

      // Default SMS content
      return {
        message: this.createDefaultSMSMessage(notification),
        mediaUrl: notification.data.mediaUrl
      };
    } catch (error) {
      console.error('Error preparing SMS content:', error);
      return {
        message: this.createDefaultSMSMessage(notification)
      };
    }
  }

  createDefaultSMSMessage(notification) {
    const messageMap = {
      'ORDER_PLACED': `QuickBite: Your order #${notification.data.orderNumber || 'XXX'} has been placed successfully. Track: ${process.env.APP_BASE_URL}/track/${notification.data.orderId}`,
      
      'ORDER_CONFIRMED': `QuickBite: Order #${notification.data.orderNumber} confirmed! Estimated delivery: ${notification.data.estimatedDelivery || '30-45 mins'}`,
      
      'ORDER_PREPARING': `QuickBite: Good news! ${notification.data.restaurantName || 'Restaurant'} is now preparing your order #${notification.data.orderNumber}`,
      
      'ORDER_READY': `QuickBite: Your order #${notification.data.orderNumber} is ready for pickup at ${notification.data.restaurantName}`,
      
      'ORDER_OUT_FOR_DELIVERY': `QuickBite: Your order #${notification.data.orderNumber} is out for delivery! Delivered by ${notification.data.deliveryPartner || 'our partner'}. Track live: ${process.env.APP_BASE_URL}/track/${notification.data.orderId}`,
      
      'ORDER_DELIVERED': `QuickBite: Order #${notification.data.orderNumber} delivered successfully! Enjoy your meal. Rate your experience: ${process.env.APP_BASE_URL}/rate/${notification.data.orderId}`,
      
      'ORDER_CANCELLED': `QuickBite: Your order #${notification.data.orderNumber} has been cancelled. ${notification.data.reason || 'Refund will be processed within 3-5 business days.'}`,
      
      'ORDER_DELAYED': `QuickBite: Your order #${notification.data.orderNumber} is delayed by ${notification.data.delayMinutes || '15'} mins due to ${notification.data.reason || 'high demand'}. Sorry for the inconvenience!`,
      
      'PAYMENT_SUCCESS': `QuickBite: Payment of ₹${(notification.data.amount || 0) / 100} successful for order #${notification.data.orderNumber}. Transaction ID: ${notification.data.transactionId}`,
      
      'PAYMENT_FAILED': `QuickBite: Payment failed for order #${notification.data.orderNumber}. Please retry or use a different payment method: ${process.env.APP_BASE_URL}/payment/${notification.data.orderId}`,
      
      'PROMOTIONAL_OFFER': `QuickBite: ${notification.title} Use code ${notification.data.promoCode} to get ${notification.data.discount}% OFF. Valid till ${notification.data.validTill}. Order now!`,
      
      'LOYALTY_REWARD': `QuickBite: Congrats! You've earned ${notification.data.points || 0} loyalty points. Total: ${notification.data.totalPoints || 0} points. Redeem: ${process.env.APP_BASE_URL}/rewards`,
      
      'REFERRAL_BONUS': `QuickBite: ₹${(notification.data.bonusAmount || 0) / 100} referral bonus credited to your wallet! Refer more friends and earn more rewards.`,
      
      'DELIVERY_ASSIGNED': `QuickBite: ${notification.data.deliveryPartner} is assigned for your order #${notification.data.orderNumber}. Contact: ${notification.data.deliveryPhone}`,
      
      'DELIVERY_ARRIVED': `QuickBite: Your delivery partner has arrived! Order #${notification.data.orderNumber}. Please collect your order.`
    };

    const defaultMessage = messageMap[notification.type];
    
    if (defaultMessage) {
      return this.truncateSMSMessage(defaultMessage);
    }

    // Generic fallback
    return this.truncateSMSMessage(`QuickBite: ${notification.title}. ${notification.message}`);
  }

  truncateSMSMessage(message, maxLength = 160) {
    if (message.length <= maxLength) {
      return message;
    }

    // Truncate and add ellipsis
    return message.substring(0, maxLength - 3) + '...';
  }

  formatPhoneNumber(phone) {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Add country code if missing (assuming India +91)
    if (cleaned.length === 10) {
      return '+91' + cleaned;
    }
    
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return '+' + cleaned;
    }
    
    if (cleaned.length === 13 && cleaned.startsWith('091')) {
      return '+' + cleaned.substring(1);
    }
    
    // Return as-is if already formatted or unknown format
    return phone.startsWith('+') ? phone : '+' + cleaned;
  }

  validatePhoneNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');
    
    // Indian phone number validation
    if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
      return true;
    }
    
    if (cleaned.length === 12 && /^91[6-9]\d{9}$/.test(cleaned)) {
      return true;
    }
    
    return false;
  }

  async sendBulkSMS(notifications) {
    const results = [];
    const batchSize = 50; // SMS batch limit
    
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      const batchPromises = batch.map(async (item) => {
        try {
          const { notification, recipient } = item;
          return await this.sendSMS(notification, recipient);
        } catch (error) {
          return {
            success: false,
            error: error.message,
            notificationId: item.notification.id
          };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value || r.reason));

      // Rate limiting - wait between batches
      if (i + batchSize < notifications.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  async handleStatusCallback(body) {
    try {
      const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = body;
      
      // Update delivery log with status
      const { pool } = require('../config/database');
      
      const query = `
        UPDATE notification_delivery_logs 
        SET status = $1, 
            delivered_at = CASE WHEN $1 = 'delivered' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
            failure_reason = $2,
            response_data = jsonb_set(
              COALESCE(response_data, '{}'),
              '{status_update}',
              $3
            )
        WHERE response_data->>'messageSid' = $4
        RETURNING notification_id
      `;

      const statusMapping = {
        'delivered': 'DELIVERED',
        'failed': 'FAILED',
        'undelivered': 'FAILED'
      };

      const mappedStatus = statusMapping[MessageStatus] || 'SENT';
      
      const result = await pool.query(query, [
        mappedStatus,
        ErrorMessage || null,
        JSON.stringify({
          status: MessageStatus,
          errorCode: ErrorCode,
          updatedAt: new Date().toISOString()
        }),
        MessageSid
      ]);

      if (result.rows.length > 0) {
        const notificationId = result.rows[0].notification_id;
        
        // Update main notification status if needed
        if (mappedStatus === 'DELIVERED') {
          const { Notification } = require('../models/notification.model');
          const notification = await Notification.findById(notificationId);
          if (notification) {
            await notification.updateStatus('DELIVERED');
          }
        }
      }

      return { success: true, messageSid: MessageSid, status: MessageStatus };
    } catch (error) {
      console.error('Error handling SMS status callback:', error);
      throw error;
    }
  }

  async logDelivery(notificationId, channel, status, responseData = null, failureReason = null) {
    try {
      const { pool } = require('../config/database');
      const { v4: uuidv4 } = require('uuid');

      const query = `
        INSERT INTO notification_delivery_logs (
          id, notification_id, channel, status, response_data, 
          sent_at, failure_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      const values = [
        uuidv4(),
        notificationId,
        channel,
        status,
        responseData ? JSON.stringify(responseData) : null,
        status === 'SENT' ? new Date() : null,
        failureReason
      ];

      await pool.query(query, values);
    } catch (error) {
      console.error('Error logging SMS delivery:', error);
    }
  }

  async testSMSService(phoneNumber) {
    try {
      if (!this.initialized) {
        throw new Error('SMS service not initialized');
      }

      if (!this.validatePhoneNumber(phoneNumber)) {
        throw new Error('Invalid phone number format');
      }

      const testNotification = {
        id: 'test-' + Date.now(),
        type: 'CUSTOM_MESSAGE',
        title: 'Test SMS',
        message: 'This is a test SMS from QuickBite notification service.',
        data: {}
      };

      const result = await this.sendSMS(testNotification, { phone: phoneNumber });

      return {
        success: true,
        message: 'Test SMS sent successfully',
        messageSid: result.messageSid
      };
    } catch (error) {
      console.error('SMS service test failed:', error);
      throw error;
    }
  }

  async getSMSAnalytics(startDate, endDate) {
    try {
      const { pool } = require('../config/database');
      
      const query = `
        SELECT 
          DATE(sent_at) as date,
          COUNT(*) as total_sent,
          COUNT(CASE WHEN status = 'SENT' THEN 1 END) as successful,
          COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END) as delivered,
          COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed,
          AVG(EXTRACT(EPOCH FROM (delivered_at - sent_at))) as avg_delivery_time_seconds
        FROM notification_delivery_logs
        WHERE channel = 'SMS'
        AND sent_at BETWEEN $1 AND $2
        GROUP BY DATE(sent_at)
        ORDER BY date DESC
      `;

      const result = await pool.query(query, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error('Error getting SMS analytics:', error);
      throw error;
    }
  }

  // Rate limiting for SMS
  async checkSMSRateLimit(phoneNumber) {
    try {
      const { pool } = require('../config/database');
      
      // Check how many SMS sent to this number in the last hour
      const query = `
        SELECT COUNT(*) as count
        FROM notification_delivery_logs ndl
        JOIN notifications n ON n.id = ndl.notification_id
        WHERE ndl.channel = 'SMS'
        AND ndl.sent_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
        AND ndl.response_data->>'to' = $1
      `;

      const result = await pool.query(query, [this.formatPhoneNumber(phoneNumber)]);
      const count = parseInt(result.rows[0].count);
      
      // Limit: 5 SMS per hour per number
      return count < 5;
    } catch (error) {
      console.error('Error checking SMS rate limit:', error);
      return true; // Allow if check fails
    }
  }
}

module.exports = SMSService;