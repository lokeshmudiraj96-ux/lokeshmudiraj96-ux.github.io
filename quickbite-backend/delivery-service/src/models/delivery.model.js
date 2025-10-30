const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Comprehensive delivery system constants
const DELIVERY_STATUSES = ['PENDING', 'ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'CANCELLED', 'FAILED', 'RETURNED'];
const ACTIVE_STATUSES = ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED'];
const PARTNER_TYPES = ['INTERNAL', 'THIRD_PARTY', 'FREELANCE', 'RESTAURANT_OWNED'];
const VEHICLE_TYPES = ['BICYCLE', 'MOTORCYCLE', 'CAR', 'SCOOTER', 'WALKING'];
const DELIVERY_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

async function ensureSchema() {
  const sql = `
    -- Enhanced delivery partners (agents) table
    CREATE TABLE IF NOT EXISTS delivery_partners (
      id UUID PRIMARY KEY,
      partner_code VARCHAR(20) UNIQUE NOT NULL,
      
      -- Personal information
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE,
      phone VARCHAR(20) NOT NULL,
      date_of_birth DATE,
      
      -- Employment details
      partner_type TEXT NOT NULL DEFAULT 'FREELANCE', -- INTERNAL, THIRD_PARTY, FREELANCE, RESTAURANT_OWNED
      employment_status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, SUSPENDED, TERMINATED
      joining_date DATE DEFAULT CURRENT_DATE,
      
      -- Vehicle and capacity information
      vehicle_type TEXT NOT NULL DEFAULT 'MOTORCYCLE',
      vehicle_number VARCHAR(20),
      max_orders_capacity INTEGER DEFAULT 3,
      max_delivery_distance_km DECIMAL(5,2) DEFAULT 15.0,
      
      -- Location and availability
      current_latitude DECIMAL(10,8),
      current_longitude DECIMAL(11,8),
      home_latitude DECIMAL(10,8),
      home_longitude DECIMAL(11,8),
      service_areas JSONB, -- Array of area codes/zones
      
      -- Performance metrics
      total_deliveries INTEGER DEFAULT 0,
      successful_deliveries INTEGER DEFAULT 0,
      average_rating DECIMAL(3,2) DEFAULT 0.0,
      total_earnings_cents BIGINT DEFAULT 0,
      
      -- Availability and schedule
      is_online BOOLEAN DEFAULT false,
      is_available BOOLEAN DEFAULT true,
      shift_start_time TIME,
      shift_end_time TIME,
      working_days JSONB, -- Array of weekday numbers [1,2,3,4,5,6,7]
      
      -- Verification and compliance
      is_verified BOOLEAN DEFAULT false,
      documents_verified BOOLEAN DEFAULT false,
      background_check_status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
      
      -- Banking information (encrypted)
      bank_account_number TEXT,
      bank_ifsc_code VARCHAR(20),
      upi_id VARCHAR(100),
      
      -- Device and app information
      device_token TEXT, -- For push notifications
      app_version VARCHAR(20),
      last_location_update TIMESTAMP,
      
      -- Metadata
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Enhanced deliveries table with comprehensive tracking
    CREATE TABLE IF NOT EXISTS deliveries (
      id UUID PRIMARY KEY,
      delivery_code VARCHAR(20) UNIQUE NOT NULL,
      
      -- Order and customer information
      order_id UUID NOT NULL,
      customer_id UUID NOT NULL,
      restaurant_id UUID NOT NULL,
      partner_id UUID REFERENCES delivery_partners(id),
      
      -- Delivery details
      status TEXT NOT NULL DEFAULT 'PENDING',
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      delivery_type TEXT NOT NULL DEFAULT 'STANDARD', -- STANDARD, EXPRESS, SCHEDULED
      
      -- Addresses
      pickup_address JSONB NOT NULL,
      delivery_address JSONB NOT NULL,
      
      -- Timing
      estimated_pickup_time TIMESTAMP,
      estimated_delivery_time TIMESTAMP,
      actual_pickup_time TIMESTAMP,
      actual_delivery_time TIMESTAMP,
      scheduled_delivery_time TIMESTAMP,
      
      -- Location tracking
      current_latitude DECIMAL(10,8),
      current_longitude DECIMAL(11,8),
      
      -- Route and distance
      optimized_route JSONB, -- Array of waypoints
      total_distance_km DECIMAL(6,2),
      estimated_duration_minutes INTEGER,
      actual_duration_minutes INTEGER,
      
      -- Pricing and earnings
      base_delivery_fee_cents INTEGER DEFAULT 0,
      distance_fee_cents INTEGER DEFAULT 0,
      surge_fee_cents INTEGER DEFAULT 0,
      tip_amount_cents INTEGER DEFAULT 0,
      partner_earnings_cents INTEGER DEFAULT 0,
      
      -- Special instructions and notes
      pickup_instructions TEXT,
      delivery_instructions TEXT,
      customer_notes TEXT,
      partner_notes TEXT,
      
      -- Delivery proof
      delivery_proof_type TEXT, -- OTP, PHOTO, SIGNATURE, CONTACTLESS
      delivery_otp VARCHAR(6),
      proof_image_url TEXT,
      signature_data TEXT,
      
      -- Quality and feedback
      customer_rating INTEGER,
      customer_feedback TEXT,
      partner_rating INTEGER,
      restaurant_rating INTEGER,
      
      -- Failure and cancellation details
      failure_reason TEXT,
      cancellation_reason TEXT,
      cancelled_by TEXT, -- CUSTOMER, RESTAURANT, PARTNER, SYSTEM
      
      -- Metadata
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Real-time location tracking
    CREATE TABLE IF NOT EXISTS delivery_location_history (
      id UUID PRIMARY KEY,
      delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
      partner_id UUID NOT NULL REFERENCES delivery_partners(id),
      
      -- Location data
      latitude DECIMAL(10,8) NOT NULL,
      longitude DECIMAL(11,8) NOT NULL,
      accuracy_meters DECIMAL(8,2),
      altitude_meters DECIMAL(8,2),
      speed_kmh DECIMAL(5,2),
      bearing_degrees INTEGER,
      
      -- Context
      location_type TEXT, -- GPS, NETWORK, PASSIVE, MANUAL
      battery_level INTEGER,
      is_moving BOOLEAN DEFAULT false,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Delivery zones and service areas
    CREATE TABLE IF NOT EXISTS delivery_zones (
      id UUID PRIMARY KEY,
      zone_name VARCHAR(100) NOT NULL,
      zone_code VARCHAR(20) UNIQUE NOT NULL,
      
      -- Geographic boundaries
      boundary_polygon JSONB NOT NULL, -- GeoJSON polygon
      center_latitude DECIMAL(10,8) NOT NULL,
      center_longitude DECIMAL(11,8) NOT NULL,
      
      -- Service configuration
      is_serviceable BOOLEAN DEFAULT true,
      base_delivery_fee_cents INTEGER DEFAULT 2000, -- ₹20 default
      per_km_rate_cents INTEGER DEFAULT 500, -- ₹5 per km
      surge_multiplier DECIMAL(3,2) DEFAULT 1.0,
      
      -- Timing and capacity
      standard_delivery_time_minutes INTEGER DEFAULT 30,
      express_delivery_time_minutes INTEGER DEFAULT 20,
      max_daily_orders INTEGER DEFAULT 1000,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Partner earnings and payouts
    CREATE TABLE IF NOT EXISTS partner_earnings (
      id UUID PRIMARY KEY,
      partner_id UUID NOT NULL REFERENCES delivery_partners(id),
      delivery_id UUID NOT NULL REFERENCES deliveries(id),
      
      -- Earning breakdown
      base_earnings_cents INTEGER NOT NULL,
      distance_bonus_cents INTEGER DEFAULT 0,
      time_bonus_cents INTEGER DEFAULT 0,
      surge_bonus_cents INTEGER DEFAULT 0,
      tip_amount_cents INTEGER DEFAULT 0,
      incentive_amount_cents INTEGER DEFAULT 0,
      penalty_amount_cents INTEGER DEFAULT 0,
      
      -- Total earnings
      gross_earnings_cents INTEGER NOT NULL,
      platform_commission_cents INTEGER DEFAULT 0,
      net_earnings_cents INTEGER NOT NULL,
      
      -- Payout status
      payout_status TEXT DEFAULT 'PENDING', -- PENDING, PROCESSED, FAILED
      payout_date DATE,
      payout_reference TEXT,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Route optimization and batching
    CREATE TABLE IF NOT EXISTS delivery_batches (
      id UUID PRIMARY KEY,
      batch_code VARCHAR(20) UNIQUE NOT NULL,
      partner_id UUID NOT NULL REFERENCES delivery_partners(id),
      
      -- Batch details
      batch_type TEXT NOT NULL DEFAULT 'MANUAL', -- MANUAL, AUTO_OPTIMIZED
      total_deliveries INTEGER NOT NULL,
      estimated_duration_minutes INTEGER,
      optimized_route JSONB, -- Complete route for all deliveries
      
      -- Status and timing
      status TEXT NOT NULL DEFAULT 'PLANNED', -- PLANNED, IN_PROGRESS, COMPLETED, CANCELLED
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Delivery batch items (many-to-many relationship)
    CREATE TABLE IF NOT EXISTS delivery_batch_items (
      id UUID PRIMARY KEY,
      batch_id UUID NOT NULL REFERENCES delivery_batches(id) ON DELETE CASCADE,
      delivery_id UUID NOT NULL REFERENCES deliveries(id),
      sequence_order INTEGER NOT NULL,
      
      UNIQUE(batch_id, delivery_id)
    );

    -- Partner performance analytics
    CREATE TABLE IF NOT EXISTS partner_performance_metrics (
      id UUID PRIMARY KEY,
      partner_id UUID NOT NULL REFERENCES delivery_partners(id),
      
      -- Time period
      metric_date DATE NOT NULL,
      shift_start_time TIMESTAMP,
      shift_end_time TIMESTAMP,
      
      -- Delivery metrics
      total_orders INTEGER DEFAULT 0,
      completed_orders INTEGER DEFAULT 0,
      cancelled_orders INTEGER DEFAULT 0,
      failed_orders INTEGER DEFAULT 0,
      
      -- Time metrics
      average_pickup_time_minutes DECIMAL(5,2) DEFAULT 0,
      average_delivery_time_minutes DECIMAL(5,2) DEFAULT 0,
      total_online_time_minutes INTEGER DEFAULT 0,
      total_busy_time_minutes INTEGER DEFAULT 0,
      
      -- Quality metrics
      customer_rating_average DECIMAL(3,2) DEFAULT 0,
      restaurant_rating_average DECIMAL(3,2) DEFAULT 0,
      on_time_delivery_percentage DECIMAL(5,2) DEFAULT 0,
      
      -- Distance and earnings
      total_distance_km DECIMAL(8,2) DEFAULT 0,
      total_earnings_cents BIGINT DEFAULT 0,
      
      UNIQUE(partner_id, metric_date)
    );

    -- AI-powered demand prediction
    CREATE TABLE IF NOT EXISTS delivery_demand_forecast (
      id UUID PRIMARY KEY,
      zone_id UUID NOT NULL REFERENCES delivery_zones(id),
      
      -- Time period
      forecast_date DATE NOT NULL,
      hour_of_day INTEGER NOT NULL, -- 0-23
      
      -- Demand prediction
      predicted_orders INTEGER NOT NULL,
      confidence_score DECIMAL(3,2) NOT NULL, -- 0-1
      
      -- Factors
      weather_factor DECIMAL(3,2) DEFAULT 1.0,
      event_factor DECIMAL(3,2) DEFAULT 1.0,
      seasonal_factor DECIMAL(3,2) DEFAULT 1.0,
      
      -- Resource allocation
      recommended_partners INTEGER,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(zone_id, forecast_date, hour_of_day)
    );

    -- Third-party logistics integration
    CREATE TABLE IF NOT EXISTS logistics_partners (
      id UUID PRIMARY KEY,
      partner_name VARCHAR(100) NOT NULL UNIQUE,
      partner_code VARCHAR(20) UNIQUE NOT NULL,
      
      -- API configuration
      api_endpoint TEXT NOT NULL,
      api_key TEXT NOT NULL,
      webhook_url TEXT,
      
      -- Service areas and capabilities
      service_zones JSONB, -- Array of zone IDs
      supported_vehicle_types JSONB,
      max_order_weight_kg DECIMAL(5,2) DEFAULT 10.0,
      
      -- Pricing
      base_rate_cents INTEGER NOT NULL,
      per_km_rate_cents INTEGER NOT NULL,
      
      -- Status and performance
      is_active BOOLEAN DEFAULT true,
      average_delivery_time_minutes INTEGER DEFAULT 30,
      success_rate_percentage DECIMAL(5,2) DEFAULT 95.0,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for performance optimization
    CREATE INDEX IF NOT EXISTS idx_delivery_partners_online ON delivery_partners(is_online, is_available) WHERE employment_status = 'ACTIVE';
    CREATE INDEX IF NOT EXISTS idx_delivery_partners_location ON delivery_partners(current_latitude, current_longitude) WHERE is_online = true;
    CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
    CREATE INDEX IF NOT EXISTS idx_deliveries_partner ON deliveries(partner_id, status);
    CREATE INDEX IF NOT EXISTS idx_deliveries_order ON deliveries(order_id);
    CREATE INDEX IF NOT EXISTS idx_deliveries_created ON deliveries(created_at);
    CREATE INDEX IF NOT EXISTS idx_location_history_delivery ON delivery_location_history(delivery_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_partner_earnings_partner ON partner_earnings(partner_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_performance_metrics_partner ON partner_performance_metrics(partner_id, metric_date);
    CREATE INDEX IF NOT EXISTS idx_demand_forecast_zone ON delivery_demand_forecast(zone_id, forecast_date, hour_of_day);
  `;
  
  await pool.query(sql);
  console.log('✅ Intelligent delivery service schema initialized');
}

// Advanced delivery partner class with AI optimization
class DeliveryPartner {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.partnerCode = data.partnerCode || this.generatePartnerCode();
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.email = data.email;
    this.phone = data.phone;
    this.dateOfBirth = data.dateOfBirth;
    
    // Employment details
    this.partnerType = data.partnerType || 'FREELANCE';
    this.employmentStatus = data.employmentStatus || 'ACTIVE';
    this.joiningDate = data.joiningDate || new Date();
    
    // Vehicle and capacity
    this.vehicleType = data.vehicleType || 'MOTORCYCLE';
    this.vehicleNumber = data.vehicleNumber;
    this.maxOrdersCapacity = data.maxOrdersCapacity || 3;
    this.maxDeliveryDistanceKm = data.maxDeliveryDistanceKm || 15.0;
    
    // Location and availability
    this.currentLatitude = data.currentLatitude;
    this.currentLongitude = data.currentLongitude;
    this.homeLatitude = data.homeLatitude;
    this.homeLongitude = data.homeLongitude;
    this.serviceAreas = data.serviceAreas || [];
    
    // Performance metrics
    this.totalDeliveries = data.totalDeliveries || 0;
    this.successfulDeliveries = data.successfulDeliveries || 0;
    this.averageRating = data.averageRating || 0.0;
    this.totalEarningsCents = data.totalEarningsCents || 0;
    
    // Availability
    this.isOnline = data.isOnline || false;
    this.isAvailable = data.isAvailable || true;
    this.shiftStartTime = data.shiftStartTime;
    this.shiftEndTime = data.shiftEndTime;
    this.workingDays = data.workingDays || [1,2,3,4,5,6,7];
    
    // Verification
    this.isVerified = data.isVerified || false;
    this.documentsVerified = data.documentsVerified || false;
    this.backgroundCheckStatus = data.backgroundCheckStatus || 'PENDING';
    
    // Banking
    this.bankAccountNumber = data.bankAccountNumber;
    this.bankIfscCode = data.bankIfscCode;
    this.upiId = data.upiId;
    
    // Device info
    this.deviceToken = data.deviceToken;
    this.appVersion = data.appVersion;
    this.lastLocationUpdate = data.lastLocationUpdate;
    
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  generatePartnerCode() {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `DP${timestamp}${random}`;
  }

  // Create new delivery partner with comprehensive onboarding
  async save() {
    try {
      const query = `
        INSERT INTO delivery_partners (
          id, partner_code, first_name, last_name, email, phone, date_of_birth,
          partner_type, employment_status, joining_date, vehicle_type, vehicle_number,
          max_orders_capacity, max_delivery_distance_km, current_latitude, current_longitude,
          home_latitude, home_longitude, service_areas, total_deliveries, successful_deliveries,
          average_rating, total_earnings_cents, is_online, is_available, shift_start_time,
          shift_end_time, working_days, is_verified, documents_verified, background_check_status,
          bank_account_number, bank_ifsc_code, upi_id, device_token, app_version, last_location_update
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37
        ) RETURNING *
      `;
      
      const values = [
        this.id, this.partnerCode, this.firstName, this.lastName, this.email, this.phone,
        this.dateOfBirth, this.partnerType, this.employmentStatus, this.joiningDate,
        this.vehicleType, this.vehicleNumber, this.maxOrdersCapacity, this.maxDeliveryDistanceKm,
        this.currentLatitude, this.currentLongitude, this.homeLatitude, this.homeLongitude,
        JSON.stringify(this.serviceAreas), this.totalDeliveries, this.successfulDeliveries,
        this.averageRating, this.totalEarningsCents, this.isOnline, this.isAvailable,
        this.shiftStartTime, this.shiftEndTime, JSON.stringify(this.workingDays),
        this.isVerified, this.documentsVerified, this.backgroundCheckStatus,
        this.bankAccountNumber, this.bankIfscCode, this.upiId, this.deviceToken,
        this.appVersion, this.lastLocationUpdate
      ];
      
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error saving delivery partner:', error);
      throw error;
    }
  }

  // AI-powered partner assignment algorithm
  static async findOptimalPartner(deliveryRequest) {
    try {
      const { pickupLatitude, pickupLongitude, deliveryType, priority } = deliveryRequest;
      
      // Calculate distance and get available partners
      const query = `
        SELECT dp.*, 
               ST_Distance(
                 ST_Point($1, $2)::geography,
                 ST_Point(dp.current_longitude, dp.current_latitude)::geography
               ) / 1000 as distance_km,
               CASE 
                 WHEN dp.average_rating >= 4.5 THEN 1.2
                 WHEN dp.average_rating >= 4.0 THEN 1.1
                 WHEN dp.average_rating >= 3.5 THEN 1.0
                 ELSE 0.9
               END as rating_multiplier,
               CASE
                 WHEN dp.total_deliveries > 1000 THEN 1.1
                 WHEN dp.total_deliveries > 500 THEN 1.05
                 ELSE 1.0
               END as experience_multiplier
        FROM delivery_partners dp
        WHERE dp.is_online = true 
          AND dp.is_available = true 
          AND dp.employment_status = 'ACTIVE'
          AND dp.is_verified = true
          AND (
            SELECT COUNT(*) FROM deliveries d 
            WHERE d.partner_id = dp.id 
              AND d.status IN ('ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')
          ) < dp.max_orders_capacity
        ORDER BY (
          -- AI scoring algorithm
          (1 / (distance_km + 1)) * 0.4 +  -- Distance factor (closer is better)
          rating_multiplier * 0.3 +         -- Rating factor
          experience_multiplier * 0.2 +     -- Experience factor
          RANDOM() * 0.1                     -- Randomization for fairness
        ) DESC
        LIMIT 5
      `;
      
      const result = await pool.query(query, [pickupLongitude, pickupLatitude]);
      return result.rows;
    } catch (error) {
      console.error('Error finding optimal partner:', error);
      throw error;
    }
  }

  // Update partner location with intelligent tracking
  static async updateLocation(partnerId, locationData) {
    try {
      const { latitude, longitude, accuracy, altitude, speed, bearing, batteryLevel, isMoving } = locationData;
      
      // Update partner's current location
      const updatePartner = `
        UPDATE delivery_partners 
        SET current_latitude = $1, 
            current_longitude = $2, 
            last_location_update = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;
      
      await pool.query(updatePartner, [latitude, longitude, partnerId]);
      
      // Record location history for active deliveries
      const recordHistory = `
        INSERT INTO delivery_location_history (
          id, delivery_id, partner_id, latitude, longitude, accuracy_meters,
          altitude_meters, speed_kmh, bearing_degrees, location_type, battery_level, is_moving
        )
        SELECT 
          $1, d.id, $2, $3, $4, $5, $6, $7, $8, 'GPS', $9, $10
        FROM deliveries d
        WHERE d.partner_id = $2 
          AND d.status IN ('ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')
      `;
      
      await pool.query(recordHistory, [
        uuidv4(), partnerId, latitude, longitude, accuracy,
        altitude, speed, bearing, batteryLevel, isMoving
      ]);
      
      return { success: true, message: 'Location updated successfully' };
    } catch (error) {
      console.error('Error updating partner location:', error);
      throw error;
    }
  }

  // Get partner performance analytics
  static async getPerformanceMetrics(partnerId, startDate, endDate) {
    try {
      const query = `
        SELECT 
          COUNT(d.id) as total_deliveries,
          COUNT(CASE WHEN d.status = 'DELIVERED' THEN 1 END) as completed_deliveries,
          COUNT(CASE WHEN d.status = 'CANCELLED' THEN 1 END) as cancelled_deliveries,
          COUNT(CASE WHEN d.status = 'FAILED' THEN 1 END) as failed_deliveries,
          AVG(d.customer_rating) as avg_customer_rating,
          AVG(d.restaurant_rating) as avg_restaurant_rating,
          AVG(EXTRACT(EPOCH FROM (d.actual_delivery_time - d.estimated_delivery_time))/60) as avg_delay_minutes,
          SUM(pe.net_earnings_cents) as total_earnings_cents,
          SUM(d.total_distance_km) as total_distance_km,
          AVG(d.total_distance_km) as avg_distance_per_delivery
        FROM deliveries d
        LEFT JOIN partner_earnings pe ON pe.delivery_id = d.id
        WHERE d.partner_id = $1 
          AND d.created_at BETWEEN $2 AND $3
        GROUP BY d.partner_id
      `;
      
      const result = await pool.query(query, [partnerId, startDate, endDate]);
      return result.rows[0] || {};
    } catch (error) {
      console.error('Error getting performance metrics:', error);
      throw error;
    }
  }
}

// Enhanced delivery class with AI route optimization
class Delivery {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.deliveryCode = data.deliveryCode || this.generateDeliveryCode();
    this.orderId = data.orderId;
    this.customerId = data.customerId;
    this.restaurantId = data.restaurantId;
    this.partnerId = data.partnerId;
    
    // Delivery details
    this.status = data.status || 'PENDING';
    this.priority = data.priority || 'NORMAL';
    this.deliveryType = data.deliveryType || 'STANDARD';
    
    // Addresses
    this.pickupAddress = data.pickupAddress;
    this.deliveryAddress = data.deliveryAddress;
    
    // Timing
    this.estimatedPickupTime = data.estimatedPickupTime;
    this.estimatedDeliveryTime = data.estimatedDeliveryTime;
    this.actualPickupTime = data.actualPickupTime;
    this.actualDeliveryTime = data.actualDeliveryTime;
    this.scheduledDeliveryTime = data.scheduledDeliveryTime;
    
    // Location and route
    this.currentLatitude = data.currentLatitude;
    this.currentLongitude = data.currentLongitude;
    this.optimizedRoute = data.optimizedRoute;
    this.totalDistanceKm = data.totalDistanceKm;
    this.estimatedDurationMinutes = data.estimatedDurationMinutes;
    this.actualDurationMinutes = data.actualDurationMinutes;
    
    // Pricing
    this.baseDeliveryFeeCents = data.baseDeliveryFeeCents || 0;
    this.distanceFeeCents = data.distanceFeeCents || 0;
    this.surgeFeeCents = data.surgeFeeCents || 0;
    this.tipAmountCents = data.tipAmountCents || 0;
    this.partnerEarningsCents = data.partnerEarningsCents || 0;
    
    // Instructions and notes
    this.pickupInstructions = data.pickupInstructions;
    this.deliveryInstructions = data.deliveryInstructions;
    this.customerNotes = data.customerNotes;
    this.partnerNotes = data.partnerNotes;
    
    // Delivery proof
    this.deliveryProofType = data.deliveryProofType || 'OTP';
    this.deliveryOtp = data.deliveryOtp || this.generateOTP();
    this.proofImageUrl = data.proofImageUrl;
    this.signatureData = data.signatureData;
    
    // Quality metrics
    this.customerRating = data.customerRating;
    this.customerFeedback = data.customerFeedback;
    this.partnerRating = data.partnerRating;
    this.restaurantRating = data.restaurantRating;
    
    // Failure details
    this.failureReason = data.failureReason;
    this.cancellationReason = data.cancellationReason;
    this.cancelledBy = data.cancelledBy;
    
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  generateDeliveryCode() {
    const timestamp = Date.now().toString().slice(-8);
    return `QBD${timestamp}`;
  }

  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Create new delivery with intelligent assignment
  async save() {
    try {
      const query = `
        INSERT INTO deliveries (
          id, delivery_code, order_id, customer_id, restaurant_id, partner_id,
          status, priority, delivery_type, pickup_address, delivery_address,
          estimated_pickup_time, estimated_delivery_time, scheduled_delivery_time,
          current_latitude, current_longitude, optimized_route, total_distance_km,
          estimated_duration_minutes, base_delivery_fee_cents, distance_fee_cents,
          surge_fee_cents, tip_amount_cents, partner_earnings_cents, pickup_instructions,
          delivery_instructions, customer_notes, partner_notes, delivery_proof_type,
          delivery_otp, proof_image_url, signature_data
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
        ) RETURNING *
      `;
      
      const values = [
        this.id, this.deliveryCode, this.orderId, this.customerId, this.restaurantId,
        this.partnerId, this.status, this.priority, this.deliveryType,
        JSON.stringify(this.pickupAddress), JSON.stringify(this.deliveryAddress),
        this.estimatedPickupTime, this.estimatedDeliveryTime, this.scheduledDeliveryTime,
        this.currentLatitude, this.currentLongitude, JSON.stringify(this.optimizedRoute),
        this.totalDistanceKm, this.estimatedDurationMinutes, this.baseDeliveryFeeCents,
        this.distanceFeeCents, this.surgeFeeCents, this.tipAmountCents, this.partnerEarningsCents,
        this.pickupInstructions, this.deliveryInstructions, this.customerNotes,
        this.partnerNotes, this.deliveryProofType, this.deliveryOtp, this.proofImageUrl,
        this.signatureData
      ];
      
      const result = await pool.query(query, values);
      
      // Calculate and store partner earnings
      await this.calculatePartnerEarnings();
      
      return result.rows[0];
    } catch (error) {
      console.error('Error saving delivery:', error);
      throw error;
    }
  }

  // AI-powered route optimization
  async optimizeRoute(additionalWaypoints = []) {
    try {
      const waypoints = [
        { lat: this.pickupAddress.latitude, lng: this.pickupAddress.longitude, type: 'pickup' },
        ...additionalWaypoints,
        { lat: this.deliveryAddress.latitude, lng: this.deliveryAddress.longitude, type: 'delivery' }
      ];

      // Implement TSP (Traveling Salesman Problem) solver for optimal route
      const optimizedWaypoints = this.solveTSP(waypoints);
      
      // Calculate total distance and time
      let totalDistance = 0;
      let totalTime = 0;
      
      for (let i = 0; i < optimizedWaypoints.length - 1; i++) {
        const segment = this.calculateSegmentDistance(optimizedWaypoints[i], optimizedWaypoints[i + 1]);
        totalDistance += segment.distance;
        totalTime += segment.time;
      }
      
      this.optimizedRoute = optimizedWaypoints;
      this.totalDistanceKm = parseFloat(totalDistance.toFixed(2));
      this.estimatedDurationMinutes = Math.round(totalTime);
      
      return {
        route: this.optimizedRoute,
        totalDistance: this.totalDistanceKm,
        estimatedTime: this.estimatedDurationMinutes
      };
    } catch (error) {
      console.error('Error optimizing route:', error);
      throw error;
    }
  }

  // Simple TSP solver using nearest neighbor heuristic
  solveTSP(waypoints) {
    if (waypoints.length <= 2) return waypoints;
    
    const visited = new Set();
    const route = [waypoints[0]]; // Start with pickup
    visited.add(0);
    
    let current = 0;
    
    while (visited.size < waypoints.length) {
      let nearestIndex = -1;
      let minDistance = Infinity;
      
      for (let i = 0; i < waypoints.length; i++) {
        if (!visited.has(i)) {
          const distance = this.calculateDistance(waypoints[current], waypoints[i]);
          if (distance < minDistance) {
            minDistance = distance;
            nearestIndex = i;
          }
        }
      }
      
      if (nearestIndex !== -1) {
        route.push(waypoints[nearestIndex]);
        visited.add(nearestIndex);
        current = nearestIndex;
      }
    }
    
    return route;
  }

  // Calculate distance between two points (Haversine formula)
  calculateDistance(point1, point2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLng = (point2.lng - point1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Calculate segment distance and estimated time
  calculateSegmentDistance(point1, point2) {
    const distance = this.calculateDistance(point1, point2);
    const averageSpeed = 25; // km/h average speed in city
    const time = (distance / averageSpeed) * 60; // Convert to minutes
    
    return { distance, time };
  }

  // Calculate partner earnings based on multiple factors
  async calculatePartnerEarnings() {
    try {
      const baseEarnings = this.baseDeliveryFeeCents;
      const distanceBonus = Math.round(this.totalDistanceKm * 500); // ₹5 per km
      let timeBonus = 0;
      let surgeBonus = this.surgeFeeCents;
      const tipAmount = this.tipAmountCents;
      
      // Time-based bonus for off-peak deliveries
      const deliveryHour = new Date().getHours();
      if (deliveryHour < 10 || deliveryHour > 22) {
        timeBonus = Math.round(baseEarnings * 0.2); // 20% night bonus
      }
      
      const grossEarnings = baseEarnings + distanceBonus + timeBonus + surgeBonus + tipAmount;
      const platformCommission = Math.round(grossEarnings * 0.15); // 15% platform fee
      const netEarnings = grossEarnings - platformCommission;
      
      // Store earnings record
      const earningsQuery = `
        INSERT INTO partner_earnings (
          id, partner_id, delivery_id, base_earnings_cents, distance_bonus_cents,
          time_bonus_cents, surge_bonus_cents, tip_amount_cents, gross_earnings_cents,
          platform_commission_cents, net_earnings_cents
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;
      
      await pool.query(earningsQuery, [
        uuidv4(), this.partnerId, this.id, baseEarnings, distanceBonus,
        timeBonus, surgeBonus, tipAmount, grossEarnings, platformCommission, netEarnings
      ]);
      
      this.partnerEarningsCents = netEarnings;
      return netEarnings;
    } catch (error) {
      console.error('Error calculating partner earnings:', error);
      throw error;
    }
  }

  // Update delivery status with comprehensive tracking
  static async updateStatus(deliveryId, newStatus, additionalData = {}) {
    try {
      const updateFields = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
      const values = [deliveryId, newStatus];
      let valueIndex = 3;
      
      // Handle status-specific updates
      switch (newStatus) {
        case 'ACCEPTED':
          if (additionalData.partnerId) {
            updateFields.push(`partner_id = $${valueIndex}`);
            values.push(additionalData.partnerId);
            valueIndex++;
          }
          break;
          
        case 'PICKED_UP':
          updateFields.push(`actual_pickup_time = $${valueIndex}`);
          values.push(additionalData.pickupTime || new Date());
          valueIndex++;
          break;
          
        case 'DELIVERED':
          updateFields.push(`actual_delivery_time = $${valueIndex}`);
          values.push(additionalData.deliveryTime || new Date());
          valueIndex++;
          if (additionalData.proofImageUrl) {
            updateFields.push(`proof_image_url = $${valueIndex}`);
            values.push(additionalData.proofImageUrl);
            valueIndex++;
          }
          break;
          
        case 'CANCELLED':
          if (additionalData.cancellationReason) {
            updateFields.push(`cancellation_reason = $${valueIndex}`);
            values.push(additionalData.cancellationReason);
            valueIndex++;
          }
          if (additionalData.cancelledBy) {
            updateFields.push(`cancelled_by = $${valueIndex}`);
            values.push(additionalData.cancelledBy);
            valueIndex++;
          }
          break;
          
        case 'FAILED':
          if (additionalData.failureReason) {
            updateFields.push(`failure_reason = $${valueIndex}`);
            values.push(additionalData.failureReason);
            valueIndex++;
          }
          break;
      }
      
      const query = `
        UPDATE deliveries 
        SET ${updateFields.join(', ')}
        WHERE id = $1
        RETURNING *
      `;
      
      const result = await pool.query(query, values);
      
      // Update partner performance metrics
      if (newStatus === 'DELIVERED' && result.rows[0]?.partner_id) {
        await this.updatePartnerMetrics(result.rows[0]);
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error updating delivery status:', error);
      throw error;
    }
  }

  // Update partner performance metrics
  static async updatePartnerMetrics(delivery) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const query = `
        INSERT INTO partner_performance_metrics (
          id, partner_id, metric_date, total_orders, completed_orders,
          total_distance_km, total_earnings_cents
        ) VALUES ($1, $2, $3, 1, 1, $4, $5)
        ON CONFLICT (partner_id, metric_date)
        DO UPDATE SET
          total_orders = partner_performance_metrics.total_orders + 1,
          completed_orders = partner_performance_metrics.completed_orders + 1,
          total_distance_km = partner_performance_metrics.total_distance_km + $4,
          total_earnings_cents = partner_performance_metrics.total_earnings_cents + $5
      `;
      
      await pool.query(query, [
        uuidv4(),
        delivery.partner_id,
        today,
        delivery.total_distance_km || 0,
        delivery.partner_earnings_cents || 0
      ]);
    } catch (error) {
      console.error('Error updating partner metrics:', error);
    }
  }

  // Get real-time delivery tracking information
  static async getTrackingInfo(deliveryId) {
    try {
      const query = `
        SELECT 
          d.*,
          dp.first_name || ' ' || dp.last_name as partner_name,
          dp.phone as partner_phone,
          dp.vehicle_type,
          dp.vehicle_number,
          dp.current_latitude as partner_latitude,
          dp.current_longitude as partner_longitude,
          COALESCE(
            (SELECT array_agg(
              json_build_object(
                'latitude', dlh.latitude,
                'longitude', dlh.longitude,
                'timestamp', dlh.created_at,
                'speed', dlh.speed_kmh,
                'bearing', dlh.bearing_degrees
              ) ORDER BY dlh.created_at DESC
            ) FROM delivery_location_history dlh 
            WHERE dlh.delivery_id = d.id 
              AND dlh.created_at >= NOW() - INTERVAL '1 hour'
            ), '[]'::json[]
          ) as recent_locations
        FROM deliveries d
        LEFT JOIN delivery_partners dp ON dp.id = d.partner_id
        WHERE d.id = $1
      `;
      
      const result = await pool.query(query, [deliveryId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting tracking info:', error);
      throw error;
    }
  }

  // Predict delivery time using AI
  static async predictDeliveryTime(deliveryData) {
    try {
      const { restaurantId, customerAddress, currentTime, weatherCondition, trafficCondition } = deliveryData;
      
      // Base calculation using historical data
      const historicalQuery = `
        SELECT 
          AVG(EXTRACT(EPOCH FROM (actual_delivery_time - created_at))/60) as avg_delivery_minutes,
          AVG(total_distance_km) as avg_distance_km
        FROM deliveries 
        WHERE restaurant_id = $1 
          AND status = 'DELIVERED'
          AND created_at >= NOW() - INTERVAL '30 days'
      `;
      
      const historical = await pool.query(historicalQuery, [restaurantId]);
      const baseTime = historical.rows[0]?.avg_delivery_minutes || 30;
      
      // Apply AI factors
      let adjustedTime = baseTime;
      
      // Time of day factor
      const hour = new Date(currentTime).getHours();
      if (hour >= 12 && hour <= 14) adjustedTime *= 1.3; // Lunch rush
      if (hour >= 19 && hour <= 21) adjustedTime *= 1.4; // Dinner rush
      
      // Weather factor
      if (weatherCondition === 'RAIN') adjustedTime *= 1.2;
      if (weatherCondition === 'STORM') adjustedTime *= 1.5;
      
      // Traffic factor
      if (trafficCondition === 'HEAVY') adjustedTime *= 1.3;
      if (trafficCondition === 'MODERATE') adjustedTime *= 1.1;
      
      // Weekend factor
      const day = new Date(currentTime).getDay();
      if (day === 0 || day === 6) adjustedTime *= 1.1;
      
      return Math.round(adjustedTime);
    } catch (error) {
      console.error('Error predicting delivery time:', error);
      return 30; // Default fallback
    }
  }
}

// Delivery zone management class
class DeliveryZone {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.zoneName = data.zoneName;
    this.zoneCode = data.zoneCode;
    this.boundaryPolygon = data.boundaryPolygon;
    this.centerLatitude = data.centerLatitude;
    this.centerLongitude = data.centerLongitude;
    this.isServiceable = data.isServiceable || true;
    this.baseDeliveryFeeCents = data.baseDeliveryFeeCents || 2000;
    this.perKmRateCents = data.perKmRateCents || 500;
    this.surgeMultiplier = data.surgeMultiplier || 1.0;
    this.standardDeliveryTimeMinutes = data.standardDeliveryTimeMinutes || 30;
    this.expressDeliveryTimeMinutes = data.expressDeliveryTimeMinutes || 20;
    this.maxDailyOrders = data.maxDailyOrders || 1000;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  async save() {
    try {
      const query = `
        INSERT INTO delivery_zones (
          id, zone_name, zone_code, boundary_polygon, center_latitude, center_longitude,
          is_serviceable, base_delivery_fee_cents, per_km_rate_cents, surge_multiplier,
          standard_delivery_time_minutes, express_delivery_time_minutes, max_daily_orders
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;
      
      const values = [
        this.id, this.zoneName, this.zoneCode, JSON.stringify(this.boundaryPolygon),
        this.centerLatitude, this.centerLongitude, this.isServiceable,
        this.baseDeliveryFeeCents, this.perKmRateCents, this.surgeMultiplier,
        this.standardDeliveryTimeMinutes, this.expressDeliveryTimeMinutes, this.maxDailyOrders
      ];
      
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error saving delivery zone:', error);
      throw error;
    }
  }

  // Check if a point is within the delivery zone
  static async findZoneByLocation(latitude, longitude) {
    try {
      const query = `
        SELECT * FROM delivery_zones 
        WHERE is_serviceable = true
          AND ST_Contains(
            ST_GeomFromGeoJSON(boundary_polygon),
            ST_Point($1, $2)
          )
        ORDER BY ST_Distance(
          ST_Point($1, $2)::geography,
          ST_Point(center_longitude, center_latitude)::geography
        )
        LIMIT 1
      `;
      
      const result = await pool.query(query, [longitude, latitude]);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding zone by location:', error);
      return null;
    }
  }
}

module.exports = {
  ensureSchema,
  DeliveryPartner,
  Delivery,
  DeliveryZone,
  DELIVERY_STATUSES,
  ACTIVE_STATUSES,
  PARTNER_TYPES,
  VEHICLE_TYPES,
  DELIVERY_PRIORITIES
};

async function seedAgentsIfEmpty() {
  const check = await pool.query('SELECT COUNT(*)::int AS c FROM agents');
  const count = check.rows?.[0]?.c || 0;
  if (count === 0) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    await pool.query('INSERT INTO agents(id, name, is_active) VALUES($1,$2,true)', [id, 'Demo Agent']);
    return { created: 1, agent_id: id };
  }
  return { created: 0 };
}

async function agentExists(agentId) {
  const { rows } = await pool.query('SELECT 1 FROM agents WHERE id = $1 AND is_active = true', [agentId]);
  return rows.length > 0;
}

async function activeDeliveriesForAgent(agentId) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM deliveries WHERE agent_id = $1 AND status = ANY($2)', [agentId, ACTIVE_STATUSES]);
  return rows[0]?.c || 0;
}

async function createAssignment({ id, orderId, agentId }) {
  const { rows } = await pool.query(
    `INSERT INTO deliveries(id, order_id, agent_id, status)
     VALUES($1,$2,$3,'ASSIGNED') RETURNING *`,
    [id, orderId, agentId]
  );
  return rows[0];
}

async function getDelivery(id) {
  const { rows } = await pool.query('SELECT * FROM deliveries WHERE id = $1', [id]);
  return rows[0] || null;
}

function canTransition(from, to) {
  const nextMap = {
    'ASSIGNED': ['PICKED_UP','FAILED'],
    'PICKED_UP': ['IN_TRANSIT','FAILED'],
    'IN_TRANSIT': ['DELIVERED','FAILED'],
    'DELIVERED': [],
    'FAILED': [],
  };
  return nextMap[from]?.includes(to) || false;
}

async function updateStatus(id, status) {
  const { rows } = await pool.query('UPDATE deliveries SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *', [id, status]);
  return rows[0] || null;
}

async function updateLocation(id, lat, lng) {
  const { rows } = await pool.query('UPDATE deliveries SET lat = $2, lng = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *', [id, lat, lng]);
  return rows[0] || null;
}

async function listAgents() {
  const { rows } = await pool.query('SELECT id, name, is_active, created_at FROM agents ORDER BY created_at ASC');
  return rows;
}

module.exports = { ensureSchema, seedAgentsIfEmpty, agentExists, activeDeliveriesForAgent, createAssignment, getDelivery, canTransition, updateStatus, updateLocation, listAgents, DELIVERY_STATUSES };
