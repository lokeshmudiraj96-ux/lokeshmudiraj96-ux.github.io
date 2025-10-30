const twilio = require('twilio');

class WhatsAppService {
  constructor() {
    this.twilioClient = null;
    this.initialized = false;
    this.initializeTwilio();
  }

  initializeTwilio() {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const whatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER; // Format: whatsapp:+14155238886

      if (!accountSid || !authToken || !whatsAppNumber) {
        console.warn('⚠️ Twilio WhatsApp credentials not configured');
        return;
      }

      this.twilioClient = twilio(accountSid, authToken);
      this.fromNumber = whatsAppNumber;
      this.initialized = true;
      console.log('✅ WhatsApp service initialized');
    } catch (error) {
      console.error('❌ WhatsApp service initialization failed:', error);
    }
  }

  async sendWhatsApp(notification, recipient) {
    try {
      if (!this.initialized) {
        throw new Error('WhatsApp service not initialized');
      }

      // Check if user has opted in for WhatsApp notifications
      if (!await this.hasOptedIn(recipient.phone)) {
        throw new Error('User has not opted in for WhatsApp notifications');
      }

      // Prepare WhatsApp content
      const whatsAppContent = await this.prepareWhatsAppContent(notification);
      
      const messageOptions = {
        body: whatsAppContent.message,
        from: this.fromNumber,
        to: this.formatWhatsAppNumber(recipient.phone),
        statusCallback: `${process.env.APP_BASE_URL}/api/notifications/whatsapp/status`,
        statusCallbackMethod: 'POST'
      };

      // Add media for rich WhatsApp messages
      if (whatsAppContent.mediaUrl) {
        messageOptions.mediaUrl = whatsAppContent.mediaUrl;
      }

      const result = await this.twilioClient.messages.create(messageOptions);

      // Log successful delivery
      await this.logDelivery(notification.id, 'WHATSAPP', 'SENT', {
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
      console.error('Error sending WhatsApp:', error);
      
      // Log failure
      await this.logDelivery(notification.id, 'WHATSAPP', 'FAILED', null, error.message);
      
      throw error;
    }
  }

  async prepareWhatsAppContent(notification) {
    try {
      // Get WhatsApp template if exists
      let template = null;
      if (notification.templateId) {
        const { NotificationTemplate } = require('../models/template.model');
        template = await NotificationTemplate.findById(notification.templateId);
      }

      // If no template, try to find one by type and channel
      if (!template) {
        const { NotificationTemplate } = require('../models/template.model');
        template = await NotificationTemplate.findByTypeAndChannel(notification.type, 'WHATSAPP');
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
          message: rendered.body,
          mediaUrl: notification.data.mediaUrl
        };
      }

      // Default WhatsApp content
      return {
        message: this.createDefaultWhatsAppMessage(notification),
        mediaUrl: notification.data.mediaUrl
      };
    } catch (error) {
      console.error('Error preparing WhatsApp content:', error);
      return {
        message: this.createDefaultWhatsAppMessage(notification)
      };
    }
  }

  createDefaultWhatsAppMessage(notification) {
    const messageMap = {
      'ORDER_PLACED': this.createOrderPlacedMessage(notification),
      'ORDER_CONFIRMED': this.createOrderConfirmedMessage(notification),
      'ORDER_PREPARING': this.createOrderPreparingMessage(notification),
      'ORDER_READY': this.createOrderReadyMessage(notification),
      'ORDER_OUT_FOR_DELIVERY': this.createOrderOutForDeliveryMessage(notification),
      'ORDER_DELIVERED': this.createOrderDeliveredMessage(notification),
      'ORDER_CANCELLED': this.createOrderCancelledMessage(notification),
      'ORDER_DELAYED': this.createOrderDelayedMessage(notification),
      'PAYMENT_SUCCESS': this.createPaymentSuccessMessage(notification),
      'PAYMENT_FAILED': this.createPaymentFailedMessage(notification),
      'PROMOTIONAL_OFFER': this.createPromotionalMessage(notification),
      'LOYALTY_REWARD': this.createLoyaltyRewardMessage(notification),
      'REFERRAL_BONUS': this.createReferralBonusMessage(notification),
      'DELIVERY_ASSIGNED': this.createDeliveryAssignedMessage(notification),
      'DELIVERY_ARRIVED': this.createDeliveryArrivedMessage(notification)
    };

    const defaultMessage = messageMap[notification.type];
    
    if (defaultMessage) {
      return defaultMessage;
    }

    // Generic fallback
    return this.createGenericMessage(notification);
  }

  createOrderPlacedMessage(notification) {
    const data = notification.data;
    return `🍽️ *Order Confirmed!*

Hi ${data.userName || 'there'}! 👋

Your QuickBite order has been placed successfully!

📦 *Order Details:*
Order #${data.orderNumber || 'XXX'}
Restaurant: ${data.restaurantName || 'N/A'}
Total: ₹${(data.totalAmount || 0) / 100}

⏰ *Estimated Delivery:* ${data.estimatedDelivery || '30-45 mins'}

Track your order: ${process.env.APP_BASE_URL}/track/${data.orderId}

Thank you for choosing QuickBite! 🚀`;
  }

  createOrderConfirmedMessage(notification) {
    const data = notification.data;
    return `✅ *Order Confirmed by Restaurant*

Great news ${data.userName || 'there'}! 

${data.restaurantName || 'The restaurant'} has confirmed your order.

📦 Order #${data.orderNumber}
⏰ Estimated delivery: ${data.estimatedDelivery || '30-45 mins'}
📍 Delivery to: ${data.deliveryAddress || 'your address'}

We'll keep you updated on your order's progress! 📱`;
  }

  createOrderPreparingMessage(notification) {
    const data = notification.data;
    return `👨‍🍳 *Your Order is Being Prepared*

Good news ${data.userName || 'there'}! 

${data.restaurantName || 'The restaurant'} is now preparing your delicious order.

📦 Order #${data.orderNumber}
🍽️ Items: ${data.itemCount || 'Multiple'} items
⏰ Preparation time: ${data.preparationTime || '15-20'} mins

Almost ready! 🔥`;
  }

  createOrderReadyMessage(notification) {
    const data = notification.data;
    return `🎉 *Order Ready for Pickup!*

Your order is ready ${data.userName || 'there'}! 

📦 Order #${data.orderNumber}
🏪 Restaurant: ${data.restaurantName}
📍 ${data.restaurantAddress || 'Restaurant address'}

${data.pickupInstructions || 'Please collect your order from the restaurant.'}

Enjoy your meal! 😋`;
  }

  createOrderOutForDeliveryMessage(notification) {
    const data = notification.data;
    return `🚗 *Your Order is Out for Delivery!*

Exciting news ${data.userName || 'there'}! 

Your order is on its way to you! 🛣️

📦 Order #${data.orderNumber}
🚚 Delivery Partner: ${data.deliveryPartner || 'Our partner'}
📞 Contact: ${data.deliveryPhone || 'Available in app'}
⏰ ETA: ${data.estimatedArrival || '10-15 mins'}

Track live: ${process.env.APP_BASE_URL}/track/${data.orderId}

Get ready to enjoy! 🎉`;
  }

  createOrderDeliveredMessage(notification) {
    const data = notification.data;
    return `✅ *Order Delivered Successfully!*

Enjoy your meal ${data.userName || 'there'}! 🍽️

📦 Order #${data.orderNumber}
✨ Delivered by: ${data.deliveryPartner || 'Our partner'}
⏰ Delivered at: ${data.deliveredAt || 'Just now'}

How was your experience? 
Rate your order: ${process.env.APP_BASE_URL}/rate/${data.orderId}

Thanks for choosing QuickBite! ❤️`;
  }

  createOrderCancelledMessage(notification) {
    const data = notification.data;
    return `❌ *Order Cancelled*

Hi ${data.userName || 'there'},

Unfortunately, your order has been cancelled.

📦 Order #${data.orderNumber}
💰 Amount: ₹${(data.refundAmount || 0) / 100}
📝 Reason: ${data.reason || 'Restaurant unavailable'}

💳 *Refund Details:*
${data.refundDetails || 'Refund will be processed within 3-5 business days to your original payment method.'}

We apologize for the inconvenience. 🙏`;
  }

  createOrderDelayedMessage(notification) {
    const data = notification.data;
    return `⏰ *Order Delayed - We're Sorry!*

Hi ${data.userName || 'there'},

We sincerely apologize for the delay in your order.

📦 Order #${data.orderNumber}
⏱️ Additional delay: ${data.delayMinutes || '15'} minutes
📝 Reason: ${data.reason || 'High demand'}

🎁 *Compensation:*
${data.compensation || 'We\'ve added bonus loyalty points to your account as an apology.'}

Thank you for your patience! 🙏`;
  }

  createPaymentSuccessMessage(notification) {
    const data = notification.data;
    return `💳 *Payment Successful!*

Hi ${data.userName || 'there'},

Your payment has been processed successfully! ✅

📦 Order #${data.orderNumber}
💰 Amount Paid: ₹${(data.amount || 0) / 100}
🆔 Transaction ID: ${data.transactionId}
💳 Payment Method: ${data.paymentMethod || 'Card'}

Your order is now confirmed and being processed! 🚀`;
  }

  createPaymentFailedMessage(notification) {
    const data = notification.data;
    return `❌ *Payment Failed*

Hi ${data.userName || 'there'},

We couldn't process your payment for order #${data.orderNumber}.

💰 Amount: ₹${(data.amount || 0) / 100}
📝 Reason: ${data.failureReason || 'Payment declined'}

🔄 *Retry Payment:*
${process.env.APP_BASE_URL}/payment/${data.orderId}

Try using a different payment method or contact your bank. 💳`;
  }

  createPromotionalMessage(notification) {
    const data = notification.data;
    return `🎉 *${notification.title}*

${notification.message}

🎫 *Promo Code:* ${data.promoCode}
💰 *Discount:* ${data.discount}% OFF
⏰ *Valid Till:* ${data.validTill}

Order now and save big! 🛒
${process.env.APP_BASE_URL}/order

*T&C Apply`;
  }

  createLoyaltyRewardMessage(notification) {
    const data = notification.data;
    return `🏆 *Loyalty Points Earned!*

Congratulations ${data.userName || 'there'}! 🎉

✨ Points Earned: +${data.points || 0}
💎 Total Points: ${data.totalPoints || 0}
🎁 Next Reward at: ${data.nextRewardAt || '1000'} points

Redeem your points: ${process.env.APP_BASE_URL}/rewards

Keep ordering to earn more rewards! 🚀`;
  }

  createReferralBonusMessage(notification) {
    const data = notification.data;
    return `🎁 *Referral Bonus Credited!*

Great news ${data.userName || 'there'}! 

💰 ₹${(data.bonusAmount || 0) / 100} has been added to your wallet!

👥 Friend referred: ${data.referredUser || 'Your friend'}
💳 Current wallet balance: ₹${(data.walletBalance || 0) / 100}

Refer more friends and earn more rewards! 🔥
Share your referral code: ${data.referralCode}`;
  }

  createDeliveryAssignedMessage(notification) {
    const data = notification.data;
    return `🚚 *Delivery Partner Assigned*

Hi ${data.userName || 'there'}!

Your delivery partner is ready! 👨‍🚚

📦 Order #${data.orderNumber}
👤 Partner: ${data.deliveryPartner}
📞 Contact: ${data.deliveryPhone}
⭐ Rating: ${data.deliveryRating || 'N/A'} stars

They'll pick up your order soon! 🏃‍♂️`;
  }

  createDeliveryArrivedMessage(notification) {
    const data = notification.data;
    return `🚪 *Delivery Partner Has Arrived!*

${data.userName || 'Hello'}! Your food is here! 🎉

📦 Order #${data.orderNumber}
👤 Partner: ${data.deliveryPartner}
📞 Contact: ${data.deliveryPhone}

Please collect your order and enjoy your meal! 🍽️✨`;
  }

  createGenericMessage(notification) {
    return `🔔 *QuickBite Notification*

${notification.title}

${notification.message}

Thank you for using QuickBite! 🚀`;
  }

  formatWhatsAppNumber(phone) {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Add country code if missing (assuming India +91)
    if (cleaned.length === 10) {
      return 'whatsapp:+91' + cleaned;
    }
    
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return 'whatsapp:+' + cleaned;
    }
    
    if (cleaned.length === 13 && cleaned.startsWith('091')) {
      return 'whatsapp:+' + cleaned.substring(1);
    }
    
    // Return formatted
    return phone.startsWith('whatsapp:') ? phone : 'whatsapp:+' + cleaned;
  }

  async hasOptedIn(phoneNumber) {
    try {
      const { pool } = require('../config/database');
      
      const query = `
        SELECT whatsapp_enabled
        FROM user_notification_preferences
        WHERE phone = $1
      `;

      const result = await pool.query(query, [this.formatPhoneNumber(phoneNumber)]);
      
      if (result.rows.length === 0) {
        return false; // Not opted in by default
      }

      return result.rows[0].whatsapp_enabled === true;
    } catch (error) {
      console.error('Error checking WhatsApp opt-in status:', error);
      return false; // Default to not opted in on error
    }
  }

  formatPhoneNumber(phone) {
    // Remove whatsapp: prefix if present
    const cleaned = phone.replace(/whatsapp:/, '').replace(/\D/g, '');
    
    // Add country code if missing (assuming India +91)
    if (cleaned.length === 10) {
      return '+91' + cleaned;
    }
    
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return '+' + cleaned;
    }
    
    return '+' + cleaned;
  }

  async sendBulkWhatsApp(notifications) {
    const results = [];
    const batchSize = 30; // WhatsApp batch limit (more conservative)
    
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      const batchPromises = batch.map(async (item) => {
        try {
          const { notification, recipient } = item;
          return await this.sendWhatsApp(notification, recipient);
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
        await new Promise(resolve => setTimeout(resolve, 2000));
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
        'read': 'DELIVERED',
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
      console.error('Error handling WhatsApp status callback:', error);
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
      console.error('Error logging WhatsApp delivery:', error);
    }
  }

  async testWhatsAppService(phoneNumber) {
    try {
      if (!this.initialized) {
        throw new Error('WhatsApp service not initialized');
      }

      if (!await this.hasOptedIn(phoneNumber)) {
        throw new Error('Phone number has not opted in for WhatsApp notifications');
      }

      const testNotification = {
        id: 'test-' + Date.now(),
        type: 'CUSTOM_MESSAGE',
        title: 'Test WhatsApp Message',
        message: 'This is a test WhatsApp message from QuickBite notification service.',
        data: {
          userName: 'Test User'
        }
      };

      const result = await this.sendWhatsApp(testNotification, { phone: phoneNumber });

      return {
        success: true,
        message: 'Test WhatsApp message sent successfully',
        messageSid: result.messageSid
      };
    } catch (error) {
      console.error('WhatsApp service test failed:', error);
      throw error;
    }
  }

  async getWhatsAppAnalytics(startDate, endDate) {
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
        WHERE channel = 'WHATSAPP'
        AND sent_at BETWEEN $1 AND $2
        GROUP BY DATE(sent_at)
        ORDER BY date DESC
      `;

      const result = await pool.query(query, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error('Error getting WhatsApp analytics:', error);
      throw error;
    }
  }

  // Opt-in management
  async enableWhatsAppForUser(userId, phoneNumber) {
    try {
      const { pool } = require('../config/database');
      
      const query = `
        INSERT INTO user_notification_preferences (
          user_id, phone, whatsapp_enabled, updated_at
        ) VALUES ($1, $2, true, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) 
        DO UPDATE SET whatsapp_enabled = true, phone = $2, updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await pool.query(query, [userId, this.formatPhoneNumber(phoneNumber)]);
      return result.rows[0];
    } catch (error) {
      console.error('Error enabling WhatsApp for user:', error);
      throw error;
    }
  }

  async disableWhatsAppForUser(userId) {
    try {
      const { pool } = require('../config/database');
      
      const query = `
        UPDATE user_notification_preferences 
        SET whatsapp_enabled = false, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error disabling WhatsApp for user:', error);
      throw error;
    }
  }
}

module.exports = WhatsAppService;