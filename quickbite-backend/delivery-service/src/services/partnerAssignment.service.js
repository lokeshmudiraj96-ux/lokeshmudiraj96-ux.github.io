/**
 * Intelligent Delivery Partner Assignment Service
 * 
 * This service implements AI-powered algorithms for:
 * - Smart partner selection based on multiple factors
 * - Load balancing across delivery partners
 * - Performance-based assignment optimization
 * - Real-time availability management
 * - Dynamic partner scoring and ranking
 */

const { DeliveryPartner } = require('../models/delivery.model');

class PartnerAssignmentService {
  
  constructor() {
    // AI assignment parameters
    this.assignmentWeights = {
      distance: 0.30,        // 30% - Proximity to pickup location
      rating: 0.20,          // 20% - Partner rating and performance
      availability: 0.15,    // 15% - Current availability and capacity
      experience: 0.15,      // 15% - Experience and delivery count
      efficiency: 0.10,      // 10% - Historical efficiency metrics
      reliability: 0.10      // 10% - On-time delivery rate
    };
    
    // Performance thresholds
    this.performanceThresholds = {
      minRating: 3.5,
      maxActiveDeliveries: 3,
      maxDistanceKm: 15,
      minSuccessRate: 85,
      maxResponseTimeSeconds: 300
    };
    
    // Assignment constraints
    this.constraints = {
      vehicleCompatibility: {
        'BICYCLE': { maxWeight: 5, maxDistance: 8 },
        'MOTORCYCLE': { maxWeight: 15, maxDistance: 25 },
        'CAR': { maxWeight: 50, maxDistance: 40 },
        'SCOOTER': { maxWeight: 10, maxDistance: 20 },
        'WALKING': { maxWeight: 2, maxDistance: 3 }
      }
    };
  }

  /**
   * Find and assign the optimal delivery partner using AI algorithms
   */
  async findOptimalPartner(deliveryRequest) {
    try {
      console.log(`🤖 Starting AI partner assignment for delivery: ${deliveryRequest.deliveryId}`);
      
      // Get all available partners in the area
      const availablePartners = await this.getAvailablePartners(deliveryRequest);
      
      if (availablePartners.length === 0) {
        console.log('❌ No available partners found');
        return null;
      }
      
      console.log(`📋 Found ${availablePartners.length} available partners`);
      
      // Score each partner using AI algorithms
      const scoredPartners = await this.scorePartners(availablePartners, deliveryRequest);
      
      // Apply business rules and constraints
      const eligiblePartners = await this.applyConstraints(scoredPartners, deliveryRequest);
      
      if (eligiblePartners.length === 0) {
        console.log('❌ No eligible partners after applying constraints');
        return null;
      }
      
      // Select the best partner using multi-criteria decision making
      const selectedPartner = await this.selectBestPartner(eligiblePartners, deliveryRequest);
      
      console.log(`✅ Selected partner: ${selectedPartner.partner.first_name} ${selectedPartner.partner.last_name} (Score: ${selectedPartner.totalScore.toFixed(2)})`);
      
      return {
        partner: selectedPartner.partner,
        assignmentScore: selectedPartner.totalScore,
        assignmentReason: selectedPartner.reasons,
        estimatedArrivalTime: selectedPartner.estimatedArrival,
        confidence: this.calculateAssignmentConfidence(selectedPartner)
      };
      
    } catch (error) {
      console.error('Partner assignment error:', error);
      throw new Error(`Failed to assign partner: ${error.message}`);
    }
  }

  /**
   * Get all available delivery partners in the service area
   */
  async getAvailablePartners(deliveryRequest) {
    try {
      const { pickupLatitude, pickupLongitude, priority, deliveryType } = deliveryRequest;
      
      // Define search radius based on priority and delivery type
      let searchRadius = 10; // Default 10km
      if (priority === 'HIGH' || deliveryType === 'EXPRESS') {
        searchRadius = 15; // Extended search for high priority
      } else if (priority === 'LOW') {
        searchRadius = 8; // Reduced search for low priority
      }
      
      const partners = await DeliveryPartner.findAvailableInArea({
        latitude: pickupLatitude,
        longitude: pickupLongitude,
        radiusKm: searchRadius,
        additionalFilters: {
          isOnline: true,
          isAvailable: true,
          employmentStatus: 'ACTIVE',
          isVerified: true
        }
      });
      
      return partners || [];
    } catch (error) {
      console.error('Error getting available partners:', error);
      return [];
    }
  }

