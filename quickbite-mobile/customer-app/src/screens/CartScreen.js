import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';

// Redux Actions
import {
  removeFromCart,
  updateItemQuantity,
  clearCart,
  applyCoupon,
  removeCoupon,
  updateDeliveryAddress,
} from '../store/slices/cartSlice';

// Components
import LoadingOverlay from '../components/common/LoadingOverlay';
import EmptyState from '../components/common/EmptyState';
import Button from '../components/common/Button';
import PriceBreakdown from '../components/cart/PriceBreakdown';
import CartItem from '../components/cart/CartItem';
import CouponCard from '../components/cart/CouponCard';
import AddressSelector from '../components/cart/AddressSelector';
import DeliveryTimeSelector from '../components/cart/DeliveryTimeSelector';
import RestaurantInfo from '../components/cart/RestaurantInfo';

// Constants & Utils
import { COLORS, SIZES, FONTS, COMMON_STYLES } from '../constants/theme';
import { formatCurrency, showToast } from '../utils/helpers';
import { validateCart } from '../utils/cartValidation';
import { trackEvent } from '../services/AnalyticsService';

const CartScreen = () => {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  
  // Redux State
  const {
    items,
    restaurant,
    subtotal,
    deliveryFee,
    taxes,
    discount,
    total,
    appliedCoupon,
    deliveryAddress,
    estimatedDeliveryTime,
    itemCount,
    isLoading,
  } = useSelector(state => state.cart);
  
  const { user } = useSelector(state => state.auth);
  const { savedAddresses } = useSelector(state => state.user);

  // Local State
  const [isUpdating, setIsUpdating] = useState(false);
  const [showCoupons, setShowCoupons] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState([]);

  // Effects
  useEffect(() => {
    // Track cart view
    trackEvent('cart_viewed', {
      item_count: itemCount,
      restaurant_id: restaurant?.id,
      subtotal: subtotal,
    });

    // Load available coupons
    loadAvailableCoupons();
  }, []);

  // Load available coupons
  const loadAvailableCoupons = async () => {
    try {
      // Mock coupons - replace with API call
      const coupons = [
        {
          id: 'FIRST20',
          title: 'First Order',
          description: 'Get 20% off on your first order',
          discount: 20,
          type: 'percentage',
          minOrder: 200,
          maxDiscount: 100,
          isValid: subtotal >= 200,
        },
        {
          id: 'SAVE50',
          title: 'Save ₹50',
          description: 'Get ₹50 off on orders above ₹300',
          discount: 50,
          type: 'fixed',
          minOrder: 300,
          maxDiscount: 50,
          isValid: subtotal >= 300,
        },
        {
          id: 'WEEKEND25',
          title: 'Weekend Special',
          description: 'Get 25% off on weekend orders',
          discount: 25,
          type: 'percentage',
          minOrder: 150,
          maxDiscount: 150,
          isValid: subtotal >= 150 && [0, 6].includes(new Date().getDay()),
        },
      ];
      
      setAvailableCoupons(coupons);
    } catch (error) {
      console.error('Error loading coupons:', error);
    }
  };

  // Handle quantity update
  const handleQuantityUpdate = async (itemId, newQuantity) => {
    if (newQuantity < 1) {
      handleRemoveItem(itemId);
      return;
    }

    setIsUpdating(true);
    try {
      await dispatch(updateItemQuantity({ itemId, quantity: newQuantity })).unwrap();
      
      trackEvent('cart_item_quantity_updated', {
        item_id: itemId,
        new_quantity: newQuantity,
        restaurant_id: restaurant?.id,
      });
    } catch (error) {
      showToast('Failed to update quantity', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle item removal
  const handleRemoveItem = (itemId) => {
    Alert.alert(
      'Remove Item',
      'Are you sure you want to remove this item from cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            dispatch(removeFromCart(itemId));
            showToast('Item removed from cart');
            
            trackEvent('cart_item_removed', {
              item_id: itemId,
              restaurant_id: restaurant?.id,
            });
          },
        },
      ]
    );
  };

  // Handle clear cart
  const handleClearCart = () => {
    Alert.alert(
      'Clear Cart',
      'Are you sure you want to remove all items from cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            dispatch(clearCart());
            showToast('Cart cleared');
            navigation.goBack();
            
            trackEvent('cart_cleared', {
              item_count: itemCount,
              restaurant_id: restaurant?.id,
            });
          },
        },
      ]
    );
  };

  // Handle coupon application
  const handleApplyCoupon = async (coupon) => {
    try {
      await dispatch(applyCoupon(coupon)).unwrap();
      setShowCoupons(false);
      showToast(`Coupon ${coupon.id} applied successfully!`);
      
      trackEvent('coupon_applied', {
        coupon_id: coupon.id,
        discount_amount: coupon.discount,
        restaurant_id: restaurant?.id,
      });
    } catch (error) {
      showToast(error.message || 'Failed to apply coupon', 'error');
    }
  };

  // Handle coupon removal
  const handleRemoveCoupon = () => {
    dispatch(removeCoupon());
    showToast('Coupon removed');
    
    trackEvent('coupon_removed', {
      coupon_id: appliedCoupon?.id,
      restaurant_id: restaurant?.id,
    });
  };

  // Handle address selection
  const handleAddressSelect = (address) => {
    dispatch(updateDeliveryAddress(address));
    
    trackEvent('delivery_address_selected', {
      address_type: address.type,
      restaurant_id: restaurant?.id,
    });
  };

  // Handle checkout
  const handleCheckout = async () => {
    // Validate cart
    const validation = validateCart({
      items,
      restaurant,
      deliveryAddress,
      user,
    });

    if (!validation.isValid) {
      showToast(validation.message, 'error');
      return;
    }

    // Navigate to checkout
    navigation.navigate('Checkout');
    
    trackEvent('checkout_initiated', {
      item_count: itemCount,
      total_amount: total,
      restaurant_id: restaurant?.id,
      has_coupon: !!appliedCoupon,
    });
  };

  // Handle continue shopping
  const handleContinueShopping = () => {
    if (restaurant) {
      navigation.navigate('Restaurant', { restaurant });
    } else {
      navigation.goBack();
    }
  };

  // Render empty cart
  if (itemCount === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <EmptyState
          icon="shopping-cart"
          title="Your cart is empty"
          subtitle="Add items from restaurants to see them here"
          buttonText="Start Shopping"
          onButtonPress={() => navigation.navigate('Home')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Restaurant Info */}
        {restaurant && (
          <RestaurantInfo
            restaurant={restaurant}
            onPress={() => navigation.navigate('Restaurant', { restaurant })}
          />
        )}

        {/* Cart Items */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Your Order ({itemCount} {itemCount === 1 ? 'item' : 'items'})
            </Text>
            <TouchableOpacity onPress={handleClearCart} style={styles.clearButton}>
              <Icon name="delete-outline" size={20} color={COLORS.error} />
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>

          {items.map((item) => (
            <CartItem
              key={item.id}
              item={item}
              onQuantityChange={(quantity) => handleQuantityUpdate(item.id, quantity)}
              onRemove={() => handleRemoveItem(item.id)}
              isUpdating={isUpdating}
            />
          ))}

          <TouchableOpacity 
            style={styles.addMoreButton}
            onPress={handleContinueShopping}
          >
            <Icon name="add" size={20} color={COLORS.primary} />
            <Text style={styles.addMoreText}>Add more items</Text>
          </TouchableOpacity>
        </View>

        {/* Delivery Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <AddressSelector
            selectedAddress={deliveryAddress}
            addresses={savedAddresses}
            onSelect={handleAddressSelect}
            onAddNew={() => navigation.navigate('AddAddress')}
          />
        </View>

        {/* Delivery Time */}
        <View style={styles.section}>
          <DeliveryTimeSelector
            estimatedTime={estimatedDeliveryTime}
            restaurantId={restaurant?.id}
          />
        </View>

        {/* Coupons & Offers */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Coupons & Offers</Text>
            <TouchableOpacity 
              onPress={() => setShowCoupons(!showCoupons)}
              style={styles.viewAllButton}
            >
              <Text style={styles.viewAllText}>
                {showCoupons ? 'Hide' : 'View All'}
              </Text>
              <Icon 
                name={showCoupons ? 'expand-less' : 'expand-more'} 
                size={20} 
                color={COLORS.primary} 
              />
            </TouchableOpacity>
          </View>

          {appliedCoupon && (
            <CouponCard
              coupon={appliedCoupon}
              isApplied={true}
              onRemove={handleRemoveCoupon}
            />
          )}

          {showCoupons && (
            <View style={styles.couponsList}>
              {availableCoupons
                .filter(coupon => coupon.id !== appliedCoupon?.id)
                .map((coupon) => (
                  <CouponCard
                    key={coupon.id}
                    coupon={coupon}
                    onApply={() => handleApplyCoupon(coupon)}
                    disabled={!coupon.isValid}
                  />
                ))}
            </View>
          )}
        </View>

        {/* Price Breakdown */}
        <View style={styles.section}>
          <PriceBreakdown
            subtotal={subtotal}
            deliveryFee={deliveryFee}
            taxes={taxes}
            discount={discount}
            total={total}
            appliedCoupon={appliedCoupon}
          />
        </View>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{formatCurrency(total)}</Text>
        </View>
        
        <Button
          title="Proceed to Checkout"
          onPress={handleCheckout}
          style={styles.checkoutButton}
          loading={isLoading}
          disabled={isLoading || itemCount === 0}
        />
      </View>

      {/* Loading Overlay */}
      {isUpdating && <LoadingOverlay message="Updating cart..." />}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: SIZES.xl,
  },
  section: {
    backgroundColor: COLORS.white,
    marginBottom: SIZES.sm,
    paddingHorizontal: SIZES.padding,
    paddingVertical: SIZES.md,
  },
  sectionHeader: {
    ...COMMON_STYLES.rowBetween,
    marginBottom: SIZES.md,
  },
  sectionTitle: {
    ...FONTS.h4,
    color: COLORS.textPrimary,
    fontWeight: 'bold',
  },
  clearButton: {
    ...COMMON_STYLES.row,
    gap: 4,
  },
  clearButtonText: {
    ...FONTS.body3,
    color: COLORS.error,
    fontWeight: '600',
  },
  addMoreButton: {
    ...COMMON_STYLES.row,
    justifyContent: 'center',
    paddingVertical: SIZES.md,
    marginTop: SIZES.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray2,
    gap: SIZES.sm,
  },
  addMoreText: {
    ...FONTS.body2,
    color: COLORS.primary,
    fontWeight: '600',
  },
  viewAllButton: {
    ...COMMON_STYLES.row,
    gap: 4,
  },
  viewAllText: {
    ...FONTS.body3,
    color: COLORS.primary,
    fontWeight: '600',
  },
  couponsList: {
    gap: SIZES.sm,
  },
  bottomSpacing: {
    height: SIZES.xxl,
  },
  bottomBar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SIZES.padding,
    paddingVertical: SIZES.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray2,
    ...COMMON_STYLES.shadow,
  },
  totalSection: {
    ...COMMON_STYLES.rowBetween,
    marginBottom: SIZES.md,
  },
  totalLabel: {
    ...FONTS.h4,
    color: COLORS.textSecondary,
  },
  totalAmount: {
    ...FONTS.h3,
    color: COLORS.textPrimary,
    fontWeight: 'bold',
  },
  checkoutButton: {
    height: SIZES.buttonHeight,
    borderRadius: SIZES.radius,
  },
});

export default CartScreen;