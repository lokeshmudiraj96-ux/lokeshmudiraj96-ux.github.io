const User = require('../models/user.model');

class UserController {
  // Get current user profile
  async getProfile(req, res, next) {
    try {
      const userId = req.user.id; // From auth middleware

      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          storeId: user.store_id,
          isVerified: user.is_verified,
          createdAt: user.created_at
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Update user profile
  async updateProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const { name, email, phone } = req.body;

      const updates = {};
      if (name) updates.name = name;
      if (email) updates.email = email;
      if (phone) updates.phone = phone;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No fields to update' 
        });
      }

      const updatedUser = await User.update(userId, updates);

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          phone: updatedUser.phone,
          role: updatedUser.role,
          isVerified: updatedUser.is_verified
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Change password
  async changePassword(req, res, next) {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ 
          success: false, 
          message: 'Current password and new password are required' 
        });
      }

      // Get user with password
      const user = await User.findById(userId);
      const userWithPassword = await User.findByEmail(user.email);

      // Verify current password
      const isValid = await User.verifyPassword(currentPassword, userWithPassword.password_hash);
      if (!isValid) {
        return res.status(401).json({ 
          success: false, 
          message: 'Current password is incorrect' 
        });
      }

      // Update password
      await User.updatePassword(userId, newPassword);

      res.status(200).json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserController();
