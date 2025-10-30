/**
 * Advanced User Management Models
 * 
 * This module provides comprehensive user management capabilities including:
 * - Enhanced user profiles with rich metadata
 * - Loyalty programs and reward systems
 * - Social features and connections
 * - User preferences and personalization
 * - Referral systems with tracking
 * - Advanced analytics and segmentation
 */

const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// User management constants
const USER_ROLES = ['CUSTOMER', 'RESTAURANT_OWNER', 'DELIVERY_PARTNER', 'ADMIN', 'SUPPORT'];
const ACCOUNT_STATUS = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'DEACTIVATED'];
const LOYALTY_TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
const PREFERENCE_CATEGORIES = ['CUISINE', 'DIETARY', 'DELIVERY_TIME', 'PRICE_RANGE', 'RESTAURANT_TYPE'];
const SOCIAL_CONNECTION_TYPES = ['FRIEND', 'FAMILY', 'COLLEAGUE', 'BLOCKED'];
const NOTIFICATION_PREFERENCES = ['EMAIL', 'SMS', 'PUSH', 'IN_APP', 'WHATSAPP'];

async function ensureUserSchema() {
  const sql = `
    -- Enhanced users table with comprehensive profile management
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      user_code VARCHAR(20) UNIQUE NOT NULL,
      
      -- Basic information
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE,
      phone VARCHAR(20) UNIQUE NOT NULL,
      date_of_birth DATE,
      gender VARCHAR(20),
      
      -- Account management
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'CUSTOMER',
      account_status TEXT NOT NULL DEFAULT 'ACTIVE',
      is_email_verified BOOLEAN DEFAULT false,
      is_phone_verified BOOLEAN DEFAULT false,
      
      -- Profile information
      profile_image_url TEXT,
      bio TEXT,
      location_address JSONB,
      home_coordinates JSONB, -- {latitude, longitude}
      work_coordinates JSONB, -- {latitude, longitude}
      
      -- Preferences
      language_preference VARCHAR(10) DEFAULT 'en',
      currency_preference VARCHAR(10) DEFAULT 'INR',
      timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
      
      -- Privacy settings
      profile_visibility TEXT DEFAULT 'PUBLIC', -- PUBLIC, FRIENDS, PRIVATE
      location_sharing BOOLEAN DEFAULT false,
      activity_sharing BOOLEAN DEFAULT true,
      
      -- Loyalty and engagement
      loyalty_tier TEXT DEFAULT 'BRONZE',
      loyalty_points INTEGER DEFAULT 0,
      total_spent_cents BIGINT DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      
      -- Social features
      followers_count INTEGER DEFAULT 0,
      following_count INTEGER DEFAULT 0,
      social_score INTEGER DEFAULT 0,
      
      -- Referral system
      referral_code VARCHAR(20) UNIQUE,
      referred_by_user_id UUID REFERENCES users(id),
      referral_earnings_cents INTEGER DEFAULT 0,
      successful_referrals INTEGER DEFAULT 0,
      
      -- Analytics and tracking
      last_login_at TIMESTAMP,
      last_order_at TIMESTAMP,
      registration_source VARCHAR(50), -- WEB, MOBILE_APP, REFERRAL, SOCIAL
      device_info JSONB,
      
      -- Engagement metrics
      session_count INTEGER DEFAULT 0,
      avg_session_duration_seconds INTEGER DEFAULT 0,
      push_notifications_enabled BOOLEAN DEFAULT true,
      marketing_emails_enabled BOOLEAN DEFAULT true,
      
      -- Subscription and premium features
      is_premium_member BOOLEAN DEFAULT false,
      premium_expiry_date TIMESTAMP,
      subscription_plan VARCHAR(50),
      
      -- Metadata
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deactivated_at TIMESTAMP,
      last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- User addresses for multiple delivery locations
    CREATE TABLE IF NOT EXISTS user_addresses (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      
      -- Address details
      address_type TEXT NOT NULL DEFAULT 'OTHER', -- HOME, WORK, OTHER
      address_label VARCHAR(100), -- "Home", "Office", "Mom's place"
      
      -- Location data
      address_line1 TEXT NOT NULL,
      address_line2 TEXT,
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100) NOT NULL,
      postal_code VARCHAR(20) NOT NULL,
      country VARCHAR(100) DEFAULT 'India',
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      
      -- Address metadata
      delivery_instructions TEXT,
      landmark TEXT,
      is_default BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- User preferences for personalization
    CREATE TABLE IF NOT EXISTS user_preferences (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      
      -- Preference details
      category TEXT NOT NULL, -- CUISINE, DIETARY, DELIVERY_TIME, etc.
      preference_key VARCHAR(100) NOT NULL,
      preference_value JSONB NOT NULL,
      
      -- Preference metadata
      preference_strength DECIMAL(3,2) DEFAULT 1.0, -- 0.0 to 1.0
      source TEXT DEFAULT 'USER_INPUT', -- USER_INPUT, BEHAVIOR_ANALYSIS, RECOMMENDATION
      confidence_score DECIMAL(3,2) DEFAULT 1.0,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(user_id, category, preference_key)
    );

    -- Loyalty program and rewards
    CREATE TABLE IF NOT EXISTS user_loyalty (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      
      -- Loyalty metrics
      current_tier TEXT NOT NULL DEFAULT 'BRONZE',
      tier_progress_percentage DECIMAL(5,2) DEFAULT 0.0,
      points_balance INTEGER DEFAULT 0,
      lifetime_points_earned INTEGER DEFAULT 0,
      points_redeemed INTEGER DEFAULT 0,
      
      -- Tier benefits
      tier_benefits JSONB, -- Array of benefit codes
      tier_achieved_at TIMESTAMP,
      next_tier_requirements JSONB,
      
      -- Spending metrics
      total_spent_cents BIGINT DEFAULT 0,
      monthly_spent_cents INTEGER DEFAULT 0,
      orders_this_month INTEGER DEFAULT 0,
      
      -- Streaks and achievements
      consecutive_order_days INTEGER DEFAULT 0,
      longest_order_streak INTEGER DEFAULT 0,
      achievements JSONB, -- Array of achievement codes
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Points transactions for transparency
    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      
      -- Transaction details
      transaction_type TEXT NOT NULL, -- EARNED, REDEEMED, EXPIRED, BONUS, PENALTY
      points_amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      
      -- Transaction context
      order_id UUID,
      reason TEXT NOT NULL,
      description TEXT,
      reference_id UUID,
      
      -- Expiry tracking for earned points
      expires_at TIMESTAMP,
      is_expired BOOLEAN DEFAULT false,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Social connections and relationships
    CREATE TABLE IF NOT EXISTS user_connections (
      id UUID PRIMARY KEY,
      requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      
      -- Connection details
      connection_type TEXT NOT NULL DEFAULT 'FRIEND',
      status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, ACCEPTED, REJECTED, BLOCKED
      
      -- Social interaction metrics
      interaction_score INTEGER DEFAULT 0,
      shared_orders_count INTEGER DEFAULT 0,
      last_interaction_at TIMESTAMP,
      
      -- Connection metadata
      requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      responded_at TIMESTAMP,
      notes TEXT,
      
      UNIQUE(requester_id, addressee_id)
    );

    -- User activity feed for social features
    CREATE TABLE IF NOT EXISTS user_activities (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      
      -- Activity details
      activity_type TEXT NOT NULL, -- ORDER_PLACED, REVIEW_POSTED, MILESTONE_ACHIEVED, etc.
      activity_title VARCHAR(200) NOT NULL,
      activity_description TEXT,
      activity_metadata JSONB,
      
      -- Visibility and engagement
      visibility TEXT DEFAULT 'FRIENDS', -- PUBLIC, FRIENDS, PRIVATE
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      
      -- Related entities
      related_order_id UUID,
      related_restaurant_id UUID,
      related_user_id UUID,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Referral system tracking
    CREATE TABLE IF NOT EXISTS user_referrals (
      id UUID PRIMARY KEY,
      referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      
      -- Referral details
      referral_code VARCHAR(20) NOT NULL,
      referral_source TEXT, -- DIRECT_LINK, SOCIAL_SHARE, QR_CODE
      
      -- Conversion tracking
      status TEXT DEFAULT 'PENDING', -- PENDING, CONVERTED, COMPLETED, EXPIRED
      first_order_id UUID,
      conversion_date TIMESTAMP,
      
      -- Rewards tracking
      referrer_reward_cents INTEGER DEFAULT 0,
      referee_reward_cents INTEGER DEFAULT 0,
      rewards_paid BOOLEAN DEFAULT false,
      
      -- Campaign tracking
      campaign_id UUID,
      campaign_code VARCHAR(50),
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP
    );

    -- User notification preferences
    CREATE TABLE IF NOT EXISTS user_notification_preferences (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      
      -- Notification channels
      email_enabled BOOLEAN DEFAULT true,
      sms_enabled BOOLEAN DEFAULT true,
      push_enabled BOOLEAN DEFAULT true,
      in_app_enabled BOOLEAN DEFAULT true,
      whatsapp_enabled BOOLEAN DEFAULT false,
      
      -- Notification categories
      order_updates BOOLEAN DEFAULT true,
      promotional_offers BOOLEAN DEFAULT true,
      loyalty_updates BOOLEAN DEFAULT true,
      social_updates BOOLEAN DEFAULT true,
      security_alerts BOOLEAN DEFAULT true,
      
      -- Timing preferences
      quiet_hours_start TIME,
      quiet_hours_end TIME,
      timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
      
      -- Frequency preferences
      marketing_frequency TEXT DEFAULT 'WEEKLY', -- DAILY, WEEKLY, MONTHLY, NEVER
      digest_frequency TEXT DEFAULT 'WEEKLY',
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- User sessions for analytics
    CREATE TABLE IF NOT EXISTS user_sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      
      -- Session details
      session_token VARCHAR(255) UNIQUE NOT NULL,
      device_type VARCHAR(50), -- MOBILE, DESKTOP, TABLET
      device_id VARCHAR(255),
      
      -- Session data
      ip_address INET,
      user_agent TEXT,
      app_version VARCHAR(20),
      platform VARCHAR(20), -- iOS, Android, Web
      
      -- Location data
      country VARCHAR(100),
      city VARCHAR(100),
      coordinates JSONB,
      
      -- Session metrics
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP,
      duration_seconds INTEGER,
      
      -- Activity tracking
      pages_viewed INTEGER DEFAULT 0,
      actions_performed INTEGER DEFAULT 0,
      orders_placed INTEGER DEFAULT 0
    );

    -- User analytics and insights
    CREATE TABLE IF NOT EXISTS user_analytics (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      
      -- Time period
      analytics_date DATE NOT NULL,
      week_of_year INTEGER,
      month_of_year INTEGER,
      
      -- Engagement metrics
      sessions_count INTEGER DEFAULT 0,
      total_session_time_seconds INTEGER DEFAULT 0,
      avg_session_duration_seconds INTEGER DEFAULT 0,
      pages_viewed INTEGER DEFAULT 0,
      
      -- Ordering behavior
      orders_placed INTEGER DEFAULT 0,
      total_order_value_cents INTEGER DEFAULT 0,
      avg_order_value_cents INTEGER DEFAULT 0,
      favorite_cuisines JSONB,
      
      -- App usage patterns
      peak_usage_hour INTEGER,
      most_used_features JSONB,
      search_queries_count INTEGER DEFAULT 0,
      
      -- Social engagement
      social_interactions INTEGER DEFAULT 0,
      content_shared INTEGER DEFAULT 0,
      referrals_made INTEGER DEFAULT 0,
      
      UNIQUE(user_id, analytics_date)
    );

    -- User segments for marketing and personalization
    CREATE TABLE IF NOT EXISTS user_segments (
      id UUID PRIMARY KEY,
      segment_name VARCHAR(100) NOT NULL UNIQUE,
      segment_description TEXT,
      
      -- Segment criteria
      criteria_rules JSONB NOT NULL, -- Complex rules for segment membership
      
      -- Segment metrics
      user_count INTEGER DEFAULT 0,
      avg_order_value_cents INTEGER DEFAULT 0,
      avg_lifetime_value_cents INTEGER DEFAULT 0,
      churn_rate_percentage DECIMAL(5,2) DEFAULT 0,
      
      -- Targeting information
      is_active BOOLEAN DEFAULT true,
      targeting_priority INTEGER DEFAULT 1,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- User segment memberships
    CREATE TABLE IF NOT EXISTS user_segment_memberships (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      segment_id UUID NOT NULL REFERENCES user_segments(id) ON DELETE CASCADE,
      
      -- Membership details
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      confidence_score DECIMAL(3,2) DEFAULT 1.0,
      
      -- Dynamic membership tracking
      is_active BOOLEAN DEFAULT true,
      last_evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(user_id, segment_id)
    );

    -- User feedback and ratings for the platform
    CREATE TABLE IF NOT EXISTS user_feedback (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      
      -- Feedback details
      feedback_type TEXT NOT NULL, -- APP_RATING, FEATURE_REQUEST, BUG_REPORT, GENERAL
      subject VARCHAR(200),
      message TEXT NOT NULL,
      rating INTEGER, -- 1-5 stars
      
      -- Context
      page_url VARCHAR(500),
      app_version VARCHAR(20),
      device_info JSONB,
      
      -- Status tracking
      status TEXT DEFAULT 'OPEN', -- OPEN, IN_PROGRESS, RESOLVED, CLOSED
      priority TEXT DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, URGENT
      
      -- Response tracking
      admin_response TEXT,
      responded_at TIMESTAMP,
      resolved_at TIMESTAMP,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for performance optimization
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE account_status = 'ACTIVE';
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE account_status = 'ACTIVE';
    CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
    CREATE INDEX IF NOT EXISTS idx_users_loyalty_tier ON users(loyalty_tier, loyalty_points);
    CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON user_addresses(user_id) WHERE is_active = true;
    CREATE INDEX IF NOT EXISTS idx_user_addresses_default ON user_addresses(user_id, is_default);
    CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id, category);
    CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user ON loyalty_transactions(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_user_connections_requester ON user_connections(requester_id, status);
    CREATE INDEX IF NOT EXISTS idx_user_connections_addressee ON user_connections(addressee_id, status);
    CREATE INDEX IF NOT EXISTS idx_user_activities_user ON user_activities(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_user_analytics_date ON user_analytics(user_id, analytics_date);
    CREATE INDEX IF NOT EXISTS idx_user_segments_active ON user_segments(is_active, targeting_priority);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, started_at);
  `;
  
  await pool.query(sql);
  console.log('✅ Advanced user management schema initialized');
}

