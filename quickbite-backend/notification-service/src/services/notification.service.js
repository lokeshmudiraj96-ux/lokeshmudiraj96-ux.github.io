const PushService = require('./push.service');
const EmailService = require('./email.service');
const SMSService = require('./sms.service');
const WhatsAppService = require('./whatsapp.service');
const WebSocketService = require('./websocket.service');
const { Notification, NOTIFICATION_CHANNELS, NOTIFICATION_PRIORITIES } = require('../models/notification.model');
const { UserNotificationPreferences } = require('../models/template.model');
const Queue = require('bull');

class NotificationService {
  constructor() {
    this.pushService = new PushService();
    this.emailService = new EmailService();
    this.smsService = new SMSService();
    this.whatsAppService = new WhatsAppService();
    this.webSocketService = new WebSocketService();
    
    // Initialize job queues
    this.notificationQueue = new Queue('notification queue', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD
      }
    });

    this.setupQueueProcessors();
  }

  initializeWebSocket(server) {
    this.webSocketService.initialize(server);
    this.webSocketService.startCleanupInterval();
  }

  setupQueueProcessors() {
    // Process immediate notifications
    this.notificationQueue.process('send_notification', async (job) => {
      const { notification, recipient, channels } = job.data;
      return await this.processNotification(notification, recipient, channels);
    });

    // Process bulk notifications
    this.notificationQueue.process('send_bulk_notification', async (job) => {
      const { notification, recipients, channels } = job.data;
      return await this.processBulkNotification(notification, recipients, channels);
    });

    // Process scheduled notifications
    this.notificationQueue.process('send_scheduled_notification', async (job) => {
      const { notificationId } = job.data;
      return await this.processScheduledNotification(notificationId);
    });
  }

  async sendNotification(notificationData, recipientData, options = {}) {
    try {
      // Create notification record
      const notification = await Notification.create({
        ...notificationData,
        userId: recipientData.userId,
        status: 'PENDING'
      });

      // Get user preferences
      const preferences = await UserNotificationPreferences.getByUserId(recipientData.userId);
      
      // Determine delivery channels
      const channels = await this.determineChannels(notification, preferences, options.channels);

      // Check if notification should be sent immediately or queued
      if (options.immediate || notification.priority === NOTIFICATION_PRIORITIES.HIGH) {
        return await this.processNotification(notification, recipientData, channels);
      } else {
        // Queue for processing
        await this.notificationQueue.add('send_notification', {
          notification: notification.toJSON(),
          recipient: recipientData,
          channels
        }, {
          priority: this.getPriority(notification.priority),
          delay: options.delay || 0
        });

        return {
          success: true,
          notificationId: notification.id,
          queued: true,
          channels
        };
      }
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }

  async sendBulkNotification(notificationData, recipients, options = {}) {
    try {
      // Create base notification
      const baseNotification = {
        ...notificationData,
        status: 'PENDING'
      };

      // Process in batches
      const batchSize = options.batchSize || 100;
      const results = [];

      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        
        // Create notifications for this batch
        const batchNotifications = await Promise.all(
          batch.map(recipient => 
            Notification.create({
              ...baseNotification,
              userId: recipient.userId,
              data: {
                ...baseNotification.data,
                ...recipient.personalData // Personalization data
              }
            })
          )
        );

        // Queue batch for processing
        await this.notificationQueue.add('send_bulk_notification', {
          notification: baseNotification,
          recipients: batch,
          channels: options.channels || ['PUSH', 'EMAIL']
        }, {
          priority: this.getPriority(baseNotification.priority),
          delay: options.delay || 0
        });

        results.push({
          batchIndex: Math.floor(i / batchSize),
          count: batch.length,
          notifications: batchNotifications.map(n => n.id)
        });

        // Rate limiting between batches
        if (i + batchSize < recipients.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return {
        success: true,
        totalRecipients: recipients.length,
        batches: results.length,
        results
      };
    } catch (error) {
      console.error('Error sending bulk notification:', error);
      throw error;
    }
  }

  async scheduleNotification(notificationData, recipientData, scheduledAt, options = {}) {
    try {
      // Create notification with scheduled status
      const notification = await Notification.create({
        ...notificationData,
        userId: recipientData.userId,
        status: 'SCHEDULED',
        scheduledAt: new Date(scheduledAt)
      });

      // Calculate delay
      const delay = new Date(scheduledAt) - new Date();
      
      if (delay <= 0) {
        throw new Error('Scheduled time must be in the future');
      }

      // Queue for future processing
      await this.notificationQueue.add('send_scheduled_notification', {
        notificationId: notification.id
      }, {
        delay,
        priority: this.getPriority(notification.priority)
      });

      return {
        success: true,
        notificationId: notification.id,
        scheduledAt: scheduledAt,
        delay: delay
      };
    } catch (error) {
      console.error('Error scheduling notification:', error);
      throw error;
    }
  }

  async processNotification(notification, recipient, channels) {
    const results = {};
    const promises = [];

    // Send via each channel
    if (channels.includes('WEBSOCKET')) {
      promises.push(
        this.webSocketService.sendToUser(recipient.userId, notification)
          .then(result => { results.WEBSOCKET = { success: result }; })
          .catch(error => { results.WEBSOCKET = { success: false, error: error.message }; })
      );
    }

    if (channels.includes('PUSH')) {
      promises.push(
        this.pushService.sendPushNotification(notification, recipient)
          .then(result => { results.PUSH = result; })
          .catch(error => { results.PUSH = { success: false, error: error.message }; })
      );
    }

    if (channels.includes('EMAIL')) {
      promises.push(
        this.emailService.sendEmail(notification, recipient)
          .then(result => { results.EMAIL = result; })
          .catch(error => { results.EMAIL = { success: false, error: error.message }; })
      );
    }

    if (channels.includes('SMS')) {
      promises.push(
        this.smsService.sendSMS(notification, recipient)
          .then(result => { results.SMS = result; })
          .catch(error => { results.SMS = { success: false, error: error.message }; })
      );
    }

    if (channels.includes('WHATSAPP')) {
      promises.push(
        this.whatsAppService.sendWhatsApp(notification, recipient)
          .then(result => { results.WHATSAPP = result; })
          .catch(error => { results.WHATSAPP = { success: false, error: error.message }; })
      );
    }

    // Wait for all channels to complete
    await Promise.all(promises);

    // Update notification status based on results
    const successfulChannels = Object.keys(results).filter(
      channel => results[channel].success
    );

    if (successfulChannels.length > 0) {
      await notification.updateStatus('SENT');
      
      // Check if any channel delivered
      const deliveredChannels = Object.keys(results).filter(
        channel => results[channel].success && results[channel].status === 'DELIVERED'
      );
      
      if (deliveredChannels.length > 0) {
        await notification.updateStatus('DELIVERED');
      }
    } else {
      await notification.updateStatus('FAILED');
    }

    return {
      success: successfulChannels.length > 0,
      notificationId: notification.id,
      channels: results,
      successfulChannels: successfulChannels.length,
      totalChannels: channels.length
    };
  }

  async processBulkNotification(notificationData, recipients, channels) {
    const results = [];

    // Group recipients by channel preferences if needed
    const recipientsByChannel = {};
    channels.forEach(channel => {
      recipientsByChannel[channel] = [];
    });

    // Add all recipients to each channel for now (can be optimized based on preferences)
    recipients.forEach(recipient => {
      channels.forEach(channel => {
        recipientsByChannel[channel].push(recipient);
      });
    });

    // Send via each channel
    if (recipientsByChannel.PUSH?.length > 0) {
      try {
        const pushResults = await this.pushService.sendBulkPushNotification(
          recipientsByChannel.PUSH.map(r => ({
            notification: { ...notificationData, userId: r.userId },
            recipient: r
          }))
        );
        results.push({ channel: 'PUSH', results: pushResults });
      } catch (error) {
        console.error('Bulk push notification error:', error);
      }
    }

    if (recipientsByChannel.EMAIL?.length > 0) {
      try {
        const emailResults = await this.emailService.sendBulkEmail(
          recipientsByChannel.EMAIL.map(r => ({
            notification: { ...notificationData, userId: r.userId },
            recipient: r
          }))
        );
        results.push({ channel: 'EMAIL', results: emailResults });
      } catch (error) {
        console.error('Bulk email notification error:', error);
      }
    }

    if (recipientsByChannel.SMS?.length > 0) {
      try {
        const smsResults = await this.smsService.sendBulkSMS(
          recipientsByChannel.SMS.map(r => ({
            notification: { ...notificationData, userId: r.userId },
            recipient: r
          }))
        );
        results.push({ channel: 'SMS', results: smsResults });
      } catch (error) {
        console.error('Bulk SMS notification error:', error);
      }
    }

    if (recipientsByChannel.WHATSAPP?.length > 0) {
      try {
        const whatsappResults = await this.whatsAppService.sendBulkWhatsApp(
          recipientsByChannel.WHATSAPP.map(r => ({
            notification: { ...notificationData, userId: r.userId },
            recipient: r
          }))
        );
        results.push({ channel: 'WHATSAPP', results: whatsappResults });
      } catch (error) {
        console.error('Bulk WhatsApp notification error:', error);
      }
    }

    return {
      success: true,
      totalRecipients: recipients.length,
      results
    };
  }

  async processScheduledNotification(notificationId) {
    try {
      const notification = await Notification.findById(notificationId);
      
      if (!notification) {
        throw new Error('Scheduled notification not found');
      }

      if (notification.status !== 'SCHEDULED') {
        throw new Error('Notification is not in scheduled status');
      }

      // Get recipient data
      const recipient = await this.getRecipientData(notification.userId);
      
      // Get user preferences
      const preferences = await UserNotificationPreferences.getByUserId(notification.userId);
      
      // Determine channels
      const channels = await this.determineChannels(notification, preferences);

      // Process the notification
      return await this.processNotification(notification, recipient, channels);
    } catch (error) {
      console.error('Error processing scheduled notification:', error);
      throw error;
    }
  }

  async determineChannels(notification, preferences, requestedChannels = null) {
    const availableChannels = Object.values(NOTIFICATION_CHANNELS);
    let channels = [];

    if (requestedChannels) {
      // Use requested channels if provided
      channels = requestedChannels.filter(c => availableChannels.includes(c));
    } else {
      // Use default channels based on notification type and priority
      channels = this.getDefaultChannels(notification.type, notification.priority);
    }

    // Filter by user preferences
    if (preferences) {
      channels = channels.filter(channel => {
        switch (channel) {
          case 'PUSH':
            return preferences.pushEnabled;
          case 'EMAIL':
            return preferences.emailEnabled;
          case 'SMS':
            return preferences.smsEnabled;
          case 'WHATSAPP':
            return preferences.whatsappEnabled;
          case 'WEBSOCKET':
            return preferences.inAppEnabled;
          default:
            return true;
        }
      });

      // Check quiet hours
      if (preferences.quietHoursEnabled && this.isQuietTime(preferences)) {
        // Only allow high priority notifications during quiet hours
        if (notification.priority !== NOTIFICATION_PRIORITIES.HIGH) {
          channels = channels.filter(c => c === 'WEBSOCKET' || c === 'EMAIL');
        }
      }
    }

    // Ensure at least one channel is available
    if (channels.length === 0) {
      channels = ['WEBSOCKET']; // Fallback to in-app notification
    }

    return channels;
  }

  getDefaultChannels(notificationType, priority) {
    const defaultChannelMap = {
      'ORDER_PLACED': ['WEBSOCKET', 'PUSH', 'SMS'],
      'ORDER_CONFIRMED': ['WEBSOCKET', 'PUSH', 'EMAIL'],
      'ORDER_PREPARING': ['WEBSOCKET', 'PUSH'],
      'ORDER_READY': ['WEBSOCKET', 'PUSH', 'SMS'],
      'ORDER_OUT_FOR_DELIVERY': ['WEBSOCKET', 'PUSH', 'SMS'],
      'ORDER_DELIVERED': ['WEBSOCKET', 'PUSH', 'EMAIL'],
      'ORDER_CANCELLED': ['WEBSOCKET', 'PUSH', 'EMAIL', 'SMS'],
      'ORDER_DELAYED': ['WEBSOCKET', 'PUSH', 'SMS'],
      'PAYMENT_SUCCESS': ['WEBSOCKET', 'PUSH', 'EMAIL'],
      'PAYMENT_FAILED': ['WEBSOCKET', 'PUSH', 'SMS'],
      'PROMOTIONAL_OFFER': ['WEBSOCKET', 'EMAIL', 'WHATSAPP'],
      'LOYALTY_REWARD': ['WEBSOCKET', 'PUSH', 'EMAIL'],
      'REFERRAL_BONUS': ['WEBSOCKET', 'PUSH', 'EMAIL'],
      'DELIVERY_ASSIGNED': ['WEBSOCKET', 'PUSH'],
      'DELIVERY_ARRIVED': ['WEBSOCKET', 'PUSH', 'SMS']
    };

    let channels = defaultChannelMap[notificationType] || ['WEBSOCKET', 'PUSH'];

    // Add more channels for high priority notifications
    if (priority === NOTIFICATION_PRIORITIES.HIGH) {
      channels = [...new Set([...channels, 'SMS'])];
    }

    return channels;
  }

  isQuietTime(preferences) {
    if (!preferences.quietHoursEnabled) {
      return false;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const startHour = preferences.quietHoursStart || 22; // 10 PM default
    const endHour = preferences.quietHoursEnd || 8; // 8 AM default

    if (startHour < endHour) {
      return currentHour >= startHour && currentHour < endHour;
    } else {
      return currentHour >= startHour || currentHour < endHour;
    }
  }

  getPriority(notificationPriority) {
    const priorityMap = {
      [NOTIFICATION_PRIORITIES.LOW]: 10,
      [NOTIFICATION_PRIORITIES.MEDIUM]: 5,
      [NOTIFICATION_PRIORITIES.HIGH]: 1
    };
    return priorityMap[notificationPriority] || 5;
  }

  async getRecipientData(userId) {
    try {
      // This would typically fetch from user service or database
      const { pool } = require('../config/database');
      
      const query = `
        SELECT u.*, unp.phone, unp.email as notification_email
        FROM users u
        LEFT JOIN user_notification_preferences unp ON u.id = unp.user_id
        WHERE u.id = $1
      `;

      const result = await pool.query(query, [userId]);
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error getting recipient data:', error);
      throw error;
    }
  }

  // Analytics and monitoring
  async getNotificationStats(startDate, endDate) {
    try {
      const { pool } = require('../config/database');
      
      const query = `
        SELECT 
          DATE(created_at) as date,
          type,
          priority,
          status,
          COUNT(*) as count
        FROM notifications
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY DATE(created_at), type, priority, status
        ORDER BY date DESC, count DESC
      `;

      const result = await pool.query(query, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error('Error getting notification stats:', error);
      throw error;
    }
  }

  async getChannelStats(startDate, endDate) {
    try {
      const { pool } = require('../config/database');
      
      const query = `
        SELECT 
          channel,
          status,
          COUNT(*) as count,
          AVG(EXTRACT(EPOCH FROM (delivered_at - sent_at))) as avg_delivery_time_seconds
        FROM notification_delivery_logs
        WHERE sent_at BETWEEN $1 AND $2
        GROUP BY channel, status
        ORDER BY channel, count DESC
      `;

      const result = await pool.query(query, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error('Error getting channel stats:', error);
      throw error;
    }
  }

  // Test methods
  async testNotificationService(userId, channels = ['WEBSOCKET']) {
    try {
      const testNotification = {
        type: 'CUSTOM_MESSAGE',
        title: 'Test Notification',
        message: 'This is a test notification from QuickBite notification service.',
        priority: NOTIFICATION_PRIORITIES.MEDIUM,
        data: {
          testMode: true,
          timestamp: new Date()
        }
      };

      const recipient = await this.getRecipientData(userId);

      return await this.sendNotification(testNotification, recipient, {
        channels,
        immediate: true
      });
    } catch (error) {
      console.error('Notification service test failed:', error);
      throw error;
    }
  }

  // Queue management
  async getQueueStats() {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        this.notificationQueue.getWaiting(),
        this.notificationQueue.getActive(),
        this.notificationQueue.getCompleted(),
        this.notificationQueue.getFailed()
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total: waiting.length + active.length + completed.length + failed.length
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      throw error;
    }
  }

  async clearQueue() {
    try {
      await this.notificationQueue.empty();
      return { success: true, message: 'Queue cleared successfully' };
    } catch (error) {
      console.error('Error clearing queue:', error);
      throw error;
    }
  }
}

module.exports = NotificationService;