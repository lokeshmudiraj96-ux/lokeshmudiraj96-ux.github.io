const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

// OTP-based authentication
router.post('/otp/request', authController.requestOTP);
router.post('/otp/verify', authController.verifyOTP);

// Email/Password authentication
router.post('/register', authController.register);
router.post('/login', authController.login);

// Token management
router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);
router.post('/logout-all', authenticate, authController.logoutAll);

module.exports = router;
