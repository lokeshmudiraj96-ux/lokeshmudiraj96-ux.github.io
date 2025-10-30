const express = require('express');
const router = express.Router();
const SocialController = require('../controllers/social.controller');
const { authenticateToken, apiRateLimit, validateRequest } = require('../middleware');
const Joi = require('joi');

// Validation schemas
const connectionRequestSchema = Joi.object({
  addresseeId: Joi.string().required(),
  connectionType: Joi.string().valid('FRIEND', 'FAMILY', 'COLLEAGUE', 'NEIGHBOR').default('FRIEND'),
  notes: Joi.string().max(500).allow('')
});

const responseRequestSchema = Joi.object({
  action: Joi.string().valid('ACCEPT', 'REJECT').required()
});

const blockUserSchema = Joi.object({
  action: Joi.string().valid('BLOCK', 'UNBLOCK').required()
});

// Routes

// POST /api/social/connections/request - Send connection request
router.post('/connections/request', 
  authenticateToken,
  apiRateLimit,
  validateRequest(connectionRequestSchema),
  SocialController.sendConnectionRequest
);

// GET /api/social/connections/pending - Get pending connection requests
router.get('/connections/pending', 
  authenticateToken,
  SocialController.getPendingRequests
);

// PUT /api/social/connections/:id/respond - Respond to connection request
router.put('/connections/:id/respond', 
  authenticateToken,
  validateRequest(responseRequestSchema),
  SocialController.respondToRequest
);

// GET /api/social/connections - Get user connections/friends
router.get('/connections', 
  authenticateToken,
  SocialController.getConnections
);

// DELETE /api/social/connections/:id - Remove connection
router.delete('/connections/:id', 
  authenticateToken,
  SocialController.removeConnection
);

// GET /api/social/connections/:friendId/mutual - Get mutual connections
router.get('/connections/:friendId/mutual', 
  authenticateToken,
  SocialController.getMutualConnections
);

// GET /api/social/suggestions - Get connection suggestions
router.get('/suggestions', 
  authenticateToken,
  SocialController.getConnectionSuggestions
);

// PUT /api/social/users/:targetUserId/block - Block/Unblock user
router.put('/users/:targetUserId/block', 
  authenticateToken,
  validateRequest(blockUserSchema),
  SocialController.blockUser
);

module.exports = router;