const User = require('../models/user.model');
const OTP = require('../models/otp.model');
const RefreshToken = require('../models/refreshToken.model');
const TokenService = require('../services/token.service');
const { sendOTP } = require('../utils/sms.util');
const { getRedisClient } = require('../config/redis');

function isValidE164(phone) {
  return typeof phone === 'string' && /^\+[1-9]\d{1,14}$/.test(phone);
}

class AuthController {
  // Request OTP for login/registration
  async requestOTP(req, res, next) {
    try {
      const { phone, purpose = 'login' } = req.body;

      if (!phone || !isValidE164(phone)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid phone number format',
          code: 'INVALID_PHONE'
        });
      }

      // Check if user exists
      const user = await User.findByPhone(phone);
      
        // Allow OTP for both existing and new users (auto-register on verify)
        console.log(`📱 OTP requested for ${phone} (${user ? 'existing' : 'new'} user)`);

      // Rate limiting: max 5 per hour per phone (best-effort; skip if Redis unavailable)
      try {
        const redis = getRedisClient();
        const bucket = new Date();
        const hourKey = `${bucket.getUTCFullYear()}${String(bucket.getUTCMonth()+1).padStart(2,'0')}${String(bucket.getUTCDate()).padStart(2,'0')}${String(bucket.getUTCHours()).padStart(2,'0')}`;
        const rlKey = `otp:rl:${phone}:${hourKey}`;
        const count = await redis.incr(rlKey);
        if (count === 1) {
          // set TTL to the remaining seconds in the current hour
          const secondsRemaining = 3600 - (bucket.getUTCMinutes()*60 + bucket.getUTCSeconds());
          await redis.expire(rlKey, Math.max(1, secondsRemaining));
        }
        if (count > 5) {
          return res.status(429).json({
            success: false,
            message: 'Rate limit exceeded',
            code: 'RATE_LIMIT_EXCEEDED'
          });
        }
      } catch (e) {
        console.warn('⚠️ Redis unavailable, skipping OTP rate limiting');
      }

      // Generate OTP (5 min TTL handled in model)
      const otpData = await OTP.create(phone, purpose);

      // Send OTP via SMS (implement this based on your SMS provider)
      await sendOTP(phone, otpData.otp_code);

      res.status(200).json({
        success: true,
        status: 'OTP_SENT',
        message: 'OTP sent successfully',
        expiresAt: otpData.expires_at
      });
    } catch (error) {
      next(error);
    }
  }

  // Verify OTP and login/register
  async verifyOTP(req, res, next) {
    try {
      const { phone, otp, name, email, purpose = 'login' } = req.body;

      if (!phone || !otp) {
        return res.status(400).json({ 
          success: false, 
          message: 'Phone and OTP are required' 
        });
      }

      // Verify OTP
      const result = await OTP.verify(phone, otp, purpose);
      if (result.status === 'EXPIRED') {
        return res.status(400).json({ success: false, message: 'OTP expired', code: 'OTP_EXPIRED' });
      }
      if (result.status !== 'VALID') {
        return res.status(400).json({ success: false, message: 'Invalid OTP', code: 'OTP_INVALID' });
      }

      let user;

      if (purpose === 'registration') {
        // Create new user
        if (!name || !email) {
          return res.status(400).json({ 
            success: false, 
            message: 'Name and email are required for registration' 
          });
        }

        user = await User.create({
          name,
          email,
          phone,
          password: Math.random().toString(36).slice(-8), // Random password for OTP-based auth
          role: 'customer'
        });

        await User.markAsVerified(user.id);
      } else {
        // Login existing user
        user = await User.findByPhone(phone);
        
        if (!user) {
            // Auto-register new user on first OTP login
            console.log(`🆕 Auto-registering new user: ${phone}`);
            user = await User.create({
              name: name || `User ${phone.slice(-4)}`,
              email: email || null,
              phone,
              password: Math.random().toString(36).slice(-8),
              role: 'customer'
            });
          
            if (user.id && typeof User.markAsVerified === 'function') {
              await User.markAsVerified(user.id);
            } else {
              user.is_verified = true;
            }
        }
      }

      // Generate tokens
      const tokens = await TokenService.generateTokenPair(user.id, user.role, user.store_id);

      res.status(200).json({
        success: true,
        message: purpose === 'registration' ? 'Registration successful' : 'Login successful',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isVerified: user.is_verified
        },
        tokens,
        token_type: 'Bearer'
      });
    } catch (error) {
      next(error);
    }
  }

  // Email/Password Registration
  async register(req, res, next) {
    try {
      const { name, email, phone, password } = req.body;

      if (!name || !email || !phone || !password) {
        return res.status(400).json({ 
          success: false, 
          message: 'All fields are required' 
        });
      }

      // Check if user exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email already registered' 
        });
      }

      const existingPhone = await User.findByPhone(phone);
      if (existingPhone) {
        return res.status(400).json({ 
          success: false, 
          message: 'Phone number already registered' 
        });
      }

      // Create user
      const user = await User.create({ name, email, phone, password, role: 'customer' });

      // Generate tokens
      const tokens = await TokenService.generateTokenPair(user.id, user.role, user.store_id);

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isVerified: user.is_verified
        },
        tokens
      });
    } catch (error) {
      next(error);
    }
  }

  // Email/Password Login
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email and password are required' 
        });
      }

      // Find user
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }

      // Verify password
      const isPasswordValid = await User.verifyPassword(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }

      // Generate tokens
      const tokens = await TokenService.generateTokenPair(user.id, user.role, user.store_id);

      res.status(200).json({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isVerified: user.is_verified
        },
        tokens
      });
    } catch (error) {
      next(error);
    }
  }

  // Refresh access token
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ 
          success: false, 
          message: 'Refresh token is required' 
        });
      }

      // Verify refresh token
      const decoded = TokenService.verifyRefreshToken(refreshToken);
      
      // Check if token exists and is valid
      const tokenData = await RefreshToken.findValid(refreshToken);
      if (!tokenData) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid or expired refresh token' 
        });
      }

      // Get user
      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }

      // Generate new tokens
      await RefreshToken.revoke(refreshToken); // Revoke old refresh token
      const tokens = await TokenService.generateTokenPair(user.id, user.role, user.store_id);

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        tokens
      });
    } catch (error) {
      next(error);
    }
  }

  // Logout
  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (refreshToken) {
        await RefreshToken.revoke(refreshToken);
      }

      res.status(200).json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      next(error);
    }
  }

  // Logout from all devices
  async logoutAll(req, res, next) {
    try {
      const userId = req.user.id; // From auth middleware

      await RefreshToken.revokeAllForUser(userId);

      res.status(200).json({
        success: true,
        message: 'Logged out from all devices'
      });
    } catch (error) {
      next(error);
    }
  }

  // Token introspection (LLR-AUTH-003)
  async introspect(req, res) {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, message: 'Token is required', code: 'TOKEN_MALFORMED' });
    }
    try {
      const decoded = TokenService.verifyAccessToken(token);
      return res.status(200).json({ active: true, user_id: decoded.id });
    } catch (e) {
      // Invalid or expired
      return res.status(200).json({ active: false });
    }
  }
}

module.exports = new AuthController();
