import messaging from '@react-native-firebase/messaging';
import PushNotification from 'react-native-push-notification';
import { Platform, Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotificationAPI } from './NotificationAPI';
import { AnalyticsService } from './AnalyticsService';
import Toast from 'react-native-toast-message';

class NotificationService {
  constructor() {
    this.fcmToken = null;
    this.notificationCallbacks = new Set();
    this.analytics = new AnalyticsService();
    this.isInitialized = false;
    
    // Notification configuration
    this.config = {
      channelId: 'quickbite-default',
      channelName: 'QuickBite Notifications',
      channelDescription: 'General notifications from QuickBite app',
      importance: 4, // High importance
      vibrate: true,
      playSound: true,
      soundName: 'default',
      showBadge: true,
    };

    // Notification categories
    this.categories = {
      ORDER: 'order',
      PROMOTION: 'promotion', 
      DELIVERY: 'delivery',
      SYSTEM: 'system',
      MARKETING: 'marketing',
    };
  }

  // Initialize notification service
  async initialize() {
    try {
      console.log('🔔 Initializing Notification Service...');
      
      // Check notification permissions
      await this.checkNotificationPermissions();
      
      // Configure local notifications
      this.configurePushNotifications();
      
      // Initialize Firebase messaging
      await this.initializeFirebaseMessaging();
      
      // Set up notification handlers
      this.setupNotificationHandlers();
      
      // Get FCM token
      await this.getFCMToken();
      
      // Load notification preferences
      await this.loadNotificationPreferences();
      
      this.isInitialized = true;
      console.log('✅ Notification Service initialized');
      
    } catch (error) {
      console.error('❌ Notification Service initialization failed:', error);
      throw error;
    }
  }

  // Request notification permissions
  async requestPermissions() {
    try {
      console.log('🔐 Requesting notification permissions...');
      
      const authStatus = await messaging().requestPermission();
      
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('✅ Notification permission granted');
        
        // Register for remote notifications (iOS)
        if (Platform.OS === 'ios') {
          await messaging().registerDeviceForRemoteMessages();
        }
        
        return true;
      } else {
        console.log('❌ Notification permission denied');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Notification permission request failed:', error);
      return false;
    }
  }

  // Check current notification permissions
  async checkNotificationPermissions() {
    try {
      const authStatus = await messaging().hasPermission();
      
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      console.log('🔔 Notification permission status:', enabled ? 'Granted' : 'Denied');
      
      return enabled;
      
    } catch (error) {
      console.error('❌ Failed to check notification permissions:', error);
      return false;
    }
  }

  // Configure local push notifications
  configurePushNotifications() {
    console.log('⚙️ Configuring local notifications...');
    
    PushNotification.configure({
      // Called when token is generated (iOS and Android)
      onRegister: (token) => {
        console.log('📱 Local notification token:', token);
      },

      // Called when a remote or local notification is opened or received
      onNotification: (notification) => {
        console.log('🔔 Local notification received:', notification);
        this.handleLocalNotification(notification);
      },

      // Called when the user fails to register for remote notifications
      onRegistrationError: (err) => {
        console.error('❌ Local notification registration error:', err);
      },

      // IOS ONLY: execute when notifications are received in foreground
      onAction: (notification) => {
        console.log('🔔 Notification action:', notification.action);
        console.log('🔔 Notification:', notification);
      },

      // Should the initial notification be popped automatically
      popInitialNotification: true,

      // Request permissions for iOS
      requestPermissions: Platform.OS === 'ios',
    });

    // Create notification channels for Android
    if (Platform.OS === 'android') {
      this.createNotificationChannels();
    }
  }

  // Create notification channels (Android)
  createNotificationChannels() {
    console.log('📺 Creating notification channels...');
    
    const channels = [
      {
        channelId: 'quickbite-orders',
        channelName: 'Order Updates',
        channelDescription: 'Notifications about your order status',
        importance: 4,
        vibrate: true,
        playSound: true,
      },
      {
        channelId: 'quickbite-delivery',
        channelName: 'Delivery Updates',
        channelDescription: 'Notifications about delivery status',
        importance: 4,
        vibrate: true,
        playSound: true,
      },
      {
        channelId: 'quickbite-promotions',
        channelName: 'Promotions & Offers',
        channelDescription: 'Special offers and promotional notifications',
        importance: 3,
        vibrate: false,
        playSound: true,
      },
      {
        channelId: 'quickbite-general',
        channelName: 'General',
        channelDescription: 'General app notifications',
        importance: 3,
        vibrate: false,
        playSound: true,
      },
    ];

    channels.forEach(channel => {
      PushNotification.createChannel(
        {
          channelId: channel.channelId,
          channelName: channel.channelName,
          channelDescription: channel.channelDescription,
          playSound: channel.playSound,
          soundName: 'default',
          importance: channel.importance,
          vibrate: channel.vibrate,
        },
        (created) => console.log(`Channel ${channel.channelId} created: ${created}`)
      );
    });
  }

