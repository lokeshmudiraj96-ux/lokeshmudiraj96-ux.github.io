import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { AuthAPI } from '../services/AuthAPI';
import { AnalyticsService } from '../services/AnalyticsService';
import { NotificationService } from '../services/NotificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';

// Analytics instance
const analytics = new AnalyticsService();
const notificationService = new NotificationService();

// Async Thunks for authentication actions

// Login with email/password
export const loginWithEmail = createAsyncThunk(
  'auth/loginWithEmail',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      console.log('🔐 Attempting email login...');
      
      const response = await AuthAPI.loginWithEmail(email, password);
      
      // Store token securely
      await AsyncStorage.setItem('auth_token', response.token);
      await AsyncStorage.setItem('refresh_token', response.refreshToken);
      
      // Log analytics
      analytics.logEvent('user_login', { 
        method: 'email',
        userId: response.user.id 
      });

      // Update FCM token
      await notificationService.updateUserToken(response.user.id);

      console.log('✅ Email login successful');
      return response;
      
    } catch (error) {
      console.error('❌ Email login failed:', error);
      
      analytics.logEvent('login_failed', { 
        method: 'email',
        error: error.message 
      });
      
      return rejectWithValue({
        message: error.message || 'Login failed',
        code: error.code || 'LOGIN_FAILED'
      });
    }
  }
);

// Login with phone number (OTP)
export const loginWithPhone = createAsyncThunk(
  'auth/loginWithPhone',
  async ({ phoneNumber }, { rejectWithValue }) => {
    try {
      console.log('📱 Initiating phone login...');
      
      const response = await AuthAPI.sendOTP(phoneNumber);
      
      analytics.logEvent('otp_sent', { 
        phoneNumber: phoneNumber 
      });

      return {
        phoneNumber,
        verificationId: response.verificationId,
        step: 'otp_sent'
      };
      
    } catch (error) {
      console.error('❌ Phone login failed:', error);
      
      analytics.logEvent('otp_send_failed', { 
        phoneNumber: phoneNumber,
        error: error.message 
      });
      
      return rejectWithValue({
        message: error.message || 'Failed to send OTP',
        code: error.code || 'OTP_SEND_FAILED'
      });
    }
  }
);

// Verify OTP
export const verifyOTP = createAsyncThunk(
  'auth/verifyOTP',
  async ({ verificationId, otp }, { rejectWithValue }) => {
    try {
      console.log('🔑 Verifying OTP...');
      
      const response = await AuthAPI.verifyOTP(verificationId, otp);
      
      // Store tokens
      await AsyncStorage.setItem('auth_token', response.token);
      await AsyncStorage.setItem('refresh_token', response.refreshToken);
      
      analytics.logEvent('user_login', { 
        method: 'phone',
        userId: response.user.id 
      });

      await notificationService.updateUserToken(response.user.id);

      console.log('✅ OTP verification successful');
      return response;
      
    } catch (error) {
      console.error('❌ OTP verification failed:', error);
      
      analytics.logEvent('otp_verify_failed', { 
        error: error.message 
      });
      
      return rejectWithValue({
        message: error.message || 'Invalid OTP',
        code: error.code || 'OTP_INVALID'
      });
    }
  }
);

// Google Sign-In
export const loginWithGoogle = createAsyncThunk(
  'auth/loginWithGoogle',
  async (_, { rejectWithValue }) => {
    try {
      console.log('🔍 Attempting Google sign-in...');
      
      // Get the users ID token
      const { idToken } = await GoogleSignin.signIn();
      
      // Create a Google credential with the token
      const googleCredential = auth.GoogleAuthProvider.credential(idToken);
      
      // Sign-in the user with the credential
      const userCredential = await auth().signInWithCredential(googleCredential);
      
      // Send to backend for verification and user creation
      const response = await AuthAPI.loginWithGoogle(idToken, userCredential.user);
      
      await AsyncStorage.setItem('auth_token', response.token);
      await AsyncStorage.setItem('refresh_token', response.refreshToken);
      
      analytics.logEvent('user_login', { 
        method: 'google',
        userId: response.user.id 
      });

      await notificationService.updateUserToken(response.user.id);

      console.log('✅ Google sign-in successful');
      return response;
      
    } catch (error) {
      console.error('❌ Google sign-in failed:', error);
      
      analytics.logEvent('login_failed', { 
        method: 'google',
        error: error.message 
      });
      
      return rejectWithValue({
        message: error.message || 'Google sign-in failed',
        code: error.code || 'GOOGLE_SIGNIN_FAILED'
      });
    }
  }
);

