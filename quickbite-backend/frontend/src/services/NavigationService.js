// Navigation service for handling routing, geocoding, and location services

class NavigationService {
  constructor() {
    this.geocoder = null;
    this.placesService = null;
    this.directionsService = null;
    this.isInitialized = false;
  }

  // Initialize Google Maps services
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      await this.loadGoogleMapsAPI();
      this.geocoder = new window.google.maps.Geocoder();
      this.directionsService = new window.google.maps.DirectionsService();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize navigation service:', error);
      throw error;
    }
  }

  // Load Google Maps API
  loadGoogleMapsAPI() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps) {
        resolve(window.google.maps);
        return;
      }

      const script = document.createElement('script');
      const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || 'YOUR_API_KEY_HERE';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry,places`;
      script.async = true;
      script.defer = true;
      
      script.onload = () => resolve(window.google.maps);
      script.onerror = () => reject(new Error('Failed to load Google Maps API'));

      document.head.appendChild(script);
    });
  }

  // Calculate route between two points
  async calculateRoute(origin, destination, options = {}) {
    if (!this.isInitialized) await this.initialize();

    const {
      travelMode = 'DRIVING',
      avoidHighways = false,
      avoidTolls = false,
      optimizeWaypoints = false,
      waypoints = []
    } = options;

    return new Promise((resolve, reject) => {
      const request = {
        origin,
        destination,
        waypoints: waypoints.map(wp => ({ location: wp, stopover: true })),
        optimizeWaypoints,
        travelMode: window.google.maps.TravelMode[travelMode],
        unitSystem: window.google.maps.UnitSystem.METRIC,
        avoidHighways,
        avoidTolls
      };

      this.directionsService.route(request, (result, status) => {
        if (status === 'OK') {
          const route = result.routes[0];
          const leg = route.legs[0];
          
          resolve({
            route: result,
            summary: {
              distance: leg.distance.text,
              duration: leg.duration.text,
              distanceValue: leg.distance.value,
              durationValue: leg.duration.value,
              startAddress: leg.start_address,
              endAddress: leg.end_address
            },
            steps: leg.steps.map(step => ({
              instruction: step.instructions.replace(/<[^>]*>/g, ''),
              distance: step.distance.text,
              duration: step.duration.text,
              startLocation: {
                lat: step.start_location.lat(),
                lng: step.start_location.lng()
              },
              endLocation: {
                lat: step.end_location.lat(),
                lng: step.end_location.lng()
              }
            }))
          });
        } else {
          reject(new Error(`Route calculation failed: ${status}`));
        }
      });
    });
  }

  // Calculate multiple routes (e.g., for delivery optimization)
  async calculateMultipleRoutes(origin, destinations, options = {}) {
    const routes = [];
    
    for (const destination of destinations) {
      try {
        const route = await this.calculateRoute(origin, destination, options);
        routes.push({
          destination,
          ...route
        });
      } catch (error) {
        console.error(`Failed to calculate route to ${destination}:`, error);
        routes.push({
          destination,
          error: error.message
        });
      }
    }

    return routes;
  }

  // Optimize delivery route (Traveling Salesman Problem approximation)
  async optimizeDeliveryRoute(origin, deliveryPoints, returnToOrigin = true) {
    if (!this.isInitialized) await this.initialize();

    const waypoints = deliveryPoints.slice(0, 23); // Google Maps API limit
    const destination = returnToOrigin ? origin : deliveryPoints[deliveryPoints.length - 1];

    try {
      const result = await this.calculateRoute(origin, destination, {
        waypoints,
        optimizeWaypoints: true
      });

      return {
        ...result,
        optimizedOrder: result.route.routes[0].waypoint_order,
        totalDistance: result.summary.distanceValue,
        totalDuration: result.summary.durationValue
      };
    } catch (error) {
      console.error('Route optimization failed:', error);
      throw error;
    }
  }

  // Geocode address to coordinates
  async geocodeAddress(address) {
    if (!this.isInitialized) await this.initialize();

    return new Promise((resolve, reject) => {
      this.geocoder.geocode({ address }, (results, status) => {
        if (status === 'OK' && results.length > 0) {
          const location = results[0].geometry.location;
          resolve({
            lat: location.lat(),
            lng: location.lng(),
            formattedAddress: results[0].formatted_address,
            addressComponents: results[0].address_components,
            placeId: results[0].place_id
          });
        } else {
          reject(new Error(`Geocoding failed: ${status}`));
        }
      });
    });
  }

  // Reverse geocode coordinates to address
  async reverseGeocode(lat, lng) {
    if (!this.isInitialized) await this.initialize();

    return new Promise((resolve, reject) => {
      this.geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === 'OK' && results.length > 0) {
          resolve({
            formattedAddress: results[0].formatted_address,
            addressComponents: results[0].address_components,
            placeId: results[0].place_id
          });
        } else {
          reject(new Error(`Reverse geocoding failed: ${status}`));
        }
      });
    });
  }

  // Find nearby restaurants
  async findNearbyRestaurants(location, radius = 5000, options = {}) {
    if (!this.isInitialized) await this.initialize();

    const {
      type = 'restaurant',
      keyword = '',
      minRating = 0,
      priceLevel = null,
      openNow = false
    } = options;

    // Create a temporary map element for PlacesService
    const mapDiv = document.createElement('div');
    const map = new window.google.maps.Map(mapDiv);
    this.placesService = new window.google.maps.places.PlacesService(map);

    return new Promise((resolve, reject) => {
      const request = {
        location: new window.google.maps.LatLng(location.lat, location.lng),
        radius,
        type,
        keyword,
        openNow
      };

      this.placesService.nearbySearch(request, (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK) {
          const filteredResults = results
            .filter(place => {
              const ratingOk = !minRating || (place.rating && place.rating >= minRating);
              const priceOk = priceLevel === null || place.price_level === priceLevel;
              return ratingOk && priceOk;
            })
            .map(place => ({
              placeId: place.place_id,
              name: place.name,
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
              rating: place.rating,
              priceLevel: place.price_level,
              types: place.types,
              vicinity: place.vicinity,
              openingHours: place.opening_hours,
              photos: place.photos ? place.photos.map(photo => photo.getUrl()) : [],
              icon: place.icon
            }));

          resolve(filteredResults);
        } else {
          reject(new Error(`Places search failed: ${status}`));
        }
      });
    });
  }

  // Calculate distance between two points
  calculateDistance(point1, point2) {
    if (!window.google || !window.google.maps) {
      // Fallback: Haversine formula
      const R = 6371; // Earth's radius in km
      const dLat = this.toRadians(point2.lat - point1.lat);
      const dLng = this.toRadians(point2.lng - point1.lng);
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(this.toRadians(point1.lat)) * Math.cos(this.toRadians(point2.lat)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c * 1000; // Return distance in meters
    }

    // Use Google Maps geometry library for more accurate calculation
    const point1LatLng = new window.google.maps.LatLng(point1.lat, point1.lng);
    const point2LatLng = new window.google.maps.LatLng(point2.lat, point2.lng);
    
    return window.google.maps.geometry.spherical.computeDistanceBetween(
      point1LatLng, 
      point2LatLng
    );
  }

  // Convert degrees to radians
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  // Calculate ETA based on current traffic
  async calculateETA(origin, destination, travelMode = 'DRIVING') {
    try {
      const route = await this.calculateRoute(origin, destination, { travelMode });
      
      // Add traffic buffer for more realistic ETA
      let trafficMultiplier = 1.0;
      const currentHour = new Date().getHours();
      
      // Rush hour traffic adjustments
      if ((currentHour >= 7 && currentHour <= 9) || (currentHour >= 17 && currentHour <= 19)) {
        trafficMultiplier = 1.3; // 30% longer during rush hour
      } else if (currentHour >= 11 && currentHour <= 14) {
        trafficMultiplier = 1.1; // 10% longer during lunch
      }

      const adjustedDuration = Math.round(route.summary.durationValue * trafficMultiplier);
      
      return {
        estimatedTime: adjustedDuration, // in seconds
        estimatedTimeText: this.formatDuration(adjustedDuration),
        distance: route.summary.distanceValue,
        distanceText: route.summary.distance,
        trafficFactor: trafficMultiplier
      };
    } catch (error) {
      console.error('ETA calculation failed:', error);
      throw error;
    }
  }

  // Format duration in seconds to human readable format
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  // Get delivery zones based on restaurant location
  getDeliveryZones(restaurantLocation, maxDeliveryDistance = 5000) {
    const zones = [];
    const center = { lat: restaurantLocation.lat, lng: restaurantLocation.lng };

    // Create concentric circles for different delivery zones
    const zoneRanges = [
      { name: 'Express Zone', range: maxDeliveryDistance * 0.3, fee: 0, color: '#4CAF50' },
      { name: 'Standard Zone', range: maxDeliveryDistance * 0.6, fee: 2, color: '#FF9800' },
      { name: 'Extended Zone', range: maxDeliveryDistance, fee: 5, color: '#F44336' }
    ];

    zoneRanges.forEach(zone => {
      zones.push({
        ...zone,
        center,
        radius: zone.range,
        bounds: this.calculateBounds(center, zone.range)
      });
    });

    return zones;
  }

  // Calculate bounds for a circular area
  calculateBounds(center, radius) {
    const lat = center.lat;
    const lng = center.lng;
    const earthRadius = 6371000; // meters

    const latOffset = (radius / earthRadius) * (180 / Math.PI);
    const lngOffset = (radius / earthRadius) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

    return {
      north: lat + latOffset,
      south: lat - latOffset,
      east: lng + lngOffset,
      west: lng - lngOffset
    };
  }

  // Check if location is within delivery zone
  isWithinDeliveryZone(customerLocation, restaurantLocation, maxDistance = 5000) {
    const distance = this.calculateDistance(customerLocation, restaurantLocation);
    return {
      isWithin: distance <= maxDistance,
      distance,
      distanceText: distance < 1000 ? `${Math.round(distance)}m` : `${(distance / 1000).toFixed(1)}km`
    };
  }
}

// Create and export singleton instance
const navigationService = new NavigationService();
export default navigationService;