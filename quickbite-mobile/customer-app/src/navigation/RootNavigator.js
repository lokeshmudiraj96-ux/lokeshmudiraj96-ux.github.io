import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { View, Text, Platform } from 'react-native';
import { useSelector } from 'react-redux';

// Screens
import HomeScreen from '../screens/HomeScreen';
import RestaurantsScreen from '../screens/RestaurantsScreen';
import RestaurantDetailsScreen from '../screens/RestaurantDetailsScreen';
import SearchScreen from '../screens/SearchScreen';
import CartScreen from '../screens/CartScreen';
import OrdersScreen from '../screens/OrdersScreen';
import OrderDetailsScreen from '../screens/OrderDetailsScreen';
import OrderTrackingScreen from '../screens/OrderTrackingScreen';
import ProfileScreen from '../screens/ProfileScreen';
import OffersScreen from '../screens/OffersScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import WalletScreen from '../screens/WalletScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import LocationPickerScreen from '../screens/LocationPickerScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import PaymentScreen from '../screens/PaymentScreen';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import OTPVerificationScreen from '../screens/auth/OTPVerificationScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// Profile Screens
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import AddressBookScreen from '../screens/profile/AddressBookScreen';
import AddAddressScreen from '../screens/profile/AddAddressScreen';
import PaymentMethodsScreen from '../screens/profile/PaymentMethodsScreen';
import SettingsScreen from '../screens/profile/SettingsScreen';
import HelpSupportScreen from '../screens/profile/HelpSupportScreen';
import PrivacyPolicyScreen from '../screens/profile/PrivacyPolicyScreen';
import TermsConditionsScreen from '../screens/profile/TermsConditionsScreen';

// Components
import CustomTabBar from '../components/navigation/CustomTabBar';
import DrawerContent from '../components/navigation/DrawerContent';
import HeaderRight from '../components/navigation/HeaderRight';
import BackButton from '../components/navigation/BackButton';

// Constants
import { COLORS, FONTS, SIZES } from '../constants/theme';

// Navigators
const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();
const Drawer = createDrawerNavigator();

