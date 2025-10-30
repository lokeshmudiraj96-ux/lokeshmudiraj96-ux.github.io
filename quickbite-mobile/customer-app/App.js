import React, { useEffect, useState } from 'react';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import Toast from 'react-native-toast-message';
import { StatusBar, AppState, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import NetInfo from '@react-native-community/netinfo';
import CodePush from 'react-native-code-push';
import { enableScreens } from 'react-native-screens';

// Store
import { store, persistor } from './src/store/store';

// Navigation
import RootNavigator from './src/navigation/RootNavigator';

// Services
import NotificationService from './src/services/NotificationService';
import AnalyticsService from './src/services/AnalyticsService';
import LocationService from './src/services/LocationService';
import OfflineService from './src/services/OfflineService';

// Components
import LoadingScreen from './src/components/common/LoadingScreen';
import NetworkStatusBar from './src/components/common/NetworkStatusBar';
import AppUpdateModal from './src/components/common/AppUpdateModal';

// Utils
import { initializeApp } from './src/utils/AppInitializer';
import { setupCrashlytics } from './src/utils/CrashlyticsHelper';

// Enable native navigation optimizations
enableScreens();

// CodePush configuration
const codePushOptions = {
  checkFrequency: CodePush.CheckFrequency.ON_APP_RESUME,
  installMode: CodePush.InstallMode.ON_NEXT_RESUME,
};

class QuickBiteCustomerApp extends React.Component {
  constructor(props) {
    super(props);
    
    this.state = {
      isAppReady: false,
      isConnected: true,
      appState: AppState.currentState,
      codePushUpdateAvailable: false,
      codePushProgress: null,
    };

    this.notificationService = new NotificationService();
    this.analyticsService = new AnalyticsService();
    this.locationService = new LocationService();
    this.offlineService = new OfflineService();
  }

  async componentDidMount() {
    console.log('🚀 QuickBite Customer App Starting...');
    
    try {
      // Initialize crash reporting
      await setupCrashlytics();

      // Initialize core services
      await this.initializeServices();

      // Set up event listeners
      this.setupEventListeners();

      // Initialize app data
      await initializeApp();

      // Check for CodePush updates
      this.checkForCodePushUpdates();

      this.setState({ isAppReady: true });
      
      console.log('✅ QuickBite Customer App Initialized Successfully');

    } catch (error) {
      console.error('❌ App initialization failed:', error);
      // Log to analytics
      this.analyticsService.logError('app_initialization_failed', error);
      
      // Still show the app, but with error state
      this.setState({ isAppReady: true });
    }
  }

  componentWillUnmount() {
    // Clean up listeners
    AppState.removeEventListener('change', this.handleAppStateChange);
    
    // Clean up services
    this.notificationService.cleanup();
    this.locationService.cleanup();
    this.offlineService.cleanup();
  }

  async initializeServices() {
    console.log('🔧 Initializing Services...');

    // Initialize notification service
    await this.notificationService.initialize();
    console.log('✅ Notification Service Ready');

    // Initialize analytics
    await this.analyticsService.initialize();
    console.log('✅ Analytics Service Ready');

    // Initialize location service
    await this.locationService.initialize();
    console.log('✅ Location Service Ready');

    // Initialize offline service
    await this.offlineService.initialize();
    console.log('✅ Offline Service Ready');

    // Request permissions
    await this.requestPermissions();
  }

  async requestPermissions() {
    console.log('🔐 Requesting Permissions...');

    // Request notification permissions
    await this.notificationService.requestPermissions();

    // Request location permissions
    await this.locationService.requestPermissions();

    console.log('✅ Permissions Requested');
  }

  setupEventListeners() {
    console.log('📡 Setting up Event Listeners...');

    // App state changes
    AppState.addEventListener('change', this.handleAppStateChange);

    // Network connectivity
    NetInfo.addEventListener(this.handleNetworkChange);

    // Firebase messaging
    this.setupFirebaseMessaging();

    console.log('✅ Event Listeners Set Up');
  }

  handleAppStateChange = (nextAppState) => {
    const { appState } = this.state;

    if (appState.match(/inactive|background/) && nextAppState === 'active') {
      // App has come to the foreground
      console.log('📱 App has come to the foreground');
      
      // Sync offline data
      this.offlineService.syncPendingData();
      
      // Update location if needed
      this.locationService.updateLocation();
      
      // Check for updates
      this.checkForCodePushUpdates();

      // Log analytics
      this.analyticsService.logEvent('app_foregrounded');
    } else if (nextAppState.match(/inactive|background/)) {
      // App has gone to the background
      console.log('📱 App has gone to the background');
      
      // Save offline data
      this.offlineService.saveCurrentState();
      
      // Log analytics
      this.analyticsService.logEvent('app_backgrounded');
    }

    this.setState({ appState: nextAppState });
  };

  handleNetworkChange = (state) => {
    console.log('🌐 Network state changed:', state.isConnected);
    
    this.setState({ isConnected: state.isConnected });

    if (state.isConnected) {
      // Connection restored - sync offline data
      this.offlineService.syncPendingData();
      this.analyticsService.logEvent('network_connected');
    } else {
      // Connection lost
      this.analyticsService.logEvent('network_disconnected');
    }
  };

  setupFirebaseMessaging = async () => {
    // Handle foreground messages
    messaging().onMessage(async remoteMessage => {
      console.log('📧 Foreground message received:', remoteMessage);
      await this.notificationService.handleForegroundMessage(remoteMessage);
    });

    // Handle background/quit state messages
    messaging().onNotificationOpenedApp(remoteMessage => {
      console.log('📧 Notification caused app to open from background:', remoteMessage);
      this.notificationService.handleNotificationOpen(remoteMessage);
    });

    // Check if app was opened from a notification (killed state)
    const initialNotification = await messaging().getInitialNotification();
    if (initialNotification) {
      console.log('📧 Notification caused app to open from quit state:', initialNotification);
      this.notificationService.handleNotificationOpen(initialNotification);
    }

    // Handle token refresh
    messaging().onTokenRefresh(token => {
      console.log('🔄 FCM Token refreshed');
      this.notificationService.updateToken(token);
    });
  };

  checkForCodePushUpdates = () => {
    CodePush.checkForUpdate().then((update) => {
      if (update) {
        console.log('📦 CodePush update available');
        this.setState({ codePushUpdateAvailable: true });
        
        // Download and install update
        CodePush.sync(
          {
            installMode: CodePush.InstallMode.ON_NEXT_RESTART,
            mandatoryInstallMode: CodePush.InstallMode.IMMEDIATE,
          },
          (status) => {
            console.log('📦 CodePush status:', status);
          },
          ({ receivedBytes, totalBytes }) => {
            const progress = receivedBytes / totalBytes;
            this.setState({ codePushProgress: progress });
          }
        );
      }
    }).catch((error) => {
      console.error('📦 CodePush check failed:', error);
    });
  };

  render() {
    const { 
      isAppReady, 
      isConnected, 
      codePushUpdateAvailable, 
      codePushProgress 
    } = this.state;

    if (!isAppReady) {
      return <LoadingScreen message="Initializing QuickBite..." />;
    }

    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <Provider store={store}>
          <PersistGate loading={<LoadingScreen message="Loading your data..." />} persistor={persistor}>
            <NavigationContainer>
              <StatusBar
                barStyle="dark-content"
                backgroundColor="#FFFFFF"
                translucent={false}
              />
              
              {/* Network Status Indicator */}
              {!isConnected && <NetworkStatusBar />}
              
              {/* Main Navigation */}
              <RootNavigator />
              
              {/* Global Toast Messages */}
              <Toast />
              
              {/* CodePush Update Modal */}
              {codePushUpdateAvailable && (
                <AppUpdateModal 
                  visible={codePushUpdateAvailable}
                  progress={codePushProgress}
                  onClose={() => this.setState({ codePushUpdateAvailable: false })}
                />
              )}
            </NavigationContainer>
          </PersistGate>
        </Provider>
      </SafeAreaProvider>
    );
  }
}

// Wrap with CodePush HOC
const App = CodePush(codePushOptions)(QuickBiteCustomerApp);

export default App;