  // Initialize Firebase messaging
  async initializeFirebaseMessaging() {
    try {
      console.log('🔥 Initializing Firebase messaging...');
      
      // Set background message handler
      messaging().setBackgroundMessageHandler(async remoteMessage => {
        console.log('📧 Background message handled:', remoteMessage);
        await this.handleBackgroundMessage(remoteMessage);
      });

      console.log('✅ Firebase messaging initialized');
      
    } catch (error) {
      console.error('❌ Firebase messaging initialization failed:', error);
      throw error;
    }
  }

  // Setup notification handlers
  setupNotificationHandlers() {
    console.log('🎯 Setting up notification handlers...');
    
    // Handle notifications when app is in foreground
    messaging().onMessage(async remoteMessage => {
      console.log('📧 Foreground message received:', remoteMessage);
      await this.handleForegroundMessage(remoteMessage);
    });

    // Handle notification when app is opened from background
    messaging().onNotificationOpenedApp(remoteMessage => {
      console.log('📧 Notification opened app from background:', remoteMessage);
      this.handleNotificationOpen(remoteMessage);
    });

    // Handle notification when app is opened from killed state
    messaging()
      .getInitialNotification()
      .then(remoteMessage => {
        if (remoteMessage) {
          console.log('📧 Notification opened app from killed state:', remoteMessage);
          this.handleNotificationOpen(remoteMessage);
        }
      });

    // Handle token refresh
    messaging().onTokenRefresh(token => {
      console.log('🔄 FCM token refreshed:', token);
      this.fcmToken = token;
      this.updateTokenOnServer(token);
    });
  }

  // Get FCM token
  async getFCMToken() {
    try {
      console.log('🔑 Getting FCM token...');
      
      const token = await messaging().getToken();
      
      if (token) {
        console.log('✅ FCM token obtained');
        this.fcmToken = token;
        
        // Save token locally
        await AsyncStorage.setItem('fcm_token', token);
        
        // Update token on server
        await this.updateTokenOnServer(token);
        
        return token;
      } else {
        console.log('❌ Failed to get FCM token');
        return null;
      }
      
    } catch (error) {
      console.error('❌ FCM token error:', error);
      return null;
    }
  }

  // Update FCM token on server
  async updateTokenOnServer(token) {
    try {
      if (!token) return;
      
      console.log('🔄 Updating FCM token on server...');
      
      await NotificationAPI.updateFCMToken(token, {
        platform: Platform.OS,
        appVersion: '1.0.0', // Get from app config
        deviceId: await this.getDeviceId(),
      });
      
      console.log('✅ FCM token updated on server');
      
    } catch (error) {
      console.error('❌ Failed to update FCM token on server:', error);
    }
  }

  // Update user token (after login)
  async updateUserToken(userId) {
    try {
      if (!this.fcmToken || !userId) return;
      
      console.log('👤 Updating user token association...');
      
      await NotificationAPI.associateTokenWithUser(this.fcmToken, userId);
      
      console.log('✅ User token association updated');
      
    } catch (error) {
      console.error('❌ Failed to update user token association:', error);
    }
  }

  // Handle foreground messages
  async handleForegroundMessage(remoteMessage) {
    try {
      const { notification, data } = remoteMessage;
      
      // Log analytics
      this.analytics.logEvent('notification_received_foreground', {
        messageId: remoteMessage.messageId,
        category: data?.category || 'unknown',
        title: notification?.title
      });

      // Show in-app notification
      if (notification) {
        this.showInAppNotification({
          title: notification.title,
          body: notification.body,
          data: data,
          type: data?.category || 'general'
        });
      }

      // Process notification data
      await this.processNotificationData(data);
      
      // Notify callbacks
      this.notifyCallbacks(remoteMessage, 'foreground');
      
    } catch (error) {
      console.error('❌ Error handling foreground message:', error);
    }
  }

