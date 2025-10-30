const {
  User,
  UserAddress,
  UserPreferences,
  UserConnection,
  UserReferral,
  USER_ROLES,
  ACCOUNT_STATUS,
  LOYALTY_TIERS
} = require('../models/user.model');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// User Profile Controllers
class UserController {
  // Get user profile
  static async getProfile(req, res) {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Remove sensitive fields
      delete user.password;
      delete user.passwordResetToken;
      delete user.passwordResetExpires;

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error('Error getting profile:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update user profile
  static async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const updates = req.body;

      // Validate allowed fields
      const allowedFields = [
        'firstName', 'lastName', 'email', 'phone', 'dateOfBirth',
        'gender', 'bio', 'occupation', 'emergencyContactName',
        'emergencyContactPhone', 'dietaryPreferences'
      ];

      const validUpdates = {};
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          validUpdates[field] = updates[field];
        }
      }

      // Email uniqueness check if email is being updated
      if (validUpdates.email) {
        const existingUser = await User.findByEmail(validUpdates.email);
        if (existingUser && existingUser.id !== userId) {
          return res.status(409).json({
            success: false,
            message: 'Email already exists'
          });
        }
      }

      // Phone uniqueness check if phone is being updated
      if (validUpdates.phone) {
        const existingUser = await User.findByPhone(validUpdates.phone);
        if (existingUser && existingUser.id !== userId) {
          return res.status(409).json({
            success: false,
            message: 'Phone number already exists'
          });
        }
      }

      const updatedUser = await User.updateProfile(userId, validUpdates);

      // Remove sensitive fields
      delete updatedUser.password;

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: updatedUser
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Upload profile image
  static async uploadProfileImage(req, res) {
    try {
      const userId = req.user.id;
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided'
        });
      }

      // Create uploads directory if it doesn't exist
      const uploadsDir = path.join(process.cwd(), 'uploads', 'profiles');
      await fs.mkdir(uploadsDir, { recursive: true });

      // Generate unique filename
      const fileExtension = path.extname(req.file.originalname);
      const fileName = `${userId}-${Date.now()}${fileExtension}`;
      const filePath = path.join(uploadsDir, fileName);

      // Process image with sharp (resize, compress)
      const processedBuffer = await sharp(req.file.buffer)
        .resize(400, 400, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      // Save processed image
      await fs.writeFile(filePath, processedBuffer);

      // Update user profile with new image URL
      const imageUrl = `/uploads/profiles/${fileName}`;
      const updatedUser = await User.updateProfile(userId, { 
        profileImageUrl: imageUrl 
      });

      res.json({
        success: true,
        message: 'Profile image uploaded successfully',
        data: {
          profileImageUrl: imageUrl
        }
      });
    } catch (error) {
      console.error('Error uploading profile image:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Change password
  static async changePassword(req, res) {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password and new password are required'
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 8 characters long'
        });
      }

      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Update password
      await user.updatePassword(newPassword);

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get loyalty stats
  static async getLoyaltyStats(req, res) {
    try {
      const userId = req.user.id;
      const stats = await User.getLoyaltyStats(userId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting loyalty stats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get user analytics
  static async getUserAnalytics(req, res) {
    try {
      const userId = req.user.id;
      const { period = '30d' } = req.query;

      const analytics = await User.getUserAnalytics(userId, period);

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Error getting user analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Search users (for social features)
  static async searchUsers(req, res) {
    try {
      const { query, limit = 20 } = req.query;
      const userId = req.user.id;

      if (!query || query.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search query must be at least 2 characters long'
        });
      }

      const users = await UserConnection.searchUsers(query.trim(), userId, parseInt(limit));

      res.json({
        success: true,
        data: users
      });
    } catch (error) {
      console.error('Error searching users:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Deactivate account
  static async deactivateAccount(req, res) {
    try {
      const userId = req.user.id;
      const { password, reason } = req.body;

      if (!password) {
        return res.status(400).json({
          success: false,
          message: 'Password is required to deactivate account'
        });
      }

      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid password'
        });
      }

      // Update account status
      await User.updateProfile(userId, {
        accountStatus: ACCOUNT_STATUS.DEACTIVATED,
        deactivationReason: reason || 'User requested deactivation',
        deactivatedAt: new Date()
      });

      res.json({
        success: true,
        message: 'Account deactivated successfully'
      });
    } catch (error) {
      console.error('Error deactivating account:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get user activity feed
  static async getActivityFeed(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const activities = await User.getActivityFeed(userId, parseInt(page), parseInt(limit));

      res.json({
        success: true,
        data: activities
      });
    } catch (error) {
      console.error('Error getting activity feed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = UserController;