// Register new user
export const registerUser = createAsyncThunk(
  'auth/registerUser',
  async ({ name, email, password, phoneNumber }, { rejectWithValue }) => {
    try {
      console.log('📝 Registering new user...');
      
      const response = await AuthAPI.register({
        name,
        email,
        password,
        phoneNumber
      });
      
      await AsyncStorage.setItem('auth_token', response.token);
      await AsyncStorage.setItem('refresh_token', response.refreshToken);
      
      analytics.logEvent('user_register', { 
        method: 'email',
        userId: response.user.id 
      });

      await notificationService.updateUserToken(response.user.id);

      console.log('✅ User registration successful');
      return response;
      
    } catch (error) {
      console.error('❌ User registration failed:', error);
      
      analytics.logEvent('register_failed', { 
        error: error.message 
      });
      
      return rejectWithValue({
        message: error.message || 'Registration failed',
        code: error.code || 'REGISTRATION_FAILED'
      });
    }
  }
);

// Refresh authentication token
export const refreshToken = createAsyncThunk(
  'auth/refreshToken',
  async (_, { rejectWithValue, getState }) => {
    try {
      const refreshTokenValue = await AsyncStorage.getItem('refresh_token');
      
      if (!refreshTokenValue) {
        throw new Error('No refresh token available');
      }
      
      const response = await AuthAPI.refreshToken(refreshTokenValue);
      
      await AsyncStorage.setItem('auth_token', response.token);
      await AsyncStorage.setItem('refresh_token', response.refreshToken);
      
      return response;
      
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      
      // Clear stored tokens
      await AsyncStorage.removeItem('auth_token');
      await AsyncStorage.removeItem('refresh_token');
      
      return rejectWithValue({
        message: error.message || 'Session expired',
        code: error.code || 'TOKEN_REFRESH_FAILED'
      });
    }
  }
);

// Logout user
export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { getState }) => {
    try {
      console.log('👋 Logging out user...');
      
      const { auth } = getState();
      
      // Notify backend
      if (auth.token) {
        await AuthAPI.logout(auth.token);
      }
      
      // Clear stored data
      await AsyncStorage.multiRemove([
        'auth_token',
        'refresh_token',
        'user_preferences',
        'cart_data'
      ]);
      
      // Sign out from Google
      try {
        await GoogleSignin.signOut();
      } catch (error) {
        console.log('Google sign-out not needed or failed:', error.message);
      }
      
      // Sign out from Firebase
      try {
        await auth().signOut();
      } catch (error) {
        console.log('Firebase sign-out failed:', error.message);
      }
      
      analytics.logEvent('user_logout', { 
        userId: auth.user?.id 
      });

      console.log('✅ Logout successful');
      return true;
      
    } catch (error) {
      console.error('❌ Logout failed:', error);
      
      // Even if backend logout fails, clear local data
      await AsyncStorage.multiRemove([
        'auth_token',
        'refresh_token',
        'user_preferences',
        'cart_data'
      ]);
      
      return true;
    }
  }
);

// Load stored authentication
export const loadStoredAuth = createAsyncThunk(
  'auth/loadStoredAuth',
  async (_, { rejectWithValue }) => {
    try {
      console.log('🔄 Loading stored authentication...');
      
      const token = await AsyncStorage.getItem('auth_token');
      
      if (!token) {
        console.log('No stored token found');
        return null;
      }
      
      // Validate token with backend
      const response = await AuthAPI.validateToken(token);
      
      console.log('✅ Stored authentication loaded');
      return {
        token,
        user: response.user,
        refreshToken: await AsyncStorage.getItem('refresh_token')
      };
      
    } catch (error) {
      console.error('❌ Failed to load stored auth:', error);
      
      // Clear invalid tokens
      await AsyncStorage.multiRemove(['auth_token', 'refresh_token']);
      
      return null;
    }
  }
);

// Initial state
const initialState = {
  // Authentication status
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
  
  // User data
  user: null,
  token: null,
  refreshToken: null,
  
  // Login flow state
  loginStep: null, // 'phone_input', 'otp_verification', 'completed'
  phoneNumber: null,
  verificationId: null,
  
  // Error handling
  error: null,
  lastError: null,
  
  // Session management
  sessionExpiry: null,
  lastActivity: null,
  
  // Biometric authentication
  biometricEnabled: false,
  biometricType: null, // 'TouchID', 'FaceID', 'Fingerprint'
  
  // Security settings
  requirePin: false,
  autoLockTime: 300000, // 5 minutes in milliseconds
};

