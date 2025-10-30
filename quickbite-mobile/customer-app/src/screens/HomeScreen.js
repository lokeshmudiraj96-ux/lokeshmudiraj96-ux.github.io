import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Platform,
  StatusBar,
  FlatList,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Geolocation from 'react-native-geolocation-service';

// Components
import LocationHeader from '../components/common/LocationHeader';
import SearchBar from '../components/common/SearchBar';
import CategorySlider from '../components/home/CategorySlider';
import RestaurantCard from '../components/home/RestaurantCard';
import OfferCard from '../components/home/OfferCard';
import QuickActions from '../components/home/QuickActions';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import Banner from '../components/home/Banner';

// Redux
import { 
  fetchNearbyRestaurants, 
  fetchFeaturedRestaurants,
  fetchActiveOffers 
} from '../store/slices/restaurantSlice';
import { 
  getCurrentLocation,
  setCurrentLocation 
} from '../store/slices/locationSlice';
import { selectCartItemCount } from '../store/slices/cartSlice';

// Services
import { AnalyticsService } from '../services/AnalyticsService';
import LocationService from '../services/LocationService';

// Utils
import { COLORS, FONTS, SIZES } from '../constants/theme';

const { width } = Dimensions.get('window');
const analytics = new AnalyticsService();
const locationService = new LocationService();

const HomeScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  
  // Redux state
  const { user, isAuthenticated } = useSelector(state => state.auth);
  const { 
    nearbyRestaurants, 
    featuredRestaurants,
    activeOffers,
    isLoading, 
    error 
  } = useSelector(state => state.restaurant);
  const { current: currentLocation, isLoading: locationLoading } = useSelector(state => state.location);
  const cartItemCount = useSelector(selectCartItemCount);

  // Local state
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [banners, setBanners] = useState([]);

  // Focus effect for screen analytics
  useFocusEffect(
    useCallback(() => {
      analytics.logEvent('home_screen_viewed', {
        userId: user?.id,
        location: currentLocation ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude
        } : null
      });
    }, [user?.id, currentLocation])
  );

  // Initialize screen
  useEffect(() => {
    initializeScreen();
  }, []);

  // Load data when location changes
  useEffect(() => {
    if (currentLocation) {
      loadHomeData();
    }
  }, [currentLocation]);

  const initializeScreen = async () => {
    try {
      console.log('🏠 Initializing Home Screen...');
      
      // Get current location if not available
      if (!currentLocation) {
        await handleLocationRequest();
      }
      
      // Load initial data
      await loadHomeData();
      
    } catch (error) {
      console.error('❌ Home screen initialization failed:', error);
    }
  };

  const handleLocationRequest = async () => {
    try {
      const hasPermission = await locationService.requestPermissions();
      
      if (hasPermission) {
        const location = await locationService.getCurrentLocation();
        if (location) {
          dispatch(setCurrentLocation(location));
        }
      } else {
        // Show location permission modal or use default location
        console.log('📍 Location permission denied, using default location');
      }
    } catch (error) {
      console.error('❌ Location request failed:', error);
    }
  };

  const loadHomeData = async () => {
    try {
      console.log('📊 Loading home screen data...');
      
      const promises = [
        // Load nearby restaurants
        currentLocation && dispatch(fetchNearbyRestaurants({
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          radius: 10, // 10km radius
          category: selectedCategory !== 'all' ? selectedCategory : null
        })),
        
        // Load featured restaurants
        dispatch(fetchFeaturedRestaurants()),
        
        // Load active offers
        dispatch(fetchActiveOffers()),
        
        // Load banners
        loadBanners(),
      ].filter(Boolean);

      await Promise.allSettled(promises);
      
      console.log('✅ Home screen data loaded');
      
    } catch (error) {
      console.error('❌ Failed to load home data:', error);
    }
  };

  const loadBanners = async () => {
    try {
      // Mock banners - in real app, fetch from API
      const mockBanners = [
        {
          id: '1',
          title: 'Free Delivery',
          subtitle: 'On orders above ₹299',
          image: 'https://via.placeholder.com/350x150/FF6B35/FFFFFF?text=Free+Delivery',
          action: 'offers',
          backgroundColor: ['#FF6B35', '#F7931E'],
        },
        {
          id: '2', 
          title: '50% Off',
          subtitle: 'On your first order',
          image: 'https://via.placeholder.com/350x150/4ECDC4/FFFFFF?text=50%25+Off',
          action: 'restaurants',
          backgroundColor: ['#4ECDC4', '#44A08D'],
        },
      ];
      
      setBanners(mockBanners);
    } catch (error) {
      console.error('❌ Failed to load banners:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    
    try {
      // Refresh location
      await handleLocationRequest();
      
      // Reload all data
      await loadHomeData();
      
      analytics.logEvent('home_screen_refreshed');
      
    } catch (error) {
      console.error('❌ Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleSearch = (query) => {
    setSearchQuery(query);
    
    if (query.trim()) {
      analytics.logEvent('search_initiated', {
        query: query.trim(),
        screen: 'home'
      });
      
      navigation.navigate('Search', { 
        initialQuery: query.trim(),
        location: currentLocation
      });
    }
  };

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    
    analytics.logEvent('category_selected', {
      category,
      screen: 'home'
    });

    // Reload restaurants with new category
    if (currentLocation) {
      dispatch(fetchNearbyRestaurants({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        radius: 10,
        category: category !== 'all' ? category : null
      }));
    }
  };

  const handleRestaurantPress = (restaurant) => {
    analytics.logEvent('restaurant_selected', {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      source: 'home_screen'
    });

    navigation.navigate('Restaurant', {
      restaurantId: restaurant.id,
      restaurant: restaurant
    });
  };

  const handleOfferPress = (offer) => {
    analytics.logEvent('offer_clicked', {
      offerId: offer.id,
      offerType: offer.type,
      source: 'home_screen'
    });

    if (offer.restaurantId) {
      navigation.navigate('Restaurant', {
        restaurantId: offer.restaurantId,
        offerId: offer.id
      });
    } else {
      navigation.navigate('Offers');
    }
  };

  const handleBannerPress = (banner) => {
    analytics.logEvent('banner_clicked', {
      bannerId: banner.id,
      action: banner.action
    });

    switch (banner.action) {
      case 'offers':
        navigation.navigate('Offers');
        break;
      case 'restaurants':
        navigation.navigate('Restaurants');
        break;
      default:
        console.log('Banner action not handled:', banner.action);
    }
  };

  const renderRestaurantItem = ({ item }) => (
    <RestaurantCard
      restaurant={item}
      onPress={() => handleRestaurantPress(item)}
      style={styles.restaurantCard}
    />
  );

  const renderOfferItem = ({ item }) => (
    <OfferCard
      offer={item}
      onPress={() => handleOfferPress(item)}
      style={styles.offerCard}
    />
  );

  const renderBannerItem = ({ item }) => (
    <Banner
      banner={item}
      onPress={() => handleBannerPress(item)}
      style={styles.banner}
    />
  );

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <LocationHeader
          location={currentLocation}
          onLocationPress={() => navigation.navigate('LocationPicker')}
          onNotificationPress={() => navigation.navigate('Notifications')}
        />
        <ErrorMessage
          message={error}
          onRetry={() => loadHomeData()}
          style={styles.errorContainer}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      
      {/* Header */}
      <LocationHeader
        location={currentLocation}
        onLocationPress={() => navigation.navigate('LocationPicker')}
        onNotificationPress={() => navigation.navigate('Notifications')}
        cartItemCount={cartItemCount}
        onCartPress={() => navigation.navigate('Cart')}
      />

      {/* Search Bar */}
      <SearchBar
        placeholder="Search restaurants, cuisines, dishes..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        onSubmit={handleSearch}
        onFocus={() => navigation.navigate('Search', { location: currentLocation })}
        style={styles.searchBar}
      />

      {/* Main Content */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Banners */}
        {banners.length > 0 && (
          <View style={styles.section}>
            <FlatList
              data={banners}
              renderItem={renderBannerItem}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bannersList}
            />
          </View>
        )}

        {/* Quick Actions */}
        <QuickActions
          onActionPress={(action) => {
            analytics.logEvent('quick_action_pressed', { action });
            
            switch (action) {
              case 'offers':
                navigation.navigate('Offers');
                break;
              case 'orders':
                navigation.navigate('Orders');
                break;
              case 'favorites':
                navigation.navigate('Favorites');
                break;
              case 'wallet':
                navigation.navigate('Wallet');
                break;
              default:
                console.log('Quick action not handled:', action);
            }
          }}
          style={styles.quickActions}
        />

        {/* Categories */}
        <CategorySlider
          selectedCategory={selectedCategory}
          onCategorySelect={handleCategorySelect}
          style={styles.categories}
        />

        {/* Active Offers */}
        {activeOffers && activeOffers.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Special Offers</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Offers')}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={activeOffers}
              renderItem={renderOfferItem}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.offersList}
            />
          </View>
        )}

        {/* Featured Restaurants */}
        {featuredRestaurants && featuredRestaurants.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Featured Restaurants</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Restaurants', { featured: true })}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={featuredRestaurants.slice(0, 5)}
              renderItem={renderRestaurantItem}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.restaurantsList}
            />
          </View>
        )}

        {/* Nearby Restaurants */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {currentLocation ? 'Restaurants Near You' : 'Popular Restaurants'}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Restaurants')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          {isLoading || locationLoading ? (
            <LoadingSpinner style={styles.loadingSpinner} />
          ) : nearbyRestaurants && nearbyRestaurants.length > 0 ? (
            nearbyRestaurants.map((restaurant, index) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                onPress={() => handleRestaurantPress(restaurant)}
                style={[
                  styles.restaurantCardVertical,
                  index === nearbyRestaurants.length - 1 && styles.lastCard
                ]}
                layout="vertical"
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {currentLocation 
                  ? 'No restaurants found in your area' 
                  : 'Please enable location to find nearby restaurants'}
              </Text>
              <TouchableOpacity 
                style={styles.retryButton}
                onPress={currentLocation ? loadHomeData : handleLocationRequest}
              >
                <Text style={styles.retryButtonText}>
                  {currentLocation ? 'Retry' : 'Enable Location'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  searchBar: {
    marginHorizontal: SIZES.padding,
    marginVertical: SIZES.base,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: SIZES.padding,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIZES.padding,
    marginBottom: SIZES.base,
  },
  sectionTitle: {
    ...FONTS.h3,
    color: COLORS.black,
    fontWeight: 'bold',
  },
  seeAllText: {
    ...FONTS.body4,
    color: COLORS.primary,
    fontWeight: '600',
  },
  bannersList: {
    paddingLeft: SIZES.padding,
  },
  banner: {
    marginRight: SIZES.base,
  },
  quickActions: {
    marginHorizontal: SIZES.padding,
    marginBottom: SIZES.padding,
  },
  categories: {
    marginBottom: SIZES.padding,
  },
  offersList: {
    paddingLeft: SIZES.padding,
  },
  offerCard: {
    marginRight: SIZES.base,
  },
  restaurantsList: {
    paddingLeft: SIZES.padding,
  },
  restaurantCard: {
    marginRight: SIZES.base,
  },
  restaurantCardVertical: {
    marginHorizontal: SIZES.padding,
    marginBottom: SIZES.base,
  },
  lastCard: {
    marginBottom: 0,
  },
  loadingSpinner: {
    marginVertical: SIZES.padding * 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SIZES.padding * 2,
    paddingHorizontal: SIZES.padding,
  },
  emptyStateText: {
    ...FONTS.body3,
    color: COLORS.gray,
    textAlign: 'center',
    marginBottom: SIZES.padding,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SIZES.padding,
    paddingVertical: SIZES.base,
    borderRadius: SIZES.radius,
  },
  retryButtonText: {
    ...FONTS.body4,
    color: COLORS.white,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  bottomSpacing: {
    height: 100, // Space for bottom tab navigation
  },
});

export default HomeScreen;