// Default navigation options
const defaultScreenOptions = {
  headerStyle: {
    backgroundColor: COLORS.white,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  headerTitleStyle: {
    ...FONTS.h3,
    color: COLORS.black,
    fontWeight: 'bold',
  },
  headerTintColor: COLORS.black,
  headerBackTitleVisible: false,
};

// Auth Stack Navigator
const AuthStack = () => (
  <Stack.Navigator
    initialRouteName="Login"
    screenOptions={{
      ...defaultScreenOptions,
      headerShown: false,
    }}
  >
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
    <Stack.Screen name="OTPVerification" component={OTPVerificationScreen} />
    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
  </Stack.Navigator>
);

// Home Stack Navigator
const HomeStack = () => (
  <Stack.Navigator
    initialRouteName="HomeMain"
    screenOptions={defaultScreenOptions}
  >
    <Stack.Screen 
      name="HomeMain" 
      component={HomeScreen}
      options={{
        headerShown: false,
      }}
    />
    <Stack.Screen 
      name="Restaurants" 
      component={RestaurantsScreen}
      options={{
        title: 'Restaurants',
        headerLeft: () => <BackButton />,
      }}
    />
    <Stack.Screen 
      name="Restaurant" 
      component={RestaurantDetailsScreen}
      options={({ route }) => ({
        title: route.params?.restaurant?.name || 'Restaurant',
        headerLeft: () => <BackButton />,
        headerRight: () => <HeaderRight showCart showFavorite />,
      })}
    />
    <Stack.Screen 
      name="Search" 
      component={SearchScreen}
      options={{
        title: 'Search',
        headerLeft: () => <BackButton />,
      }}
    />
    <Stack.Screen 
      name="LocationPicker" 
      component={LocationPickerScreen}
      options={{
        title: 'Select Location',
        headerLeft: () => <BackButton />,
      }}
    />
  </Stack.Navigator>
);

// Orders Stack Navigator
const OrdersStack = () => (
  <Stack.Navigator
    initialRouteName="OrdersMain"
    screenOptions={defaultScreenOptions}
  >
    <Stack.Screen 
      name="OrdersMain" 
      component={OrdersScreen}
      options={{
        title: 'My Orders',
      }}
    />
    <Stack.Screen 
      name="OrderDetails" 
      component={OrderDetailsScreen}
      options={{
        title: 'Order Details',
        headerLeft: () => <BackButton />,
      }}
    />
    <Stack.Screen 
      name="OrderTracking" 
      component={OrderTrackingScreen}
      options={{
        title: 'Track Order',
        headerLeft: () => <BackButton />,
      }}
    />
  </Stack.Navigator>
);

// Offers Stack Navigator
const OffersStack = () => (
  <Stack.Navigator
    initialRouteName="OffersMain"
    screenOptions={defaultScreenOptions}
  >
    <Stack.Screen 
      name="OffersMain" 
      component={OffersScreen}
      options={{
        title: 'Offers & Deals',
      }}
    />
  </Stack.Navigator>
);

// Profile Stack Navigator
const ProfileStack = () => (
  <Stack.Navigator
    initialRouteName="ProfileMain"
    screenOptions={defaultScreenOptions}
  >
    <Stack.Screen 
      name="ProfileMain" 
      component={ProfileScreen}
      options={{
        title: 'Profile',
      }}
    />
    <Stack.Screen 
      name="EditProfile" 
      component={EditProfileScreen}
      options={{
        title: 'Edit Profile',
        headerLeft: () => <BackButton />,
      }}
    />
    <Stack.Screen 
      name="AddressBook" 
      component={AddressBookScreen}
      options={{
        title: 'My Addresses',
        headerLeft: () => <BackButton />,
      }}
    />
    <Stack.Screen 
      name="AddAddress" 
      component={AddAddressScreen}
      options={{
        title: 'Add Address',
        headerLeft: () => <BackButton />,
      }}
    />
    <Stack.Screen 
      name="PaymentMethods" 
      component={PaymentMethodsScreen}
      options={{
        title: 'Payment Methods',
        headerLeft: () => <BackButton />,
      }}
    />
    <Stack.Screen 
      name="Settings" 
      component={SettingsScreen}
      options={{
        title: 'Settings',
        headerLeft: () => <BackButton />,
      }}
    />
    <Stack.Screen 
      name="HelpSupport" 
      component={HelpSupportScreen}
      options={{
        title: 'Help & Support',
        headerLeft: () => <BackButton />,
      }}
    />
    <Stack.Screen 
      name="PrivacyPolicy" 
      component={PrivacyPolicyScreen}
      options={{
        title: 'Privacy Policy',
        headerLeft: () => <BackButton />,
      }}
    />
    <Stack.Screen 
      name="TermsConditions" 
      component={TermsConditionsScreen}
      options={{
        title: 'Terms & Conditions',
        headerLeft: () => <BackButton />,
      }}
    />
  </Stack.Navigator>
);

// Tab Bar Icon Component
const TabBarIcon = ({ name, color, size, focused, badge }) => (
  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
    <Icon name={name} size={size} color={color} />
    {badge > 0 && (
      <View style={{
        position: 'absolute',
        top: -8,
        right: -12,
        backgroundColor: COLORS.red,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
      }}>
        <Text style={{
          color: COLORS.white,
          fontSize: 11,
          fontWeight: 'bold',
        }}>
          {badge > 99 ? '99+' : badge}
        </Text>
      </View>
    )}
  </View>
);

// Bottom Tab Navigator
const BottomTabNavigator = () => {
  const cartItemCount = useSelector(state => state.cart.itemCount);
  
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          let badge = 0;

          switch (route.name) {
            case 'Home':
              iconName = 'home';
              break;
            case 'Orders':
              iconName = 'receipt-long';
              break;
            case 'Offers':
              iconName = 'local-offer';
              break;
            case 'Profile':
              iconName = 'person';
              break;
            default:
              iconName = 'home';
          }

          return (
            <TabBarIcon
              name={iconName}
              color={color}
              size={size}
              focused={focused}
              badge={badge}
            />
          );
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopColor: COLORS.lightGray,
          borderTopWidth: 1,
          elevation: 8,
          shadowOffset: {
            width: 0,
            height: -2,
          },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          height: Platform.OS === 'ios' ? 90 : 70,
          paddingBottom: Platform.OS === 'ios' ? 25 : 10,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          ...FONTS.caption,
          fontWeight: '600',
          marginTop: 2,
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeStack}
        options={{
          title: 'Home',
        }}
      />
      <Tab.Screen 
        name="Orders" 
        component={OrdersStack}
        options={{
          title: 'Orders',
        }}
      />
      <Tab.Screen 
        name="Offers" 
        component={OffersStack}
        options={{
          title: 'Offers',
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileStack}
        options={{
          title: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
};

// Drawer Navigator
const DrawerNavigator = () => (
  <Drawer.Navigator
    initialRouteName="MainTabs"
    drawerContent={(props) => <DrawerContent {...props} />}
    screenOptions={{
      headerShown: false,
      drawerStyle: {
        backgroundColor: COLORS.white,
        width: 280,
      },
      drawerActiveTintColor: COLORS.primary,
      drawerInactiveTintColor: COLORS.gray,
      drawerLabelStyle: {
        ...FONTS.body3,
        fontWeight: '600',
      },
    }}
  >
    <Drawer.Screen 
      name="MainTabs" 
      component={BottomTabNavigator}
      options={{
        title: 'Home',
        drawerIcon: ({ color, size }) => (
          <Icon name="home" color={color} size={size} />
        ),
      }}
    />
    <Drawer.Screen 
      name="Favorites" 
      component={FavoritesScreen}
      options={{
        title: 'Favorites',
        drawerIcon: ({ color, size }) => (
          <Icon name="favorite" color={color} size={size} />
        ),
      }}
    />
    <Drawer.Screen 
      name="Wallet" 
      component={WalletScreen}
      options={{
        title: 'Wallet',
        drawerIcon: ({ color, size }) => (
          <Icon name="account-balance-wallet" color={color} size={size} />
        ),
      }}
    />
    <Drawer.Screen 
      name="Notifications" 
      component={NotificationsScreen}
      options={{
        title: 'Notifications',
        drawerIcon: ({ color, size }) => (
          <Icon name="notifications" color={color} size={size} />
        ),
      }}
    />
  </Drawer.Navigator>
);

// Main App Stack Navigator
const AppStack = () => (
  <Stack.Navigator
    initialRouteName="Main"
    screenOptions={{
      ...defaultScreenOptions,
      headerShown: false,
    }}
  >
    <Stack.Screen name="Main" component={DrawerNavigator} />
    
    {/* Modal Screens */}
    <Stack.Group screenOptions={{ presentation: 'modal' }}>
      <Stack.Screen 
        name="Cart" 
        component={CartScreen}
        options={{
          headerShown: true,
          title: 'My Cart',
          headerLeft: () => <BackButton />,
          headerRight: () => <HeaderRight showClear />,
        }}
      />
      <Stack.Screen 
        name="Checkout" 
        component={CheckoutScreen}
        options={{
          headerShown: true,
          title: 'Checkout',
          headerLeft: () => <BackButton />,
        }}
      />
      <Stack.Screen 
        name="Payment" 
        component={PaymentScreen}
        options={{
          headerShown: true,
          title: 'Payment',
          headerLeft: () => <BackButton />,
        }}
      />
    </Stack.Group>
  </Stack.Navigator>
);

// Root Navigator
const RootNavigator = () => {
  const { isAuthenticated, isInitialized } = useSelector(state => state.auth);

  // Show loading screen while checking authentication
  if (!isInitialized) {
    return <LoadingScreen message="Loading..." />;
  }

  // Show auth flow if not authenticated
  if (!isAuthenticated) {
    return <AuthStack />;
  }

  // Show main app if authenticated
  return <AppStack />;
};

export default RootNavigator;