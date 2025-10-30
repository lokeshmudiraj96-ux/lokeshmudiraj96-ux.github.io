import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Button,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  Alert,
  CircularProgress,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import {
  Search,
  FilterList,
  LocationOn,
  Star,
  AccessTime,
  DirectionsCar,
  Close,
  Restaurant
} from '@mui/icons-material';
import NavigationMap from './NavigationMap';
import navigationService from '../services/NavigationService';
import { useLocationCtx } from '../context/LocationContext';

const RestaurantFinder = ({ onRestaurantSelect }) => {
  const { location, detect, loading: locationLoading } = useLocationCtx();
  
  const [restaurants, setRestaurants] = useState([]);
  const [filteredRestaurants, setFilteredRestaurants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  
  // Filter states
  const [filters, setFilters] = useState({
    radius: 5000, // 5km default
    minRating: 0,
    priceLevel: null,
    cuisine: '',
    openNow: false,
    deliveryTime: 60, // max delivery time in minutes
    sortBy: 'distance'
  });

  const cuisineTypes = [
    'Indian', 'Chinese', 'Italian', 'Mexican', 'Thai', 'Japanese', 
    'American', 'Mediterranean', 'Korean', 'Vietnamese', 'Continental'
  ];

  // Find nearby restaurants using Google Places API
  const findRestaurants = useCallback(async () => {
    if (!location) {
      setError('Location not available. Please enable location services.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nearbyRestaurants = await navigationService.findNearbyRestaurants(
        location, 
        filters.radius, 
        {
          keyword: searchQuery,
          minRating: filters.minRating,
          priceLevel: filters.priceLevel,
          openNow: filters.openNow,
          type: 'restaurant'
        }
      );

      // Calculate distances and sort
      const restaurantsWithDistance = nearbyRestaurants.map(restaurant => {
        const distance = navigationService.calculateDistance(
          location.lat,
          location.lon,
          restaurant.lat,
          restaurant.lon
        );
        
        return {
          ...restaurant,
          distance: distance,
          distanceText: distance < 1000 ? `${Math.round(distance)} m` : `${(distance/1000).toFixed(1)} km`
        };
      });

      // Sort based on selected criteria
      const sortedRestaurants = sortRestaurants(restaurantsWithDistance);
      
      setRestaurants(sortedRestaurants);
      setFilteredRestaurants(sortedRestaurants);
      
    } catch (error) {
      console.error('Error finding restaurants:', error);
      setError('Failed to find nearby restaurants. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [location, filters, searchQuery]);

  // Sort restaurants based on criteria
  const sortRestaurants = useCallback((restaurantList) => {
    const sorted = [...restaurantList];
    
    switch (filters.sortBy) {
      case 'rating':
        return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      case 'deliveryTime':
        return sorted.sort((a, b) => (a.deliveryTime || 60) - (b.deliveryTime || 60));
      case 'priceLevel':
        return sorted.sort((a, b) => (a.priceLevel || 0) - (b.priceLevel || 0));
      case 'distance':
      default:
        return sorted.sort((a, b) => a.distance - b.distance);
    }
  }, [filters.sortBy]);

  // Apply filters to restaurant list
  const applyFilters = useCallback(() => {
    let filtered = restaurants.filter(restaurant => {
      // Rating filter
      if (filters.minRating > 0 && (restaurant.rating || 0) < filters.minRating) {
        return false;
      }
      
      // Price level filter
      if (filters.priceLevel !== null && restaurant.priceLevel !== filters.priceLevel) {
        return false;
      }
      
      // Cuisine filter
      if (filters.cuisine && restaurant.cuisine !== filters.cuisine) {
        return false;
      }
      
      // Open now filter
      if (filters.openNow && !restaurant.isOpen) {
        return false;
      }
      
      // Delivery time filter
      if (filters.deliveryTime < 60 && (restaurant.deliveryTime || 60) > filters.deliveryTime) {
        return false;
      }
      
      // Distance filter
      if (restaurant.distance > filters.radius) {
        return false;
      }
      
      return true;
    });

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(restaurant => 
        restaurant.name.toLowerCase().includes(query) ||
        restaurant.cuisine?.toLowerCase().includes(query) ||
        restaurant.address?.toLowerCase().includes(query)
      );
    }

    setFilteredRestaurants(sortRestaurants(filtered));
  }, [restaurants, filters, searchQuery, sortRestaurants]);

  // Handle restaurant selection
  const handleRestaurantSelect = (restaurant) => {
    setSelectedRestaurant(restaurant);
    if (onRestaurantSelect) {
      onRestaurantSelect(restaurant);
    }
  };

  // Handle filter changes
  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  // Reset filters
  const resetFilters = () => {
    setFilters({
      radius: 5000,
      minRating: 0,
      priceLevel: null,
      cuisine: '',
      openNow: false,
      deliveryTime: 60,
      sortBy: 'distance'
    });
    setSearchQuery('');
  };

  // Get location on component mount
  useEffect(() => {
    if (!location && !locationLoading) {
      detect();
    }
  }, [location, locationLoading, detect]);

  // Find restaurants when location is available
  useEffect(() => {
    if (location) {
      findRestaurants();
    }
  }, [location, findRestaurants]);

  // Apply filters when they change
  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  // Render price level
  const renderPriceLevel = (level) => {
    if (!level) return 'N/A';
    return '₹'.repeat(level) + '₹'.repeat(4 - level).replace(/₹/g, '○');
  };

  // Show location loading state
  if (!location && locationLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <Box textAlign="center">
          <CircularProgress sx={{ mb: 2 }} />
          <Typography>Getting your location...</Typography>
          <Button onClick={detect} sx={{ mt: 2 }}>
            Retry
          </Button>
        </Box>
      </Box>
    );
  }

  // Show location error
  if (!location && !locationLoading) {
    return (
      <Box p={2}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Location access is required to find nearby restaurants.
        </Alert>
        <Button onClick={detect} variant="contained" fullWidth>
          Enable Location
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Search and Filter Bar */}
      <Box mb={3}>
        <Box display="flex" gap={1} mb={2}>
          <TextField
            fullWidth
            placeholder="Search restaurants, cuisines..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              )
            }}
          />
          <IconButton 
            onClick={() => setShowFilters(true)}
            sx={{ border: '1px solid', borderColor: 'divider' }}
          >
            <FilterList />
          </IconButton>
          <Button
            variant={showMap ? "contained" : "outlined"}
            onClick={() => setShowMap(!showMap)}
            startIcon={<LocationOn />}
          >
            Map
          </Button>
        </Box>

        {/* Active Filters */}
        <Box display="flex" gap={1} flexWrap="wrap">
          {filters.minRating > 0 && (
            <Chip
              label={`${filters.minRating}+ Rating`}
              onDelete={() => handleFilterChange('minRating', 0)}
              size="small"
            />
          )}
          {filters.cuisine && (
            <Chip
              label={filters.cuisine}
              onDelete={() => handleFilterChange('cuisine', '')}
              size="small"
            />
          )}
          {filters.openNow && (
            <Chip
              label="Open Now"
              onDelete={() => handleFilterChange('openNow', false)}
              size="small"
            />
          )}
          {filters.priceLevel !== null && (
            <Chip
              label={renderPriceLevel(filters.priceLevel)}
              onDelete={() => handleFilterChange('priceLevel', null)}
              size="small"
            />
          )}
        </Box>
      </Box>

      {/* Map View */}
      {showMap && (
        <Box mb={3}>
          <NavigationMap 
            restaurants={filteredRestaurants}
            destination={selectedRestaurant ? {
              lat: selectedRestaurant.lat,
              lon: selectedRestaurant.lon
            } : null}
            onRouteCalculated={(routeData) => {
              console.log('Route calculated:', routeData);
            }}
          />
        </Box>
      )}

      {/* Loading State */}
      {loading && (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      )}

      {/* Error State */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
          <Button onClick={findRestaurants} sx={{ ml: 2 }}>
            Retry
          </Button>
        </Alert>
      )}

      {/* Results Summary */}
      {!loading && (
        <Box mb={2}>
          <Typography variant="body2" color="text.secondary">
            Found {filteredRestaurants.length} restaurants
            {searchQuery && ` for "${searchQuery}"`}
            {location && ` near your location`}
          </Typography>
        </Box>
      )}

      {/* Restaurant Cards */}
      <Grid container spacing={2}>
        {filteredRestaurants.map((restaurant) => (
          <Grid item xs={12} key={restaurant.id}>
            <Card 
              sx={{ 
                cursor: 'pointer',
                '&:hover': { boxShadow: 4 },
                border: selectedRestaurant?.id === restaurant.id ? 2 : 0,
                borderColor: selectedRestaurant?.id === restaurant.id ? 'primary.main' : 'transparent'
              }}
              onClick={() => handleRestaurantSelect(restaurant)}
            >
              <Box display="flex">
                <CardMedia
                  component="img"
                  sx={{ width: 120, height: 120 }}
                  image={restaurant.image || `https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=300&h=200&fit=crop`}
                  alt={restaurant.name}
                />
                <CardContent sx={{ flex: 1 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={1}>
                    <Typography variant="h6" component="h3">
                      {restaurant.name}
                    </Typography>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <Star sx={{ fontSize: 16, color: 'orange' }} />
                      <Typography variant="body2">
                        {restaurant.rating?.toFixed(1) || 'N/A'}
                      </Typography>
                    </Box>
                  </Box>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {restaurant.cuisine} • {renderPriceLevel(restaurant.priceLevel)}
                  </Typography>

                  <Box display="flex" alignItems="center" gap={2} mb={1}>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <AccessTime sx={{ fontSize: 16 }} />
                      <Typography variant="body2">
                        {restaurant.deliveryTime || 30} min
                      </Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <DirectionsCar sx={{ fontSize: 16 }} />
                      <Typography variant="body2">
                        {restaurant.distanceText}
                      </Typography>
                    </Box>
                  </Box>

                  <Typography variant="body2" color="text.secondary">
                    {restaurant.address}
                  </Typography>

                  {restaurant.specialOffers?.length > 0 && (
                    <Box mt={1}>
                      {restaurant.specialOffers.slice(0, 2).map((offer, index) => (
                        <Chip
                          key={index}
                          label={offer}
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ mr: 1, mb: 0.5 }}
                        />
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* No Results */}
      {!loading && filteredRestaurants.length === 0 && (
        <Box textAlign="center" py={4}>
          <Restaurant sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            No restaurants found
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Try adjusting your search or filters
          </Typography>
          <Button onClick={resetFilters}>
            Clear Filters
          </Button>
        </Box>
      )}

      {/* Filter Dialog */}
      <Dialog open={showFilters} onClose={() => setShowFilters(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            Filters
            <IconButton onClick={() => setShowFilters(false)}>
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box py={2}>
            {/* Sort By */}
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>Sort By</InputLabel>
              <Select
                value={filters.sortBy}
                label="Sort By"
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
              >
                <MenuItem value="distance">Distance</MenuItem>
                <MenuItem value="rating">Rating</MenuItem>
                <MenuItem value="deliveryTime">Delivery Time</MenuItem>
                <MenuItem value="priceLevel">Price</MenuItem>
              </Select>
            </FormControl>

            {/* Distance Radius */}
            <Typography gutterBottom>
              Distance: {(filters.radius / 1000).toFixed(1)} km
            </Typography>
            <Slider
              value={filters.radius}
              onChange={(e, value) => handleFilterChange('radius', value)}
              min={500}
              max={10000}
              step={500}
              sx={{ mb: 3 }}
            />

            {/* Minimum Rating */}
            <Typography gutterBottom>
              Minimum Rating: {filters.minRating > 0 ? `${filters.minRating}+` : 'Any'}
            </Typography>
            <Slider
              value={filters.minRating}
              onChange={(e, value) => handleFilterChange('minRating', value)}
              min={0}
              max={5}
              step={0.5}
              sx={{ mb: 3 }}
            />

            {/* Cuisine Type */}
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>Cuisine</InputLabel>
              <Select
                value={filters.cuisine}
                label="Cuisine"
                onChange={(e) => handleFilterChange('cuisine', e.target.value)}
              >
                <MenuItem value="">Any</MenuItem>
                {cuisineTypes.map((cuisine) => (
                  <MenuItem key={cuisine} value={cuisine}>{cuisine}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Price Level */}
            <Typography gutterBottom>Price Range</Typography>
            <ToggleButtonGroup
              value={filters.priceLevel}
              exclusive
              onChange={(e, value) => handleFilterChange('priceLevel', value)}
              sx={{ mb: 3 }}
            >
              <ToggleButton value={null}>Any</ToggleButton>
              <ToggleButton value={1}>₹</ToggleButton>
              <ToggleButton value={2}>₹₹</ToggleButton>
              <ToggleButton value={3}>₹₹₹</ToggleButton>
              <ToggleButton value={4}>₹₹₹₹</ToggleButton>
            </ToggleButtonGroup>

            {/* Max Delivery Time */}
            <Typography gutterBottom>
              Max Delivery Time: {filters.deliveryTime} min
            </Typography>
            <Slider
              value={filters.deliveryTime}
              onChange={(e, value) => handleFilterChange('deliveryTime', value)}
              min={15}
              max={90}
              step={15}
              sx={{ mb: 3 }}
            />

            {/* Open Now Toggle */}
            <ToggleButton
              value={filters.openNow}
              selected={filters.openNow}
              onChange={(e, value) => handleFilterChange('openNow', !filters.openNow)}
              fullWidth
              sx={{ mb: 3 }}
            >
              Open Now Only
            </ToggleButton>

            {/* Action Buttons */}
            <Box display="flex" gap={2}>
              <Button onClick={resetFilters} variant="outlined" fullWidth>
                Reset
              </Button>
              <Button 
                onClick={() => setShowFilters(false)} 
                variant="contained" 
                fullWidth
              >
                Apply Filters
              </Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default RestaurantFinder;