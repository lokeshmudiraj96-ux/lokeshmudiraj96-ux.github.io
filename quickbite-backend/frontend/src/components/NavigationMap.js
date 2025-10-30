import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  Button, 
  Chip, 
  Alert,
  CircularProgress,
  Fab
} from '@mui/material';
import {
  MyLocation,
  DirectionsWalk,
  DirectionsCar,
  DirectionsBike,
  Navigation,
  Refresh
} from '@mui/icons-material';
import { useLocationCtx } from '../context/LocationContext';

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

const NavigationMap = ({ 
  destination, 
  restaurants = [], 
  deliveryAgent = null,
  onRouteCalculated,
  showTrafficLayer = true,
  enableRealTimeTracking = false 
}) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const markersRef = useRef([]);

  const { location, detect, loading: locationLoading, isLocationAccurate, isLocationRecent } = useLocationCtx();

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [travelMode, setTravelMode] = useState('DRIVING');
  const [routeInfo, setRouteInfo] = useState(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [mapError, setMapError] = useState(null);

  // Load Google Maps API
  const loadGoogleMapsAPI = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps) {
        resolve(window.google.maps);
        return;
      }

      if (!GOOGLE_MAPS_API_KEY) {
        reject(new Error('Google Maps API key not configured'));
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=geometry,places`;
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        if (window.google && window.google.maps) {
          resolve(window.google.maps);
        } else {
          reject(new Error('Google Maps API failed to load'));
        }
      };
      
      script.onerror = () => {
        reject(new Error('Failed to load Google Maps API'));
      };

      document.head.appendChild(script);
    });
  }, []);

  // Add current location marker
  const addCurrentLocationMarker = useCallback(() => {
    if (!mapInstanceRef.current || !location || !window.google) return;

    const marker = new window.google.maps.Marker({
      position: { lat: location.lat, lng: location.lon },
      map: mapInstanceRef.current,
      title: 'Your Location',
      icon: {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="8" fill="#2196F3" stroke="white" stroke-width="3"/>
            <circle cx="12" cy="12" r="3" fill="white"/>
          </svg>
        `),
        scaledSize: new window.google.maps.Size(24, 24),
        anchor: new window.google.maps.Point(12, 12)
      }
    });

    markersRef.current.push(marker);

    // Add accuracy circle
    if (location.accuracy) {
      const accuracyCircle = new window.google.maps.Circle({
        strokeColor: '#2196F3',
        strokeOpacity: 0.3,
        strokeWeight: 1,
        fillColor: '#2196F3',
        fillOpacity: 0.1,
        map: mapInstanceRef.current,
        center: { lat: location.lat, lng: location.lon },
        radius: location.accuracy
      });

      markersRef.current.push(accuracyCircle);
    }
  }, [location]);

  // Add restaurant markers
  const addRestaurantMarkers = useCallback(() => {
    if (!mapInstanceRef.current || !window.google) return;

    restaurants.forEach((restaurant) => {
      const marker = new window.google.maps.Marker({
        position: { lat: restaurant.lat, lng: restaurant.lon },
        map: mapInstanceRef.current,
        title: restaurant.name,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2Z" fill="#FC8019"/>
              <circle cx="12" cy="9" r="3" fill="white"/>
              <path d="M12 6L13 8H15L13.5 9.5L14 11L12 10L10 11L10.5 9.5L9 8H11L12 6Z" fill="#FC8019"/>
            </svg>
          `),
          scaledSize: new window.google.maps.Size(32, 32),
          anchor: new window.google.maps.Point(16, 32)
        }
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="padding: 8px; font-family: Arial, sans-serif;">
            <h4 style="margin: 0 0 4px 0; color: #333;">${restaurant.name}</h4>
            <p style="margin: 0; color: #666; font-size: 14px;">${restaurant.address || 'Restaurant Location'}</p>
            ${restaurant.rating ? `<p style="margin: 4px 0 0 0; font-size: 14px;">⭐ ${restaurant.rating}/5</p>` : ''}
          </div>
        `
      });

      marker.addListener('click', () => {
        infoWindow.open(mapInstanceRef.current, marker);
      });

      markersRef.current.push(marker);
    });
  }, [restaurants]);

  // Add delivery agent marker
  const addDeliveryAgentMarker = useCallback(() => {
    if (!mapInstanceRef.current || !deliveryAgent || !window.google) return;

    const marker = new window.google.maps.Marker({
      position: { lat: deliveryAgent.lat, lng: deliveryAgent.lon },
      map: mapInstanceRef.current,
      title: `Delivery Agent: ${deliveryAgent.name}`,
      icon: {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2Z" fill="#4CAF50"/>
            <circle cx="12" cy="9" r="3" fill="white"/>
            <path d="M12 6.5L13.5 8.5H15.5L14 10L14.5 11.5L12 10.5L9.5 11.5L10 10L8.5 8.5H10.5L12 6.5Z" fill="#4CAF50"/>
          </svg>
        `),
        scaledSize: new window.google.maps.Size(32, 32),
        anchor: new window.google.maps.Point(16, 32)
      }
    });

    markersRef.current.push(marker);
  }, [deliveryAgent]);

  // Initialize Google Maps
  const initializeMap = useCallback(async () => {
    try {
      const googleMaps = await loadGoogleMapsAPI();
      
      if (!mapRef.current || !location) return;

      const mapOptions = {
        center: { lat: location.lat, lng: location.lon },
        zoom: 15,
        mapTypeId: googleMaps.MapTypeId.ROADMAP,
        zoomControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        mapTypeControl: false,
        gestureHandling: 'greedy'
      };

      mapInstanceRef.current = new googleMaps.Map(mapRef.current, mapOptions);
      directionsServiceRef.current = new googleMaps.DirectionsService();
      directionsRendererRef.current = new googleMaps.DirectionsRenderer({
        suppressMarkers: false,
        polylineOptions: {
          strokeColor: '#FC8019',
          strokeWeight: 6,
          strokeOpacity: 0.8
        }
      });

      directionsRendererRef.current.setMap(mapInstanceRef.current);

      // Add traffic layer if enabled
      if (showTrafficLayer) {
        const trafficLayer = new googleMaps.TrafficLayer();
        trafficLayer.setMap(mapInstanceRef.current);
      }

      setIsMapLoaded(true);
      setMapError(null);

      // Add current location marker
      addCurrentLocationMarker();

      // Add restaurant markers
      if (restaurants.length > 0) {
        addRestaurantMarkers();
      }

      // Add delivery agent marker if available
      if (deliveryAgent) {
        addDeliveryAgentMarker();
      }

    } catch (error) {
      console.error('Failed to initialize map:', error);
      setMapError(error.message);
    }
  }, [location, restaurants, deliveryAgent, showTrafficLayer, loadGoogleMapsAPI, addCurrentLocationMarker, addRestaurantMarkers, addDeliveryAgentMarker]);

  // Calculate route
  const calculateRoute = useCallback(async () => {
    if (!directionsServiceRef.current || !location || !destination) return;

    setIsCalculatingRoute(true);
    
    try {
      const request = {
        origin: { lat: location.lat, lng: location.lon },
        destination: { lat: destination.lat, lng: destination.lon },
        travelMode: window.google.maps.TravelMode[travelMode],
        unitSystem: window.google.maps.UnitSystem.METRIC,
        avoidHighways: false,
        avoidTolls: false
      };

      const result = await new Promise((resolve, reject) => {
        directionsServiceRef.current.route(request, (result, status) => {
          if (status === 'OK') {
            resolve(result);
          } else {
            reject(new Error(`Directions request failed: ${status}`));
          }
        });
      });

      directionsRendererRef.current.setDirections(result);

      const route = result.routes[0];
      const leg = route.legs[0];

      const routeData = {
        distance: leg.distance.text,
        duration: leg.duration.text,
        distanceValue: leg.distance.value,
        durationValue: leg.duration.value,
        startAddress: leg.start_address,
        endAddress: leg.end_address
      };

      setRouteInfo(routeData);
      
      if (onRouteCalculated) {
        onRouteCalculated(routeData);
      }

    } catch (error) {
      console.error('Route calculation failed:', error);
      setMapError('Failed to calculate route. Please try again.');
    } finally {
      setIsCalculatingRoute(false);
    }
  }, [location, destination, travelMode, onRouteCalculated]);

  // Clear markers
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(marker => {
      if (marker.setMap) {
        marker.setMap(null);
      }
    });
    markersRef.current = [];
  }, []);

  // Refresh current location
  const refreshLocation = useCallback(async () => {
    await detect();
  }, [detect]);

  // Initialize map when location is available
  useEffect(() => {
    if (location && !isMapLoaded && GOOGLE_MAPS_API_KEY) {
      initializeMap();
    }
  }, [location, isMapLoaded, initializeMap]);

  // Calculate route when destination changes
  useEffect(() => {
    if (isMapLoaded && destination) {
      calculateRoute();
    }
  }, [isMapLoaded, destination, calculateRoute]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearMarkers();
    };
  }, [clearMarkers]);

  // Show error if no API key
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <Card>
        <CardContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="h6" gutterBottom>Maps Configuration Required</Typography>
            <Typography variant="body2">
              To enable maps functionality, please configure your Google Maps API key in the environment variables.
            </Typography>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (mapError) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            {mapError}
          </Alert>
          <Button onClick={() => window.location.reload()} variant="contained">
            Reload Page
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!location) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="center" minHeight="300px">
            <Box textAlign="center">
              <CircularProgress sx={{ mb: 2 }} />
              <Typography>Getting your location...</Typography>
              <Button 
                onClick={refreshLocation} 
                startIcon={<MyLocation />}
                sx={{ mt: 2 }}
              >
                Enable Location
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box>
      {/* Map Container */}
      <Box position="relative" height="400px" width="100%" borderRadius={2} overflow="hidden">
        <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
        
        {/* Map Controls */}
        <Box position="absolute" top={16} right={16} display="flex" flexDirection="column" gap={1}>
          <Fab 
            size="small" 
            onClick={refreshLocation} 
            disabled={locationLoading}
            sx={{ bgcolor: 'background.paper' }}
          >
            {locationLoading ? <CircularProgress size={20} /> : <Refresh />}
          </Fab>
        </Box>

        {/* Travel Mode Controls */}
        <Box position="absolute" bottom={16} left={16} display="flex" gap={1}>
          {[
            { mode: 'WALKING', icon: <DirectionsWalk />, label: 'Walk' },
            { mode: 'DRIVING', icon: <DirectionsCar />, label: 'Drive' },
            { mode: 'BICYCLING', icon: <DirectionsBike />, label: 'Bike' }
          ].map(({ mode, icon, label }) => (
            <Chip
              key={mode}
              icon={icon}
              label={label}
              onClick={() => setTravelMode(mode)}
              color={travelMode === mode ? "primary" : "default"}
              variant={travelMode === mode ? "filled" : "outlined"}
              sx={{ bgcolor: 'background.paper' }}
            />
          ))}
        </Box>
      </Box>

      {/* Route Information */}
      {routeInfo && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="h6">Route Information</Typography>
              {isCalculatingRoute && <CircularProgress size={20} />}
            </Box>
            
            <Box display="flex" gap={2} mb={2}>
              <Chip icon={<DirectionsCar />} label={`${routeInfo.distance}`} />
              <Chip icon={<Navigation />} label={`${routeInfo.duration}`} />
            </Box>

            <Typography variant="body2" color="text.secondary">
              From: {routeInfo.startAddress}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              To: {routeInfo.endAddress}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Location Accuracy Info */}
      {location && (
        <Box mt={1}>
          <Chip 
            size="small"
            label={`Accuracy: ${location.accuracy ? `${Math.round(location.accuracy)}m` : 'Unknown'}`}
            color={isLocationAccurate(50) ? "success" : "warning"}
          />
          {!isLocationRecent() && (
            <Chip 
              size="small"
              label="Location may be outdated"
              color="warning"
              sx={{ ml: 1 }}
            />
          )}
        </Box>
      )}
    </Box>
  );
};

export default NavigationMap;