  // Handle background messages
  async handleBackgroundMessage(remoteMessage) {
    try {
      const { data } = remoteMessage;
      
      console.log('📧 Processing background message:', data);
      
      // Log analytics
      this.analytics.logEvent('notification_received_background', {
        messageId: remoteMessage.messageId,
        category: data?.category || 'unknown'
      });

      // Process urgent data updates
      if (data?.category === this.categories.ORDER) {
        await this.handleOrderNotification(data);
      }
      
    } catch (error) {
      console.error('❌ Error handling background message:', error);
    }
  }

  // Handle notification tap/open
  handleNotificationOpen(remoteMessage) {
    try {
      const { data } = remoteMessage;
      
      // Log analytics
      this.analytics.logEvent('notification_opened', {
        messageId: remoteMessage.messageId,
        category: data?.category || 'unknown'
      });

      // Navigate based on notification type
      this.handleNotificationNavigation(data);
      
      // Notify callbacks
      this.notifyCallbacks(remoteMessage, 'opened');
      
    } catch (error) {
      console.error('❌ Error handling notification open:', error);
    }
  }

  // Handle local notifications
  handleLocalNotification(notification) {
    try {
      console.log('🔔 Processing local notification:', notification);
      
      // Log analytics
      this.analytics.logEvent('local_notification_received', {
        id: notification.id,
        title: notification.title
      });

      // Handle notification action
      if (notification.userInteraction) {
        // User tapped on notification
        this.handleNotificationNavigation(notification.data);
      }
      
    } catch (error) {
      console.error('❌ Error handling local notification:', error);
    }
  }

  // Show in-app notification
  showInAppNotification({ title, body, data, type = 'info' }) {
    try {
      // Only show if app is active
      if (AppState.currentState === 'active') {
        Toast.show({
          type: this.getToastType(type),
          text1: title,
          text2: body,
          visibilityTime: 4000,
          autoHide: true,
          topOffset: 60,
          onPress: () => {
            this.handleNotificationNavigation(data);
            Toast.hide();
          },
        });
      }
      
    } catch (error) {
      console.error('❌ Error showing in-app notification:', error);
    }
  }

  // Get toast type based on notification category
  getToastType(category) {
    switch (category) {
      case this.categories.ORDER:
      case this.categories.DELIVERY:
        return 'info';
      case this.categories.PROMOTION:
        return 'success';
      case this.categories.SYSTEM:
        return 'error';
      default:
        return 'info';
    }
  }

  // Handle notification navigation
  handleNotificationNavigation(data) {
    try {
      if (!data) return;
      
      const { category, screen, orderId, restaurantId, offerId } = data;
      
      // This would integrate with your navigation service
      switch (category) {
        case this.categories.ORDER:
          if (orderId) {
            // Navigate to order details
            console.log('📱 Navigate to order:', orderId);
            // NavigationService.navigate('OrderDetails', { orderId });
          }
          break;
          
        case this.categories.DELIVERY:
          if (orderId) {
            // Navigate to order tracking
            console.log('📱 Navigate to order tracking:', orderId);
            // NavigationService.navigate('OrderTracking', { orderId });
          }
          break;
          
        case this.categories.PROMOTION:
          if (restaurantId) {
            // Navigate to restaurant
            console.log('📱 Navigate to restaurant:', restaurantId);
            // NavigationService.navigate('Restaurant', { restaurantId });
          } else if (offerId) {
            // Navigate to offer details
            console.log('📱 Navigate to offer:', offerId);
            // NavigationService.navigate('Offers', { offerId });
          }
          break;
          
        default:
          if (screen) {
            console.log('📱 Navigate to screen:', screen);
            // NavigationService.navigate(screen, data);
          }
      }
      
    } catch (error) {
      console.error('❌ Error handling notification navigation:', error);
    }
  }

  // Process notification data
  async processNotificationData(data) {
    try {
      if (!data) return;
      
      const { category, action } = data;
      
      switch (category) {
        case this.categories.ORDER:
          await this.handleOrderNotification(data);
          break;
          
        case this.categories.DELIVERY:
          await this.handleDeliveryNotification(data);
          break;
          
        case this.categories.PROMOTION:
          await this.handlePromotionNotification(data);
          break;
          
        default:
          console.log('📧 General notification data processed');
      }
      
    } catch (error) {
      console.error('❌ Error processing notification data:', error);
    }
  }

  // Handle order notifications
  async handleOrderNotification(data) {
    try {
      const { orderId, status, action } = data;
      
      console.log('🍽️ Processing order notification:', { orderId, status });
      
      // Update local order cache or trigger refresh
      // This would integrate with your order management system
      
      if (action === 'refresh_order') {
        // Trigger order data refresh
        console.log('🔄 Triggering order refresh for:', orderId);
      }
      
    } catch (error) {
      console.error('❌ Error handling order notification:', error);
    }
  }

