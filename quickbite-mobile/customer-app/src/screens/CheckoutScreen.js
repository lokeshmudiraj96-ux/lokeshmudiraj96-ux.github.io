import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';

// Redux Actions
import { placeOrder } from '../store/slices/orderSlice';
import { clearCart } from '../store/slices/cartSlice';

// Components
import LoadingOverlay from '../components/common/LoadingOverlay';
import Button from '../components/common/Button';
import OrderSummary from '../components/checkout/OrderSummary';
import DeliveryDetails from '../components/checkout/DeliveryDetails';
import PaymentMethods from '../components/checkout/PaymentMethods';
import OrderInstructions from '../components/checkout/OrderInstructions';
import PriceBreakdown from '../components/checkout/PriceBreakdown';
import ContactlessDelivery from '../components/checkout/ContactlessDelivery';

// Services
import { PaymentService } from '../services/PaymentService';
import { OrderService } from '../services/OrderService';
import { trackEvent } from '../services/AnalyticsService';

// Constants & Utils
import { COLORS, SIZES, FONTS, COMMON_STYLES } from '../constants/theme';
import { formatCurrency, showToast, validatePhoneNumber } from '../utils/helpers';
import { validateCheckout } from '../utils/checkoutValidation';

const CheckoutScreen = () => {
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
  } = useSelector(state => state.cart);

  const { user } = useSelector(state => state.auth);
  const { savedPaymentMethods } = useSelector(state => state.user);

  // Local State
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [contactlessDelivery, setContactlessDelivery] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [estimatedDelivery, setEstimatedDelivery] = useState(null);
  const [orderPreferences, setOrderPreferences] = useState({
    cutlery: true,
    napkins: true,
    extraSpicy: false,
    lessSpicy: false,
  });

  // Effects
  useEffect(() => {
    // Set default payment method
    if (savedPaymentMethods.length > 0) {
      setSelectedPaymentMethod(savedPaymentMethods[0]);
    }

    // Calculate estimated delivery time
    calculateEstimatedDelivery();

    // Track checkout view
    trackEvent('checkout_viewed', {
      restaurant_id: restaurant?.id,
      item_count: items.length,
      total_amount: total,
      has_coupon: !!appliedCoupon,
    });
  }, []);

  // Calculate estimated delivery time
  const calculateEstimatedDelivery = () => {
    const now = new Date();
    const preparationTime = restaurant?.preparationTime || 20; // minutes
    const deliveryTime = restaurant?.deliveryTime || 30; // minutes
    const totalTime = preparationTime + deliveryTime;
    
    const estimatedTime = new Date(now.getTime() + totalTime * 60000);
    setEstimatedDelivery({
      time: estimatedTime,
      preparationTime,
      deliveryTime: deliveryTime,
      totalMinutes: totalTime,
    });
  };

  // Validate checkout form
  const validateForm = () => {
    const validation = validateCheckout({
      items,
      restaurant,
      deliveryAddress,
      selectedPaymentMethod,
      phoneNumber,
      user,
    });

    if (!validation.isValid) {
      showToast(validation.message, 'error');
      return false;
    }

    return true;
  };

  // Handle payment method selection
  const handlePaymentMethodSelect = (method) => {
    setSelectedPaymentMethod(method);
    
    trackEvent('payment_method_selected', {
      method_type: method.type,
      restaurant_id: restaurant?.id,
    });
  };

  // Handle order placement
  const handlePlaceOrder = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    
    try {
      // Prepare order data
      const orderData = {
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          customizations: item.customizations || {},
          totalPrice: item.totalPrice,
        })),
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          image: restaurant.image,
          phoneNumber: restaurant.phoneNumber,
          address: restaurant.address,
        },
        customer: {
          id: user.id,
          name: user.name,
          email: user.email,
          phoneNumber: phoneNumber,
        },
        deliveryAddress: {
          ...deliveryAddress,
          instructions: deliveryInstructions,
          contactlessDelivery,
        },
        paymentMethod: selectedPaymentMethod,
        pricing: {
          subtotal,
          deliveryFee,
          taxes,
          discount,
          total,
          appliedCoupon,
        },
        estimatedDeliveryTime: estimatedDelivery?.time,
        preferences: orderPreferences,
        specialInstructions: deliveryInstructions,
      };

      // Process payment
      let paymentResult = null;
      if (selectedPaymentMethod.type !== 'cod') {
        paymentResult = await PaymentService.processPayment(
          selectedPaymentMethod,
          total,
          orderData
        );
        
        if (!paymentResult.success) {
          throw new Error(paymentResult.error || 'Payment failed');
        }
      }

      // Create order
      const orderResult = await dispatch(placeOrder({
        ...orderData,
        paymentResult,
        paymentStatus: selectedPaymentMethod.type === 'cod' ? 'pending' : 'completed',
      })).unwrap();

      // Clear cart on success
      dispatch(clearCart());

      // Track successful order
      trackEvent('order_placed', {
        order_id: orderResult.orderId,
        restaurant_id: restaurant.id,
        payment_method: selectedPaymentMethod.type,
        total_amount: total,
        item_count: items.length,
        delivery_type: contactlessDelivery ? 'contactless' : 'regular',
      });

      // Navigate to order confirmation
      navigation.reset({
        index: 0,
        routes: [
          { name: 'Home' },
          {
            name: 'OrderConfirmation',
            params: {
              orderId: orderResult.orderId,
              estimatedDelivery: estimatedDelivery,
              restaurant: restaurant,
            },
          },
        ],
      });

      showToast('Order placed successfully!');

    } catch (error) {
      console.error('Error placing order:', error);
      showToast(error.message || 'Failed to place order', 'error');
      
      // Track failed order
      trackEvent('order_failed', {
        restaurant_id: restaurant?.id,
        error: error.message,
        payment_method: selectedPaymentMethod?.type,
        total_amount: total,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle phone number change
  const handlePhoneNumberChange = (number) => {
    setPhoneNumber(number);
  };

  // Handle delivery instructions change
  const handleInstructionsChange = (instructions) => {
    setDeliveryInstructions(instructions);
  };

  // Handle preferences change
  const handlePreferencesChange = (key, value) => {
    setOrderPreferences(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Order Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <OrderSummary
            restaurant={restaurant}
            items={items}
            estimatedDelivery={estimatedDelivery}
          />
        </View>

        {/* Delivery Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Details</Text>
          <DeliveryDetails
            address={deliveryAddress}
            phoneNumber={phoneNumber}
            onPhoneNumberChange={handlePhoneNumberChange}
            estimatedTime={estimatedDelivery}
            onEditAddress={() => navigation.navigate('AddressBook')}
          />
        </View>

        {/* Order Instructions */}
        <View style={styles.section}>
          <OrderInstructions
            instructions={deliveryInstructions}
            preferences={orderPreferences}
            onInstructionsChange={handleInstructionsChange}
            onPreferencesChange={handlePreferencesChange}
          />
        </View>

        {/* Contactless Delivery */}
        <View style={styles.section}>
          <ContactlessDelivery
            enabled={contactlessDelivery}
            onToggle={setContactlessDelivery}
          />
        </View>

        {/* Payment Methods */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <PaymentMethods
            paymentMethods={savedPaymentMethods}
            selectedMethod={selectedPaymentMethod}
            onMethodSelect={handlePaymentMethodSelect}
            onAddMethod={() => navigation.navigate('PaymentMethods')}
            orderTotal={total}
          />
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
            showDetails={true}
          />
        </View>

        {/* Order Policies */}
        <View style={styles.section}>
          <View style={styles.policyContainer}>
            <Icon name="info-outline" size={16} color={COLORS.info} />
            <Text style={styles.policyText}>
              By placing this order, you agree to our Terms & Conditions and Privacy Policy.
            </Text>
          </View>
          
          <View style={styles.policyContainer}>
            <Icon name="schedule" size={16} color={COLORS.warning} />
            <Text style={styles.policyText}>
              Cancellation available within 60 seconds of placing order.
            </Text>
          </View>
        </View>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.totalSection}>
          <View>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.estimatedTime}>
              Delivered by {estimatedDelivery?.time.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
          </View>
          <Text style={styles.totalAmount}>{formatCurrency(total)}</Text>
        </View>
        
        <Button
          title={`Place Order • ${formatCurrency(total)}`}
          onPress={handlePlaceOrder}
          style={styles.placeOrderButton}
          loading={isLoading}
          disabled={isLoading || !selectedPaymentMethod}
          icon={selectedPaymentMethod?.type === 'cod' ? 'money' : 'payment'}
        />
      </View>

      {/* Loading Overlay */}
      {isLoading && (
        <LoadingOverlay 
          message={
            selectedPaymentMethod?.type === 'cod' 
              ? 'Placing your order...' 
              : 'Processing payment...'
          } 
        />
      )}
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
  sectionTitle: {
    ...FONTS.h4,
    color: COLORS.textPrimary,
    fontWeight: 'bold',
    marginBottom: SIZES.md,
  },
  policyContainer: {
    ...COMMON_STYLES.row,
    alignItems: 'flex-start',
    marginBottom: SIZES.sm,
    gap: SIZES.sm,
  },
  policyText: {
    ...FONTS.body3,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 18,
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
    ...FONTS.body2,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  estimatedTime: {
    ...FONTS.caption,
    color: COLORS.success,
    marginTop: 2,
  },
  totalAmount: {
    ...FONTS.h3,
    color: COLORS.textPrimary,
    fontWeight: 'bold',
  },
  placeOrderButton: {
    height: SIZES.buttonHeight,
    borderRadius: SIZES.radius,
    backgroundColor: COLORS.success,
  },
});

export default CheckoutScreen;