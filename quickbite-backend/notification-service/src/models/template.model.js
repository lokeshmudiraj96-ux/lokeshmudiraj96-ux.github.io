const { v4: uuidv4 } = require('uuid');
const Handlebars = require('handlebars');

// Initialize database connection
let pool;

// Template Class for managing notification templates
class NotificationTemplate {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.name = data.name;
    this.type = data.type;
    this.category = data.category;
    this.channel = data.channel;
    this.subjectTemplate = data.subjectTemplate;
    this.bodyTemplate = data.bodyTemplate;
    this.variables = data.variables || [];
    this.styling = data.styling || {};
    this.isActive = data.isActive !== false;
    this.version = data.version || 1;
    this.createdBy = data.createdBy;
  }

  async save() {
    try {
      const { pool: dbPool } = require('../config/database');
      pool = dbPool;

      const query = `
        INSERT INTO notification_templates (
          id, name, type, category, channel, subject_template, body_template,
          variables, styling, is_active, version, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        ) RETURNING *
      `;

      const values = [
        this.id, this.name, this.type, this.category, this.channel,
        this.subjectTemplate, this.bodyTemplate, JSON.stringify(this.variables),
        JSON.stringify(this.styling), this.isActive, this.version, this.createdBy
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error saving notification template:', error);
      throw error;
    }
  }

  async update(updates) {
    try {
      const allowedUpdates = [
        'name', 'type', 'category', 'channel', 'subjectTemplate',
        'bodyTemplate', 'variables', 'styling', 'isActive'
      ];

      const updateFields = [];
      const values = [this.id];
      let paramCount = 1;

      for (const field of allowedUpdates) {
        if (updates[field] !== undefined) {
          paramCount++;
          updateFields.push(`${this.camelToSnake(field)} = $${paramCount}`);
          
          if (field === 'variables' || field === 'styling') {
            values.push(JSON.stringify(updates[field]));
          } else {
            values.push(updates[field]);
          }
        }
      }

      if (updateFields.length === 0) {
        return this;
      }

      // Increment version when updating templates
      updateFields.push(`version = version + 1`);
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      const query = `
        UPDATE notification_templates 
        SET ${updateFields.join(', ')}
        WHERE id = $1
        RETURNING *
      `;

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating notification template:', error);
      throw error;
    }
  }

  async render(data = {}) {
    try {
      const compiledSubject = this.subjectTemplate ? 
        Handlebars.compile(this.subjectTemplate)(data) : null;
      
      const compiledBody = Handlebars.compile(this.bodyTemplate)(data);

      return {
        subject: compiledSubject,
        body: compiledBody,
        styling: this.styling
      };
    } catch (error) {
      console.error('Error rendering template:', error);
      throw new Error(`Template rendering failed: ${error.message}`);
    }
  }

  static async findById(id) {
    try {
      const { pool: dbPool } = require('../config/database');
      pool = dbPool;

      const query = 'SELECT * FROM notification_templates WHERE id = $1';
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      const data = result.rows[0];
      data.variables = typeof data.variables === 'string' ? 
        JSON.parse(data.variables) : data.variables;
      data.styling = typeof data.styling === 'string' ? 
        JSON.parse(data.styling) : data.styling;

      return new NotificationTemplate(data);
    } catch (error) {
      console.error('Error finding template:', error);
      throw error;
    }
  }

  static async findByTypeAndChannel(type, channel) {
    try {
      const { pool: dbPool } = require('../config/database');
      pool = dbPool;

      const query = `
        SELECT * FROM notification_templates 
        WHERE type = $1 AND channel = $2 AND is_active = true
        ORDER BY version DESC
        LIMIT 1
      `;

      const result = await pool.query(query, [type, channel]);

      if (result.rows.length === 0) {
        return null;
      }

      const data = result.rows[0];
      data.variables = typeof data.variables === 'string' ? 
        JSON.parse(data.variables) : data.variables;
      data.styling = typeof data.styling === 'string' ? 
        JSON.parse(data.styling) : data.styling;

      return new NotificationTemplate(data);
    } catch (error) {
      console.error('Error finding template by type and channel:', error);
      throw error;
    }
  }

  static async getAll(filters = {}) {
    try {
      const { pool: dbPool } = require('../config/database');
      pool = dbPool;

      let query = 'SELECT * FROM notification_templates WHERE 1=1';
      const values = [];
      let paramCount = 0;

      if (filters.category) {
        query += ` AND category = $${++paramCount}`;
        values.push(filters.category);
      }

      if (filters.channel) {
        query += ` AND channel = $${++paramCount}`;
        values.push(filters.channel);
      }

      if (filters.isActive !== undefined) {
        query += ` AND is_active = $${++paramCount}`;
        values.push(filters.isActive);
      }

      query += ' ORDER BY category, name';

      const result = await pool.query(query, values);

      return result.rows.map(row => {
        row.variables = typeof row.variables === 'string' ? 
          JSON.parse(row.variables) : row.variables;
        row.styling = typeof row.styling === 'string' ? 
          JSON.parse(row.styling) : row.styling;
        return new NotificationTemplate(row);
      });
    } catch (error) {
      console.error('Error getting all templates:', error);
      throw error;
    }
  }

  // Helper method to convert camelCase to snake_case
  camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}

