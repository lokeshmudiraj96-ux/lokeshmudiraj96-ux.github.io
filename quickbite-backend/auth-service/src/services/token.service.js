const jwt = require('jsonwebtoken');

class TokenService {
  // Generate access token
  static generateAccessToken(userId, role, storeId = null) {
    return jwt.sign(
      { 
        id: userId, 
        role, 
        storeId,
        type: 'access' 
      },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    );
  }

  // Verify access token
  static verifyAccessToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  // Verify refresh token
  static verifyRefreshToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  // Generate token pair
  static async generateTokenPair(userId, role, storeId = null) {
    const RefreshToken = require('../models/refreshToken.model');
    
    const accessToken = this.generateAccessToken(userId, role, storeId);
    const refreshTokenData = await RefreshToken.create(userId);
    
    // Return in snake_case to align with frontend
    return {
      access_token: accessToken,
      refresh_token: refreshTokenData.token,
      expires_in: 900 // 15 minutes in seconds
    };
  }
}

module.exports = TokenService;
