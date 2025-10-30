const express = require('express');
const { LoyaltyController, ReferralController } = require('../controllers/loyalty.controller');
const { authenticateToken, apiRateLimit, validateRequest } = require('../middleware');
const Joi = require('joi');

// Validation schemas
const redeemPointsSchema = Joi.object({
  points: Joi.number().integer().min(1000).max(50000).required(),
  redeemFor: Joi.string().valid('CASH_CREDIT', 'DISCOUNT_VOUCHER', 'FREE_DELIVERY').default('CASH_CREDIT')
});

const processReferralSchema = Joi.object({
  referralCode: Joi.string().required().length(8),
  newUserId: Joi.string().required()
});

// Loyalty Routes
const loyaltyRouter = express.Router();

// GET /api/loyalty/overview - Get loyalty program overview
loyaltyRouter.get('/overview', 
  authenticateToken,
  LoyaltyController.getLoyaltyOverview
);

// GET /api/loyalty/transactions - Get loyalty transaction history
loyaltyRouter.get('/transactions', 
  authenticateToken,
  LoyaltyController.getTransactionHistory
);

// POST /api/loyalty/redeem - Redeem loyalty points
loyaltyRouter.post('/redeem', 
  authenticateToken,
  apiRateLimit,
  validateRequest(redeemPointsSchema),
  LoyaltyController.redeemPoints
);

// GET /api/loyalty/rewards - Get available rewards/offers
loyaltyRouter.get('/rewards', 
  authenticateToken,
  LoyaltyController.getAvailableRewards
);

// POST /api/loyalty/birthday-bonus - Claim birthday bonus
loyaltyRouter.post('/birthday-bonus', 
  authenticateToken,
  apiRateLimit,
  LoyaltyController.awardBirthdayBonus
);

// Referral Routes
const referralRouter = express.Router();

// GET /api/referrals/overview - Get referral overview
referralRouter.get('/overview', 
  authenticateToken,
  ReferralController.getReferralOverview
);

// GET /api/referrals/history - Get referral history
referralRouter.get('/history', 
  authenticateToken,
  ReferralController.getReferralHistory
);

// POST /api/referrals/process - Process referral (when someone uses referral code)
referralRouter.post('/process', 
  authenticateToken,
  validateRequest(processReferralSchema),
  ReferralController.processReferral
);

// GET /api/referrals/link - Generate referral link
referralRouter.get('/link', 
  authenticateToken,
  ReferralController.generateReferralLink
);

module.exports = { loyaltyRouter, referralRouter };