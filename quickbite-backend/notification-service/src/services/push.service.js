const webpush = require('web-push');
const admin = require('firebase-admin');
const { NOTIFICATION_CHANNELS, NOTIFICATION_STATUS } = require('../models/notification.model');

class PushNotificationService {
  constructor() {
    this.webPushConfigured = false;
    this.firebaseConfigured = false;
    this.initializeServices();
  }

  initializeServices() {
    try {
      // Initialize Web Push
      const vapidPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC;
      const vapidPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE;
      const vapidContact = process.env.WEB_PUSH_CONTACT || 'mailto:admin@quickbite.app';

      if (vapidPublicKey && vapidPrivateKey) {
        webpush.setVapidDetails(vapidContact, vapidPublicKey, vapidPrivateKey);
        this.webPushConfigured = true;
        console.log('✅ Web Push configured');
      }

      // Initialize Firebase Admin
      const firebaseConfig = process.env.FIREBASE_CONFIG;
      if (firebaseConfig) {
        const serviceAccount = JSON.parse(firebaseConfig);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        this.firebaseConfigured = true;
        console.log('✅ Firebase Admin configured');
      }
    } catch (error) {
      console.error('❌ Error initializing push services:', error);
    }
  }

  async sendPushNotification(notification, subscription) {
    try {
      const payload = {
        notification: {
          title: notification.title,
          body: notification.message,
          icon: '/icons/app-icon-192.png',
          badge: '/icons/app-badge-72.png',
          data: {
            notificationId: notification.id,
            type: notification.type,
            ...notification.data
          },
          actions: this.getNotificationActions(notification.type),
          requireInteraction: notification.priority === 'HIGH' || notification.priority === 'URGENT',
          tag: `${notification.type}-${notification.userId}`,
          renotify: true,
          timestamp: Date.now()
        }
      };

      let result;

      if (subscription.endpoint.includes('fcm.googleapis.com') && this.firebaseConfigured) {
        // Use Firebase for FCM endpoints
        result = await this.sendFirebaseNotification(payload, subscription);
      } else if (this.webPushConfigured) {
        // Use Web Push for other endpoints
        result = await this.sendWebPushNotification(payload, subscription);
      } else {
        throw new Error('No push service configured');
      }

      // Log delivery
      await this.logDelivery(notification.id, 'PUSH', 'SENT', result);

      return {
        success: true,
        messageId: result.messageId || result.id,
        endpoint: subscription.endpoint
      };
    } catch (error) {
      console.error('Error sending push notification:', error);
      
      // Log failure
      await this.logDelivery(notification.id, 'PUSH', 'FAILED', null, error.message);

      // Handle specific error cases
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Subscription expired or invalid
        await this.removeInvalidSubscription(subscription);
      }

      throw error;
    }
  }

  async sendFirebaseNotification(payload, subscription) {
    try {
      const message = {
        token: this.extractTokenFromEndpoint(subscription.endpoint),
        notification: payload.notification,
        data: this.convertToStringData(payload.notification.data),
        android: {
          priority: 'high',
          notification: {
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              contentAvailable: true
            }
          }
        },
        webpush: {
          headers: {
            Urgency: 'high'
          },
          notification: payload.notification
        }
      };

      const response = await admin.messaging().send(message);
      return { messageId: response, provider: 'firebase' };
    } catch (error) {
      console.error('Firebase notification error:', error);
      throw error;
    }
  }

  async sendWebPushNotification(payload, subscription) {
    try {
      const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh_key,
          auth: subscription.auth_key
        }
      };

      const options = {
        TTL: 24 * 60 * 60, // 24 hours
        urgency: this.getUrgencyFromPriority(payload.notification.priority),
        headers: {
          'Content-Encoding': 'gzip'
        }
      };

      const response = await webpush.sendNotification(
        pushSubscription, 
        JSON.stringify(payload),
        options
      );

      return { 
        id: response.headers?.location || 'webpush-sent',
        provider: 'webpush',
        statusCode: response.statusCode
      };
    } catch (error) {
      console.error('Web Push notification error:', error);
      throw error;
    }
  }

  async getUserSubscriptions(userId) {
    try {
      const { pool } = require('../config/database');
      
      const query = `
        SELECT * FROM notification_subscriptions 
        WHERE user_id = $1 AND is_active = true
        ORDER BY created_at DESC
      `;

      const result = await pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      console.error('Error getting user subscriptions:', error);
      throw error;
    }
  }

  async addSubscription(userId, subscription) {
    try {
      const { pool } = require('../config/database');
      const { v4: uuidv4 } = require('uuid');

      const query = `
        INSERT INTO notification_subscriptions (
          id, user_id, endpoint, p256dh_key, auth_key, device_type, browser
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id, endpoint) 
        DO UPDATE SET 
          p256dh_key = EXCLUDED.p256dh_key,
          auth_key = EXCLUDED.auth_key,
          is_active = true,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const values = [
        uuidv4(),
        userId,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        subscription.deviceType || 'unknown',
        subscription.browser || 'unknown'
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error adding subscription:', error);
      throw error;
    }
  }

  async removeSubscription(userId, endpoint) {
    try {
      const { pool } = require('../config/database');

      const query = `
        UPDATE notification_subscriptions 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND endpoint = $2
        RETURNING *
      `;

      const result = await pool.query(query, [userId, endpoint]);
      return result.rows[0];
    } catch (error) {
      console.error('Error removing subscription:', error);
      throw error;
    }
  }

  async removeInvalidSubscription(subscription) {
    try {
      const { pool } = require('../config/database');

      const query = `
        UPDATE notification_subscriptions 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE endpoint = $1
      `;

      await pool.query(query, [subscription.endpoint]);
    } catch (error) {
      console.error('Error removing invalid subscription:', error);
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
      console.error('Error logging delivery:', error);
    }
  }

  getNotificationActions(notificationType) {
    const actionMap = {
      'ORDER_PLACED': [
        { action: 'view-order', title: 'View Order' },
        { action: 'track-order', title: 'Track Order' }
      ],
      'ORDER_READY': [
        { action: 'view-order', title: 'View Order' },
        { action: 'call-restaurant', title: 'Call Restaurant' }
      ],
      'ORDER_OUT_FOR_DELIVERY': [
        { action: 'track-delivery', title: 'Track Delivery' },
        { action: 'call-delivery', title: 'Call Delivery Partner' }
      ],
      'PROMOTIONAL_OFFER': [
        { action: 'view-offer', title: 'View Offer' },
        { action: 'order-now', title: 'Order Now' }
      ],
      'LOYALTY_REWARD': [
        { action: 'view-rewards', title: 'View Rewards' },
        { action: 'redeem-points', title: 'Redeem Points' }
      ]
    };

    return actionMap[notificationType] || [
      { action: 'view', title: 'View' }
    ];
  }

  getUrgencyFromPriority(priority) {
    const urgencyMap = {
      'CRITICAL': 'high',
      'URGENT': 'high',
      'HIGH': 'normal',
      'MEDIUM': 'normal',
      'LOW': 'low'
    };
    return urgencyMap[priority] || 'normal';
  }

  extractTokenFromEndpoint(endpoint) {
    // Extract FCM token from endpoint
    const matches = endpoint.match(/\/fcm\/send\/(.+)$/);
    return matches ? matches[1] : endpoint;
  }

  convertToStringData(data) {
    // Firebase requires data values to be strings
    const stringData = {};
    for (const [key, value] of Object.entries(data || {})) {
      stringData[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return stringData;
  }

  // Method to send bulk notifications
  async sendBulkNotifications(notifications) {
    const results = [];
    const batchSize = 500; // FCM batch limit

    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      const batchPromises = batch.map(async (item) => {
        try {
          const { notification, subscription } = item;
          return await this.sendPushNotification(notification, subscription);
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
    }

    return results;
  }

  // Method to test push notification setup
  async testPushNotification(userId) {
    try {
      const subscriptions = await this.getUserSubscriptions(userId);
      
      if (subscriptions.length === 0) {
        throw new Error('No active subscriptions found for user');
      }

      const testNotification = {
        id: 'test-' + Date.now(),
        userId: userId,
        type: 'CUSTOM_MESSAGE',
        title: 'QuickBite Test Notification',
        message: 'This is a test notification to verify push notifications are working correctly.',
        data: { test: true },
        priority: 'MEDIUM'
      };

      const results = await Promise.all(
        subscriptions.map(sub => this.sendPushNotification(testNotification, sub))
      );

      return {
        success: true,
        message: `Test notification sent to ${results.length} device(s)`,
        results
      };
    } catch (error) {
      console.error('Error testing push notification:', error);
      throw error;
    }
  }
}

module.exports = PushNotificationService;