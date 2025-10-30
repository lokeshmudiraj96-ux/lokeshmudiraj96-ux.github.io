const NotificationService = require('../services/notification.service');
const { Notification } = require('../models/notification.model');
const { UserNotificationPreferences, NotificationTemplate, NotificationCampaign } = require('../models/template.model');

class NotificationController {
  constructor() {
    this.notificationService = new NotificationService();
  }

  // Send single notification
  async sendNotification(req, res) {
    try {
      const {
        type,
        title,
        message,
        data = {},
        priority = 'MEDIUM',
        channels = ['WEBSOCKET', 'PUSH'],
        recipientId,
        templateId,
        immediate = false,
        scheduledAt
      } = req.body;

      // Validate required fields
      if (!type || !title || !message) {
        return res.status(400).json({
          error: 'Missing required fields: type, title, message'
        });
      }

      if (!recipientId) {
        return res.status(400).json({
          error: 'recipientId is required'
        });
      }

      // Get recipient data
      const recipient = await this.notificationService.getRecipientData(recipientId);

      const notificationData = {
        type,
        title,
        message,
        data,
        priority,
        templateId,
        userId: recipientId
      };

      let result;

      if (scheduledAt) {
        // Schedule notification
        result = await this.notificationService.scheduleNotification(
          notificationData,
          recipient,
          scheduledAt,
          { channels }
        );
      } else {
        // Send immediately or queue
        result = await this.notificationService.sendNotification(
          notificationData,
          recipient,
          { channels, immediate }
        );
      }

      res.json({
        success: true,
        message: scheduledAt ? 'Notification scheduled successfully' : 'Notification sent successfully',
        data: result
      });
    } catch (error) {
      console.error('Error in sendNotification:', error);
      res.status(500).json({
        error: 'Failed to send notification',
        details: error.message
      });
    }
  }

