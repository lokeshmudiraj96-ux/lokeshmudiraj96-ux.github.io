import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { combineReducers } from '@reduxjs/toolkit';

// Reducers
import authReducer from './slices/authSlice';
import userReducer from './slices/userSlice';
import restaurantReducer from './slices/restaurantSlice';
import cartReducer from './slices/cartSlice';
import orderReducer from './slices/orderSlice';
import locationReducer from './slices/locationSlice';
import notificationReducer from './slices/notificationSlice';
import offlineReducer from './slices/offlineSlice';
import preferencesReducer from './slices/preferencesSlice';

// Persist configuration
const persistConfig = {
  key: 'quickbite_customer_root',
  version: 1,
  storage: AsyncStorage,
  whitelist: [
    'auth', 
    'user', 
    'cart', 
    'location', 
    'preferences',
    'offline'
  ], // Only persist these reducers
  blacklist: [
    'restaurant', // Don't persist restaurant data (fetch fresh)
    'notification' // Don't persist notifications
  ],
  timeout: 10000, // 10 seconds timeout
};

// Cart persist configuration (separate for faster access)
const cartPersistConfig = {
  key: 'quickbite_cart',
  storage: AsyncStorage,
  timeout: 5000,
};

// User preferences persist configuration
const preferencesPersistConfig = {
  key: 'quickbite_preferences',
  storage: AsyncStorage,
  timeout: 5000,
};

// Offline data persist configuration
const offlinePersistConfig = {
  key: 'quickbite_offline',
  storage: AsyncStorage,
  timeout: 15000, // Longer timeout for offline data
};

// Combine reducers
const rootReducer = combineReducers({
  auth: authReducer,
  user: userReducer,
  restaurant: restaurantReducer,
  cart: persistReducer(cartPersistConfig, cartReducer),
  order: orderReducer,
  location: locationReducer,
  notification: notificationReducer,
  offline: persistReducer(offlinePersistConfig, offlineReducer),
  preferences: persistReducer(preferencesPersistConfig, preferencesReducer),
});

// Create persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Custom serializable check middleware configuration
const serializableCheck = createSerializableStateInvariantMiddleware({
  ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
  ignoredPaths: [
    'auth.user.lastLoginDate',
    'order.orders.createdAt',
    'order.orders.updatedAt',
    'location.lastUpdated',
    'offline.lastSync',
  ],
});

// Configure store
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
        ignoredActionsPaths: ['meta.arg', 'payload.timestamp'],
        ignoredPaths: [
          'auth.user.lastLoginDate',
          'order.orders.createdAt',
          'order.orders.updatedAt', 
          'location.lastUpdated',
          'offline.lastSync',
        ],
      },
      immutableCheck: {
        warnAfter: 128,
      },
    }).concat([
      // Add custom middleware here if needed
    ]),
  devTools: __DEV__ && {
    name: 'QuickBite Customer App',
    maxAge: 50,
    trace: true,
    traceLimit: 25,
  },
});

// Create persistor
export const persistor = persistStore(store);

// Utility functions for store management
export const resetStore = () => {
  persistor.purge().then(() => {
    console.log('🗑️ Store purged successfully');
  });
};

export const flushStore = () => {
  persistor.flush().then(() => {
    console.log('💾 Store flushed successfully');
  });
};

// Store debugging utilities (development only)
if (__DEV__) {
  // Log state changes in development
  store.subscribe(() => {
    const state = store.getState();
    console.log('🔄 Store State Updated:', {
      auth: !!state.auth.token,
      cartItems: state.cart.items.length,
      currentOrder: !!state.order.currentOrder,
      location: !!state.location.current,
      offline: state.offline.isOffline,
    });
  });

  // Expose store globally for debugging
  global.store = store;
  global.persistor = persistor;
}

export default store;