// Campaign Class for managing notification campaigns
class NotificationCampaign {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.name = data.name;
    this.description = data.description;
    this.type = data.type;
    this.templateId = data.templateId;
    this.targetAudience = data.targetAudience || {};
    this.channels = data.channels || ['PUSH'];
    this.status = data.status || 'DRAFT';
    this.scheduledAt = data.scheduledAt;
    this.totalRecipients = data.totalRecipients || 0;
    this.sentCount = data.sentCount || 0;
    this.deliveredCount = data.deliveredCount || 0;
    this.failedCount = data.failedCount || 0;
    this.clickCount = data.clickCount || 0;
    this.conversionCount = data.conversionCount || 0;
    this.createdBy = data.createdBy;
  }

  async save() {
    try {
      const { pool: dbPool } = require('../config/database');
      pool = dbPool;

      const query = `
        INSERT INTO notification_campaigns (
          id, name, description, type, template_id, target_audience, channels,
          status, scheduled_at, total_recipients, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        ) RETURNING *
      `;

      const values = [
        this.id, this.name, this.description, this.type, this.templateId,
        JSON.stringify(this.targetAudience), this.channels, this.status,
        this.scheduledAt, this.totalRecipients, this.createdBy
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error saving campaign:', error);
      throw error;
    }
  }

  async updateStatus(status, additionalData = {}) {
    try {
      const updates = ['status = $2'];
      const values = [this.id, status];
      let paramCount = 2;

      if (status === 'RUNNING') {
        updates.push('started_at = CURRENT_TIMESTAMP');
      } else if (status === 'COMPLETED') {
        updates.push('completed_at = CURRENT_TIMESTAMP');
      }

      if (additionalData.sentCount !== undefined) {
        updates.push(`sent_count = $${++paramCount}`);
        values.push(additionalData.sentCount);
      }

      if (additionalData.deliveredCount !== undefined) {
        updates.push(`delivered_count = $${++paramCount}`);
        values.push(additionalData.deliveredCount);
      }

      if (additionalData.failedCount !== undefined) {
        updates.push(`failed_count = $${++paramCount}`);
        values.push(additionalData.failedCount);
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');

      const query = `
        UPDATE notification_campaigns 
        SET ${updates.join(', ')}
        WHERE id = $1
        RETURNING *
      `;

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating campaign status:', error);
      throw error;
    }
  }

  async getRecipients() {
    try {
      // Build recipient query based on target audience criteria
      const { loyaltyTier, city, lastOrderDays, minOrderCount } = this.targetAudience;

      let query = 'SELECT id, email, phone FROM users WHERE 1=1';
      const values = [];
      let paramCount = 0;

      if (loyaltyTier) {
        query += ` AND loyalty_tier = ANY($${++paramCount})`;
        values.push(Array.isArray(loyaltyTier) ? loyaltyTier : [loyaltyTier]);
      }

      if (city) {
        query += ` AND city = ANY($${++paramCount})`;
        values.push(Array.isArray(city) ? city : [city]);
      }

      if (lastOrderDays) {
        query += ` AND last_order_at >= CURRENT_DATE - INTERVAL '${lastOrderDays} days'`;
      }

      if (minOrderCount) {
        query += ` AND total_orders >= $${++paramCount}`;
        values.push(minOrderCount);
      }

      query += ' AND account_status = \'ACTIVE\'';

      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error getting campaign recipients:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const { pool: dbPool } = require('../config/database');
      pool = dbPool;

      const query = 'SELECT * FROM notification_campaigns WHERE id = $1';
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      const data = result.rows[0];
      data.targetAudience = typeof data.target_audience === 'string' ? 
        JSON.parse(data.target_audience) : data.target_audience;

      return new NotificationCampaign(data);
    } catch (error) {
      console.error('Error finding campaign:', error);
      throw error;
    }
  }

  static async getScheduledCampaigns() {
    try {
      const { pool: dbPool } = require('../config/database');
      pool = dbPool;

      const query = `
        SELECT * FROM notification_campaigns 
        WHERE status = 'SCHEDULED' 
        AND scheduled_at <= CURRENT_TIMESTAMP
        ORDER BY scheduled_at ASC
      `;

      const result = await pool.query(query);

      return result.rows.map(row => {
        row.targetAudience = typeof row.target_audience === 'string' ? 
          JSON.parse(row.target_audience) : row.target_audience;
        return new NotificationCampaign(row);
      });
    } catch (error) {
      console.error('Error getting scheduled campaigns:', error);
      throw error;
    }
  }
}

// User Notification Preferences Class
class UserNotificationPreferences {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.userId = data.userId;
    this.emailNotifications = data.emailNotifications !== false;
    this.pushNotifications = data.pushNotifications !== false;
    this.smsNotifications = data.smsNotifications || false;
    this.whatsappNotifications = data.whatsappNotifications || false;
    this.orderUpdates = data.orderUpdates !== false;
    this.promotionalOffers = data.promotionalOffers !== false;
    this.loyaltyUpdates = data.loyaltyUpdates !== false;
    this.socialActivity = data.socialActivity !== false;
    this.securityAlerts = data.securityAlerts !== false;
    this.weeklyDigest = data.weeklyDigest !== false;
    this.quietHoursStart = data.quietHoursStart || '22:00';
    this.quietHoursEnd = data.quietHoursEnd || '08:00';
    this.timezone = data.timezone || 'Asia/Kolkata';
    this.frequencyCap = data.frequencyCap || 10;
  }

  async save() {
    try {
      const { pool: dbPool } = require('../config/database');
      pool = dbPool;

      const query = `
        INSERT INTO user_notification_preferences (
          id, user_id, email_notifications, push_notifications, sms_notifications,
          whatsapp_notifications, order_updates, promotional_offers, loyalty_updates,
          social_activity, security_alerts, weekly_digest, quiet_hours_start,
          quiet_hours_end, timezone, frequency_cap
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        ) ON CONFLICT (user_id) DO UPDATE SET
          email_notifications = EXCLUDED.email_notifications,
          push_notifications = EXCLUDED.push_notifications,
          sms_notifications = EXCLUDED.sms_notifications,
          whatsapp_notifications = EXCLUDED.whatsapp_notifications,
          order_updates = EXCLUDED.order_updates,
          promotional_offers = EXCLUDED.promotional_offers,
          loyalty_updates = EXCLUDED.loyalty_updates,
          social_activity = EXCLUDED.social_activity,
          security_alerts = EXCLUDED.security_alerts,
          weekly_digest = EXCLUDED.weekly_digest,
          quiet_hours_start = EXCLUDED.quiet_hours_start,
          quiet_hours_end = EXCLUDED.quiet_hours_end,
          timezone = EXCLUDED.timezone,
          frequency_cap = EXCLUDED.frequency_cap,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const values = [
        this.id, this.userId, this.emailNotifications, this.pushNotifications,
        this.smsNotifications, this.whatsappNotifications, this.orderUpdates,
        this.promotionalOffers, this.loyaltyUpdates, this.socialActivity,
        this.securityAlerts, this.weeklyDigest, this.quietHoursStart,
        this.quietHoursEnd, this.timezone, this.frequencyCap
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error saving user preferences:', error);
      throw error;
    }
  }

  static async findByUserId(userId) {
    try {
      const { pool: dbPool } = require('../config/database');
      pool = dbPool;

      const query = 'SELECT * FROM user_notification_preferences WHERE user_id = $1';
      const result = await pool.query(query, [userId]);

      if (result.rows.length === 0) {
        // Return default preferences if none exist
        return new UserNotificationPreferences({ userId });
      }

      return new UserNotificationPreferences(result.rows[0]);
    } catch (error) {
      console.error('Error finding user preferences:', error);
      throw error;
    }
  }

  shouldReceiveNotification(notificationType, channel) {
    // Check if user wants this type of notification
    const typeMapping = {
      'ORDER_PLACED': 'orderUpdates',
      'ORDER_CONFIRMED': 'orderUpdates',
      'ORDER_PREPARING': 'orderUpdates',
      'ORDER_READY': 'orderUpdates',
      'ORDER_OUT_FOR_DELIVERY': 'orderUpdates',
      'ORDER_DELIVERED': 'orderUpdates',
      'ORDER_CANCELLED': 'orderUpdates',
      'PROMOTIONAL_OFFER': 'promotionalOffers',
      'LOYALTY_REWARD': 'loyaltyUpdates',
      'REFERRAL_BONUS': 'loyaltyUpdates',
      'BIRTHDAY_OFFER': 'promotionalOffers',
      'FRIEND_ACTIVITY': 'socialActivity',
      'SECURITY_ALERT': 'securityAlerts',
      'WEEKLY_DIGEST': 'weeklyDigest'
    };

    const preferenceKey = typeMapping[notificationType];
    if (preferenceKey && !this[preferenceKey]) {
      return false;
    }

    // Check if user wants this channel
    const channelMapping = {
      'EMAIL': 'emailNotifications',
      'PUSH': 'pushNotifications',
      'SMS': 'smsNotifications',
      'WHATSAPP': 'whatsappNotifications'
    };

    const channelKey = channelMapping[channel];
    if (channelKey && !this[channelKey]) {
      return false;
    }

    return true;
  }
}

module.exports = {
  NotificationTemplate,
  NotificationCampaign,
  UserNotificationPreferences
};