  /**
   * Score partners using advanced AI algorithms
   */
  async scorePartners(partners, deliveryRequest) {
    const scoredPartners = [];
    
    for (const partner of partners) {
      try {
        const scores = await this.calculatePartnerScores(partner, deliveryRequest);
        
        // Calculate weighted total score
        const totalScore = Object.entries(this.assignmentWeights).reduce((total, [factor, weight]) => {
          return total + (scores[factor] * weight);
        }, 0);
        
        scoredPartners.push({
          partner,
          scores,
          totalScore,
          estimatedArrival: scores.estimatedArrival
        });
      } catch (error) {
        console.warn(`Failed to score partner ${partner.id}:`, error.message);
      }
    }
    
    // Sort by total score (descending)
    return scoredPartners.sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * Calculate comprehensive scores for a partner
   */
  async calculatePartnerScores(partner, deliveryRequest) {
    const scores = {};
    
    // 1. Distance Score (0-100)
    scores.distance = await this.calculateDistanceScore(partner, deliveryRequest);
    
    // 2. Rating Score (0-100)
    scores.rating = this.calculateRatingScore(partner);
    
    // 3. Availability Score (0-100)
    scores.availability = await this.calculateAvailabilityScore(partner);
    
    // 4. Experience Score (0-100)
    scores.experience = this.calculateExperienceScore(partner);
    
    // 5. Efficiency Score (0-100)
    scores.efficiency = await this.calculateEfficiencyScore(partner);
    
    // 6. Reliability Score (0-100)
    scores.reliability = await this.calculateReliabilityScore(partner);
    
    // Calculate estimated arrival time
    scores.estimatedArrival = await this.calculateEstimatedArrival(partner, deliveryRequest);
    
    return scores;
  }

  /**
   * Calculate distance-based score with intelligent routing
   */
  async calculateDistanceScore(partner, deliveryRequest) {
    try {
      const { pickupLatitude, pickupLongitude } = deliveryRequest;
      
      // Calculate straight-line distance
      const distance = this.calculateHaversineDistance(
        partner.current_latitude,
        partner.current_longitude,
        pickupLatitude,
        pickupLongitude
      );
      
      // Apply distance penalties and bonuses
      let score = Math.max(0, 100 - (distance * 8)); // 8 points penalty per km
      
      // Bonus for very close partners (within 2km)
      if (distance <= 2) {
        score = Math.min(100, score + 20);
      }
      
      // Penalty for partners beyond optimal range
      if (distance > 10) {
        score = Math.max(0, score - ((distance - 10) * 15));
      }
      
      return Math.round(score);
    } catch (error) {
      console.warn('Distance score calculation error:', error.message);
      return 50; // Default score
    }
  }

  /**
   * Calculate rating-based score with recent performance weighting
   */
  calculateRatingScore(partner) {
    try {
      const rating = partner.average_rating || 0;
      const totalDeliveries = partner.total_deliveries || 0;
      
      // Base score from rating (0-5 scale to 0-100)
      let score = (rating / 5) * 100;
      
      // Apply confidence factor based on number of deliveries
      if (totalDeliveries < 10) {
        score *= 0.7; // Reduce score for partners with few deliveries
      } else if (totalDeliveries < 50) {
        score *= 0.85;
      } else if (totalDeliveries > 500) {
        score *= 1.1; // Bonus for highly experienced partners
      }
      
      // Bonus for excellent ratings
      if (rating >= 4.8) {
        score = Math.min(100, score + 10);
      } else if (rating >= 4.5) {
        score = Math.min(100, score + 5);
      }
      
      // Penalty for low ratings
      if (rating < 3.5) {
        score = Math.max(0, score - 20);
      }
      
      return Math.round(Math.max(0, Math.min(100, score)));
    } catch (error) {
      console.warn('Rating score calculation error:', error.message);
      return 50;
    }
  }

  /**
   * Calculate availability score based on current capacity and workload
   */
  async calculateAvailabilityScore(partner) {
    try {
      // Get current active deliveries
      const activeDeliveries = await DeliveryPartner.getActiveDeliveriesCount(partner.id);
      const maxCapacity = partner.max_orders_capacity || 3;
      
      // Calculate capacity utilization
      const utilizationRate = activeDeliveries / maxCapacity;
      
      // Base score (inversely related to utilization)
      let score = (1 - utilizationRate) * 100;
      
      // Bonus for partners with available capacity
      if (activeDeliveries === 0) {
        score = Math.min(100, score + 20); // Bonus for completely free partners
      } else if (utilizationRate < 0.5) {
        score = Math.min(100, score + 10); // Bonus for low utilization
      }
      
      // Penalty for high utilization
      if (utilizationRate > 0.8) {
        score = Math.max(0, score - 15);
      }
      
      // Consider time since last location update
      const lastUpdate = new Date(partner.last_location_update);
      const timeSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60); // minutes
      
      if (timeSinceUpdate > 30) {
        score *= 0.7; // Reduce score for stale location data
      } else if (timeSinceUpdate > 15) {
        score *= 0.85;
      }
      
      return Math.round(Math.max(0, Math.min(100, score)));
    } catch (error) {
      console.warn('Availability score calculation error:', error.message);
      return 50;
    }
  }