// Advanced User class with comprehensive management
class User {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.userCode = data.userCode || this.generateUserCode();
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.email = data.email;
    this.phone = data.phone;
    this.dateOfBirth = data.dateOfBirth;
    this.gender = data.gender;
    
    // Account management
    this.passwordHash = data.passwordHash;
    this.role = data.role || 'CUSTOMER';
    this.accountStatus = data.accountStatus || 'ACTIVE';
    this.isEmailVerified = data.isEmailVerified || false;
    this.isPhoneVerified = data.isPhoneVerified || false;
    
    // Profile information
    this.profileImageUrl = data.profileImageUrl;
    this.bio = data.bio;
    this.locationAddress = data.locationAddress;
    this.homeCoordinates = data.homeCoordinates;
    this.workCoordinates = data.workCoordinates;
    
    // Preferences
    this.languagePreference = data.languagePreference || 'en';
    this.currencyPreference = data.currencyPreference || 'INR';
    this.timezone = data.timezone || 'Asia/Kolkata';
    
    // Privacy settings
    this.profileVisibility = data.profileVisibility || 'PUBLIC';
    this.locationSharing = data.locationSharing || false;
    this.activitySharing = data.activitySharing || true;
    
    // Loyalty and engagement
    this.loyaltyTier = data.loyaltyTier || 'BRONZE';
    this.loyaltyPoints = data.loyaltyPoints || 0;
    this.totalSpentCents = data.totalSpentCents || 0;
    this.totalOrders = data.totalOrders || 0;
    
