const { User, UserReferral } = require('../models/user.model');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');

class LoyaltyController {
  // Get loyalty program overview
  static async getLoyaltyOverview(req, res) {
    try {
      const userId = req.user.id;
      const stats = await User.getLoyaltyStats(userId);
      
      // Get recent loyalty transactions
      const { pool } = require('../config/database');
      const transactionsQuery = `
        SELECT * FROM loyalty_transactions 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT 10
      `;
      
      const transactionsResult = await pool.query(transactionsQuery, [userId]);
      
      // Get tier information and benefits
      const tierBenefits = LoyaltyController.getTierBenefits(stats.loyaltyTier);
      const nextTierInfo = LoyaltyController.getNextTierInfo(stats.loyaltyTier, stats.loyaltyPoints);

      res.json({
        success: true,
        data: {
          currentStats: stats,
          recentTransactions: transactionsResult.rows,
          tierBenefits,
          nextTierInfo,
          pointsValue: {
            onePointEquals: 0.01, // 1 point = ₹0.01
            minimumRedemption: 1000, // 1000 points = ₹10
            expiryPeriod: '12 months'
          }
        }
      });
    } catch (error) {
      console.error('Error getting loyalty overview:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get loyalty transaction history
  static async getTransactionHistory(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, type = 'ALL' } = req.query;

      const { pool } = require('../config/database');
      
      let query = `
        SELECT 
          lt.*,
          CASE 
            WHEN lt.order_id IS NOT NULL THEN o.order_number
            ELSE NULL 
          END as order_number
        FROM loyalty_transactions lt
        LEFT JOIN orders o ON o.id = lt.order_id
        WHERE lt.user_id = $1
      `;
      
      const params = [userId];
      
      if (type !== 'ALL') {
        query += ` AND lt.transaction_type = $${params.length + 1}`;
        params.push(type);
      }
      
      query += ` ORDER BY lt.created_at DESC`;
      
      // Add pagination
      const offset = (page - 1) * limit;
      query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(limit), offset);

      const result = await pool.query(query, params);
      
      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM loyalty_transactions 
        WHERE user_id = $1 ${type !== 'ALL' ? 'AND transaction_type = $2' : ''}
      `;
      
      const countParams = [userId];
      if (type !== 'ALL') countParams.push(type);
      
      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);

      res.json({
        success: true,
        data: {
          transactions: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error getting transaction history:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Redeem loyalty points
  static async redeemPoints(req, res) {
    try {
      const userId = req.user.id;
      const { points, redeemFor = 'CASH_CREDIT' } = req.body;

      // Validate input
      const schema = Joi.object({
        points: Joi.number().integer().min(1000).max(50000).required(),
        redeemFor: Joi.string().valid('CASH_CREDIT', 'DISCOUNT_VOUCHER', 'FREE_DELIVERY').default('CASH_CREDIT')
      });

      const { error } = schema.validate({ points, redeemFor });
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.details.map(detail => detail.message)
        });
      }

      // Check if user has enough points
      const user = await User.findById(userId);
      if (user.loyaltyPoints < points) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient loyalty points'
        });
      }

      // Calculate redemption value
      const redemptionValue = LoyaltyController.calculateRedemptionValue(points, redeemFor);
      
      // Process redemption
      const { pool } = require('../config/database');
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Deduct points from user
        await client.query(
          'UPDATE users SET loyalty_points = loyalty_points - $1 WHERE id = $2',
          [points, userId]
        );

        // Create redemption transaction
        const transactionId = uuidv4();
        await client.query(
          `INSERT INTO loyalty_transactions (
            id, user_id, transaction_type, points_change, points_balance,
            description, metadata
          ) VALUES ($1, $2, 'REDEMPTION', $3, $4, $5, $6)`,
          [
            transactionId,
            userId,
            -points,
            user.loyaltyPoints - points,
            `Redeemed ${points} points for ${redeemFor}`,
            JSON.stringify({
              redeemFor,
              redemptionValue,
              cashValue: redemptionValue
            })
          ]
        );

        // Create wallet credit if cash redemption
        if (redeemFor === 'CASH_CREDIT') {
          await client.query(
            'UPDATE users SET wallet_balance_cents = wallet_balance_cents + $1 WHERE id = $2',
            [redemptionValue, userId]
          );
        }

        await client.query('COMMIT');

        res.json({
          success: true,
          message: 'Points redeemed successfully',
          data: {
            pointsRedeemed: points,
            redemptionValue,
            redeemFor,
            newBalance: user.loyaltyPoints - points
          }
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error redeeming points:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get available rewards/offers
  static async getAvailableRewards(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);
      
      // Define available rewards based on points and tier
      const rewards = [
        {
          id: 'cash_1000',
          title: '₹10 Cash Credit',
          description: 'Get ₹10 added to your wallet',
          pointsRequired: 1000,
          type: 'CASH_CREDIT',
          value: 1000, // ₹10 in paise
          available: user.loyaltyPoints >= 1000,
          category: 'CASH'
        },
        {
          id: 'cash_2500',
          title: '₹25 Cash Credit',
          description: 'Get ₹25 added to your wallet',
          pointsRequired: 2500,
          type: 'CASH_CREDIT',
          value: 2500, // ₹25 in paise
          available: user.loyaltyPoints >= 2500,
          category: 'CASH'
        },
        {
          id: 'free_delivery_7',
          title: 'Free Delivery (7 days)',
          description: 'Free delivery on all orders for 7 days',
          pointsRequired: 1500,
          type: 'FREE_DELIVERY',
          validityDays: 7,
          available: user.loyaltyPoints >= 1500,
          category: 'DELIVERY'
        },
        {
          id: 'discount_15',
          title: '15% Off Voucher',
          description: '15% discount on your next order (up to ₹100)',
          pointsRequired: 2000,
          type: 'DISCOUNT_VOUCHER',
          discountPercent: 15,
          maxDiscount: 10000, // ₹100 in paise
          available: user.loyaltyPoints >= 2000,
          category: 'DISCOUNT'
        }
      ];

      // Add tier-specific rewards
      const tierRewards = LoyaltyController.getTierSpecificRewards(user.loyaltyTier, user.loyaltyPoints);
      rewards.push(...tierRewards);

      res.json({
        success: true,
        data: {
          userPoints: user.loyaltyPoints,
          userTier: user.loyaltyTier,
          rewards: rewards.sort((a, b) => a.pointsRequired - b.pointsRequired)
        }
      });
    } catch (error) {
      console.error('Error getting available rewards:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get tier benefits and requirements
  static getTierBenefits(tier) {
    const benefits = {
      BRONZE: {
        pointsMultiplier: 1,
        deliveryDiscount: 0,
        specialOffers: false,
        prioritySupport: false,
        exclusiveDeals: false,
        birthdayBonus: 100
      },
      SILVER: {
        pointsMultiplier: 1.2,
        deliveryDiscount: 10, // 10% off delivery
        specialOffers: true,
        prioritySupport: false,
        exclusiveDeals: false,
        birthdayBonus: 250
      },
      GOLD: {
        pointsMultiplier: 1.5,
        deliveryDiscount: 25,
        specialOffers: true,
        prioritySupport: true,
        exclusiveDeals: true,
        birthdayBonus: 500,
        freeDeliveryThreshold: 30000 // ₹300 for free delivery
      },
      PLATINUM: {
        pointsMultiplier: 2,
        deliveryDiscount: 50,
        specialOffers: true,
        prioritySupport: true,
        exclusiveDeals: true,
        birthdayBonus: 1000,
        freeDeliveryThreshold: 20000, // ₹200 for free delivery
        conciergeService: true
      },
      DIAMOND: {
        pointsMultiplier: 3,
        deliveryDiscount: 100, // Free delivery
        specialOffers: true,
        prioritySupport: true,
        exclusiveDeals: true,
        birthdayBonus: 2000,
        freeDeliveryThreshold: 0, // Always free delivery
        conciergeService: true,
        personalChef: true
      }
    };

    return benefits[tier] || benefits.BRONZE;
  }

  // Get next tier information
  static getNextTierInfo(currentTier, currentPoints) {
    const tierRequirements = {
      BRONZE: { points: 0, orders: 0 },
      SILVER: { points: 5000, orders: 5 },
      GOLD: { points: 15000, orders: 20 },
      PLATINUM: { points: 40000, orders: 50 },
      DIAMOND: { points: 100000, orders: 100 }
    };

    const tiers = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
    const currentIndex = tiers.indexOf(currentTier);
    
    if (currentIndex === tiers.length - 1) {
      return {
        isMaxTier: true,
        message: 'You have reached the highest tier!'
      };
    }

    const nextTier = tiers[currentIndex + 1];
    const nextTierReq = tierRequirements[nextTier];
    
    return {
      nextTier,
      pointsRequired: nextTierReq.points,
      pointsNeeded: Math.max(0, nextTierReq.points - currentPoints),
      ordersRequired: nextTierReq.orders,
      progress: Math.min(100, (currentPoints / nextTierReq.points) * 100)
    };
  }

  // Calculate redemption value
  static calculateRedemptionValue(points, redeemFor) {
    const baseRate = 1; // 1 point = 1 paisa = ₹0.01
    
    switch (redeemFor) {
      case 'CASH_CREDIT':
        return points * baseRate; // Direct conversion
      case 'DISCOUNT_VOUCHER':
        return points * baseRate * 1.2; // 20% bonus for vouchers
      case 'FREE_DELIVERY':
        return points * baseRate * 0.8; // 20% less value for convenience
      default:
        return points * baseRate;
    }
  }

  // Get tier-specific rewards
  static getTierSpecificRewards(tier, points) {
    const rewards = [];

    if (tier === 'GOLD' || tier === 'PLATINUM' || tier === 'DIAMOND') {
      rewards.push({
        id: 'priority_delivery',
        title: 'Priority Delivery',
        description: 'Get your orders delivered faster',
        pointsRequired: 3000,
        type: 'PRIORITY_SERVICE',
        available: points >= 3000,
        category: 'SERVICE'
      });
    }

    if (tier === 'PLATINUM' || tier === 'DIAMOND') {
      rewards.push({
        id: 'concierge_service',
        title: 'Personal Concierge',
        description: '1-hour personalized food recommendation session',
        pointsRequired: 5000,
        type: 'CONCIERGE_SERVICE',
        available: points >= 5000,
        category: 'SERVICE'
      });
    }

    if (tier === 'DIAMOND') {
      rewards.push({
        id: 'chef_consultation',
        title: 'Chef Consultation',
        description: 'Video call with our partner chefs for cooking tips',
        pointsRequired: 8000,
        type: 'CHEF_CONSULTATION',
        available: points >= 8000,
        category: 'EXCLUSIVE'
      });
    }

    return rewards;
  }

  // Award birthday bonus
  static async awardBirthdayBonus(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if it's user's birthday
      const today = new Date();
      const birthday = new Date(user.dateOfBirth);
      
      if (
        birthday.getDate() !== today.getDate() ||
        birthday.getMonth() !== today.getMonth()
      ) {
        return res.status(400).json({
          success: false,
          message: 'Birthday bonus can only be claimed on your birthday'
        });
      }

      // Check if already claimed this year
      const { pool } = require('../config/database');
      const claimedQuery = `
        SELECT * FROM loyalty_transactions 
        WHERE user_id = $1 
        AND transaction_type = 'BIRTHDAY_BONUS'
        AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
      `;
      
      const claimed = await pool.query(claimedQuery, [userId]);
      
      if (claimed.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Birthday bonus already claimed this year'
        });
      }

      // Award birthday bonus based on tier
      const tierBenefits = LoyaltyController.getTierBenefits(user.loyaltyTier);
      const bonusPoints = tierBenefits.birthdayBonus;

      await user.addLoyaltyPoints(
        bonusPoints,
        'BIRTHDAY_BONUS',
        `Happy Birthday! Tier ${user.loyaltyTier} birthday bonus`
      );

      res.json({
        success: true,
        message: 'Happy Birthday! Bonus points awarded!',
        data: {
          bonusPoints,
          newBalance: user.loyaltyPoints + bonusPoints
        }
      });
    } catch (error) {
      console.error('Error awarding birthday bonus:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

// Referral Controller
class ReferralController {
  // Get referral overview
  static async getReferralOverview(req, res) {
    try {
      const userId = req.user.id;
      const stats = await UserReferral.getReferralStats(userId);
      
      // Get user's referral code
      const user = await User.findById(userId);
      
      res.json({
        success: true,
        data: {
          referralCode: user.referralCode,
          stats,
          rewards: {
            referrerReward: '₹5', // For referring someone
            refereeReward: '₹3', // For new user joining
            bonusAfter5: '₹25', // Bonus after 5 successful referrals
            bonusAfter10: '₹50' // Bonus after 10 successful referrals
          },
          shareMessage: `Join QuickBite using my code ${user.referralCode} and get ₹3 off your first order! 🍕🎉`
        }
      });
    } catch (error) {
      console.error('Error getting referral overview:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get referral history
  static async getReferralHistory(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const { pool } = require('../config/database');
      
      const query = `
        SELECT 
          ur.*,
          u.first_name || ' ' || u.last_name as referee_name,
          u.profile_image_url as referee_profile_image
        FROM user_referrals ur
        LEFT JOIN users u ON u.id = ur.referee_id
        WHERE ur.referrer_id = $1
        ORDER BY ur.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const offset = (page - 1) * limit;
      const result = await pool.query(query, [userId, parseInt(limit), offset]);
      
      // Get total count
      const countResult = await pool.query(
        'SELECT COUNT(*) as total FROM user_referrals WHERE referrer_id = $1',
        [userId]
      );
      
      const total = parseInt(countResult.rows[0].total);

      res.json({
        success: true,
        data: {
          referrals: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error getting referral history:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Process referral (called when someone uses referral code)
  static async processReferral(req, res) {
    try {
      const { referralCode, newUserId } = req.body;

      if (!referralCode || !newUserId) {
        return res.status(400).json({
          success: false,
          message: 'Referral code and new user ID are required'
        });
      }

      // Find referrer by code
      const referrer = await User.findByReferralCode(referralCode);
      if (!referrer) {
        return res.status(404).json({
          success: false,
          message: 'Invalid referral code'
        });
      }

      // Check if new user exists
      const newUser = await User.findById(newUserId);
      if (!newUser) {
        return res.status(404).json({
          success: false,
          message: 'New user not found'
        });
      }

      // Check if referral already exists
      const { pool } = require('../config/database');
      const existingReferral = await pool.query(
        'SELECT * FROM user_referrals WHERE referee_id = $1',
        [newUserId]
      );

      if (existingReferral.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'User already referred by someone else'
        });
      }

      // Cannot refer yourself
      if (referrer.id === newUserId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot refer yourself'
        });
      }

      // Create referral record
      const referral = new UserReferral({
        referrerId: referrer.id,
        refereeId: newUserId,
        referralCode,
        referralSource: 'MANUAL_CODE',
        status: 'PENDING'
      });

      const savedReferral = await referral.save();

      // Give immediate welcome bonus to referee
      const welcomeBonus = 300; // ₹3 in paise
      await newUser.addLoyaltyPoints(
        welcomeBonus,
        'REFERRAL_WELCOME',
        'Welcome bonus from referral'
      );

      res.json({
        success: true,
        message: 'Referral processed successfully',
        data: {
          referralId: savedReferral.id,
          welcomeBonus: welcomeBonus,
          message: 'Welcome bonus awarded! Complete your first order to earn rewards for your referrer.'
        }
      });
    } catch (error) {
      console.error('Error processing referral:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Generate referral link
  static async generateReferralLink(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const baseUrl = process.env.APP_BASE_URL || 'https://quickbite.app';
      const referralLink = `${baseUrl}/signup?ref=${user.referralCode}`;
      
      const shareText = `Join QuickBite using my referral link and get ₹3 off your first order! 🍕✨`;
      
      res.json({
        success: true,
        data: {
          referralCode: user.referralCode,
          referralLink,
          shareText,
          socialSharing: {
            whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${referralLink}`)}`,
            facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`,
            twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(referralLink)}`
          }
        }
      });
    } catch (error) {
      console.error('Error generating referral link:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = {
  LoyaltyController,
  ReferralController
};