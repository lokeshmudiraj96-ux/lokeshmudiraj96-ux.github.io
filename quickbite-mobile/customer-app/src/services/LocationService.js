import Geolocation from 'react-native-geolocation-service';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geocoding from 'react-native-geocoding';
import { PERMISSIONS, request, check, RESULTS } from 'react-native-permissions';

// Initialize Geocoding with Google API Key
Geocoding.init(process.env.GOOGLE_MAPS_API_KEY || "AIzaSyBvOkBwGyuuA6UNYuGSUBJXzhKv8nb4mMY");

class LocationService {
  constructor() {
    this.watchId = null;
    this.currentLocation = null;
    this.locationCallbacks = new Set();
    this.permissionStatus = 'unknown';
    
    // Configuration
    this.config = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000, // 1 minute
      distanceFilter: 10, // meters
    };

    // Address cache
    this.addressCache = new Map();
    this.reverseGeocodeCache = new Map();
  }

  // Initialize location service
  async initialize() {
    try {
      console.log('🌍 Initializing Location Service...');
      
      // Check permissions
      await this.checkLocationPermissions();
      
      // Load saved location
      await this.loadSavedLocation();
      
      console.log('✅ Location Service initialized');
      return true;
      
    } catch (error) {
      console.error('❌ Location Service initialization failed:', error);
      throw error;
    }
  }

  // Request location permissions
  async requestPermissions() {
    try {
      console.log('🔐 Requesting location permissions...');
      
      if (Platform.OS === 'android') {
        return await this.requestAndroidPermissions();
      } else {
        return await this.requestIOSPermissions();
      }
      
    } catch (error) {
      console.error('❌ Location permission request failed:', error);
      return false;
    }
  }

  // Android permission handling
  async requestAndroidPermissions() {
    try {
      // Check if permissions are already granted
      const fineLocationGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      
      if (fineLocationGranted) {
        this.permissionStatus = 'granted';
        return true;
      }

      // Request permissions
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'QuickBite needs access to your location to find nearby restaurants and calculate delivery fees.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );

      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('✅ Android location permission granted');
        this.permissionStatus = 'granted';
        return true;
      } else {
        console.log('❌ Android location permission denied');
        this.permissionStatus = 'denied';
        return false;
      }
      
    } catch (error) {
      console.error('❌ Android permission error:', error);
      this.permissionStatus = 'error';
      return false;
    }
  }

  // iOS permission handling  
  async requestIOSPermissions() {
    try {
      const permission = PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;
      
      const result = await request(permission);
      
      switch (result) {
        case RESULTS.GRANTED:
          console.log('✅ iOS location permission granted');
          this.permissionStatus = 'granted';
          return true;
          
        case RESULTS.DENIED:
          console.log('❌ iOS location permission denied');
          this.permissionStatus = 'denied';
          return false;
          
        case RESULTS.BLOCKED:
          console.log('⚠️ iOS location permission blocked');
          this.permissionStatus = 'blocked';
          this.showSettingsAlert();
          return false;
          
        default:
          console.log('❓ iOS location permission unavailable');
          this.permissionStatus = 'unavailable';
          return false;
      }
      
    } catch (error) {
      console.error('❌ iOS permission error:', error);
      this.permissionStatus = 'error';
      return false;
    }
  }

  // Check current permission status
  async checkLocationPermissions() {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        this.permissionStatus = granted ? 'granted' : 'denied';
      } else {
        const result = await check(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        this.permissionStatus = result;
      }
      
      console.log('📍 Location permission status:', this.permissionStatus);
      return this.permissionStatus === 'granted';
      
    } catch (error) {
      console.error('❌ Permission check failed:', error);
      this.permissionStatus = 'error';
      return false;
    }
  }

  // Get current location
  async getCurrentLocation(options = {}) {
    return new Promise((resolve, reject) => {
      const config = { ...this.config, ...options };
      
      console.log('📍 Getting current location...');
      
      Geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp,
          };
          
          this.currentLocation = location;
          this.saveLocation(location);
          
          console.log('✅ Current location obtained:', {
            lat: location.latitude.toFixed(6),
            lng: location.longitude.toFixed(6),
            accuracy: location.accuracy
          });
          
          // Notify callbacks
          this.notifyLocationCallbacks(location);
          
          resolve(location);
        },
        (error) => {
          console.error('❌ Location error:', error);
          
          // Try to use cached location if available
          if (this.currentLocation) {
            console.log('📍 Using cached location');
            resolve(this.currentLocation);
          } else {
            reject(this.handleLocationError(error));
          }
        },
        config
      );
    });
  }

  // Start watching location changes
  startWatchingLocation(callback, options = {}) {
    try {
      if (this.watchId) {
        this.stopWatchingLocation();
      }
      
      console.log('👁️ Starting location watch...');
      
      const config = { ...this.config, ...options };
      
      this.watchId = Geolocation.watchPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp,
          };
          
          this.currentLocation = location;
          this.saveLocation(location);
          
          // Notify callback
          if (callback) callback(location);
          
          // Notify all registered callbacks
          this.notifyLocationCallbacks(location);
        },
        (error) => {
          console.error('❌ Location watch error:', error);
          if (callback) callback(null, this.handleLocationError(error));
        },
        config
      );
      
      return this.watchId;
      
    } catch (error) {
      console.error('❌ Failed to start location watch:', error);
      throw error;
    }
  }

  // Stop watching location
  stopWatchingLocation() {
    if (this.watchId) {
      console.log('🛑 Stopping location watch...');
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  // Register callback for location updates
  registerLocationCallback(callback) {
    this.locationCallbacks.add(callback);
    
    // Immediately call with current location if available
    if (this.currentLocation) {
      callback(this.currentLocation);
    }
    
    return () => {
      this.locationCallbacks.delete(callback);
    };
  }

  // Notify all registered callbacks
  notifyLocationCallbacks(location) {
    this.locationCallbacks.forEach(callback => {
      try {
        callback(location);
      } catch (error) {
        console.error('❌ Location callback error:', error);
      }
    });
  }

  // Reverse geocoding - get address from coordinates
  async getAddressFromCoordinates(latitude, longitude) {
    try {
      const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
      
      // Check cache first
      if (this.reverseGeocodeCache.has(cacheKey)) {
        console.log('📍 Using cached reverse geocoding result');
        return this.reverseGeocodeCache.get(cacheKey);
      }
      
      console.log('🔍 Reverse geocoding coordinates...');
      
      const response = await Geocoding.from({
        latitude,
        longitude
      });
      
      if (response.results && response.results.length > 0) {
        const result = response.results[0];
        
        const address = {
          fullAddress: result.formatted_address,
          street: this.extractAddressComponent(result, 'route'),
          streetNumber: this.extractAddressComponent(result, 'street_number'),
          locality: this.extractAddressComponent(result, 'locality'),
          subLocality: this.extractAddressComponent(result, 'sublocality'),
          city: this.extractAddressComponent(result, 'administrative_area_level_2'),
          state: this.extractAddressComponent(result, 'administrative_area_level_1'),
          country: this.extractAddressComponent(result, 'country'),
          postalCode: this.extractAddressComponent(result, 'postal_code'),
          placeId: result.place_id,
          latitude,
          longitude,
        };
        
        // Cache the result
        this.reverseGeocodeCache.set(cacheKey, address);
        
        console.log('✅ Reverse geocoding successful');
        return address;
      } else {
        throw new Error('No address found for coordinates');
      }
      
    } catch (error) {
      console.error('❌ Reverse geocoding failed:', error);
      
      // Return basic address with coordinates
      return {
        fullAddress: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        latitude,
        longitude,
        error: error.message
      };
    }
  }

  // Forward geocoding - get coordinates from address
  async getCoordinatesFromAddress(address) {
    try {
      // Check cache first
      const cacheKey = address.toLowerCase().trim();
      if (this.addressCache.has(cacheKey)) {
        console.log('📍 Using cached geocoding result');
        return this.addressCache.get(cacheKey);
      }
      
      console.log('🔍 Geocoding address:', address);
      
      const response = await Geocoding.from(address);
      
      if (response.results && response.results.length > 0) {
        const result = response.results[0];
        const location = result.geometry.location;
        
        const coordinates = {
          latitude: location.lat,
          longitude: location.lng,
          fullAddress: result.formatted_address,
          placeId: result.place_id,
          addressComponents: result.address_components,
        };
        
        // Cache the result
        this.addressCache.set(cacheKey, coordinates);
        
        console.log('✅ Geocoding successful');
        return coordinates;
      } else {
        throw new Error('No coordinates found for address');
      }
      
    } catch (error) {
      console.error('❌ Geocoding failed:', error);
      throw error;
    }
  }

  // Calculate distance between two points
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers
    
    return distance;
  }

  // Convert degrees to radians
  deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  // Find nearby locations within radius
  findNearbyLocations(locations, centerLat, centerLng, radiusKm = 10) {
    return locations
      .map(location => ({
        ...location,
        distance: this.calculateDistance(
          centerLat,
          centerLng,
          location.latitude,
          location.longitude
        )
      }))
      .filter(location => location.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
  }

  // Save location to storage
  async saveLocation(location) {
    try {
      await AsyncStorage.setItem('last_known_location', JSON.stringify({
        ...location,
        savedAt: Date.now()
      }));
    } catch (error) {
      console.error('❌ Failed to save location:', error);
    }
  }

  // Load saved location from storage
  async loadSavedLocation() {
    try {
      const savedLocation = await AsyncStorage.getItem('last_known_location');
      if (savedLocation) {
        const location = JSON.parse(savedLocation);
        
        // Check if location is not too old (1 hour)
        const maxAge = 60 * 60 * 1000; // 1 hour
        if (Date.now() - location.savedAt < maxAge) {
          this.currentLocation = location;
          console.log('📍 Loaded saved location:', {
            lat: location.latitude.toFixed(6),
            lng: location.longitude.toFixed(6),
            age: Math.round((Date.now() - location.savedAt) / 1000 / 60) + ' minutes'
          });
        }
      }
    } catch (error) {
      console.error('❌ Failed to load saved location:', error);
    }
  }

  // Update current location
  async updateLocation() {
    try {
      if (this.permissionStatus !== 'granted') {
        const hasPermission = await this.requestPermissions();
        if (!hasPermission) return null;
      }
      
      return await this.getCurrentLocation();
    } catch (error) {
      console.error('❌ Failed to update location:', error);
      return null;
    }
  }

  // Handle location errors
  handleLocationError(error) {
    const errorMessages = {
      1: 'Location access denied by user',
      2: 'Location service unavailable',
      3: 'Location request timed out',
      4: 'Location service disabled',
      5: 'Location service not available',
    };
    
    const message = errorMessages[error.code] || `Location error: ${error.message}`;
    
    console.error('📍 Location error:', {
      code: error.code,
      message: message
    });
    
    return {
      code: error.code,
      message: message,
      originalError: error
    };
  }

  // Extract address component from Google response
  extractAddressComponent(result, type) {
    const component = result.address_components.find(
      comp => comp.types.includes(type)
    );
    return component ? component.long_name : '';
  }

  // Show settings alert for blocked permissions
  showSettingsAlert() {
    Alert.alert(
      'Location Permission Required',
      'QuickBite needs location access to find nearby restaurants. Please enable location permission in device settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Open Settings', 
          onPress: () => {
            if (Platform.OS === 'ios') {
              Linking.openURL('app-settings:');
            } else {
              Linking.openSettings();
            }
          }
        },
      ]
    );
  }

  // Get permission status
  getPermissionStatus() {
    return this.permissionStatus;
  }

  // Get current location (cached)
  getCachedLocation() {
    return this.currentLocation;
  }

  // Cleanup
  cleanup() {
    console.log('🧹 Cleaning up Location Service...');
    
    this.stopWatchingLocation();
    this.locationCallbacks.clear();
    this.addressCache.clear();
    this.reverseGeocodeCache.clear();
    this.currentLocation = null;
  }
}

export default LocationService;