    // Social features
    this.followersCount = data.followersCount || 0;
    this.followingCount = data.followingCount || 0;
    this.socialScore = data.socialScore || 0;
    
    // Referral system
    this.referralCode = data.referralCode || this.generateReferralCode();
    this.referredByUserId = data.referredByUserId;
    this.referralEarningsCents = data.referralEarningsCents || 0;
    this.successfulReferrals = data.successfulReferrals || 0;
    
    // Analytics and tracking
    this.lastLoginAt = data.lastLoginAt;
    this.lastOrderAt = data.lastOrderAt;
    this.registrationSource = data.registrationSource || 'WEB';
    this.deviceInfo = data.deviceInfo;
    
    // Engagement metrics
    this.sessionCount = data.sessionCount || 0;
    this.avgSessionDurationSeconds = data.avgSessionDurationSeconds || 0;
    this.pushNotificationsEnabled = data.pushNotificationsEnabled !== false;
    this.marketingEmailsEnabled = data.marketingEmailsEnabled !== false;
    
    // Subscription and premium
    this.isPremiumMember = data.isPremiumMember || false;
    this.premiumExpiryDate = data.premiumExpiryDate;
    this.subscriptionPlan = data.subscriptionPlan;
    
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  generateUserCode() {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `QB${timestamp}${random}`;
  }

