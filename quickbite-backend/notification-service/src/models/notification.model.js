const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Initialize database connection (will be imported from config)
let pool;

// Notification Types
const NOTIFICATION_TYPES = {
  ORDER_PLACED: 'ORDER_PLACED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  ORDER_PREPARING: 'ORDER_PREPARING',
  ORDER_READY: 'ORDER_READY',
  ORDER_PICKED_UP: 'ORDER_PICKED_UP',
  ORDER_OUT_FOR_DELIVERY: 'ORDER_OUT_FOR_DELIVERY',
  ORDER_DELIVERED: 'ORDER_DELIVERED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_DELAYED: 'ORDER_DELAYED',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  REFUND_PROCESSED: 'REFUND_PROCESSED',
  DELIVERY_ASSIGNED: 'DELIVERY_ASSIGNED',
  DELIVERY_ARRIVED: 'DELIVERY_ARRIVED',
  PROMOTIONAL_OFFER: 'PROMOTIONAL_OFFER',
  LOYALTY_REWARD: 'LOYALTY_REWARD',
  REFERRAL_BONUS: 'REFERRAL_BONUS',
  BIRTHDAY_OFFER: 'BIRTHDAY_OFFER',
  NEW_RESTAURANT: 'NEW_RESTAURANT',
  RESTAURANT_REOPENED: 'RESTAURANT_REOPENED',
  FRIEND_ACTIVITY: 'FRIEND_ACTIVITY',
  SYSTEM_MAINTENANCE: 'SYSTEM_MAINTENANCE',
  SECURITY_ALERT: 'SECURITY_ALERT',
  ACCOUNT_UPDATE: 'ACCOUNT_UPDATE',
  WEEKLY_DIGEST: 'WEEKLY_DIGEST',
  CUSTOM_MESSAGE: 'CUSTOM_MESSAGE'
};

// Notification Channels
const NOTIFICATION_CHANNELS = {
  PUSH: 'PUSH',
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
  IN_APP: 'IN_APP',
  WEBHOOK: 'WEBHOOK'
};

// Notification Status
const NOTIFICATION_STATUS = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  READ: 'READ',
  CLICKED: 'CLICKED',
  DISMISSED: 'DISMISSED'
};

// Priority Levels
const PRIORITY_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
  CRITICAL: 'CRITICAL'
};

// Template Categories
const TEMPLATE_CATEGORIES = {
  ORDER_UPDATES: 'ORDER_UPDATES',
  PAYMENTS: 'PAYMENTS',
  DELIVERY: 'DELIVERY',
  PROMOTIONS: 'PROMOTIONS',
  LOYALTY: 'LOYALTY',
  SOCIAL: 'SOCIAL',
  SECURITY: 'SECURITY',
  SYSTEM: 'SYSTEM'
};

