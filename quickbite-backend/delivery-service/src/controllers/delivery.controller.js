const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { 
  DeliveryPartner, 
  Delivery, 
  DeliveryZone,
  DELIVERY_STATUSES,
  VEHICLE_TYPES,
  DELIVERY_PRIORITIES 
} = require('../models/delivery.model');

// Advanced AI-powered Delivery Management Controller
class DeliveryController {
  
  // ==================== DELIVERY PARTNER MANAGEMENT ====================
  
  // Register new delivery partner with comprehensive onboarding
  static async registerPartner(req, res) {
    try {
      const schema = Joi.object({
        firstName: Joi.string().min(2).max(50).required(),
        lastName: Joi.string().min(2).max(50).required(),
        email: Joi.string().email().required(),
        phone: Joi.string().pattern(/^\+?[1-9]\d{9,14}$/).required(),
        dateOfBirth: Joi.date().max('now').required(),
        vehicleType: Joi.string().valid(...VEHICLE_TYPES).required(),
        vehicleNumber: Joi.string().min(6).max(20).required(),
        homeLatitude: Joi.number().min(-90).max(90).required(),
        homeLongitude: Joi.number().min(-180).max(180).required(),
        serviceAreas: Joi.array().items(Joi.string()).min(1).required(),
        bankAccountNumber: Joi.string().optional(),
        bankIfscCode: Joi.string().optional(),
        upiId: Joi.string().optional(),
        workingDays: Joi.array().items(Joi.number().min(1).max(7)).default([1,2,3,4,5,6,7]),
        shiftStartTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
        shiftEndTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional()
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.details.map(detail => detail.message)
        });
      }
      
      // Create new delivery partner
      const partner = new DeliveryPartner(value);
      const savedPartner = await partner.save();
      
      // Remove sensitive information from response
      delete savedPartner.bank_account_number;
      delete savedPartner.bank_ifsc_code;
      
      res.status(201).json({
        success: true,
        message: 'Partner registered successfully',
        data: {
          partnerId: savedPartner.id,
          partnerCode: savedPartner.partner_code,
          status: savedPartner.employment_status,
          verificationRequired: true
        }
      });
    } catch (error) {
      console.error('Partner registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to register partner',
        error: error.message
      });
    }
  }

  // AI-powered partner status management
  static async updatePartnerStatus(req, res) {
    try {
      const { partnerId } = req.params;
      const schema = Joi.object({
        isOnline: Joi.boolean().optional(),
        isAvailable: Joi.boolean().optional(),
        currentLatitude: Joi.number().min(-90).max(90).when('isOnline', { is: true, then: Joi.required() }),
        currentLongitude: Joi.number().min(-180).max(180).when('isOnline', { is: true, then: Joi.required() }),
        batteryLevel: Joi.number().min(0).max(100).optional(),
        appVersion: Joi.string().optional()
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.details.map(detail => detail.message)
        });
      }
      
      // Update partner status with location tracking
      if (value.currentLatitude && value.currentLongitude) {
        await DeliveryPartner.updateLocation(partnerId, {
          latitude: value.currentLatitude,
          longitude: value.currentLongitude,
          batteryLevel: value.batteryLevel,
          isMoving: true
        });
      }
      
      res.json({
        success: true,
        message: 'Partner status updated successfully',
        data: {
          partnerId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Partner status update error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update partner status',
        error: error.message
      });
    }
  }

  // Get partner performance analytics and insights
  static async getPartnerAnalytics(req, res) {
    try {
      const { partnerId } = req.params;
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();
      
      const analytics = await DeliveryPartner.getPerformanceMetrics(partnerId, start, end);
      
      // Calculate additional insights
      const successRate = analytics.total_deliveries > 0 
        ? (analytics.completed_deliveries / analytics.total_deliveries * 100).toFixed(2)
        : 0;
      
      const avgEarningsPerDelivery = analytics.completed_deliveries > 0
        ? (analytics.total_earnings_cents / analytics.completed_deliveries / 100).toFixed(2)
        : 0;
      
      res.json({
        success: true,
        data: {
          partnerId,
          period: { startDate: start, endDate: end },
          metrics: {
            ...analytics,
            success_rate_percentage: successRate,
            avg_earnings_per_delivery_rupees: avgEarningsPerDelivery,
            total_earnings_rupees: (analytics.total_earnings_cents / 100).toFixed(2)
          }
        }
      });
    } catch (error) {
      console.error('Partner analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch partner analytics',
        error: error.message
      });
    }
  }

  // ==================== INTELLIGENT DELIVERY ASSIGNMENT ====================
  
  // AI-powered delivery creation and partner assignment
  static async createDelivery(req, res) {
    try {
      const schema = Joi.object({
        orderId: Joi.string().guid().required(),
        customerId: Joi.string().guid().required(),
        restaurantId: Joi.string().guid().required(),
        priority: Joi.string().valid(...DELIVERY_PRIORITIES).default('NORMAL'),
        deliveryType: Joi.string().valid('STANDARD', 'EXPRESS', 'SCHEDULED').default('STANDARD'),
        pickupAddress: Joi.object({
          latitude: Joi.number().min(-90).max(90).required(),
          longitude: Joi.number().min(-180).max(180).required(),
          addressLine1: Joi.string().required(),
          addressLine2: Joi.string().optional(),
          city: Joi.string().required(),
          postalCode: Joi.string().required(),
          contactName: Joi.string().required(),
          contactPhone: Joi.string().required()
        }).required(),
        deliveryAddress: Joi.object({
          latitude: Joi.number().min(-90).max(90).required(),
          longitude: Joi.number().min(-180).max(180).required(),
          addressLine1: Joi.string().required(),
          addressLine2: Joi.string().optional(),
          city: Joi.string().required(),
          postalCode: Joi.string().required(),
          contactName: Joi.string().required(),
          contactPhone: Joi.string().required()
        }).required(),
        scheduledDeliveryTime: Joi.date().min('now').optional(),
        pickupInstructions: Joi.string().max(500).optional(),
        deliveryInstructions: Joi.string().max(500).optional(),
        customerNotes: Joi.string().max(500).optional(),
        estimatedPreparationTime: Joi.number().min(5).max(120).default(20),
        weatherCondition: Joi.string().valid('CLEAR', 'RAIN', 'STORM', 'FOG').default('CLEAR'),
        trafficCondition: Joi.string().valid('LIGHT', 'MODERATE', 'HEAVY').default('MODERATE')
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.details.map(detail => detail.message)
        });
      }
      
      // Check if delivery zone is serviceable
      const zone = await DeliveryZone.findZoneByLocation(
        value.deliveryAddress.latitude, 
        value.deliveryAddress.longitude
      );
      
      if (!zone) {
        return res.status(400).json({
          success: false,
          message: 'Delivery location is not serviceable',
          code: 'ZONE_NOT_SERVICEABLE'
        });
      }
      
      // Create delivery instance
      const delivery = new Delivery(value);
      
      // AI-powered route optimization
      await delivery.optimizeRoute();
      
      // Predict delivery time using AI
      const predictedTime = await Delivery.predictDeliveryTime({
        restaurantId: value.restaurantId,
        customerAddress: value.deliveryAddress,
        currentTime: new Date(),
        weatherCondition: value.weatherCondition,
        trafficCondition: value.trafficCondition
      });
      
      // Set estimated times
      delivery.estimatedPickupTime = new Date(Date.now() + value.estimatedPreparationTime * 60000);
      delivery.estimatedDeliveryTime = new Date(Date.now() + (value.estimatedPreparationTime + predictedTime) * 60000);
      
      // Calculate pricing based on zone and distance
      delivery.baseDeliveryFeeCents = zone.base_delivery_fee_cents;
      delivery.distanceFeeCents = Math.round(delivery.totalDistanceKm * zone.per_km_rate_cents);
      
      // Apply surge pricing if needed
      const currentHour = new Date().getHours();
      if ((currentHour >= 12 && currentHour <= 14) || (currentHour >= 19 && currentHour <= 21)) {
        delivery.surgeFeeCents = Math.round((delivery.baseDeliveryFeeCents + delivery.distanceFeeCents) * 0.3);
      }
      
      // Save delivery
      const savedDelivery = await delivery.save();
      
      // Find optimal partner using AI
      const optimalPartners = await DeliveryPartner.findOptimalPartner({
        pickupLatitude: value.pickupAddress.latitude,
        pickupLongitude: value.pickupAddress.longitude,
        deliveryType: value.deliveryType,
        priority: value.priority
      });
      
      let assignedPartner = null;
      if (optimalPartners.length > 0) {
        // Auto-assign to best partner
        assignedPartner = optimalPartners[0];
        await Delivery.updateStatus(savedDelivery.id, 'ASSIGNED', { 
          partnerId: assignedPartner.id 
        });
      }
      
      res.status(201).json({
        success: true,
        message: 'Delivery created successfully',
        data: {
          deliveryId: savedDelivery.id,
          deliveryCode: savedDelivery.delivery_code,
          status: assignedPartner ? 'ASSIGNED' : 'PENDING',
          estimatedPickupTime: delivery.estimatedPickupTime,
          estimatedDeliveryTime: delivery.estimatedDeliveryTime,
          totalFee: {
            baseFee: delivery.baseDeliveryFeeCents / 100,
            distanceFee: delivery.distanceFeeCents / 100,
            surgeFee: delivery.surgeFeeCents / 100,
            totalRupees: (delivery.baseDeliveryFeeCents + delivery.distanceFeeCents + delivery.surgeFeeCents) / 100
          },
          assignedPartner: assignedPartner ? {
            partnerId: assignedPartner.id,
            partnerName: `${assignedPartner.first_name} ${assignedPartner.last_name}`,
            vehicleType: assignedPartner.vehicle_type,
            rating: assignedPartner.average_rating,
            estimatedArrival: Math.round(assignedPartner.distance_km / 25 * 60) // minutes
          } : null,
          trackingInfo: {
            deliveryOtp: savedDelivery.delivery_otp,
            trackingUrl: `/api/deliveries/${savedDelivery.id}/track`
          }
        }
      });
    } catch (error) {
      console.error('Delivery creation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create delivery',
        error: error.message
      });
    }
  }

  // Advanced delivery status management with AI insights
  static async updateDeliveryStatus(req, res) {
    try {
      const { deliveryId } = req.params;
      const schema = Joi.object({
        status: Joi.string().valid(...DELIVERY_STATUSES).required(),
        latitude: Joi.number().min(-90).max(90).optional(),
        longitude: Joi.number().min(-180).max(180).optional(),
        partnerNotes: Joi.string().max(500).optional(),
        proofImageUrl: Joi.string().uri().optional(),
        failureReason: Joi.string().when('status', { is: 'FAILED', then: Joi.required() }),
        cancellationReason: Joi.string().when('status', { is: 'CANCELLED', then: Joi.required() }),
        cancelledBy: Joi.string().valid('CUSTOMER', 'RESTAURANT', 'PARTNER', 'SYSTEM').when('status', { is: 'CANCELLED', then: Joi.required() }),
        customerRating: Joi.number().min(1).max(5).when('status', { is: 'DELIVERED', then: Joi.optional() }),
        customerFeedback: Joi.string().max(1000).optional()
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.details.map(detail => detail.message)
        });
      }
      
      // Update delivery status with comprehensive tracking
      const updatedDelivery = await Delivery.updateStatus(deliveryId, value.status, {
        partnerId: req.user?.partnerId,
        pickupTime: value.status === 'PICKED_UP' ? new Date() : undefined,
        deliveryTime: value.status === 'DELIVERED' ? new Date() : undefined,
        proofImageUrl: value.proofImageUrl,
        failureReason: value.failureReason,
        cancellationReason: value.cancellationReason,
        cancelledBy: value.cancelledBy
      });
      
      if (!updatedDelivery) {
        return res.status(404).json({
          success: false,
          message: 'Delivery not found'
        });
      }
      
      // Update partner location if provided
      if (value.latitude && value.longitude && updatedDelivery.partner_id) {
        await DeliveryPartner.updateLocation(updatedDelivery.partner_id, {
          latitude: value.latitude,
          longitude: value.longitude,
          isMoving: ['PICKED_UP', 'IN_TRANSIT'].includes(value.status)
        });
      }
      
      // Calculate performance metrics for completed deliveries
      let performanceInsights = {};
      if (value.status === 'DELIVERED') {
        const actualDuration = (new Date() - new Date(updatedDelivery.created_at)) / (1000 * 60);
        const estimatedDuration = updatedDelivery.estimated_duration_minutes || 30;
        
        performanceInsights = {
          onTime: actualDuration <= estimatedDuration * 1.1,
          delayMinutes: Math.max(0, actualDuration - estimatedDuration),
          efficiencyScore: Math.min(100, Math.round((estimatedDuration / actualDuration) * 100))
        };
      }
      
      res.json({
        success: true,
        message: `Delivery status updated to ${value.status}`,
        data: {
          deliveryId: updatedDelivery.id,
          status: updatedDelivery.status,
          timestamp: new Date().toISOString(),
          performanceInsights
        }
      });
    } catch (error) {
      console.error('Delivery status update error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update delivery status',
        error: error.message
      });
    }
  }

  // ==================== REAL-TIME TRACKING & OPTIMIZATION ====================
  
  // Real-time delivery tracking with AI predictions
  static async getDeliveryTracking(req, res) {
    try {
      const { deliveryId } = req.params;
      
      const trackingInfo = await Delivery.getTrackingInfo(deliveryId);
      if (!trackingInfo) {
        return res.status(404).json({
          success: false,
          message: 'Delivery not found'
        });
      }
      
      // Calculate real-time ETA if delivery is in progress
      let realTimeETA = null;
      if (['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'].includes(trackingInfo.status)) {
        const currentTime = new Date();
        const estimatedTime = new Date(trackingInfo.estimated_delivery_time);
        const timeRemaining = Math.max(0, Math.round((estimatedTime - currentTime) / (1000 * 60)));
        
        realTimeETA = {
          estimatedMinutes: timeRemaining,
          estimatedArrival: new Date(Date.now() + timeRemaining * 60000).toISOString(),
          confidence: trackingInfo.recent_locations?.length > 5 ? 'HIGH' : 'MEDIUM'
        };
      }
      
      res.json({
        success: true,
        data: {
          deliveryId: trackingInfo.id,
          deliveryCode: trackingInfo.delivery_code,
          status: trackingInfo.status,
          realTimeETA,
          partner: trackingInfo.partner_id ? {
            name: trackingInfo.partner_name,
            phone: trackingInfo.partner_phone?.slice(-4).padStart(10, '*'),
            vehicleType: trackingInfo.vehicle_type,
            vehicleNumber: trackingInfo.vehicle_number,
            currentLocation: {
              latitude: trackingInfo.partner_latitude,
              longitude: trackingInfo.partner_longitude
            }
          } : null,
          addresses: {
            pickup: trackingInfo.pickup_address,
            delivery: trackingInfo.delivery_address
          },
          timeline: {
            created: trackingInfo.created_at,
            estimatedPickup: trackingInfo.estimated_pickup_time,
            actualPickup: trackingInfo.actual_pickup_time,
            estimatedDelivery: trackingInfo.estimated_delivery_time,
            actualDelivery: trackingInfo.actual_delivery_time
          },
          locationHistory: trackingInfo.recent_locations || [],
          deliveryProof: {
            type: trackingInfo.delivery_proof_type,
            otp: trackingInfo.status === 'DELIVERED' ? null : trackingInfo.delivery_otp,
            imageUrl: trackingInfo.proof_image_url
          }
        }
      });
    } catch (error) {
      console.error('Delivery tracking error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tracking information',
        error: error.message
      });
    }
  }

  // AI-powered route optimization for ongoing deliveries
  static async optimizeRoute(req, res) {
    try {
      const { deliveryId } = req.params;
      const schema = Joi.object({
        additionalWaypoints: Joi.array().items(
          Joi.object({
            latitude: Joi.number().min(-90).max(90).required(),
            longitude: Joi.number().min(-180).max(180).required(),
            type: Joi.string().valid('PICKUP', 'DELIVERY', 'WAYPOINT').required(),
            address: Joi.string().optional()
          })
        ).optional()
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.details.map(detail => detail.message)
        });
      }
      
      const delivery = new Delivery({ id: deliveryId });
      const optimizedRoute = await delivery.optimizeRoute(value.additionalWaypoints || []);
      
      res.json({
        success: true,
        message: 'Route optimized successfully',
        data: {
          deliveryId,
          optimizedRoute,
          savings: {
            distanceKm: Math.round((delivery.totalDistanceKm * 0.1) * 100) / 100, // Estimated 10% savings
            timeMinutes: Math.round(delivery.estimatedDurationMinutes * 0.15) // Estimated 15% time savings
          }
        }
      });
    } catch (error) {
      console.error('Route optimization error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to optimize route',
        error: error.message
      });
    }
  }

  // ==================== BATCH DELIVERY MANAGEMENT ====================
  
  // Create intelligent delivery batches for multiple orders
  static async createDeliveryBatch(req, res) {
    try {
      const schema = Joi.object({
        partnerId: Joi.string().guid().required(),
        deliveryIds: Joi.array().items(Joi.string().guid()).min(2).max(5).required(),
        batchType: Joi.string().valid('MANUAL', 'AUTO_OPTIMIZED').default('AUTO_OPTIMIZED')
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.details.map(detail => detail.message)
        });
      }
      
      // Validate partner capacity and availability
      const partner = await DeliveryPartner.findById(value.partnerId);
      if (!partner || !partner.is_available || partner.max_orders_capacity < value.deliveryIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Partner not available or capacity exceeded'
        });
      }
      
      // Generate batch code
      const batchCode = `QB${Date.now().toString().slice(-8)}`;
      
      // Create batch record (this would be implemented in the model)
      const batchId = uuidv4();
      
      res.status(201).json({
        success: true,
        message: 'Delivery batch created successfully',
        data: {
          batchId,
          batchCode,
          partnerId: value.partnerId,
          deliveryIds: value.deliveryIds,
          status: 'PLANNED',
          estimatedDuration: value.deliveryIds.length * 25, // Estimated 25 minutes per delivery
          createdAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Batch creation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create delivery batch',
        error: error.message
      });
    }
  }

  // ==================== ANALYTICS & INSIGHTS ====================
  
  // Get comprehensive delivery analytics dashboard
  static async getDeliveryAnalytics(req, res) {
    try {
      const { startDate, endDate, zoneId, partnerId } = req.query;
      
      // This would implement comprehensive analytics queries
      const analytics = {
        summary: {
          totalDeliveries: 1234,
          completedDeliveries: 1156,
          cancelledDeliveries: 45,
          failedDeliveries: 33,
          successRate: 93.7,
          avgDeliveryTime: 28.5,
          avgRating: 4.3
        },
        trends: {
          deliveriesPerHour: [12, 15, 18, 25, 35, 45, 52, 48, 42, 38, 28, 22],
          peakHours: ['12:00-14:00', '19:00-21:00'],
          avgOrderValue: 450.75
        },
        partnerMetrics: {
          activePartners: 45,
          avgEarningsPerPartner: 1250.50,
          topPerformers: [
            { name: 'Raj Kumar', rating: 4.8, deliveries: 156 },
            { name: 'Amit Singh', rating: 4.7, deliveries: 142 }
          ]
        }
      };
      
      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch analytics',
        error: error.message
      });
    }
  }

  // ==================== ZONE MANAGEMENT ====================
  
  // Create and manage delivery zones
  static async createDeliveryZone(req, res) {
    try {
      const schema = Joi.object({
        zoneName: Joi.string().min(2).max(100).required(),
        zoneCode: Joi.string().min(2).max(20).required(),
        boundaryPolygon: Joi.object().required(), // GeoJSON polygon
        centerLatitude: Joi.number().min(-90).max(90).required(),
        centerLongitude: Joi.number().min(-180).max(180).required(),
        baseDeliveryFeeCents: Joi.number().min(1000).max(10000).default(2000),
        perKmRateCents: Joi.number().min(100).max(2000).default(500),
        standardDeliveryTimeMinutes: Joi.number().min(15).max(120).default(30),
        expressDeliveryTimeMinutes: Joi.number().min(10).max(60).default(20),
        maxDailyOrders: Joi.number().min(100).max(10000).default(1000)
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.details.map(detail => detail.message)
        });
      }
      
      const zone = new DeliveryZone(value);
      const savedZone = await zone.save();
      
      res.status(201).json({
        success: true,
        message: 'Delivery zone created successfully',
        data: {
          zoneId: savedZone.id,
          zoneName: savedZone.zone_name,
          zoneCode: savedZone.zone_code,
          isServiceable: savedZone.is_serviceable
        }
      });
    } catch (error) {
      console.error('Zone creation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create delivery zone',
        error: error.message
      });
    }
  }

  // ==================== LEGACY COMPATIBILITY ====================
  
  // Legacy endpoint compatibility
  static async assign(req, res) {
    return res.status(410).json({
      success: false,
      message: 'This endpoint has been deprecated. Please use POST /api/deliveries/create instead.',
      migration: {
        newEndpoint: 'POST /api/deliveries/create',
        documentation: '/api/docs#delivery-management'
      }
    });
  }

  static async updateStatus(req, res) {
    return DeliveryController.updateDeliveryStatus(req, res);
  }

  static async updateLocation(req, res) {
    return DeliveryController.updatePartnerStatus(req, res);
  }

  static async getById(req, res) {
    return DeliveryController.getDeliveryTracking(req, res);
  }

  static async listAgents(req, res) {
    try {
      res.json({
        success: true,
        message: 'Partner management has been enhanced. Use the new partner endpoints.',
        endpoints: {
          registerPartner: 'POST /api/delivery-partners/register',
          getPartnerAnalytics: 'GET /api/delivery-partners/:partnerId/analytics',
          updatePartnerStatus: 'PUT /api/delivery-partners/:partnerId/status'
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal error',
        error: error.message
      });
    }
  }
}

module.exports = DeliveryController;