  // Handle delivery notifications
  async handleDeliveryNotification(data) {
    try {
      const { orderId, deliveryStatus, location } = data;
      
      console.log('🚚 Processing delivery notification:', { orderId, deliveryStatus });
      
      // Update delivery tracking data
      if (location) {
        console.log('📍 Updating delivery location for:', orderId);
        // Update delivery partner location in store
      }
      
    } catch (error) {
      console.error('❌ Error handling delivery notification:', error);
    }
  }

  // Handle promotion notifications
  async handlePromotionNotification(data) {
    try {
      const { promotionId, restaurantId, validUntil } = data;
      
      console.log('🎉 Processing promotion notification:', { promotionId });
      
      // Cache promotion data for quick access
      await AsyncStorage.setItem(
        `promotion_${promotionId}`, 
        JSON.stringify({ ...data, receivedAt: Date.now() })
      );
      
    } catch (error) {
      console.error('❌ Error handling promotion notification:', error);
    }
  }

  // Send local notification
  sendLocalNotification({ title, message, data = {}, channelId = 'quickbite-general', delay = 0 }) {
    try {
      console.log('📱 Sending local notification:', title);
      
      PushNotification.localNotification({
        title,
        message,
        playSound: true,
        soundName: 'default',
        userInfo: data,
        channelId,
        timeoutAfter: delay,
      });
      
      // Log analytics
      this.analytics.logEvent('local_notification_sent', {
        title,
        channelId
      });
      
    } catch (error) {
      console.error('❌ Error sending local notification:', error);
    }
  }

  // Schedule local notification
  scheduleLocalNotification({ title, message, data = {}, channelId = 'quickbite-general', date }) {
    try {
      console.log('⏰ Scheduling local notification:', { title, date });
      
      PushNotification.localNotificationSchedule({
        title,
        message,
        date,
        playSound: true,
        soundName: 'default',
        userInfo: data,
        channelId,
      });
      
      // Log analytics
      this.analytics.logEvent('local_notification_scheduled', {
        title,
        channelId,
        scheduledFor: date
      });
      
    } catch (error) {
      console.error('❌ Error scheduling local notification:', error);
    }
  }

  // Cancel local notifications
  cancelLocalNotifications() {
    try {
      console.log('🗑️ Cancelling local notifications...');
      PushNotification.cancelAllLocalNotifications();
    } catch (error) {
      console.error('❌ Error cancelling local notifications:', error);
    }
  }

  // Register notification callback
  registerNotificationCallback(callback) {
    this.notificationCallbacks.add(callback);
    
    return () => {
      this.notificationCallbacks.delete(callback);
    };
  }

  // Notify all callbacks
  notifyCallbacks(notification, type) {
    this.notificationCallbacks.forEach(callback => {
      try {
        callback(notification, type);
      } catch (error) {
        console.error('❌ Notification callback error:', error);
      }
    });
  }

  // Load notification preferences
  async loadNotificationPreferences() {
    try {
      const preferences = await AsyncStorage.getItem('notification_preferences');
      if (preferences) {
        this.preferences = JSON.parse(preferences);
        console.log('⚙️ Loaded notification preferences');
      }
    } catch (error) {
      console.error('❌ Failed to load notification preferences:', error);
    }
  }

  // Save notification preferences
  async saveNotificationPreferences(preferences) {
    try {
      await AsyncStorage.setItem('notification_preferences', JSON.stringify(preferences));
      this.preferences = preferences;
      console.log('💾 Saved notification preferences');
    } catch (error) {
      console.error('❌ Failed to save notification preferences:', error);
    }
  }

  // Get device ID
  async getDeviceId() {
    try {
      let deviceId = await AsyncStorage.getItem('device_id');
      if (!deviceId) {
        deviceId = `${Platform.OS}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await AsyncStorage.setItem('device_id', deviceId);
      }
      return deviceId;
    } catch (error) {
      console.error('❌ Error getting device ID:', error);
      return `${Platform.OS}_${Date.now()}`;
    }
  }

  // Get FCM token
  getToken() {
    return this.fcmToken;
  }

  // Check if initialized
  isServiceInitialized() {
    return this.isInitialized;
  }

  // Cleanup
  cleanup() {
    console.log('🧹 Cleaning up Notification Service...');
    
    this.notificationCallbacks.clear();
    this.cancelLocalNotifications();
    this.fcmToken = null;
    this.isInitialized = false;
  }
}

export default NotificationService;