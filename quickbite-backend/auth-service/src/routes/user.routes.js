const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(authenticate);

router.get('/me', userController.getProfile);
router.put('/me', userController.updateProfile);
router.put('/change-password', userController.changePassword);

module.exports = router;
