const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const juice = require('juice');
const { NOTIFICATION_CHANNELS } = require('../models/notification.model');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    this.templateCache = new Map();
    this.initializeTransporter();
  }

  async initializeTransporter() {
    try {
      const emailConfig = {
        service: process.env.EMAIL_SERVICE || 'gmail',
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      };

      if (!emailConfig.auth.user || !emailConfig.auth.pass) {
        console.warn('⚠️ Email credentials not configured');
        return;
      }

      this.transporter = nodemailer.createTransporter(emailConfig);

      // Verify connection
      await this.transporter.verify();
      this.initialized = true;
      console.log('✅ Email service initialized');
    } catch (error) {
      console.error('❌ Email service initialization failed:', error);
    }
  }

  async sendEmail(notification, recipient) {
    try {
      if (!this.initialized) {
        throw new Error('Email service not initialized');
      }

      // Get or render email content
      const emailContent = await this.renderEmailContent(notification);
      
      const mailOptions = {
        from: {
          name: 'QuickBite',
          address: process.env.EMAIL_FROM || 'noreply@quickbite.app'
        },
        to: recipient.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        attachments: emailContent.attachments || [],
        headers: {
          'X-Notification-ID': notification.id,
          'X-Notification-Type': notification.type,
          'X-User-ID': notification.userId
        },
        // Email tracking
        list: {
          unsubscribe: `${process.env.APP_BASE_URL}/unsubscribe?token=${this.generateUnsubscribeToken(notification.userId)}`
        }
      };

      // Add priority headers
      if (notification.priority === 'HIGH' || notification.priority === 'URGENT') {
        mailOptions.priority = 'high';
        mailOptions.headers['X-Priority'] = '1';
        mailOptions.headers['X-MSMail-Priority'] = 'High';
      }

      const result = await this.transporter.sendMail(mailOptions);

      // Log successful delivery
      await this.logDelivery(notification.id, 'EMAIL', 'SENT', {
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected
      });

      return {
        success: true,
        messageId: result.messageId,
        recipient: recipient.email
      };
    } catch (error) {
      console.error('Error sending email:', error);
      
      // Log failure
      await this.logDelivery(notification.id, 'EMAIL', 'FAILED', null, error.message);
      
      throw error;
    }
  }

  async renderEmailContent(notification) {
    try {
      // Try to get template from notification
      let template = null;
      if (notification.templateId) {
        const { NotificationTemplate } = require('../models/template.model');
        template = await NotificationTemplate.findById(notification.templateId);
      }

      // If no template, try to find one by type and channel
      if (!template) {
        const { NotificationTemplate } = require('../models/template.model');
        template = await NotificationTemplate.findByTypeAndChannel(notification.type, 'EMAIL');
      }

      // If still no template, use default
      if (!template) {
        return this.renderDefaultEmail(notification);
      }

      // Render template with notification data
      const rendered = await template.render({
        ...notification.data,
        notification: {
          title: notification.title,
          message: notification.message,
          type: notification.type,
          priority: notification.priority
        },
        user: notification.data.user || {},
        order: notification.data.order || {},
        restaurant: notification.data.restaurant || {},
        delivery: notification.data.delivery || {},
        app: {
          name: 'QuickBite',
          url: process.env.APP_BASE_URL || 'https://quickbite.app',
          supportUrl: `${process.env.APP_BASE_URL}/support`,
          logoUrl: `${process.env.APP_BASE_URL}/images/logo-email.png`
        }
      });

      // Inline CSS for better email client compatibility
      const htmlWithInlinedCSS = juice(rendered.body);

      return {
        subject: rendered.subject || this.getDefaultSubject(notification),
        html: htmlWithInlinedCSS,
        text: this.htmlToText(rendered.body),
        attachments: this.getEmailAttachments(notification)
      };
    } catch (error) {
      console.error('Error rendering email content:', error);
      return this.renderDefaultEmail(notification);
    }
  }

  renderDefaultEmail(notification) {
    const defaultTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{{title}}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #e74c3c; }
          .content { padding: 20px 0; }
          .footer { text-align: center; padding: 20px 0; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
          .btn { display: inline-block; padding: 10px 20px; background: #e74c3c; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>QuickBite</h1>
          </div>
          <div class="content">
            <h2>{{title}}</h2>
            <p>{{message}}</p>
            {{#if actionUrl}}
            <p><a href="{{actionUrl}}" class="btn">View Details</a></p>
            {{/if}}
          </div>
          <div class="footer">
            <p>This email was sent by QuickBite. If you don't want to receive these emails, you can <a href="{{unsubscribeUrl}}">unsubscribe</a>.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const compiled = handlebars.compile(defaultTemplate);
    const html = compiled({
      title: notification.title,
      message: notification.message,
      actionUrl: notification.data.actionUrl,
      unsubscribeUrl: `${process.env.APP_BASE_URL}/unsubscribe?token=${this.generateUnsubscribeToken(notification.userId)}`
    });

    return {
      subject: this.getDefaultSubject(notification),
      html: juice(html),
      text: this.htmlToText(html)
    };
  }

  getDefaultSubject(notification) {
    const subjectMap = {
      'ORDER_PLACED': 'Order Confirmed - QuickBite',
      'ORDER_PREPARING': 'Your order is being prepared',
      'ORDER_READY': 'Your order is ready for pickup',
      'ORDER_OUT_FOR_DELIVERY': 'Your order is on the way',
      'ORDER_DELIVERED': 'Order delivered successfully',
      'ORDER_CANCELLED': 'Order cancelled',
      'PAYMENT_SUCCESS': 'Payment confirmation',
      'PAYMENT_FAILED': 'Payment failed - Action required',
      'PROMOTIONAL_OFFER': 'Special offer just for you!',
      'LOYALTY_REWARD': 'You\'ve earned loyalty rewards!',
      'REFERRAL_BONUS': 'Referral bonus credited',
      'BIRTHDAY_OFFER': 'Happy Birthday! Special offer inside',
      'WEEKLY_DIGEST': 'Your weekly QuickBite summary'
    };

    return subjectMap[notification.type] || notification.title || 'Notification from QuickBite';
  }

  htmlToText(html) {
    // Simple HTML to text conversion
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  getEmailAttachments(notification) {
    const attachments = [];

    // Add QR code for order tracking
    if (notification.type.startsWith('ORDER_') && notification.data.orderId) {
      attachments.push({
        filename: 'order-qr.png',
        content: notification.data.qrCode,
        encoding: 'base64',
        cid: 'order-qr'
      });
    }

    // Add invoice for order confirmation
    if (notification.type === 'ORDER_PLACED' && notification.data.invoice) {
      attachments.push({
        filename: 'invoice.pdf',
        content: notification.data.invoice,
        encoding: 'base64'
      });
    }

    return attachments;
  }

  async sendBulkEmails(notifications) {
    const results = [];
    const batchSize = 100; // Email batch limit

    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      const batchPromises = batch.map(async (item) => {
        try {
          const { notification, recipient } = item;
          return await this.sendEmail(notification, recipient);
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
      console.error('Error logging email delivery:', error);
    }
  }

  generateUnsubscribeToken(userId) {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { userId, action: 'unsubscribe' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1y' }
    );
  }

  async processUnsubscribe(token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      
      if (decoded.action !== 'unsubscribe') {
        throw new Error('Invalid unsubscribe token');
      }

      // Update user preferences to disable email notifications
      const { UserNotificationPreferences } = require('../models/template.model');
      const preferences = await UserNotificationPreferences.findByUserId(decoded.userId);
      
      preferences.emailNotifications = false;
      preferences.promotionalOffers = false;
      preferences.weeklyDigest = false;
      
      await preferences.save();

      return { success: true, userId: decoded.userId };
    } catch (error) {
      console.error('Error processing unsubscribe:', error);
      throw error;
    }
  }

  async validateEmailAddress(email) {
    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async testEmailService() {
    try {
      if (!this.initialized) {
        throw new Error('Email service not initialized');
      }

      const testResult = await this.transporter.verify();
      
      return {
        success: true,
        message: 'Email service is working correctly',
        details: testResult
      };
    } catch (error) {
      console.error('Email service test failed:', error);
      throw error;
    }
  }

  // Template management methods
  async loadTemplate(templateName) {
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName);
    }

    try {
      const templatePath = path.join(__dirname, '../templates/email', `${templateName}.hbs`);
      const templateContent = await fs.readFile(templatePath, 'utf8');
      const compiled = handlebars.compile(templateContent);
      
      this.templateCache.set(templateName, compiled);
      return compiled;
    } catch (error) {
      console.error(`Error loading template ${templateName}:`, error);
      return null;
    }
  }

  clearTemplateCache() {
    this.templateCache.clear();
  }

  // Email analytics methods
  async getEmailAnalytics(startDate, endDate) {
    try {
      const { pool } = require('../config/database');
      
      const query = `
        SELECT 
          DATE(sent_at) as date,
          COUNT(*) as total_sent,
          COUNT(CASE WHEN status = 'SENT' THEN 1 END) as successful,
          COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed
        FROM notification_delivery_logs
        WHERE channel = 'EMAIL'
        AND sent_at BETWEEN $1 AND $2
        GROUP BY DATE(sent_at)
        ORDER BY date DESC
      `;

      const result = await pool.query(query, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error('Error getting email analytics:', error);
      throw error;
    }
  }
}

module.exports = EmailService;