// Database Schema Creation
async function ensureNotificationSchema() {
  try {
    const { pool: dbPool } = require('../config/database');
    pool = dbPool;

    // Create notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(36) NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data JSONB DEFAULT '{}',
        channels TEXT[] NOT NULL DEFAULT ARRAY['PUSH'],
        priority VARCHAR(20) DEFAULT 'MEDIUM',
        category VARCHAR(50),
        template_id VARCHAR(36),
        scheduled_at TIMESTAMP,
        expires_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'PENDING',
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        read_at TIMESTAMP,
        clicked_at TIMESTAMP,
        failure_reason TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create notification_delivery_logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_delivery_logs (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id VARCHAR(36) NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
        channel VARCHAR(20) NOT NULL,
        external_id VARCHAR(255),
        status VARCHAR(20) NOT NULL,
        response_data JSONB,
        attempt_number INTEGER DEFAULT 1,
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        failure_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create notification_templates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_templates (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        type VARCHAR(50) NOT NULL,
        category VARCHAR(50) NOT NULL,
        channel VARCHAR(20) NOT NULL,
        subject_template TEXT,
        body_template TEXT NOT NULL,
        variables JSONB DEFAULT '[]',
        styling JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        version INTEGER DEFAULT 1,
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create user_notification_preferences table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_notification_preferences (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(36) NOT NULL UNIQUE,
        email_notifications BOOLEAN DEFAULT true,
        push_notifications BOOLEAN DEFAULT true,
        sms_notifications BOOLEAN DEFAULT false,
        whatsapp_notifications BOOLEAN DEFAULT false,
        order_updates BOOLEAN DEFAULT true,
        promotional_offers BOOLEAN DEFAULT true,
        loyalty_updates BOOLEAN DEFAULT true,
        social_activity BOOLEAN DEFAULT true,
        security_alerts BOOLEAN DEFAULT true,
        weekly_digest BOOLEAN DEFAULT true,
        quiet_hours_start TIME DEFAULT '22:00',
        quiet_hours_end TIME DEFAULT '08:00',
        timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
        frequency_cap INTEGER DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create notification_campaigns table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_campaigns (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(50) NOT NULL,
        template_id VARCHAR(36) REFERENCES notification_templates(id),
        target_audience JSONB NOT NULL,
        channels TEXT[] NOT NULL,
        status VARCHAR(20) DEFAULT 'DRAFT',
        scheduled_at TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        total_recipients INTEGER DEFAULT 0,
        sent_count INTEGER DEFAULT 0,
        delivered_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        click_count INTEGER DEFAULT 0,
        conversion_count INTEGER DEFAULT 0,
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create notification_subscriptions table (for push notifications)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_subscriptions (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(36) NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh_key TEXT NOT NULL,
        auth_key TEXT NOT NULL,
        device_type VARCHAR(20),
        browser VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, endpoint)
      );
    `);

    // Create notification_analytics table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_analytics (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE NOT NULL,
        notification_type VARCHAR(50),
        channel VARCHAR(20),
        sent_count INTEGER DEFAULT 0,
        delivered_count INTEGER DEFAULT 0,
        read_count INTEGER DEFAULT 0,
        click_count INTEGER DEFAULT 0,
        conversion_count INTEGER DEFAULT 0,
        bounce_count INTEGER DEFAULT 0,
        unsubscribe_count INTEGER DEFAULT 0,
        avg_delivery_time INTERVAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, notification_type, channel)
      );
    `);

    // Create notification_queues table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_queues (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        queue_name VARCHAR(100) NOT NULL,
        notification_data JSONB NOT NULL,
        priority INTEGER DEFAULT 5,
        scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'PENDING',
        retry_count INTEGER DEFAULT 0,
        failure_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
      CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
      CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_at ON notifications(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_notification_id ON notification_delivery_logs(notification_id);
      CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_channel ON notification_delivery_logs(channel);
      CREATE INDEX IF NOT EXISTS idx_notification_templates_type ON notification_templates(type);
      CREATE INDEX IF NOT EXISTS idx_notification_campaigns_status ON notification_campaigns(status);
      CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_user_id ON notification_subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_notification_analytics_date ON notification_analytics(date);
      CREATE INDEX IF NOT EXISTS idx_notification_queues_status ON notification_queues(status);
      CREATE INDEX IF NOT EXISTS idx_notification_queues_scheduled_at ON notification_queues(scheduled_at);
    `);

    console.log('✅ Notification database schema ensured');
  } catch (error) {
    console.error('❌ Error ensuring notification schema:', error);
    throw error;
  }
}

// Notification Class
class Notification {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.userId = data.userId;
    this.type = data.type;
    this.title = data.title;
    this.message = data.message;
    this.data = data.data || {};
    this.channels = data.channels || ['PUSH'];
    this.priority = data.priority || 'MEDIUM';
    this.category = data.category;
    this.templateId = data.templateId;
    this.scheduledAt = data.scheduledAt;
    this.expiresAt = data.expiresAt;
    this.status = data.status || 'PENDING';
    this.retryCount = data.retryCount || 0;
    this.maxRetries = data.maxRetries || 3;
  }

  async save() {
    try {
      const query = `
        INSERT INTO notifications (
          id, user_id, type, title, message, data, channels, priority,
          category, template_id, scheduled_at, expires_at, status,
          retry_count, max_retries
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        ) RETURNING *
      `;

      const values = [
        this.id, this.userId, this.type, this.title, this.message,
        JSON.stringify(this.data), this.channels, this.priority,
        this.category, this.templateId, this.scheduledAt, this.expiresAt,
        this.status, this.retryCount, this.maxRetries
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error saving notification:', error);
      throw error;
    }
  }

  async updateStatus(status, additionalData = {}) {
    try {
      const updates = [];
      const values = [status, this.id];
      let paramCount = 2;

      updates.push('status = $1');

      if (status === 'SENT') {
        updates.push(`sent_at = CURRENT_TIMESTAMP`);
      } else if (status === 'DELIVERED') {
        updates.push(`delivered_at = CURRENT_TIMESTAMP`);
      } else if (status === 'READ') {
        updates.push(`read_at = CURRENT_TIMESTAMP`);
      } else if (status === 'CLICKED') {
        updates.push(`clicked_at = CURRENT_TIMESTAMP`);
      }

      if (additionalData.failureReason) {
        updates.push(`failure_reason = $${++paramCount}`);
        values.push(additionalData.failureReason);
      }

      if (additionalData.incrementRetry) {
        updates.push(`retry_count = retry_count + 1`);
      }

      const query = `
        UPDATE notifications 
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramCount === 2 ? 2 : paramCount + 1}
        RETURNING *
      `;

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating notification status:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const query = 'SELECT * FROM notifications WHERE id = $1';
      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const data = result.rows[0];
      data.data = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
      
      return new Notification(data);
    } catch (error) {
      console.error('Error finding notification:', error);
      throw error;
    }
  }

  static async findByUserId(userId, options = {}) {
    try {
      const {
        status,
        type,
        limit = 20,
        offset = 0,
        includeRead = true
      } = options;

      let query = 'SELECT * FROM notifications WHERE user_id = $1';
      const values = [userId];
      let paramCount = 1;

      if (status) {
        query += ` AND status = $${++paramCount}`;
        values.push(status);
      }

      if (type) {
        query += ` AND type = $${++paramCount}`;
        values.push(type);
      }

      if (!includeRead) {
        query += ` AND read_at IS NULL`;
      }

      query += ` ORDER BY created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
      values.push(limit, offset);

      const result = await pool.query(query, values);
      
      return result.rows.map(row => {
        row.data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        return new Notification(row);
      });
    } catch (error) {
      console.error('Error finding notifications by user:', error);
      throw error;
    }
  }

  static async getPendingNotifications(limit = 100) {
    try {
      const query = `
        SELECT * FROM notifications 
        WHERE status = 'PENDING' 
        AND (scheduled_at IS NULL OR scheduled_at <= CURRENT_TIMESTAMP)
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        ORDER BY priority DESC, created_at ASC
        LIMIT $1
      `;

      const result = await pool.query(query, [limit]);
      
      return result.rows.map(row => {
        row.data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        return new Notification(row);
      });
    } catch (error) {
      console.error('Error getting pending notifications:', error);
      throw error;
    }
  }

  static async markAsRead(userId, notificationIds) {
    try {
      if (!Array.isArray(notificationIds)) {
        notificationIds = [notificationIds];
      }

      const placeholders = notificationIds.map((_, i) => `$${i + 2}`).join(',');
      const query = `
        UPDATE notifications 
        SET status = 'READ', read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND id IN (${placeholders})
        RETURNING id
      `;

      const values = [userId, ...notificationIds];
      const result = await pool.query(query, values);
      
      return result.rows.map(row => row.id);
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      throw error;
    }
  }

  static async getUnreadCount(userId) {
    try {
      const query = `
        SELECT COUNT(*) as count 
        FROM notifications 
        WHERE user_id = $1 AND read_at IS NULL AND status != 'FAILED'
      `;

      const result = await pool.query(query, [userId]);
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw error;
    }
  }
}

// Legacy function compatibility
async function ensureSchema() {
  return ensureNotificationSchema();
}

async function createNotification(data) {
  const notification = new Notification(data);
  return notification.save();
}

async function getNotification(id) {
  return Notification.findById(id);
}

async function setStatus(id, status, sentAt = null, lastError = null) {
  const notification = await Notification.findById(id);
  if (!notification) return null;
  
  return notification.updateStatus(status, { 
    failureReason: lastError,
    incrementRetry: status === 'FAILED'
  });
}

async function logEvent(notificationId, eventType, details = null) {
  const eventId = uuidv4();
  await pool.query(
    'INSERT INTO notification_delivery_logs(id, notification_id, channel, status, response_data) VALUES($1,$2,$3,$4,$5)',
    [eventId, notificationId, eventType, 'LOGGED', details ? JSON.stringify(details) : null]
  );
  return eventId;
}

module.exports = {
  ensureNotificationSchema,
  ensureSchema, // legacy compatibility
  createNotification,
  getNotification,
  setStatus,
  logEvent,
  Notification,
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUS,
  PRIORITY_LEVELS,
  TEMPLATE_CATEGORIES,
  // Legacy exports for compatibility
  NOTIF_TYPES: Object.values(NOTIFICATION_TYPES),
  NOTIF_PRIORITIES: Object.values(PRIORITY_LEVELS),
  NOTIF_STATUSES: Object.values(NOTIFICATION_STATUS)
};
