import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Linking,
  Alert,
  Animated,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialIcons';
import MapView, { Marker, Polyline } from 'react-native-maps';

// Components
import LoadingScreen from '../components/common/LoadingScreen';
import ErrorState from '../components/common/ErrorState';
import Button from '../components/common/Button';
import OrderStatusTimeline from '../components/tracking/OrderStatusTimeline';
import DeliveryPartnerCard from '../components/tracking/DeliveryPartnerCard';
import OrderSummaryCard from '../components/tracking/OrderSummaryCard';
import LiveLocationMap from '../components/tracking/LiveLocationMap';
import EstimatedArrival from '../components/tracking/EstimatedArrival';
import ContactOptions from '../components/tracking/ContactOptions';

// Services
import { OrderService } from '../services/OrderService';
import { LocationService } from '../services/LocationService';
import { trackEvent } from '../services/AnalyticsService';

// Constants & Utils
import { COLORS, SIZES, FONTS, COMMON_STYLES } from '../constants/theme';
import { formatTime, formatCurrency, showToast } from '../utils/helpers';

const ORDER_STATUSES = {
  PLACED: 'placed',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  PICKED_UP: 'picked_up',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

const OrderTrackingScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const mapRef = useRef(null);
  const pulseAnimation = useRef(new Animated.Value(0)).current;

  // Route params
  const { orderId } = route.params;

  // Redux State
  const { user } = useSelector(state => state.auth);

  // Local State
  const [order, setOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deliveryPartnerLocation, setDeliveryPartnerLocation] = useState(null);
  const [estimatedArrival, setEstimatedArrival] = useState(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [showFullMap, setShowFullMap] = useState(false);

  // Effects
  useEffect(() => {
    loadOrderDetails();
    startLocationTracking();
    startPulseAnimation();

    const interval = setInterval(loadOrderDetails, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [orderId]);

  useEffect(() => {
    if (order) {
      trackEvent('order_tracking_viewed', {
        order_id: order.id,
        status: order.status,
        restaurant_id: order.restaurant.id,
      });
    }
  }, [order]);

  // Load order details
  const loadOrderDetails = async () => {
    try {
      setError(null);
      const orderData = await OrderService.getOrder(orderId);
      setOrder(orderData);
      
      // Update estimated arrival if delivery partner is assigned
      if (orderData.deliveryPartner && orderData.deliveryPartner.location) {
        updateEstimatedArrival(orderData);
      }
    } catch (err) {
      console.error('Error loading order:', err);
      setError(err.message || 'Failed to load order details');
    } finally {
      setIsLoading(false);
    }
  };

  // Start location tracking for delivery partner
  const startLocationTracking = () => {
    // This would typically be a WebSocket connection or polling
    // For demo, we'll simulate location updates
    if (order?.deliveryPartner) {
      // Subscribe to delivery partner location updates
      // WebSocket implementation would go here
    }
  };

  // Update estimated arrival time
  const updateEstimatedArrival = async (orderData) => {
    if (!orderData.deliveryPartner?.location || !orderData.deliveryAddress) {
      return;
    }

    try {
      const distance = await LocationService.calculateDistance(
        orderData.deliveryPartner.location,
        orderData.deliveryAddress
      );

      const estimatedTime = Math.ceil(distance.duration / 60); // Convert to minutes
      setEstimatedArrival({
        time: new Date(Date.now() + estimatedTime * 60000),
        minutes: estimatedTime,
        distance: distance.distance,
      });
    } catch (error) {
      console.error('Error calculating arrival time:', error);
    }
  };

  // Start pulse animation for delivery partner marker
  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  // Handle contact restaurant
  const handleContactRestaurant = () => {
    Alert.alert(
      'Contact Restaurant',
      'How would you like to contact the restaurant?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call',
          onPress: () => {
            Linking.openURL(`tel:${order.restaurant.phoneNumber}`);
            trackEvent('restaurant_called', { order_id: order.id });
          },
        },
        {
          text: 'Chat',
          onPress: () => {
            navigation.navigate('Chat', {
              type: 'restaurant',
              orderId: order.id,
              restaurantId: order.restaurant.id,
            });
            trackEvent('restaurant_chat_opened', { order_id: order.id });
          },
        },
      ]
    );
  };

  // Handle contact delivery partner
  const handleContactDeliveryPartner = () => {
    if (!order.deliveryPartner) {
      showToast('Delivery partner not assigned yet');
      return;
    }

    Alert.alert(
      'Contact Delivery Partner',
      'How would you like to contact your delivery partner?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call',
          onPress: () => {
            Linking.openURL(`tel:${order.deliveryPartner.phoneNumber}`);
            trackEvent('delivery_partner_called', { order_id: order.id });
          },
        },
        {
          text: 'Chat',
          onPress: () => {
            navigation.navigate('Chat', {
              type: 'delivery',
              orderId: order.id,
              deliveryPartnerId: order.deliveryPartner.id,
            });
            trackEvent('delivery_partner_chat_opened', { order_id: order.id });
          },
        },
      ]
    );
  };

  // Handle cancel order
  const handleCancelOrder = () => {
    Alert.alert(
      'Cancel Order',
      'Are you sure you want to cancel this order? This action cannot be undone.',
      [
        { text: 'Keep Order', style: 'cancel' },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: async () => {
            try {
              await OrderService.cancelOrder(order.id);
              setOrder(prev => ({ ...prev, status: ORDER_STATUSES.CANCELLED }));
              showToast('Order cancelled successfully');
              
              trackEvent('order_cancelled', {
                order_id: order.id,
                status: order.status,
                restaurant_id: order.restaurant.id,
              });
            } catch (error) {
              showToast('Failed to cancel order', 'error');
            }
          },
        },
      ]
    );
  };

  // Handle map ready
  const onMapReady = () => {
    setIsMapReady(true);
    if (order?.deliveryPartner?.location && order?.deliveryAddress) {
      // Fit map to show both locations
      const coordinates = [
        order.deliveryPartner.location,
        order.deliveryAddress,
      ];
      mapRef.current?.fitToCoordinates(coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  };

  // Check if order can be cancelled
  const canCancelOrder = () => {
    return [ORDER_STATUSES.PLACED, ORDER_STATUSES.CONFIRMED].includes(order?.status);
  };

  // Check if delivery is in progress
  const isDeliveryInProgress = () => {
    return [ORDER_STATUSES.PICKED_UP, ORDER_STATUSES.OUT_FOR_DELIVERY].includes(order?.status);
  };

  // Render loading state
  if (isLoading) {
    return <LoadingScreen message="Loading order details..." />;
  }

  // Render error state
  if (error || !order) {
    return (
      <ErrorState
        title="Order Not Found"
        subtitle={error || 'Unable to load order details'}
        buttonText="Try Again"
        onButtonPress={loadOrderDetails}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Order Status Timeline */}
        <View style={styles.section}>
          <OrderStatusTimeline
            status={order.status}
            statusHistory={order.statusHistory}
            estimatedDeliveryTime={order.estimatedDeliveryTime}
          />
        </View>

        {/* Estimated Arrival */}
        {isDeliveryInProgress() && estimatedArrival && (
          <View style={styles.section}>
            <EstimatedArrival
              estimatedTime={estimatedArrival.time}
              distance={estimatedArrival.distance}
              deliveryPartner={order.deliveryPartner}
            />
          </View>
        )}

        {/* Live Map */}
        {isDeliveryInProgress() && order.deliveryPartner?.location && (
          <View style={styles.section}>
            <View style={styles.mapHeader}>
              <Text style={styles.sectionTitle}>Live Tracking</Text>
              <TouchableOpacity 
                style={styles.fullScreenButton}
                onPress={() => setShowFullMap(true)}
              >
                <Icon name="fullscreen" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.mapContainer}>
              <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={{
                  latitude: order.deliveryAddress.latitude,
                  longitude: order.deliveryAddress.longitude,
                  latitudeDelta: 0.0922,
                  longitudeDelta: 0.0421,
                }}
                onMapReady={onMapReady}
              >
                {/* Customer Location */}
                <Marker
                  coordinate={order.deliveryAddress}
                  title="Your Location"
                  description={order.deliveryAddress.address}
                  pinColor={COLORS.primary}
                />

                {/* Delivery Partner Location */}
                <Marker
                  coordinate={order.deliveryPartner.location}
                  title={order.deliveryPartner.name}
                  description="Your delivery partner"
                >
                  <Animated.View
                    style={[
                      styles.deliveryMarker,
                      {
                        transform: [
                          {
                            scale: pulseAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 1.3],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <Icon name="motorcycle" size={24} color={COLORS.white} />
                  </Animated.View>
                </Marker>

                {/* Route Line */}
                {order.route && (
                  <Polyline
                    coordinates={order.route}
                    strokeColor={COLORS.primary}
                    strokeWidth={3}
                    lineDashPattern={[5, 5]}
                  />
                )}
              </MapView>
            </View>
          </View>
        )}

        {/* Delivery Partner Info */}
        {order.deliveryPartner && (
          <View style={styles.section}>
            <DeliveryPartnerCard
              deliveryPartner={order.deliveryPartner}
              onCall={handleContactDeliveryPartner}
              onMessage={handleContactDeliveryPartner}
              orderStatus={order.status}
            />
          </View>
        )}

        {/* Order Summary */}
        <View style={styles.section}>
          <OrderSummaryCard
            order={order}
            onContactRestaurant={handleContactRestaurant}
            showItemDetails={true}
          />
        </View>

        {/* Contact Options */}
        <View style={styles.section}>
          <ContactOptions
            order={order}
            onContactRestaurant={handleContactRestaurant}
            onContactDeliveryPartner={handleContactDeliveryPartner}
            onReportIssue={() => navigation.navigate('ReportIssue', { orderId: order.id })}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.section}>
          {canCancelOrder() && (
            <Button
              title="Cancel Order"
              onPress={handleCancelOrder}
              style={styles.cancelButton}
              textStyle={styles.cancelButtonText}
              variant="outline"
            />
          )}
          
          {order.status === ORDER_STATUSES.DELIVERED && (
            <View style={styles.buttonRow}>
              <Button
                title="Rate Order"
                onPress={() => navigation.navigate('RateOrder', { orderId: order.id })}
                style={[styles.actionButton, { marginRight: SIZES.sm }]}
                variant="outline"
              />
              <Button
                title="Reorder"
                onPress={() => navigation.navigate('Restaurant', { restaurant: order.restaurant })}
                style={styles.actionButton}
              />
            </View>
          )}
        </View>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Full Screen Map Modal */}
      {showFullMap && (
        <LiveLocationMap
          visible={showFullMap}
          order={order}
          onClose={() => setShowFullMap(false)}
          deliveryPartnerLocation={deliveryPartnerLocation}
          estimatedArrival={estimatedArrival}
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
  mapHeader: {
    ...COMMON_STYLES.rowBetween,
    marginBottom: SIZES.md,
  },
  fullScreenButton: {
    padding: SIZES.sm,
  },
  mapContainer: {
    height: 200,
    borderRadius: SIZES.radius,
    overflow: 'hidden',
    ...COMMON_STYLES.shadow,
  },
  map: {
    flex: 1,
  },
  deliveryMarker: {
    width: 40,
    height: 40,
    backgroundColor: COLORS.success,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  buttonRow: {
    flexDirection: 'row',
  },
  actionButton: {
    flex: 1,
    height: SIZES.buttonHeight,
  },
  cancelButton: {
    height: SIZES.buttonHeight,
    borderColor: COLORS.error,
    borderWidth: 1,
  },
  cancelButtonText: {
    color: COLORS.error,
  },
  bottomSpacing: {
    height: SIZES.xl,
  },
});

export default OrderTrackingScreen;