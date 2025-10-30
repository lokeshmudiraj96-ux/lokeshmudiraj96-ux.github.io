const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notification.controller');
const auth = require('../middleware/auth.middleware');

// Legacy compatibility routes (keep existing API working)
router.post('/send', auth, ctrl.send);
router.get('/status/:notification_id', auth, ctrl.status);
router.post('/retry/:notification_id', auth, ctrl.retry);

// New comprehensive notification routes
// Single notification management
router.post('/notifications', auth, ctrl.sendNotification);
router.post('/notifications/bulk', auth, ctrl.sendBulkNotification);
router.post('/notifications/order', auth, ctrl.sendOrderNotification);
router.post('/notifications/test', auth, ctrl.testNotification);

// User notification management
router.get('/users/:userId/notifications', auth, ctrl.getUserNotifications);
router.get('/notifications/:notificationId', auth, ctrl.getNotificationById);
router.patch('/notifications/:notificationId/read', auth, ctrl.markNotificationRead);
router.patch('/users/:userId/notifications/read-all', auth, ctrl.markAllNotificationsRead);
router.delete('/notifications/:notificationId', auth, ctrl.deleteNotification);

// User notification counts
router.get('/users/:userId/notifications/unread-count', auth, ctrl.getUnreadCount);

// User preferences management
router.get('/users/:userId/preferences', auth, ctrl.getUserPreferences);
router.patch('/users/:userId/preferences', auth, ctrl.updateUserPreferences);

// Promotional notifications
router.post('/notifications/promotional', auth, ctrl.sendPromotionalNotification);

// Analytics and monitoring
router.get('/analytics', auth, ctrl.getNotificationAnalytics);
router.get('/queue/status', auth, ctrl.getQueueStatus);
router.post('/queue/clear', auth, ctrl.clearQueue);

// Status callbacks for external services
router.post('/sms/status', ctrl.handleSMSStatusCallback);
router.post('/whatsapp/status', ctrl.handleWhatsAppStatusCallback);

module.exports = router;