  generateReferralCode() {
    const name = (this.firstName || 'USER').substr(0, 3).toUpperCase();
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `${name}${random}`;
  }

  // Create new user with comprehensive profile setup
  async save() {
    try {
      // Hash password if provided
      if (this.password) {
        this.passwordHash = await bcrypt.hash(this.password, 12);
        delete this.password; // Remove plain password
      }

      const query = `
        INSERT INTO users (
          id, user_code, first_name, last_name, email, phone, date_of_birth, gender,
          password_hash, role, account_status, is_email_verified, is_phone_verified,
          profile_image_url, bio, location_address, home_coordinates, work_coordinates,
          language_preference, currency_preference, timezone, profile_visibility,
          location_sharing, activity_sharing, loyalty_tier, loyalty_points,
          total_spent_cents, total_orders, referral_code, referred_by_user_id,
          referral_earnings_cents, successful_referrals, registration_source,
          device_info, push_notifications_enabled, marketing_emails_enabled,
          is_premium_member, premium_expiry_date, subscription_plan
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
          $35, $36, $37, $38, $39
        ) RETURNING *
      `;
      
      const values = [
        this.id, this.userCode, this.firstName, this.lastName, this.email, this.phone,
        this.dateOfBirth, this.gender, this.passwordHash, this.role, this.accountStatus,
        this.isEmailVerified, this.isPhoneVerified, this.profileImageUrl, this.bio,
        JSON.stringify(this.locationAddress), JSON.stringify(this.homeCoordinates),
        JSON.stringify(this.workCoordinates), this.languagePreference, this.currencyPreference,
        this.timezone, this.profileVisibility, this.locationSharing, this.activitySharing,
        this.loyaltyTier, this.loyaltyPoints, this.totalSpentCents, this.totalOrders,
        this.referralCode, this.referredByUserId, this.referralEarningsCents,
        this.successfulReferrals, this.registrationSource, JSON.stringify(this.deviceInfo),
        this.pushNotificationsEnabled, this.marketingEmailsEnabled, this.isPremiumMember,
        this.premiumExpiryDate, this.subscriptionPlan
      ];
      
      const result = await pool.query(query, values);
      
      // Initialize user loyalty record
      await this.initializeLoyaltyProgram();
      
      // Set up default notification preferences
      await this.setupDefaultNotificationPreferences();
      
      return result.rows[0];
    } catch (error) {
      console.error('Error saving user:', error);
      throw error;
    }
  }

