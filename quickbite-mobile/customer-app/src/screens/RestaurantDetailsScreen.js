import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Animated,
  Dimensions,
  Share,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { useRoute, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';

// Redux Actions
import { addToCart } from '../store/slices/cartSlice';
import { toggleFavorite } from '../store/slices/userSlice';

// Components
import LoadingScreen from '../components/common/LoadingScreen';
import ErrorState from '../components/common/ErrorState';
import Button from '../components/common/Button';
import MenuCategory from '../components/restaurant/MenuCategory';
import MenuItemCard from '../components/restaurant/MenuItemCard';
import RestaurantHeader from '../components/restaurant/RestaurantHeader';
import RestaurantInfo from '../components/restaurant/RestaurantInfo';
import ReviewsSection from '../components/restaurant/ReviewsSection';
import StickyTabBar from '../components/restaurant/StickyTabBar';
import AddItemModal from '../components/restaurant/AddItemModal';
import CartFloatingButton from '../components/restaurant/CartFloatingButton';

// Services
import { RestaurantService } from '../services/RestaurantService';
import { trackEvent } from '../services/AnalyticsService';

// Constants & Utils
import { COLORS, SIZES, FONTS, COMMON_STYLES } from '../constants/theme';
import { formatCurrency, showToast, getImageUrl } from '../utils/helpers';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const HEADER_HEIGHT = 250;
const TAB_BAR_HEIGHT = 50;

const RestaurantDetailsScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const scrollViewRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Route params
  const { restaurant: initialRestaurant, restaurantId } = route.params;

  // Redux State
  const { cart } = useSelector(state => state.cart);
  const { favorites } = useSelector(state => state.user);
  const { user } = useSelector(state => state.auth);

  // Local State
  const [restaurant, setRestaurant] = useState(initialRestaurant || null);
  const [menu, setMenu] = useState([]);
  const [isLoading, setIsLoading] = useState(!initialRestaurant);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [categoryPositions, setCategoryPositions] = useState({});
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  // Derived State
  const isFavorite = restaurant ? favorites.includes(restaurant.id) : false;
  const cartItems = cart.items || [];
  const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartRestaurantId = cart.restaurant?.id;
  const canAddToCart = !cartRestaurantId || cartRestaurantId === restaurant?.id;

  // Effects
  useEffect(() => {
    loadRestaurantData();
  }, [restaurantId]);

  useEffect(() => {
    // Setup scroll listener for header visibility
    const listenerId = scrollY.addListener(({ value }) => {
      setIsHeaderVisible(value < HEADER_HEIGHT - 100);
    });

    return () => scrollY.removeListener(listenerId);
  }, []);

  useEffect(() => {
    // Track restaurant view
    if (restaurant) {
      trackEvent('restaurant_viewed', {
        restaurant_id: restaurant.id,
        restaurant_name: restaurant.name,
        cuisine_type: restaurant.cuisineType,
        rating: restaurant.rating,
      });
    }
  }, [restaurant]);

  // Load restaurant data
  const loadRestaurantData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const id = restaurantId || initialRestaurant?.id;
      if (!id) {
        throw new Error('Restaurant ID is required');
      }

      // Load restaurant details if not provided
      let restaurantData = initialRestaurant;
      if (!restaurantData) {
        restaurantData = await RestaurantService.getRestaurant(id);
      }

      // Load menu
      const menuData = await RestaurantService.getMenu(id);

      setRestaurant(restaurantData);
      setMenu(menuData);
      
      // Set first category as active
      if (menuData.length > 0) {
        setActiveCategory(menuData[0].id);
      }
    } catch (err) {
      console.error('Error loading restaurant:', err);
      setError(err.message || 'Failed to load restaurant details');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle category scroll
  const scrollToCategory = (categoryId) => {
    const position = categoryPositions[categoryId];
    if (position && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        y: position - TAB_BAR_HEIGHT,
        animated: true,
      });
    }
    setActiveCategory(categoryId);
  };

  // Handle menu item press
  const handleMenuItemPress = (item) => {
    setSelectedItem(item);
    setShowAddItemModal(true);
    
    trackEvent('menu_item_viewed', {
      restaurant_id: restaurant.id,
      item_id: item.id,
      item_name: item.name,
      item_price: item.price,
    });
  };

  // Handle add to cart
  const handleAddToCart = async (item, customizations = {}, quantity = 1) => {
    if (!canAddToCart) {
      showToast('Clear cart to add items from different restaurant', 'warning');
      return;
    }

    try {
      const cartItem = {
        ...item,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        quantity,
        customizations,
        totalPrice: (item.price + (customizations.additionalPrice || 0)) * quantity,
      };

      await dispatch(addToCart({
        item: cartItem,
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          image: restaurant.image,
          cuisineType: restaurant.cuisineType,
          deliveryTime: restaurant.deliveryTime,
          deliveryFee: restaurant.deliveryFee,
        },
      })).unwrap();

      setShowAddItemModal(false);
      showToast(`${item.name} added to cart`);
      
      trackEvent('item_added_to_cart', {
        restaurant_id: restaurant.id,
        item_id: item.id,
        item_name: item.name,
        quantity,
        price: cartItem.totalPrice,
      });
    } catch (error) {
      showToast('Failed to add item to cart', 'error');
    }
  };

  // Handle favorite toggle
  const handleToggleFavorite = () => {
    dispatch(toggleFavorite(restaurant.id));
    
    trackEvent('restaurant_favorite_toggled', {
      restaurant_id: restaurant.id,
      is_favorite: !isFavorite,
    });
    
    showToast(
      isFavorite ? 'Removed from favorites' : 'Added to favorites'
    );
  };

  // Handle share
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${restaurant.name} on QuickBite! Great ${restaurant.cuisineType} food with ${restaurant.rating}⭐ rating.`,
        url: `https://quickbite.app/restaurant/${restaurant.id}`,
        title: restaurant.name,
      });
      
      trackEvent('restaurant_shared', {
        restaurant_id: restaurant.id,
        restaurant_name: restaurant.name,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  // Handle category position measurement
  const onCategoryLayout = (categoryId, event) => {
    const { y } = event.nativeEvent.layout;
    setCategoryPositions(prev => ({
      ...prev,
      [categoryId]: y + HEADER_HEIGHT,
    }));
  };

  // Render loading state
  if (isLoading) {
    return <LoadingScreen message="Loading restaurant details..." />;
  }

  // Render error state
  if (error) {
    return (
      <ErrorState
        title="Oops!"
        subtitle={error}
        buttonText="Try Again"
        onButtonPress={loadRestaurantData}
      />
    );
  }

  // Render main content
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      {/* Header */}
      <RestaurantHeader
        restaurant={restaurant}
        isFavorite={isFavorite}
        onToggleFavorite={handleToggleFavorite}
        onShare={handleShare}
        onBack={() => navigation.goBack()}
        scrollY={scrollY}
        headerHeight={HEADER_HEIGHT}
      />

      {/* Sticky Tab Bar */}
      <Animated.View
        style={[
          styles.stickyTabBar,
          {
            opacity: scrollY.interpolate({
              inputRange: [HEADER_HEIGHT - 100, HEADER_HEIGHT],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            }),
          },
        ]}
      >
        <StickyTabBar
          categories={menu}
          activeCategory={activeCategory}
          onCategoryPress={scrollToCategory}
        />
      </Animated.View>

      {/* Content */}
      <Animated.ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Restaurant Header Image & Basic Info */}
        <View style={styles.headerSpace} />

        {/* Restaurant Information */}
        <RestaurantInfo restaurant={restaurant} />

        {/* Menu Categories */}
        {menu.map((category, categoryIndex) => (
          <View
            key={category.id}
            onLayout={(event) => onCategoryLayout(category.id, event)}
          >
            <MenuCategory
              category={category}
              onItemPress={handleMenuItemPress}
              canAddToCart={canAddToCart}
              onDirectAdd={(item) => handleAddToCart(item, {}, 1)}
              cartItems={cartItems}
            />
          </View>
        ))}

        {/* Reviews Section */}
        <ReviewsSection 
          restaurantId={restaurant.id}
          rating={restaurant.rating}
          reviewCount={restaurant.reviewCount}
        />

        {/* Bottom Spacing for FAB */}
        <View style={styles.bottomSpacing} />
      </Animated.ScrollView>

      {/* Floating Cart Button */}
      {cartItemCount > 0 && canAddToCart && (
        <CartFloatingButton
          itemCount={cartItemCount}
          total={cartItems.reduce((sum, item) => sum + item.totalPrice, 0)}
          onPress={() => navigation.navigate('Cart')}
        />
      )}

      {/* Add Item Modal */}
      {showAddItemModal && selectedItem && (
        <AddItemModal
          item={selectedItem}
          restaurant={restaurant}
          visible={showAddItemModal}
          onClose={() => {
            setShowAddItemModal(false);
            setSelectedItem(null);
          }}
          onAddToCart={handleAddToCart}
          existingCartItem={cartItems.find(item => item.id === selectedItem.id)}
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
  stickyTabBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray2,
    ...COMMON_STYLES.shadow,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: SIZES.xxl,
  },
  headerSpace: {
    height: HEADER_HEIGHT,
  },
  bottomSpacing: {
    height: SIZES.xxl + 60, // Space for floating button
  },
});

export default RestaurantDetailsScreen;