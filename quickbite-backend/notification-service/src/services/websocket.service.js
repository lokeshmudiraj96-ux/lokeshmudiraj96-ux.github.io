const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { Notification } = require('../models/notification.model');

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId mapping
    this.userSockets = new Map(); // socketId -> user info mapping
    this.initialized = false;
  }

  initialize(server) {
    try {
      this.io = socketIo(server, {
        cors: {
          origin: process.env.FRONTEND_URL || "http://localhost:3000",
          methods: ["GET", "POST"],
          credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
      });

      this.setupMiddleware();
      this.setupConnectionHandlers();
      this.initialized = true;

      console.log('✅ WebSocket service initialized');
    } catch (error) {
      console.error('❌ WebSocket service initialization failed:', error);
    }
  }

  setupMiddleware() {
    // Authentication middleware
    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        socket.userId = decoded.userId;
        socket.userType = decoded.userType || 'USER'; // USER, RESTAURANT, DELIVERY
        socket.user = decoded;

        next();
      } catch (error) {
        console.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  setupConnectionHandlers() {
    this.io.on('connection', (socket) => {
      try {
        const userId = socket.userId;
        const userType = socket.userType;

        console.log(`📱 User connected: ${userId} (${userType}) - Socket: ${socket.id}`);

        // Store user connection
        this.connectedUsers.set(userId, socket.id);
        this.userSockets.set(socket.id, {
          userId,
          userType,
          connectedAt: new Date(),
          lastActivity: new Date()
        });

        // Join user-specific room
        socket.join(`user_${userId}`);

        // Join type-specific rooms
        if (userType === 'RESTAURANT') {
          socket.join('restaurants');
          socket.join(`restaurant_${socket.user.restaurantId}`);
        } else if (userType === 'DELIVERY') {
          socket.join('delivery_partners');
          socket.join(`delivery_${userId}`);
        } else {
          socket.join('customers');
        }

        // Send welcome message
        socket.emit('connected', {
          message: 'Connected to QuickBite notifications',
          userId,
          userType,
          timestamp: new Date()
        });

        // Handle custom events
        this.handleSocketEvents(socket);

        // Handle disconnection
        socket.on('disconnect', (reason) => {
          console.log(`📱 User disconnected: ${userId} - Reason: ${reason}`);
          this.connectedUsers.delete(userId);
          this.userSockets.delete(socket.id);
        });

      } catch (error) {
        console.error('Error handling socket connection:', error);
        socket.disconnect();
      }
    });
  }

  handleSocketEvents(socket) {
    const userId = socket.userId;

    // Handle heartbeat/ping
    socket.on('ping', () => {
      const userInfo = this.userSockets.get(socket.id);
      if (userInfo) {
        userInfo.lastActivity = new Date();
      }
      socket.emit('pong', { timestamp: new Date() });
    });

    // Handle subscription to specific notification types
    socket.on('subscribe', (data) => {
      try {
        const { types, orderId, restaurantId } = data;

        if (types && Array.isArray(types)) {
          types.forEach(type => {
            socket.join(`notifications_${type}`);
          });
        }

        if (orderId) {
          socket.join(`order_${orderId}`);
        }

        if (restaurantId && socket.userType === 'RESTAURANT') {
          socket.join(`restaurant_${restaurantId}`);
        }

        socket.emit('subscribed', { 
          message: 'Subscribed successfully', 
          subscriptions: data 
        });
      } catch (error) {
        console.error('Error handling subscription:', error);
        socket.emit('error', { message: 'Subscription failed' });
      }
    });

    // Handle unsubscription
    socket.on('unsubscribe', (data) => {
      try {
        const { types, orderId, restaurantId } = data;

        if (types && Array.isArray(types)) {
          types.forEach(type => {
            socket.leave(`notifications_${type}`);
          });
        }

        if (orderId) {
          socket.leave(`order_${orderId}`);
        }

        if (restaurantId) {
          socket.leave(`restaurant_${restaurantId}`);
        }

        socket.emit('unsubscribed', { 
          message: 'Unsubscribed successfully', 
          unsubscriptions: data 
        });
      } catch (error) {
        console.error('Error handling unsubscription:', error);
        socket.emit('error', { message: 'Unsubscription failed' });
      }
    });

    // Mark notification as read
    socket.on('mark_read', async (data) => {
      try {
        const { notificationId } = data;
        const notification = await Notification.findById(notificationId);
        
        if (notification && notification.userId === userId) {
          await notification.markAsRead();
          socket.emit('notification_read', { 
            notificationId, 
            readAt: new Date() 
          });
        }
      } catch (error) {
        console.error('Error marking notification as read:', error);
        socket.emit('error', { message: 'Failed to mark notification as read' });
      }
    });

    // Get unread notification count
    socket.on('get_unread_count', async () => {
      try {
        const count = await Notification.getUnreadCount(userId);
        socket.emit('unread_count', { count });
      } catch (error) {
        console.error('Error getting unread count:', error);
        socket.emit('error', { message: 'Failed to get unread count' });
      }
    });

    // Get recent notifications
    socket.on('get_recent_notifications', async (data) => {
      try {
        const { limit = 10, offset = 0 } = data;
        const notifications = await Notification.getForUser(userId, limit, offset);
        socket.emit('recent_notifications', { notifications });
      } catch (error) {
        console.error('Error getting recent notifications:', error);
        socket.emit('error', { message: 'Failed to get recent notifications' });
      }
    });

    // Update user location (for delivery partners)
    socket.on('update_location', (data) => {
      try {
        const { latitude, longitude } = data;
        
        if (socket.userType === 'DELIVERY') {
          // Broadcast location to relevant order rooms
          socket.broadcast.emit('delivery_location_update', {
            deliveryPartnerId: userId,
            latitude,
            longitude,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error updating location:', error);
      }
    });
  }

  // Send notification to specific user
  async sendToUser(userId, notification) {
    try {
      if (!this.initialized || !this.io) {
        console.warn('WebSocket service not initialized');
        return false;
      }

      const socketId = this.connectedUsers.get(userId);
      
      if (socketId) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('notification', this.formatNotificationForWebSocket(notification));
          
          // Log successful delivery
          await this.logDelivery(notification.id, 'WEBSOCKET', 'DELIVERED', {
            socketId,
            userId
          });

          return true;
        }
      }

      // User not connected
      await this.logDelivery(notification.id, 'WEBSOCKET', 'FAILED', null, 'User not connected');
      return false;
    } catch (error) {
      console.error('Error sending WebSocket notification to user:', error);
      await this.logDelivery(notification.id, 'WEBSOCKET', 'FAILED', null, error.message);
      return false;
    }
  }

  // Send notification to multiple users
  async sendToUsers(userIds, notification) {
    const results = [];
    
    for (const userId of userIds) {
      const result = await this.sendToUser(userId, notification);
      results.push({ userId, success: result });
    }
    
    return results;
  }

  // Broadcast to room
  broadcastToRoom(room, event, data) {
    try {
      if (!this.initialized || !this.io) {
        console.warn('WebSocket service not initialized');
        return false;
      }

      this.io.to(room).emit(event, data);
      return true;
    } catch (error) {
      console.error('Error broadcasting to room:', error);
      return false;
    }
  }

  // Send order updates to all relevant parties
  async sendOrderUpdate(orderId, orderData, updateType) {
    try {
      const orderRoom = `order_${orderId}`;
      
      // Broadcast to order room (customer, restaurant, delivery partner)
      this.broadcastToRoom(orderRoom, 'order_update', {
        orderId,
        updateType,
        data: orderData,
        timestamp: new Date()
      });

      // Send specific notifications based on update type
      if (updateType === 'STATUS_CHANGED') {
        await this.handleOrderStatusUpdate(orderId, orderData);
      }
    } catch (error) {
      console.error('Error sending order update:', error);
    }
  }

  async handleOrderStatusUpdate(orderId, orderData) {
    try {
      const { status, userId, restaurantId, deliveryPartnerId } = orderData;

      // Notify customer
      if (userId) {
        await this.sendToUser(userId, {
          type: 'ORDER_STATUS_UPDATE',
          title: 'Order Status Updated',
          message: `Your order is now ${status.toLowerCase()}`,
          data: { orderId, status, ...orderData }
        });
      }

      // Notify restaurant
      if (restaurantId && status === 'PLACED') {
        this.broadcastToRoom(`restaurant_${restaurantId}`, 'new_order', {
          orderId,
          data: orderData,
          timestamp: new Date()
        });
      }

      // Notify delivery partner
      if (deliveryPartnerId && ['READY', 'OUT_FOR_DELIVERY'].includes(status)) {
        await this.sendToUser(deliveryPartnerId, {
          type: 'DELIVERY_UPDATE',
          title: 'Delivery Assignment',
          message: status === 'READY' ? 'Order ready for pickup' : 'Order out for delivery',
          data: { orderId, status, ...orderData }
        });
      }
    } catch (error) {
      console.error('Error handling order status update:', error);
    }
  }

  // Send live delivery tracking updates
  sendDeliveryTracking(orderId, trackingData) {
    try {
      const orderRoom = `order_${orderId}`;
      
      this.broadcastToRoom(orderRoom, 'delivery_tracking', {
        orderId,
        ...trackingData,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error sending delivery tracking:', error);
    }
  }

  // Send system-wide announcements
  broadcastAnnouncement(announcement, targetType = 'all') {
    try {
      let room;
      
      switch (targetType) {
        case 'customers':
          room = 'customers';
          break;
        case 'restaurants':
          room = 'restaurants';
          break;
        case 'delivery':
          room = 'delivery_partners';
          break;
        default:
          // Send to all connected users
          this.io.emit('announcement', {
            ...announcement,
            timestamp: new Date()
          });
          return;
      }

      this.broadcastToRoom(room, 'announcement', {
        ...announcement,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error broadcasting announcement:', error);
    }
  }

  formatNotificationForWebSocket(notification) {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      priority: notification.priority,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      timestamp: new Date()
    };
  }

  // Get connection statistics
  getConnectionStats() {
    const totalConnections = this.connectedUsers.size;
    const userTypes = {
      customers: 0,
      restaurants: 0,
      delivery: 0
    };

    this.userSockets.forEach(userInfo => {
      if (userInfo.userType === 'RESTAURANT') {
        userTypes.restaurants++;
      } else if (userInfo.userType === 'DELIVERY') {
        userTypes.delivery++;
      } else {
        userTypes.customers++;
      }
    });

    return {
      totalConnections,
      userTypes,
      timestamp: new Date()
    };
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }

  // Get online users in a room
  getOnlineUsersInRoom(room) {
    try {
      const sockets = this.io.sockets.adapter.rooms.get(room);
      if (!sockets) return [];

      const users = [];
      sockets.forEach(socketId => {
        const userInfo = this.userSockets.get(socketId);
        if (userInfo) {
          users.push({
            userId: userInfo.userId,
            userType: userInfo.userType,
            connectedAt: userInfo.connectedAt,
            lastActivity: userInfo.lastActivity
          });
        }
      });

      return users;
    } catch (error) {
      console.error('Error getting online users in room:', error);
      return [];
    }
  }

  async logDelivery(notificationId, channel, status, responseData = null, failureReason = null) {
    try {
      const { pool } = require('../config/database');
      const { v4: uuidv4 } = require('uuid');

      const query = `
        INSERT INTO notification_delivery_logs (
          id, notification_id, channel, status, response_data, 
          sent_at, delivered_at, failure_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      const values = [
        uuidv4(),
        notificationId,
        channel,
        status,
        responseData ? JSON.stringify(responseData) : null,
        status === 'SENT' ? new Date() : null,
        status === 'DELIVERED' ? new Date() : null,
        failureReason
      ];

      await pool.query(query, values);
    } catch (error) {
      console.error('Error logging WebSocket delivery:', error);
    }
  }

  // Cleanup inactive connections
  cleanupInactiveConnections() {
    const now = new Date();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

    this.userSockets.forEach((userInfo, socketId) => {
      if (now - userInfo.lastActivity > inactiveThreshold) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          console.log(`🧹 Cleaning up inactive connection: ${userInfo.userId}`);
          socket.disconnect(true);
        }
      }
    });
  }

  // Start cleanup interval
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupInactiveConnections();
    }, 5 * 60 * 1000); // Run every 5 minutes
  }
}

module.exports = WebSocketService;