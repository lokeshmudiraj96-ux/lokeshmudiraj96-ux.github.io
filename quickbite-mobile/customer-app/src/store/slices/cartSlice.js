import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { CartAPI } from '../services/CartAPI';
import { AnalyticsService } from '../services/AnalyticsService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Analytics instance
const analytics = new AnalyticsService();

// Async Thunks

// Sync cart with backend
export const syncCart = createAsyncThunk(
  'cart/syncCart',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { auth, cart } = getState();
      
      if (!auth.isAuthenticated) {
        return cart.items; // Return local cart if not authenticated
      }
      
      console.log('🔄 Syncing cart with backend...');
      
      // Send local cart to backend and get updated cart
      const response = await CartAPI.syncCart(cart.items);
      
      analytics.logEvent('cart_synced', {
        itemCount: response.items.length,
        totalValue: response.total
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Cart sync failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

// Apply coupon code
export const applyCoupon = createAsyncThunk(
  'cart/applyCoupon',
  async ({ couponCode }, { getState, rejectWithValue }) => {
    try {
      const { cart } = getState();
      
      console.log('🎫 Applying coupon:', couponCode);
      
      const response = await CartAPI.applyCoupon({
        couponCode,
        cartItems: cart.items,
        subtotal: cart.subtotal
      });
      
      analytics.logEvent('coupon_applied', {
        couponCode,
        discountAmount: response.discountAmount,
        cartValue: cart.subtotal
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Coupon application failed:', error);
      
      analytics.logEvent('coupon_apply_failed', {
        couponCode,
        error: error.message
      });
      
      return rejectWithValue(error.message);
    }
  }
);

// Calculate delivery fee
export const calculateDeliveryFee = createAsyncThunk(
  'cart/calculateDeliveryFee',
  async ({ restaurantId, deliveryAddress }, { getState, rejectWithValue }) => {
    try {
      const { cart } = getState();
      
      const response = await CartAPI.calculateDeliveryFee({
        restaurantId,
        deliveryAddress,
        cartItems: cart.items,
        subtotal: cart.subtotal
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Delivery fee calculation failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

// Initial state
const initialState = {
  // Cart items
  items: [],
  
  // Restaurant info
  restaurantId: null,
  restaurantName: null,
  restaurantImage: null,
  
  // Pricing
  subtotal: 0,
  taxes: 0,
  deliveryFee: 0,
  packagingFee: 0,
  platformFee: 0,
  discount: 0,
  total: 0,
  
  // Coupon
  appliedCoupon: null,
  couponDiscount: 0,
  
  // Delivery
  deliveryAddress: null,
  estimatedDeliveryTime: null,
  
  // Loading states
  isLoading: false,
  isSyncing: false,
  isApplyingCoupon: false,
  isCalculatingFees: false,
  
  // Error handling
  error: null,
  
  // Cart metadata
  lastModified: null,
  itemCount: 0,
  
  // Special instructions
  specialInstructions: '',
  
  // Saved for later
  savedItems: [],
};

// Helper functions
const calculateSubtotal = (items) => {
  return items.reduce((total, item) => {
    return total + (item.price * item.quantity);
  }, 0);
};

const calculateTaxes = (subtotal, taxRate = 0.18) => {
  return subtotal * taxRate;
};

const calculateTotal = (subtotal, taxes, deliveryFee, packagingFee, platformFee, discount) => {
  return Math.max(0, subtotal + taxes + deliveryFee + packagingFee + platformFee - discount);
};

const updateCartTotals = (state) => {
  state.subtotal = calculateSubtotal(state.items);
  state.taxes = calculateTaxes(state.subtotal);
  state.total = calculateTotal(
    state.subtotal,
    state.taxes,
    state.deliveryFee,
    state.packagingFee,
    state.platformFee,
    state.discount + state.couponDiscount
  );
  state.itemCount = state.items.reduce((count, item) => count + item.quantity, 0);
  state.lastModified = Date.now();
};

// Cart slice
const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    // Add item to cart
    addItem: (state, action) => {
      const { item, restaurantId, restaurantName, restaurantImage } = action.payload;
      
      // Check if adding from different restaurant
      if (state.restaurantId && state.restaurantId !== restaurantId) {
        // Clear cart when switching restaurants
        state.items = [];
        state.appliedCoupon = null;
        state.couponDiscount = 0;
      }
      
      // Set restaurant info
      state.restaurantId = restaurantId;
      state.restaurantName = restaurantName;
      state.restaurantImage = restaurantImage;
      
      // Check if item already exists
      const existingItemIndex = state.items.findIndex(
        cartItem => cartItem.id === item.id && 
        JSON.stringify(cartItem.customizations) === JSON.stringify(item.customizations)
      );
      
      if (existingItemIndex >= 0) {
        // Update quantity
        state.items[existingItemIndex].quantity += item.quantity || 1;
      } else {
        // Add new item
        state.items.push({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          image: item.image,
          quantity: item.quantity || 1,
          customizations: item.customizations || [],
          specialInstructions: item.specialInstructions || '',
          category: item.category,
          isVeg: item.isVeg,
          isAvailable: item.isAvailable !== false,
          addedAt: Date.now()
        });
      }
      
      updateCartTotals(state);
      
      // Log analytics
      analytics.logEvent('add_to_cart', {
        itemId: item.id,
        itemName: item.name,
        quantity: item.quantity || 1,
        price: item.price,
        restaurantId: restaurantId
      });
    },
    
    // Remove item from cart
    removeItem: (state, action) => {
      const { itemId, customizations } = action.payload;
      
      state.items = state.items.filter(item => {
        if (item.id !== itemId) return true;
        if (customizations) {
          return JSON.stringify(item.customizations) !== JSON.stringify(customizations);
        }
        return false;
      });
      
      // Clear restaurant if no items
      if (state.items.length === 0) {
        state.restaurantId = null;
        state.restaurantName = null;
        state.restaurantImage = null;
        state.appliedCoupon = null;
        state.couponDiscount = 0;
      }
      
      updateCartTotals(state);
      
      analytics.logEvent('remove_from_cart', {
        itemId,
        remainingItems: state.items.length
      });
    },
    
    // Update item quantity
    updateQuantity: (state, action) => {
      const { itemId, customizations, quantity } = action.payload;
      
      const itemIndex = state.items.findIndex(item => {
        if (item.id !== itemId) return false;
        if (customizations) {
          return JSON.stringify(item.customizations) === JSON.stringify(customizations);
        }
        return true;
      });
      
      if (itemIndex >= 0) {
        if (quantity <= 0) {
          // Remove item if quantity is 0 or negative
          state.items.splice(itemIndex, 1);
        } else {
          state.items[itemIndex].quantity = quantity;
        }
        
        updateCartTotals(state);
        
        analytics.logEvent('update_cart_quantity', {
          itemId,
          newQuantity: quantity
        });
      }
    },
    
    // Clear entire cart
    clearCart: (state) => {
      const itemCount = state.items.length;
      
      state.items = [];
      state.restaurantId = null;
      state.restaurantName = null;
      state.restaurantImage = null;
      state.appliedCoupon = null;
      state.couponDiscount = 0;
      state.deliveryAddress = null;
      state.specialInstructions = '';
      
      updateCartTotals(state);
      
      analytics.logEvent('cart_cleared', {
        previousItemCount: itemCount
      });
    },
    
    // Set delivery address
    setDeliveryAddress: (state, action) => {
      state.deliveryAddress = action.payload;
    },
    
    // Set special instructions
    setSpecialInstructions: (state, action) => {
      state.specialInstructions = action.payload;
    },
    
    // Remove applied coupon
    removeCoupon: (state) => {
      if (state.appliedCoupon) {
        analytics.logEvent('coupon_removed', {
          couponCode: state.appliedCoupon.code,
          discountAmount: state.couponDiscount
        });
        
        state.appliedCoupon = null;
        state.couponDiscount = 0;
        updateCartTotals(state);
      }
    },
    
    // Save item for later
    saveForLater: (state, action) => {
      const { itemId, customizations } = action.payload;
      
      const itemIndex = state.items.findIndex(item => {
        if (item.id !== itemId) return false;
        if (customizations) {
          return JSON.stringify(item.customizations) === JSON.stringify(customizations);
        }
        return true;
      });
      
      if (itemIndex >= 0) {
        const item = state.items[itemIndex];
        
        // Add to saved items
        state.savedItems.push({
          ...item,
          savedAt: Date.now()
        });
        
        // Remove from cart
        state.items.splice(itemIndex, 1);
        
        updateCartTotals(state);
        
        analytics.logEvent('item_saved_for_later', {
          itemId: item.id,
          itemName: item.name
        });
      }
    },
    
    // Move saved item back to cart
    moveToCart: (state, action) => {
      const { savedItemIndex } = action.payload;
      
      if (savedItemIndex >= 0 && savedItemIndex < state.savedItems.length) {
        const savedItem = state.savedItems[savedItemIndex];
        
        // Check restaurant compatibility
        if (!state.restaurantId || state.restaurantId === savedItem.restaurantId) {
          // Add to cart
          state.items.push({
            ...savedItem,
            addedAt: Date.now()
          });
          
          // Remove from saved items
          state.savedItems.splice(savedItemIndex, 1);
          
          updateCartTotals(state);
          
          analytics.logEvent('saved_item_moved_to_cart', {
            itemId: savedItem.id,
            itemName: savedItem.name
          });
        }
      }
    },
    
    // Remove saved item
    removeSavedItem: (state, action) => {
      const { savedItemIndex } = action.payload;
      
      if (savedItemIndex >= 0 && savedItemIndex < state.savedItems.length) {
        const removedItem = state.savedItems[savedItemIndex];
        state.savedItems.splice(savedItemIndex, 1);
        
        analytics.logEvent('saved_item_removed', {
          itemId: removedItem.id,
          itemName: removedItem.name
        });
      }
    },
    
    // Clear cart error
    clearCartError: (state) => {
      state.error = null;
    },
    
    // Update delivery fee
    updateDeliveryFee: (state, action) => {
      const { deliveryFee, packagingFee, platformFee, estimatedDeliveryTime } = action.payload;
      
      if (deliveryFee !== undefined) state.deliveryFee = deliveryFee;
      if (packagingFee !== undefined) state.packagingFee = packagingFee;
      if (platformFee !== undefined) state.platformFee = platformFee;
      if (estimatedDeliveryTime !== undefined) state.estimatedDeliveryTime = estimatedDeliveryTime;
      
      updateCartTotals(state);
    },
  },
  extraReducers: (builder) => {
    // Sync Cart
    builder
      .addCase(syncCart.pending, (state) => {
        state.isSyncing = true;
        state.error = null;
      })
      .addCase(syncCart.fulfilled, (state, action) => {
        state.isSyncing = false;
        
        if (action.payload.items) {
          state.items = action.payload.items;
          updateCartTotals(state);
        }
      })
      .addCase(syncCart.rejected, (state, action) => {
        state.isSyncing = false;
        state.error = action.payload;
      });

    // Apply Coupon
    builder
      .addCase(applyCoupon.pending, (state) => {
        state.isApplyingCoupon = true;
        state.error = null;
      })
      .addCase(applyCoupon.fulfilled, (state, action) => {
        state.isApplyingCoupon = false;
        state.appliedCoupon = action.payload.coupon;
        state.couponDiscount = action.payload.discountAmount;
        updateCartTotals(state);
      })
      .addCase(applyCoupon.rejected, (state, action) => {
        state.isApplyingCoupon = false;
        state.error = action.payload;
      });

    // Calculate Delivery Fee
    builder
      .addCase(calculateDeliveryFee.pending, (state) => {
        state.isCalculatingFees = true;
        state.error = null;
      })
      .addCase(calculateDeliveryFee.fulfilled, (state, action) => {
        state.isCalculatingFees = false;
        state.deliveryFee = action.payload.deliveryFee;
        state.packagingFee = action.payload.packagingFee;
        state.platformFee = action.payload.platformFee;
        state.estimatedDeliveryTime = action.payload.estimatedDeliveryTime;
        updateCartTotals(state);
      })
      .addCase(calculateDeliveryFee.rejected, (state, action) => {
        state.isCalculatingFees = false;
        state.error = action.payload;
      });
  },
});

// Export actions
export const {
  addItem,
  removeItem,
  updateQuantity,
  clearCart,
  setDeliveryAddress,
  setSpecialInstructions,
  removeCoupon,
  saveForLater,
  moveToCart,
  removeSavedItem,
  clearCartError,
  updateDeliveryFee,
} = cartSlice.actions;

// Selectors
export const selectCart = (state) => state.cart;
export const selectCartItems = (state) => state.cart.items;
export const selectCartItemCount = (state) => state.cart.itemCount;
export const selectCartSubtotal = (state) => state.cart.subtotal;
export const selectCartTotal = (state) => state.cart.total;
export const selectCartRestaurant = (state) => ({
  id: state.cart.restaurantId,
  name: state.cart.restaurantName,
  image: state.cart.restaurantImage
});
export const selectAppliedCoupon = (state) => state.cart.appliedCoupon;
export const selectSavedItems = (state) => state.cart.savedItems;
export const selectCartLoading = (state) => 
  state.cart.isLoading || state.cart.isSyncing || state.cart.isApplyingCoupon;

// Export reducer
export default cartSlice.reducer;