  // Send bulk notifications
  async sendBulkNotification(req, res) {
    try {
      const {
        type,
        title,
        message,
        data = {},
        priority = 'MEDIUM',
        channels = ['PUSH', 'EMAIL'],
        recipients,
        templateId,
        batchSize = 100,
        scheduledAt
      } = req.body;

      // Validate required fields
      if (!type || !title || !message) {
        return res.status(400).json({
          error: 'Missing required fields: type, title, message'
        });
      }

      if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({
          error: 'Recipients array is required and must not be empty'
        });
      }

      const notificationData = {
        type,
        title,
        message,
        data,
        priority,
        templateId
      };

      const result = await this.notificationService.sendBulkNotification(
        notificationData,
        recipients,
        { channels, batchSize, delay: scheduledAt ? new Date(scheduledAt) - new Date() : 0 }
      );

      res.json({
        success: true,
        message: 'Bulk notification initiated successfully',
        data: result
      });
    } catch (error) {
      console.error('Error in sendBulkNotification:', error);
      res.status(500).json({
        error: 'Failed to send bulk notification',
        details: error.message
      });
    }
  }

  // Get user notifications
  async getUserNotifications(req, res) {
    try {
      const userId = req.params.userId || req.user?.id;
      const {
        limit = 20,
        offset = 0,
        status,
        type,
        unreadOnly = false
      } = req.query;

      if (!userId) {
        return res.status(400).json({
          error: 'User ID is required'
        });
      }

      let filters = { userId };
      
      if (status) filters.status = status;
      if (type) filters.type = type;
      if (unreadOnly === 'true') filters.isRead = false;

      const notifications = await Notification.getForUser(
        userId,
        parseInt(limit),
        parseInt(offset),
        filters
      );

      const total = await Notification.countForUser(userId, filters);
      const unreadCount = await Notification.getUnreadCount(userId);

      res.json({
        success: true,
        data: {
          notifications,
          pagination: {
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: (parseInt(offset) + parseInt(limit)) < total
          },
          unreadCount
        }
      });
    } catch (error) {
      console.error('Error in getUserNotifications:', error);
      res.status(500).json({
        error: 'Failed to get notifications',
        details: error.message
      });
    }
  }

  // Mark notification as read
  async markNotificationRead(req, res) {
    try {
      const { notificationId } = req.params;
      const userId = req.user?.id;

      if (!notificationId) {
        return res.status(400).json({
          error: 'Notification ID is required'
        });
      }

      const notification = await Notification.findById(notificationId);

      if (!notification) {
        return res.status(404).json({
          error: 'Notification not found'
        });
      }

      // Check if user owns this notification
      if (userId && notification.userId !== userId) {
        return res.status(403).json({
          error: 'Unauthorized to access this notification'
        });
      }

      await notification.markAsRead();

      res.json({
        success: true,
        message: 'Notification marked as read',
        data: { notificationId, readAt: new Date() }
      });
    } catch (error) {
      console.error('Error in markNotificationRead:', error);
      res.status(500).json({
        error: 'Failed to mark notification as read',
        details: error.message
      });
    }
  }

  // Send order notification (specific to order events)
  async sendOrderNotification(req, res) {
    try {
      const {
        orderId,
        orderNumber,
        userId,
        type,
        status,
        restaurantName,
        deliveryPartner,
        estimatedDelivery,
        totalAmount,
        channels = ['WEBSOCKET', 'PUSH', 'SMS']
      } = req.body;

      if (!orderId || !userId || !type) {
        return res.status(400).json({
          error: 'Missing required fields: orderId, userId, type'
        });
      }

      const orderData = {
        orderId,
        orderNumber,
        status,
        restaurantName,
        deliveryPartner,
        estimatedDelivery,
        totalAmount
      };

      // Map order status to notification message
      const notificationMap = {
        'ORDER_PLACED': {
          title: 'Order Placed Successfully',
          message: `Your order #${orderNumber} has been placed successfully.`
        },
        'ORDER_CONFIRMED': {
          title: 'Order Confirmed',
          message: `${restaurantName} has confirmed your order #${orderNumber}.`
        },
        'ORDER_PREPARING': {
          title: 'Order Being Prepared',
          message: `${restaurantName} is now preparing your order.`
        },
        'ORDER_READY': {
          title: 'Order Ready',
          message: `Your order #${orderNumber} is ready for pickup.`
        },
        'ORDER_OUT_FOR_DELIVERY': {
          title: 'Order Out for Delivery',
          message: `Your order is on the way! Delivered by ${deliveryPartner}.`
        },
        'ORDER_DELIVERED': {
          title: 'Order Delivered',
          message: `Your order #${orderNumber} has been delivered successfully.`
        },
        'ORDER_CANCELLED': {
          title: 'Order Cancelled',
          message: `Your order #${orderNumber} has been cancelled.`
        }
      };

      const notification = notificationMap[type];
      if (!notification) {
        return res.status(400).json({
          error: 'Invalid notification type for order'
        });
      }

      const recipient = await this.notificationService.getRecipientData(userId);

      const notificationData = {
        type,
        title: notification.title,
        message: notification.message,
        data: orderData,
        priority: ['ORDER_CANCELLED', 'ORDER_DELIVERED'].includes(type) ? 'HIGH' : 'MEDIUM'
      };

      // Also send real-time order update via WebSocket
      if (this.notificationService.webSocketService.initialized) {
        await this.notificationService.webSocketService.sendOrderUpdate(
          orderId,
          orderData,
          'STATUS_CHANGED'
        );
      }

      const result = await this.notificationService.sendNotification(
        notificationData,
        recipient,
        { channels, immediate: true }
      );

      res.json({
        success: true,
        message: 'Order notification sent successfully',
        data: result
      });
    } catch (error) {
      console.error('Error in sendOrderNotification:', error);
      res.status(500).json({
        error: 'Failed to send order notification',
        details: error.message
      });
    }
  }

  // Test notification service
  async testNotification(req, res) {
    try {
      const { userId, channels = ['WEBSOCKET'] } = req.body;

      if (!userId) {
        return res.status(400).json({
          error: 'User ID is required for testing'
        });
      }

      const result = await this.notificationService.testNotificationService(userId, channels);

      res.json({
        success: true,
        message: 'Test notification sent successfully',
        data: result
      });
    } catch (error) {
      console.error('Error in testNotification:', error);
      res.status(500).json({
        error: 'Failed to send test notification',
        details: error.message
      });
    }
  }

  // Legacy compatibility methods
  async send(req, res) {
    // Map legacy format to new format
    const legacyToNew = {
      user_id: req.body.user_id,
      type: 'CUSTOM_MESSAGE',
      title: req.body.title,
      message: req.body.message,
      data: { order_id: req.body.order_id },
      priority: req.body.priority || 'MEDIUM',
      channels: [req.body.type || 'PUSH'],
      recipientId: req.body.user_id
    };

    req.body = legacyToNew;
    return this.sendNotification(req, res);
  }

  async status(req, res) {
    try {
      const id = req.params.notification_id;
      const notification = await Notification.findById(id);
      
      if (!notification) {
        return res.status(404).json({ 
          success: false, 
          message: 'Notification not found' 
        });
      }

      return res.json({ 
        notification_id: notification.id, 
        status: notification.status, 
        timestamp_sent: notification.sentAt 
      });
    } catch (error) {
      console.error('get notification status failed', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Internal error' 
      });
    }
  }

  async retry(req, res) {
    try {
      const id = req.params.notification_id;
      const notification = await Notification.findById(id);
      
      if (!notification) {
        return res.status(404).json({ 
          success: false, 
          message: 'Notification not found' 
        });
      }

      if (notification.status !== 'FAILED') {
        return res.status(400).json({ 
          success: false, 
          message: 'Only FAILED notifications can be retried' 
        });
      }

      // Retry logic would go here
      const result = await this.notificationService.sendNotification(
        notification,
        { userId: notification.userId },
        { immediate: true }
      );

      return res.json({ 
        notification_id: id, 
        status: result.success ? 'SENT' : 'FAILED',
        result
      });
    } catch (error) {
      console.error('retry notification failed', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Internal error' 
      });
    }
  }
}

module.exports = new NotificationController();