// Auth slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Clear authentication error
    clearAuthError: (state) => {
      state.error = null;
    },
    
    // Set login step
    setLoginStep: (state, action) => {
      state.loginStep = action.payload;
    },
    
    // Update user activity timestamp
    updateLastActivity: (state) => {
      state.lastActivity = Date.now();
    },
    
    // Enable/disable biometric authentication
    setBiometricAuth: (state, action) => {
      state.biometricEnabled = action.payload.enabled;
      state.biometricType = action.payload.type;
    },
    
    // Update security settings
    updateSecuritySettings: (state, action) => {
      const { requirePin, autoLockTime } = action.payload;
      if (requirePin !== undefined) state.requirePin = requirePin;
      if (autoLockTime !== undefined) state.autoLockTime = autoLockTime;
    },
    
    // Reset auth state
    resetAuthState: (state) => {
      Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // Login with Email
    builder
      .addCase(loginWithEmail.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginWithEmail.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.sessionExpiry = action.payload.expiresAt;
        state.lastActivity = Date.now();
        state.loginStep = 'completed';
        state.error = null;
      })
      .addCase(loginWithEmail.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.error = action.payload;
        state.lastError = action.payload;
      });

    // Login with Phone
    builder
      .addCase(loginWithPhone.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginWithPhone.fulfilled, (state, action) => {
        state.isLoading = false;
        state.phoneNumber = action.payload.phoneNumber;
        state.verificationId = action.payload.verificationId;
        state.loginStep = 'otp_verification';
        state.error = null;
      })
      .addCase(loginWithPhone.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
        state.lastError = action.payload;
        state.loginStep = 'phone_input';
      });

    // Verify OTP
    builder
      .addCase(verifyOTP.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(verifyOTP.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.sessionExpiry = action.payload.expiresAt;
        state.lastActivity = Date.now();
        state.loginStep = 'completed';
        state.error = null;
      })
      .addCase(verifyOTP.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
        state.lastError = action.payload;
      });

    // Google Sign-In
    builder
      .addCase(loginWithGoogle.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginWithGoogle.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.sessionExpiry = action.payload.expiresAt;
        state.lastActivity = Date.now();
        state.loginStep = 'completed';
        state.error = null;
      })
      .addCase(loginWithGoogle.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.error = action.payload;
        state.lastError = action.payload;
      });

    // User Registration
    builder
      .addCase(registerUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.sessionExpiry = action.payload.expiresAt;
        state.lastActivity = Date.now();
        state.loginStep = 'completed';
        state.error = null;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.error = action.payload;
        state.lastError = action.payload;
      });

    // Refresh Token
    builder
      .addCase(refreshToken.pending, (state) => {
        // Don't set loading for token refresh to avoid UI flickering
      })
      .addCase(refreshToken.fulfilled, (state, action) => {
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.sessionExpiry = action.payload.expiresAt;
        state.lastActivity = Date.now();
      })
      .addCase(refreshToken.rejected, (state, action) => {
        // Token refresh failed - user needs to login again
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
        state.refreshToken = null;
        state.sessionExpiry = null;
        state.error = action.payload;
      });

    // Logout
    builder
      .addCase(logoutUser.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        Object.assign(state, initialState);
        state.isInitialized = true;
      });

    // Load Stored Auth
    builder
      .addCase(loadStoredAuth.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(loadStoredAuth.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isInitialized = true;
        
        if (action.payload) {
          state.isAuthenticated = true;
          state.user = action.payload.user;
          state.token = action.payload.token;
          state.refreshToken = action.payload.refreshToken;
          state.lastActivity = Date.now();
        }
      })
      .addCase(loadStoredAuth.rejected, (state) => {
        state.isLoading = false;
        state.isInitialized = true;
        state.isAuthenticated = false;
      });
  },
});

// Export actions
export const {
  clearAuthError,
  setLoginStep,
  updateLastActivity,
  setBiometricAuth,
  updateSecuritySettings,
  resetAuthState,
} = authSlice.actions;

// Selectors
export const selectAuth = (state) => state.auth;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
export const selectUser = (state) => state.auth.user;
export const selectAuthLoading = (state) => state.auth.isLoading;
export const selectAuthError = (state) => state.auth.error;
export const selectLoginStep = (state) => state.auth.loginStep;
export const selectBiometricEnabled = (state) => state.auth.biometricEnabled;

// Export reducer
export default authSlice.reducer;