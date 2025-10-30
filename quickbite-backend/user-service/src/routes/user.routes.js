const express = require('express');
const router = express.Router();
const multer = require('multer');
const UserController = require('../controllers/user.controller');
const { authenticateToken, uploadRateLimit, validateRequest } = require('../middleware');
const Joi = require('joi');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Validation schemas
const updateProfileSchema = Joi.object({
  firstName: Joi.string().min(2).max(50),
  lastName: Joi.string().min(2).max(50),
  email: Joi.string().email(),
  phone: Joi.string().pattern(/^[+]?[\d\s()-]+$/).min(10).max(15),
  dateOfBirth: Joi.date(),
  gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'),
  bio: Joi.string().max(500),
  occupation: Joi.string().max(100),
  emergencyContactName: Joi.string().max(100),
  emergencyContactPhone: Joi.string().pattern(/^[+]?[\d\s()-]+$/).min(10).max(15),
  dietaryPreferences: Joi.array().items(Joi.string())
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).pattern(
    new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]')
  ).required()
});

const deactivateAccountSchema = Joi.object({
  password: Joi.string().required(),
  reason: Joi.string().max(500)
});

// Routes

// GET /api/users/profile - Get user profile
router.get('/profile', authenticateToken, UserController.getProfile);

// PUT /api/users/profile - Update user profile
router.put('/profile', 
  authenticateToken, 
  validateRequest(updateProfileSchema),
  UserController.updateProfile
);

// POST /api/users/profile/image - Upload profile image
router.post('/profile/image', 
  authenticateToken,
  uploadRateLimit,
  upload.single('profileImage'),
  UserController.uploadProfileImage
);

// PUT /api/users/password - Change password
router.put('/password', 
  authenticateToken,
  validateRequest(changePasswordSchema),
  UserController.changePassword
);

// GET /api/users/loyalty - Get loyalty stats
router.get('/loyalty', authenticateToken, UserController.getLoyaltyStats);

// GET /api/users/analytics - Get user analytics
router.get('/analytics', authenticateToken, UserController.getUserAnalytics);

// GET /api/users/search - Search users (for social features)
router.get('/search', authenticateToken, UserController.searchUsers);

// POST /api/users/deactivate - Deactivate account
router.post('/deactivate', 
  authenticateToken,
  validateRequest(deactivateAccountSchema),
  UserController.deactivateAccount
);

// GET /api/users/activity - Get user activity feed
router.get('/activity', authenticateToken, UserController.getActivityFeed);

module.exports = router;