  /**
   * Calculate experience score based on delivery history and tenure
   */
  calculateExperienceScore(partner) {
    try {
      const totalDeliveries = partner.total_deliveries || 0;
      const joiningDate = new Date(partner.joining_date);
      const tenureMonths = (Date.now() - joiningDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      
      // Base score from delivery count
      let deliveryScore = Math.min(80, totalDeliveries / 10); // 1 point per 10 deliveries, max 80
      
      // Base score from tenure
      let tenureScore = Math.min(20, tenureMonths * 2); // 2 points per month, max 20
      
      let score = deliveryScore + tenureScore;
      
      // Bonuses for milestones
      if (totalDeliveries >= 1000) {
        score = Math.min(100, score + 15); // Veteran bonus
      } else if (totalDeliveries >= 500) {
        score = Math.min(100, score + 10);
      } else if (totalDeliveries >= 100) {
        score = Math.min(100, score + 5);
      }
      
      // Vehicle type experience bonus
      if (partner.vehicle_type === 'MOTORCYCLE' && totalDeliveries > 200) {
        score = Math.min(100, score + 5); // Experienced motorcycle riders
      }
      
      return Math.round(Math.max(0, Math.min(100, score)));
    } catch (error) {
      console.warn('Experience score calculation error:', error.message);
      return 50;
    }
  }

  /**
   * Calculate efficiency score based on historical performance metrics
   */
  async calculateEfficiencyScore(partner) {
    try {
      // This would typically fetch from partner_performance_metrics table
      // For now, we'll use available data and estimate
      
      const totalDeliveries = partner.total_deliveries || 0;
      const successfulDeliveries = partner.successful_deliveries || 0;
      
      if (totalDeliveries === 0) return 50; // No data available
      
      // Success rate component (70% of efficiency score)
      const successRate = (successfulDeliveries / totalDeliveries) * 100;
      let efficiencyScore = (successRate / 100) * 70;
      
      // Average deliveries per day estimate (30% of efficiency score)
      const joiningDate = new Date(partner.joining_date);
      const daysSinceJoining = (Date.now() - joiningDate.getTime()) / (1000 * 60 * 60 * 24);
      const avgDeliveriesPerDay = totalDeliveries / Math.max(1, daysSinceJoining);
      
      // Normalize deliveries per day (assuming 8-12 deliveries/day is optimal)
      let productivityScore = 0;
      if (avgDeliveriesPerDay >= 8 && avgDeliveriesPerDay <= 12) {
        productivityScore = 30; // Optimal range
      } else if (avgDeliveriesPerDay >= 6 && avgDeliveriesPerDay <= 15) {
        productivityScore = 25; // Good range
      } else if (avgDeliveriesPerDay >= 4 && avgDeliveriesPerDay <= 18) {
        productivityScore = 20; // Acceptable range
      } else {
        productivityScore = 10; // Below/above optimal
      }
      
      efficiencyScore += productivityScore;
      
      // Bonus for consistent performers
      if (successRate >= 95 && avgDeliveriesPerDay >= 8) {
        efficiencyScore = Math.min(100, efficiencyScore + 10);
      }
      
      return Math.round(Math.max(0, Math.min(100, efficiencyScore)));
    } catch (error) {
      console.warn('Efficiency score calculation error:', error.message);
      return 50;
    }
  }

  /**
   * Calculate reliability score based on punctuality and consistency
   */
  async calculateReliabilityScore(partner) {
    try {
      // This would fetch actual performance data from database
      // For now, we'll estimate based on available metrics
      
      const totalDeliveries = partner.total_deliveries || 0;
      const rating = partner.average_rating || 0;
      
      if (totalDeliveries < 5) return 50; // Insufficient data
      
      // Base reliability from rating (assuming rating correlates with reliability)
      let reliabilityScore = (rating / 5) * 80;
      
      // Estimate on-time performance based on rating tiers
      let onTimeBonus = 0;
      if (rating >= 4.8) {
        onTimeBonus = 20; // Excellent reliability
      } else if (rating >= 4.5) {
        onTimeBonus = 15; // Very good reliability
      } else if (rating >= 4.0) {
        onTimeBonus = 10; // Good reliability
      } else if (rating >= 3.5) {
        onTimeBonus = 5; // Fair reliability
      }
      
      reliabilityScore += onTimeBonus;
      
      // Consistency bonus for experienced partners with stable performance
      const joiningDate = new Date(partner.joining_date);
      const tenureMonths = (Date.now() - joiningDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      
      if (tenureMonths > 6 && rating >= 4.0) {
        reliabilityScore = Math.min(100, reliabilityScore + 5); // Consistency bonus
      }
      
      return Math.round(Math.max(0, Math.min(100, reliabilityScore)));
    } catch (error) {
      console.warn('Reliability score calculation error:', error.message);
      return 50;
    }
  }

  /**
   * Calculate estimated arrival time at pickup location
   */
  async calculateEstimatedArrival(partner, deliveryRequest) {
    try {
      const distance = this.calculateHaversineDistance(
        partner.current_latitude,
        partner.current_longitude,
        deliveryRequest.pickupLatitude,
        deliveryRequest.pickupLongitude
      );
      
      // Get vehicle speed parameters
      const vehicleSpeeds = {
        'BICYCLE': 15,     // km/h
        'MOTORCYCLE': 30,  // km/h
        'CAR': 25,         // km/h (slower in city traffic)
        'SCOOTER': 25,     // km/h
        'WALKING': 5       // km/h
      };
      
      const speed = vehicleSpeeds[partner.vehicle_type] || 25;
      
      // Calculate base travel time
      const baseTime = (distance / speed) * 60; // minutes
      
      // Apply traffic and area factors
      let adjustedTime = baseTime;
      
      // Rush hour penalty
      const currentHour = new Date().getHours();
      if ((currentHour >= 8 && currentHour <= 10) || (currentHour >= 17 && currentHour <= 19)) {
        adjustedTime *= 1.3; // 30% increase during rush hours
      }
      
      // Area complexity factor (assume urban areas have more traffic)
      adjustedTime *= 1.2; // 20% increase for urban complexity
      
      // Add buffer time for partner response and preparation
      adjustedTime += 2; // 2 minutes buffer
      
      return Math.round(Math.max(1, adjustedTime));
    } catch (error) {
      console.warn('Arrival time calculation error:', error.message);
      return 15; // Default 15 minutes
    }
  }

  /**
   * Apply business constraints and filtering rules
   */
  async applyConstraints(scoredPartners, deliveryRequest) {
    const eligiblePartners = [];
    
    for (const scoredPartner of scoredPartners) {
      const partner = scoredPartner.partner;
      let eligible = true;
      const reasons = [];
      
      // Check minimum rating requirement
      if (partner.average_rating < this.performanceThresholds.minRating) {
        eligible = false;
        reasons.push(`Rating too low: ${partner.average_rating} < ${this.performanceThresholds.minRating}`);
      }
      
      // Check maximum distance constraint
      const distance = this.calculateHaversineDistance(
        partner.current_latitude,
        partner.current_longitude,
        deliveryRequest.pickupLatitude,
        deliveryRequest.pickupLongitude
      );
      
      if (distance > this.performanceThresholds.maxDistanceKm) {
        eligible = false;
        reasons.push(`Distance too far: ${distance.toFixed(1)}km > ${this.performanceThresholds.maxDistanceKm}km`);
      }
      
      // Check vehicle compatibility
      const vehicleConstraints = this.constraints.vehicleCompatibility[partner.vehicle_type];
      if (vehicleConstraints) {
        if (deliveryRequest.estimatedWeight && deliveryRequest.estimatedWeight > vehicleConstraints.maxWeight) {
          eligible = false;
          reasons.push(`Weight exceeds vehicle capacity: ${deliveryRequest.estimatedWeight}kg > ${vehicleConstraints.maxWeight}kg`);
        }
        
        if (distance > vehicleConstraints.maxDistance) {
          eligible = false;
          reasons.push(`Distance exceeds vehicle range: ${distance.toFixed(1)}km > ${vehicleConstraints.maxDistance}km`);
        }
      }
      
      // Check service area constraints
      if (partner.service_areas && partner.service_areas.length > 0) {
        const inServiceArea = await this.checkServiceAreaCoverage(partner, deliveryRequest);
        if (!inServiceArea) {
          eligible = false;
          reasons.push('Pickup location outside partner service area');
        }
      }
      
      // Priority-based constraints
      if (deliveryRequest.priority === 'HIGH' && partner.average_rating < 4.0) {
        eligible = false;
        reasons.push('High priority delivery requires rating >= 4.0');
      }
      
      if (eligible) {
        scoredPartner.eligibilityReasons = ['All constraints satisfied'];
        eligiblePartners.push(scoredPartner);
      } else {
        console.log(`Partner ${partner.first_name} ${partner.last_name} not eligible: ${reasons.join(', ')}`);
      }
    }
    
    return eligiblePartners;
  }

  /**
   * Select the best partner using advanced decision algorithms
   */
  async selectBestPartner(eligiblePartners, deliveryRequest) {
    if (eligiblePartners.length === 0) {
      throw new Error('No eligible partners available');
    }
    
    // For high priority deliveries, apply additional scoring
    if (deliveryRequest.priority === 'HIGH' || deliveryRequest.deliveryType === 'EXPRESS') {
      eligiblePartners.forEach(partner => {
        // Boost scores for high-performing partners in urgent situations
        if (partner.partner.average_rating >= 4.5) {
          partner.totalScore += 10;
        }
        if (partner.estimatedArrival <= 10) {
          partner.totalScore += 5;
        }
      });
      
      // Re-sort after adjustment
      eligiblePartners.sort((a, b) => b.totalScore - a.totalScore);
    }
    
    // Apply load balancing for fairness
    const selectedPartner = await this.applyLoadBalancing(eligiblePartners, deliveryRequest);
    
    // Add assignment reasons for transparency
    selectedPartner.reasons = this.generateAssignmentReasons(selectedPartner);
    
    return selectedPartner;
  }

  /**
   * Apply intelligent load balancing to ensure fair distribution
   */
  async applyLoadBalancing(eligiblePartners, deliveryRequest) {
    // Get recent assignment counts for top candidates
    const topCandidates = eligiblePartners.slice(0, Math.min(5, eligiblePartners.length));
    
    for (const candidate of topCandidates) {
      // Get assignments in the last hour
      const recentAssignments = await DeliveryPartner.getRecentAssignmentCount(
        candidate.partner.id, 
        60 // last 60 minutes
      );
      
      // Apply load balancing penalty
      if (recentAssignments > 3) {
        candidate.totalScore -= (recentAssignments - 3) * 2; // Reduce score for overloaded partners
      } else if (recentAssignments === 0) {
        candidate.totalScore += 3; // Small bonus for partners with no recent assignments
      }
    }
    
    // Re-sort after load balancing adjustment
    topCandidates.sort((a, b) => b.totalScore - a.totalScore);
    
    return topCandidates[0];
  }

  /**
   * Generate human-readable assignment reasons
   */
  generateAssignmentReasons(selectedPartner) {
    const reasons = [];
    const scores = selectedPartner.scores;
    
    if (scores.distance >= 80) {
      reasons.push('Very close to pickup location');
    } else if (scores.distance >= 60) {
      reasons.push('Close proximity to pickup');
    }
    
    if (scores.rating >= 90) {
      reasons.push('Excellent customer ratings');
    } else if (scores.rating >= 75) {
      reasons.push('High customer ratings');
    }
    
    if (scores.availability >= 85) {
      reasons.push('High availability and low current workload');
    }
    
    if (scores.experience >= 80) {
      reasons.push('Highly experienced partner');
    }
    
    if (scores.efficiency >= 85) {
      reasons.push('Excellent delivery efficiency');
    }
    
    if (scores.reliability >= 85) {
      reasons.push('Strong reliability track record');
    }
    
    if (selectedPartner.estimatedArrival <= 10) {
      reasons.push('Quick arrival time estimated');
    }
    
    return reasons.length > 0 ? reasons : ['Best overall match for this delivery'];
  }

  /**
   * Calculate assignment confidence score
   */
  calculateAssignmentConfidence(selectedPartner) {
    let confidence = 70; // Base confidence
    
    const scores = selectedPartner.scores;
    
    // Increase confidence based on strong scores
    if (scores.distance >= 80) confidence += 10;
    if (scores.rating >= 85) confidence += 8;
    if (scores.availability >= 80) confidence += 5;
    if (scores.experience >= 75) confidence += 5;
    if (scores.efficiency >= 80) confidence += 7;
    
    // Decrease confidence for marginal scores
    if (scores.distance < 50) confidence -= 10;
    if (scores.rating < 60) confidence -= 15;
    if (scores.availability < 40) confidence -= 10;
    
    return Math.max(50, Math.min(95, confidence));
  }

  /**
   * Check if partner serves the delivery area
   */
  async checkServiceAreaCoverage(partner, deliveryRequest) {
    try {
      if (!partner.service_areas || partner.service_areas.length === 0) {
        return true; // No restrictions if service areas not defined
      }
      
      // This would implement geofencing logic
      // For now, return true as a placeholder
      return true;
    } catch (error) {
      console.warn('Service area check error:', error.message);
      return true; // Default to allowing assignment
    }
  }

  /**
   * Calculate Haversine distance between two points
   */
  calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Batch assignment optimization for multiple deliveries
   */
  async optimizeBatchAssignment(deliveries, availablePartners) {
    try {
      console.log(`🎯 Optimizing batch assignment for ${deliveries.length} deliveries and ${availablePartners.length} partners`);
      
      // This implements the Hungarian algorithm or similar optimization
      // For now, we'll use a greedy approach with partner capacity constraints
      
      const assignments = [];
      const partnerWorkload = new Map();
      
      // Initialize partner workload tracking
      for (const partner of availablePartners) {
        partnerWorkload.set(partner.id, {
          partner,
          assignedDeliveries: [],
          currentCapacity: 0,
          maxCapacity: partner.max_orders_capacity || 3
        });
      }
      
      // Sort deliveries by priority and creation time
      const sortedDeliveries = [...deliveries].sort((a, b) => {
        const priorityWeight = { 'HIGH': 3, 'NORMAL': 2, 'LOW': 1 };
        const aPriority = priorityWeight[a.priority] || 2;
        const bPriority = priorityWeight[b.priority] || 2;
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority; // Higher priority first
        }
        
        return new Date(a.createdAt) - new Date(b.createdAt); // Older first
      });
      
      // Assign deliveries using intelligent matching
      for (const delivery of sortedDeliveries) {
        const optimalAssignment = await this.findOptimalPartner(delivery);
        
        if (optimalAssignment && partnerWorkload.has(optimalAssignment.partner.id)) {
          const workload = partnerWorkload.get(optimalAssignment.partner.id);
          
          if (workload.currentCapacity < workload.maxCapacity) {
            assignments.push({
              deliveryId: delivery.id,
              partnerId: optimalAssignment.partner.id,
              assignmentScore: optimalAssignment.assignmentScore,
              estimatedArrival: optimalAssignment.estimatedArrivalTime
            });
            
            workload.assignedDeliveries.push(delivery);
            workload.currentCapacity++;
          }
        }
      }
      
      console.log(`✅ Batch assignment completed: ${assignments.length}/${deliveries.length} deliveries assigned`);
      
      return {
        assignments,
        unassignedDeliveries: deliveries.length - assignments.length,
        utilizationRate: (assignments.length / deliveries.length * 100).toFixed(1)
      };
      
    } catch (error) {
      console.error('Batch assignment optimization error:', error);
      throw error;
    }
  }

  /**
   * Real-time partner rebalancing based on demand patterns
   */
  async rebalancePartnerAllocation(zoneId, demandForecast) {
    try {
      console.log(`⚖️ Rebalancing partner allocation for zone: ${zoneId}`);
      
      // Get current partner distribution in the zone
      const partnersInZone = await DeliveryPartner.getPartnersInZone(zoneId);
      
      // Calculate optimal partner distribution based on demand
      const optimalDistribution = this.calculateOptimalDistribution(demandForecast);
      
      // Generate rebalancing recommendations
      const recommendations = [];
      
      for (const [area, requiredPartners] of Object.entries(optimalDistribution)) {
        const currentPartners = partnersInZone.filter(p => 
          this.isPartnerInArea(p, area)
        ).length;
        
        const difference = requiredPartners - currentPartners;
        
        if (difference > 0) {
          recommendations.push({
            area,
            action: 'INCREASE',
            requiredPartners: difference,
            priority: this.calculateRebalancingPriority(area, difference)
          });
        } else if (difference < 0) {
          recommendations.push({
            area,
            action: 'DECREASE',
            excessPartners: Math.abs(difference),
            priority: 'LOW'
          });
        }
      }
      
      return {
        zoneId,
        currentDistribution: partnersInZone.length,
        recommendations,
        projectedImprovement: this.calculateProjectedImprovement(recommendations)
      };
      
    } catch (error) {
      console.error('Partner rebalancing error:', error);
      throw error;
    }
  }

  /**
   * Helper methods for rebalancing
   */
  calculateOptimalDistribution(demandForecast) {
    // Simplified optimal distribution calculation
    // In practice, this would use sophisticated algorithms
    
    const totalDemand = Object.values(demandForecast).reduce((sum, demand) => sum + demand, 0);
    const optimalDistribution = {};
    
    for (const [area, demand] of Object.entries(demandForecast)) {
      // Assume 1 partner can handle 10 deliveries per hour
      const requiredPartners = Math.ceil(demand / 10);
      optimalDistribution[area] = requiredPartners;
    }
    
    return optimalDistribution;
  }

  isPartnerInArea(partner, area) {
    // Simplified area check - in practice would use geofencing
    return partner.service_areas?.includes(area) || false;
  }

  calculateRebalancingPriority(area, difference) {
    if (difference >= 3) return 'HIGH';
    if (difference >= 2) return 'MEDIUM';
    return 'LOW';
  }

  calculateProjectedImprovement(recommendations) {
    // Estimate improvement in delivery efficiency
    const highPriorityActions = recommendations.filter(r => r.priority === 'HIGH').length;
    return Math.min(25, highPriorityActions * 8); // Max 25% improvement
  }
}

module.exports = PartnerAssignmentService;