require('dotenv').config();

const config = {
  // Server configuration
  server: {
    port: process.env.PORT || 3005,
    host: process.env.HOST || 'localhost',
    env: process.env.NODE_ENV || 'development'
  },

  // Database configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'quickbite_users',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.NODE_ENV === 'production'
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },

  // Redis configuration (for caching and sessions)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: process.env.REDIS_DB || 0
  },

  // File upload configuration
  upload: {
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    uploadPath: process.env.UPLOAD_PATH || './uploads'
  },

  // Email configuration
  email: {
    service: process.env.EMAIL_SERVICE || 'gmail',
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'noreply@quickbite.app'
  },

  // SMS configuration (for notifications)
  sms: {
    provider: process.env.SMS_PROVIDER || 'twilio',
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || ''
  },

  // App configuration
  app: {
    name: 'QuickBite User Service',
    version: '1.0.0',
    baseUrl: process.env.APP_BASE_URL || 'https://quickbite.app',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    adminUrl: process.env.ADMIN_URL || 'http://localhost:3001'
  },

  // Security configuration
  security: {
    saltRounds: 12,
    rateLimitWindow: 15 * 60 * 1000, // 15 minutes
    rateLimitMax: 100, // requests per window
    corsOrigins: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://quickbite.app',
      'https://www.quickbite.app',
      'https://admin.quickbite.app'
    ]
  },

  // Loyalty program configuration
  loyalty: {
    pointsPerRupee: 1, // 1 point per rupee spent
    minimumRedemption: 1000, // minimum 1000 points to redeem
    pointExpiryMonths: 12, // points expire after 12 months
    tiers: {
      BRONZE: { minPoints: 0, minOrders: 0, multiplier: 1 },
      SILVER: { minPoints: 5000, minOrders: 5, multiplier: 1.2 },
      GOLD: { minPoints: 15000, minOrders: 20, multiplier: 1.5 },
      PLATINUM: { minPoints: 40000, minOrders: 50, multiplier: 2 },
      DIAMOND: { minPoints: 100000, minOrders: 100, multiplier: 3 }
    }
  },

  // Referral program configuration
  referral: {
    referrerReward: 500, // ₹5 in paise
    refereeReward: 300, // ₹3 in paise
    codeLength: 8,
    expiryDays: 365, // referral code expires after 1 year
    maxRewardsPerUser: 50 // maximum 50 referral rewards per user
  },

  // Notification configuration
  notifications: {
    pushService: process.env.PUSH_SERVICE || 'firebase',
    firebaseServerKey: process.env.FIREBASE_SERVER_KEY || '',
    webPushVapidPublic: process.env.WEB_PUSH_VAPID_PUBLIC || '',
    webPushVapidPrivate: process.env.WEB_PUSH_VAPID_PRIVATE || '',
    webPushContact: process.env.WEB_PUSH_CONTACT || 'mailto:admin@quickbite.app'
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'app.log',
    maxSize: '10MB',
    maxFiles: 5
  },

  // Feature flags
  features: {
    socialFeatures: process.env.ENABLE_SOCIAL === 'true',
    loyaltyProgram: process.env.ENABLE_LOYALTY === 'true',
    referralProgram: process.env.ENABLE_REFERRAL === 'true',
    advancedAnalytics: process.env.ENABLE_ANALYTICS === 'true',
    realTimeNotifications: process.env.ENABLE_REALTIME === 'true'
  },

  // External service URLs
  services: {
    authService: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    orderService: process.env.ORDER_SERVICE_URL || 'http://localhost:3002',
    restaurantService: process.env.RESTAURANT_SERVICE_URL || 'http://localhost:3003',
    deliveryService: process.env.DELIVERY_SERVICE_URL || 'http://localhost:3004',
    notificationService: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3006'
  }
};

// Validation
function validateConfig() {
  const required = [
    'JWT_SECRET',
    'DB_PASSWORD'
  ];

  if (config.server.env === 'production') {
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
}

// Initialize configuration
validateConfig();

module.exports = config;