  // Initialize loyalty program for new users
  async initializeLoyaltyProgram() {
    try {
      const loyaltyQuery = `
        INSERT INTO user_loyalty (
          id, user_id, current_tier, points_balance, tier_benefits,
          next_tier_requirements, tier_achieved_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      
      const tierBenefits = this.getTierBenefits('BRONZE');
      const nextTierRequirements = this.getNextTierRequirements('BRONZE');
      
      await pool.query(loyaltyQuery, [
        uuidv4(), this.id, 'BRONZE', 0, JSON.stringify(tierBenefits),
        JSON.stringify(nextTierRequirements), new Date()
      ]);

      // Welcome bonus points
      await this.addLoyaltyPoints(100, 'WELCOME_BONUS', 'Welcome to QuickBite!');
    } catch (error) {
      console.error('Error initializing loyalty program:', error);
    }
  }

  // Set up default notification preferences
  async setupDefaultNotificationPreferences() {
    try {
      const prefQuery = `
        INSERT INTO user_notification_preferences (
          id, user_id, email_enabled, sms_enabled, push_enabled, in_app_enabled,
          order_updates, promotional_offers, loyalty_updates, social_updates,
          security_alerts, marketing_frequency, digest_frequency
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `;
      
      await pool.query(prefQuery, [
        uuidv4(), this.id, true, true, true, true, true, true, true, true,
        true, 'WEEKLY', 'WEEKLY'
      ]);
    } catch (error) {
      console.error('Error setting up notification preferences:', error);
    }
  }

  // Find user by various identifiers
  static async findById(id) {
    try {
      const query = `
        SELECT u.*, ul.current_tier, ul.points_balance, ul.tier_progress_percentage
        FROM users u
        LEFT JOIN user_loyalty ul ON ul.user_id = u.id
        WHERE u.id = $1 AND u.account_status != 'DEACTIVATED'
      `;
      
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding user by ID:', error);
      throw error;
    }
  }

  static async findByEmail(email) {
    try {
      const query = `
        SELECT u.*, ul.current_tier, ul.points_balance
        FROM users u
        LEFT JOIN user_loyalty ul ON ul.user_id = u.id
        WHERE LOWER(u.email) = LOWER($1) AND u.account_status != 'DEACTIVATED'
      `;
      
      const result = await pool.query(query, [email]);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw error;
    }
  }

  static async findByPhone(phone) {
    try {
      const query = `
        SELECT u.*, ul.current_tier, ul.points_balance
        FROM users u
        LEFT JOIN user_loyalty ul ON ul.user_id = u.id
        WHERE u.phone = $1 AND u.account_status != 'DEACTIVATED'
      `;
      
      const result = await pool.query(query, [phone]);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding user by phone:', error);
      throw error;
    }
  }

  static async findByReferralCode(referralCode) {
    try {
      const query = `
        SELECT u.*, ul.current_tier, ul.points_balance
        FROM users u
        LEFT JOIN user_loyalty ul ON ul.user_id = u.id
        WHERE u.referral_code = $1 AND u.account_status = 'ACTIVE'
      `;
      
      const result = await pool.query(query, [referralCode]);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding user by referral code:', error);
      throw error;
    }
  }

  // Comprehensive user profile update
  static async updateProfile(userId, updates) {
    try {
      const allowedFields = [
        'first_name', 'last_name', 'date_of_birth', 'gender', 'bio',
        'profile_image_url', 'location_address', 'home_coordinates',
        'work_coordinates', 'language_preference', 'currency_preference',
        'timezone', 'profile_visibility', 'location_sharing', 'activity_sharing'
      ];
      
      const updateFields = [];
      const values = [];
      let valueIndex = 1;
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key) && value !== undefined) {
          updateFields.push(`${key} = $${valueIndex + 1}`);
          values.push(value);
          valueIndex++;
        }
      }
      
      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }
      
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.unshift(userId); // Add userId as first parameter
      
      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')}
        WHERE id = $1
        RETURNING *
      `;
      
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }

  // Loyalty points management
  async addLoyaltyPoints(points, transactionType, reason, orderId = null) {
    try {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Update user loyalty points
        const updateQuery = `
          UPDATE user_loyalty 
          SET points_balance = points_balance + $1,
              lifetime_points_earned = lifetime_points_earned + $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $2
          RETURNING points_balance
        `;
        
        const result = await client.query(updateQuery, [points, this.id]);
        const newBalance = result.rows[0].points_balance;
        
        // Record transaction
        const transactionQuery = `
          INSERT INTO loyalty_transactions (
            id, user_id, transaction_type, points_amount, balance_after,
            order_id, reason, description
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        
        await client.query(transactionQuery, [
          uuidv4(), this.id, transactionType, points, newBalance,
          orderId, reason, `${transactionType}: ${reason}`
        ]);
        
        // Check for tier upgrade
        await this.checkTierUpgrade(client, newBalance);
        
        await client.query('COMMIT');
        return newBalance;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error adding loyalty points:', error);
      throw error;
    }
  }

  // Check and process tier upgrades
  async checkTierUpgrade(client, currentPoints) {
    try {
      const tierThresholds = {
        'BRONZE': 0,
        'SILVER': 1000,
        'GOLD': 5000,
        'PLATINUM': 15000,
        'DIAMOND': 50000
      };
      
      let newTier = 'BRONZE';
      for (const [tier, threshold] of Object.entries(tierThresholds)) {
        if (currentPoints >= threshold) {
          newTier = tier;
        }
      }
      
      // Check if upgrade is needed
      const currentTierQuery = `
        SELECT current_tier FROM user_loyalty WHERE user_id = $1
      `;
      const currentResult = await client.query(currentTierQuery, [this.id]);
      const currentTier = currentResult.rows[0].current_tier;
      
      if (newTier !== currentTier) {
        // Upgrade tier
        const upgradeQuery = `
          UPDATE user_loyalty 
          SET current_tier = $1,
              tier_achieved_at = CURRENT_TIMESTAMP,
              tier_benefits = $2,
              next_tier_requirements = $3
          WHERE user_id = $4
        `;
        
        const tierBenefits = this.getTierBenefits(newTier);
        const nextTierRequirements = this.getNextTierRequirements(newTier);
        
        await client.query(upgradeQuery, [
          newTier, JSON.stringify(tierBenefits), JSON.stringify(nextTierRequirements), this.id
        ]);
        
        // Award tier upgrade bonus
        const tierBonusPoints = this.getTierUpgradeBonus(newTier);
        if (tierBonusPoints > 0) {
          await this.addLoyaltyPoints(tierBonusPoints, 'TIER_UPGRADE_BONUS', `Upgraded to ${newTier} tier`);
        }
        
        console.log(`🎉 User ${this.id} upgraded to ${newTier} tier!`);
      }
    } catch (error) {
      console.error('Error checking tier upgrade:', error);
    }
  }

  // Get tier-specific benefits
  getTierBenefits(tier) {
    const benefits = {
      'BRONZE': ['FREE_DELIVERY_ABOVE_299', 'BIRTHDAY_DISCOUNT_5'],
      'SILVER': ['FREE_DELIVERY_ABOVE_199', 'BIRTHDAY_DISCOUNT_10', 'PRIORITY_SUPPORT'],
      'GOLD': ['FREE_DELIVERY_ABOVE_99', 'BIRTHDAY_DISCOUNT_15', 'PRIORITY_SUPPORT', 'EXCLUSIVE_OFFERS'],
      'PLATINUM': ['FREE_DELIVERY_ALWAYS', 'BIRTHDAY_DISCOUNT_20', 'VIP_SUPPORT', 'EXCLUSIVE_OFFERS', 'EARLY_ACCESS'],
      'DIAMOND': ['FREE_DELIVERY_ALWAYS', 'BIRTHDAY_DISCOUNT_25', 'VIP_SUPPORT', 'EXCLUSIVE_OFFERS', 'EARLY_ACCESS', 'PERSONAL_CONCIERGE']
    };
    
    return benefits[tier] || benefits['BRONZE'];
  }

  // Get next tier requirements
  getNextTierRequirements(currentTier) {
    const requirements = {
      'BRONZE': { nextTier: 'SILVER', pointsNeeded: 1000, ordersNeeded: 5 },
      'SILVER': { nextTier: 'GOLD', pointsNeeded: 5000, ordersNeeded: 20 },
      'GOLD': { nextTier: 'PLATINUM', pointsNeeded: 15000, ordersNeeded: 50 },
      'PLATINUM': { nextTier: 'DIAMOND', pointsNeeded: 50000, ordersNeeded: 150 },
      'DIAMOND': { nextTier: null, pointsNeeded: null, ordersNeeded: null }
    };
    
    return requirements[currentTier] || requirements['BRONZE'];
  }

  // Get tier upgrade bonus points
  getTierUpgradeBonus(tier) {
    const bonuses = {
      'SILVER': 200,
      'GOLD': 500,
      'PLATINUM': 1000,
      'DIAMOND': 2500
    };
    
    return bonuses[tier] || 0;
  }

  // User analytics and insights
  static async getUserAnalytics(userId, startDate, endDate) {
    try {
      const query = `
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          SUM(sessions_count) as total_sessions,
          SUM(total_session_time_seconds) as total_time,
          SUM(orders_placed) as orders_count,
          SUM(total_order_value_cents) as total_spent,
          AVG(avg_order_value_cents) as avg_order_value
        FROM user_analytics
        WHERE user_id = $1 
          AND analytics_date BETWEEN $2 AND $3
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date DESC
      `;
      
      const result = await pool.query(query, [userId, startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error('Error getting user analytics:', error);
      throw error;
    }
  }

  // Password management
  static async verifyPassword(plainPassword, hashedPassword) {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      console.error('Error verifying password:', error);
      return false;
    }
  }

  static async updatePassword(userId, newPassword) {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      
      const query = `
        UPDATE users 
        SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id
      `;
      
      const result = await pool.query(query, [hashedPassword, userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating password:', error);
      throw error;
    }
  }
}

// User Address Management Class
class UserAddress {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.userId = data.userId;
    this.addressType = data.addressType || 'OTHER';
    this.addressLabel = data.addressLabel;
    this.addressLine1 = data.addressLine1;
    this.addressLine2 = data.addressLine2;
    this.city = data.city;
    this.state = data.state;
    this.postalCode = data.postalCode;
    this.country = data.country || 'India';
    this.latitude = data.latitude;
    this.longitude = data.longitude;
    this.deliveryInstructions = data.deliveryInstructions;
    this.landmark = data.landmark;
    this.isDefault = data.isDefault || false;
    this.isActive = data.isActive !== false;
  }

  async save() {
    try {
      // If this is set as default, unset other default addresses
      if (this.isDefault) {
        await pool.query(
          'UPDATE user_addresses SET is_default = false WHERE user_id = $1 AND id != $2',
          [this.userId, this.id]
        );
      }

      const query = `
        INSERT INTO user_addresses (
          id, user_id, address_type, address_label, address_line1, address_line2,
          city, state, postal_code, country, latitude, longitude,
          delivery_instructions, landmark, is_default, is_active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        ) RETURNING *
      `;

      const values = [
        this.id, this.userId, this.addressType, this.addressLabel,
        this.addressLine1, this.addressLine2, this.city, this.state,
        this.postalCode, this.country, this.latitude, this.longitude,
        this.deliveryInstructions, this.landmark, this.isDefault, this.isActive
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error saving address:', error);
      throw error;
    }
  }

  static async getByUserId(userId) {
    try {
      const query = `
        SELECT * FROM user_addresses 
        WHERE user_id = $1 AND is_active = true
        ORDER BY is_default DESC, created_at DESC
      `;

      const result = await pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      console.error('Error getting user addresses:', error);
      throw error;
    }
  }

  static async setAsDefault(userId, addressId) {
    try {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Unset current default
        await client.query(
          'UPDATE user_addresses SET is_default = false WHERE user_id = $1',
          [userId]
        );
        
        // Set new default
        const result = await client.query(
          'UPDATE user_addresses SET is_default = true WHERE id = $1 AND user_id = $2 RETURNING *',
          [addressId, userId]
        );
        
        await client.query('COMMIT');
        return result.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error setting default address:', error);
      throw error;
    }
  }
}

// User Preferences Management Class
class UserPreferences {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.userId = data.userId;
    this.category = data.category;
    this.preferenceKey = data.preferenceKey;
    this.preferenceValue = data.preferenceValue;
    this.preferenceStrength = data.preferenceStrength || 1.0;
    this.source = data.source || 'USER_INPUT';
    this.confidenceScore = data.confidenceScore || 1.0;
  }

  async save() {
    try {
      const query = `
        INSERT INTO user_preferences (
          id, user_id, category, preference_key, preference_value,
          preference_strength, source, confidence_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (user_id, category, preference_key)
        DO UPDATE SET
          preference_value = EXCLUDED.preference_value,
          preference_strength = EXCLUDED.preference_strength,
          confidence_score = EXCLUDED.confidence_score,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const values = [
        this.id, this.userId, this.category, this.preferenceKey,
        JSON.stringify(this.preferenceValue), this.preferenceStrength,
        this.source, this.confidenceScore
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error saving preference:', error);
      throw error;
    }
  }

  static async getByUserId(userId, category = null) {
    try {
      let query = 'SELECT * FROM user_preferences WHERE user_id = $1';
      const params = [userId];

      if (category) {
        query += ' AND category = $2';
        params.push(category);
      }

      query += ' ORDER BY category, preference_key';

      const result = await pool.query(query, params);
      return result.rows.map(row => ({
        ...row,
        preference_value: typeof row.preference_value === 'string' 
          ? JSON.parse(row.preference_value) 
          : row.preference_value
      }));
    } catch (error) {
      console.error('Error getting preferences:', error);
      throw error;
    }
  }

  static async updatePreferences(userId, preferences) {
    try {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        for (const pref of preferences) {
          const preference = new UserPreferences({
            userId,
            ...pref
          });
          await preference.save();
        }
        
        await client.query('COMMIT');
        return true;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error updating preferences:', error);
      throw error;
    }
  }
}

// Social Connections Management Class
class UserConnection {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.requesterId = data.requesterId;
    this.addresseeId = data.addresseeId;
    this.connectionType = data.connectionType || 'FRIEND';
    this.status = data.status || 'PENDING';
    this.interactionScore = data.interactionScore || 0;
    this.sharedOrdersCount = data.sharedOrdersCount || 0;
    this.lastInteractionAt = data.lastInteractionAt;
    this.notes = data.notes;
  }

  async save() {
    try {
      const query = `
        INSERT INTO user_connections (
          id, requester_id, addressee_id, connection_type, status,
          interaction_score, shared_orders_count, last_interaction_at, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const values = [
        this.id, this.requesterId, this.addresseeId, this.connectionType,
        this.status, this.interactionScore, this.sharedOrdersCount,
        this.lastInteractionAt, this.notes
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error saving connection:', error);
      throw error;
    }
  }

  static async getConnections(userId, status = 'ACCEPTED') {
    try {
      const query = `
        SELECT 
          uc.*,
          CASE 
            WHEN uc.requester_id = $1 THEN u2.first_name || ' ' || u2.last_name
            ELSE u1.first_name || ' ' || u1.last_name
          END as friend_name,
          CASE 
            WHEN uc.requester_id = $1 THEN u2.profile_image_url
            ELSE u1.profile_image_url
          END as friend_profile_image,
          CASE 
            WHEN uc.requester_id = $1 THEN u2.id
            ELSE u1.id
          END as friend_id
        FROM user_connections uc
        JOIN users u1 ON u1.id = uc.requester_id
        JOIN users u2 ON u2.id = uc.addressee_id
        WHERE (uc.requester_id = $1 OR uc.addressee_id = $1)
          AND uc.status = $2
        ORDER BY uc.last_interaction_at DESC NULLS LAST
      `;

      const result = await pool.query(query, [userId, status]);
      return result.rows;
    } catch (error) {
      console.error('Error getting connections:', error);
      throw error;
    }
  }

  static async updateConnectionStatus(connectionId, status, responderId) {
    try {
      const query = `
        UPDATE user_connections 
        SET status = $1, responded_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND addressee_id = $3
        RETURNING *
      `;

      const result = await pool.query(query, [status, connectionId, responderId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating connection status:', error);
      throw error;
    }
  }

  static async searchUsers(searchTerm, excludeUserId, limit = 20) {
    try {
      const query = `
        SELECT 
          id, first_name, last_name, profile_image_url, bio, social_score,
          followers_count, following_count
        FROM users
        WHERE (
          LOWER(first_name || ' ' || last_name) LIKE LOWER($1) OR
          LOWER(email) LIKE LOWER($1) OR
          phone LIKE $1
        )
        AND id != $2
        AND account_status = 'ACTIVE'
        ORDER BY social_score DESC, followers_count DESC
        LIMIT $3
      `;

      const result = await pool.query(query, [`%${searchTerm}%`, excludeUserId, limit]);
      return result.rows;
    } catch (error) {
      console.error('Error searching users:', error);
      throw error;
    }
  }
}

// Referral System Management Class
class UserReferral {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.referrerId = data.referrerId;
    this.refereeId = data.refereeId;
    this.referralCode = data.referralCode;
    this.referralSource = data.referralSource;
    this.status = data.status || 'PENDING';
    this.firstOrderId = data.firstOrderId;
    this.conversionDate = data.conversionDate;
    this.referrerRewardCents = data.referrerRewardCents || 0;
    this.refereeRewardCents = data.refereeRewardCents || 0;
    this.rewardsPaid = data.rewardsPaid || false;
    this.campaignId = data.campaignId;
    this.campaignCode = data.campaignCode;
    this.expiresAt = data.expiresAt;
  }

  async save() {
    try {
      const query = `
        INSERT INTO user_referrals (
          id, referrer_id, referee_id, referral_code, referral_source,
          status, first_order_id, conversion_date, referrer_reward_cents,
          referee_reward_cents, rewards_paid, campaign_id, campaign_code, expires_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        ) RETURNING *
      `;

      const values = [
        this.id, this.referrerId, this.refereeId, this.referralCode,
        this.referralSource, this.status, this.firstOrderId, this.conversionDate,
        this.referrerRewardCents, this.refereeRewardCents, this.rewardsPaid,
        this.campaignId, this.campaignCode, this.expiresAt
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error saving referral:', error);
      throw error;
    }
  }

  static async processReferralConversion(refereeId, orderId) {
    try {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Find pending referral
        const findQuery = `
          SELECT * FROM user_referrals 
          WHERE referee_id = $1 AND status = 'PENDING'
        `;
        const referral = await client.query(findQuery, [refereeId]);
        
        if (referral.rows.length === 0) {
          await client.query('COMMIT');
          return null;
        }
        
        const referralData = referral.rows[0];
        
        // Update referral status
        const updateQuery = `
          UPDATE user_referrals 
          SET status = 'CONVERTED', 
              first_order_id = $1, 
              conversion_date = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
        `;
        
        const updatedReferral = await client.query(updateQuery, [orderId, referralData.id]);
        
        // Award referral rewards
        await UserReferral.awardReferralRewards(client, referralData.referrer_id, refereeId, referralData.id);
        
        await client.query('COMMIT');
        return updatedReferral.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error processing referral conversion:', error);
      throw error;
    }
  }

  static async awardReferralRewards(client, referrerId, refereeId, referralId) {
    try {
      const referrerReward = 500; // ₹5 in paise
      const refereeReward = 300; // ₹3 in paise
      
      // Award points to referrer
      const referrerUser = new User({ id: referrerId });
      await referrerUser.addLoyaltyPoints(
        referrerReward,
        'REFERRAL_REWARD',
        'Referral reward for successful referral'
      );
      
      // Award points to referee
      const refereeUser = new User({ id: refereeId });
      await refereeUser.addLoyaltyPoints(
        refereeReward,
        'REFERRAL_REWARD',
        'Welcome reward from referral'
      );
      
      // Update referral record
      await client.query(
        'UPDATE user_referrals SET referrer_reward_cents = $1, referee_reward_cents = $2, rewards_paid = true WHERE id = $3',
        [referrerReward, refereeReward, referralId]
      );
      
      // Update referrer stats
      await client.query(
        'UPDATE users SET successful_referrals = successful_referrals + 1, referral_earnings_cents = referral_earnings_cents + $1 WHERE id = $2',
        [referrerReward, referrerId]
      );
      
    } catch (error) {
      console.error('Error awarding referral rewards:', error);
      throw error;
    }
  }

  static async getReferralStats(userId) {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_referrals,
          COUNT(CASE WHEN status = 'CONVERTED' THEN 1 END) as successful_referrals,
          COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_referrals,
          SUM(referrer_reward_cents) as total_earnings_cents
        FROM user_referrals
        WHERE referrer_id = $1
      `;

      const result = await pool.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting referral stats:', error);
      throw error;
    }
  }
}

module.exports = {
  ensureUserSchema,
  User,
  UserAddress,
  UserPreferences,
  UserConnection,
  UserReferral,
  USER_ROLES,
  ACCOUNT_STATUS,
  LOYALTY_TIERS,
  PREFERENCE_CATEGORIES,
  SOCIAL_CONNECTION_TYPES,
  NOTIFICATION_PREFERENCES
};