import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardMedia,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Button,
  IconButton,
  Slider,
  Switch,
  FormControlLabel,
  Rating,
  Badge,
  Skeleton,
  Alert,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  Autocomplete
} from '@mui/material';
import {
  Search,
  FilterList,
  LocationOn,
  Schedule,
  DeliveryDining,
  Star,
  LocalOffer,
  Refresh,
  Map as MapIcon,
  Restaurant as RestaurantIcon,
  AccessTime
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const RestaurantSearch = () => {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  
  // Search filters
  const [filters, setFilters] = useState({
    search_query: '',
    latitude: null,
    longitude: null,
    radius: 5,
    cuisine_type: '',
    min_rating: 0,
    is_open: true,
    delivery_fee_max: null,
    min_order_max: null,
    sort_by: 'distance'
  });

  const navigate = useNavigate();

  // Cuisine types
  const cuisineTypes = [
    'All Cuisines',
    'North Indian', 
    'South Indian',
    'Chinese',
    'Italian',
    'Mexican',
    'Thai',
    'Continental',
    'Fast Food',
    'Desserts',
    'Beverages'
  ];

  // Sort options
  const sortOptions = [
    { value: 'distance', label: 'Distance' },
    { value: 'rating', label: 'Rating' },
    { value: 'delivery_fee', label: 'Delivery Fee' },
    { value: 'delivery_time', label: 'Delivery Time' },
    { value: 'popularity', label: 'Popularity' }
  ];

  // Get user's location
  const getUserLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ latitude, longitude });
          setFilters(prev => ({ ...prev, latitude, longitude }));
        },
        (error) => {
          console.error('Error getting location:', error);
          // Fallback to default location (Delhi)
          const defaultLocation = { latitude: 28.6139, longitude: 77.2090 };
          setUserLocation(defaultLocation);
          setFilters(prev => ({ ...prev, ...defaultLocation }));
        }
      );
    } else {
      // Fallback location
      const defaultLocation = { latitude: 28.6139, longitude: 77.2090 };
      setUserLocation(defaultLocation);
      setFilters(prev => ({ ...prev, ...defaultLocation }));
    }
  }, []);

  // Search restaurants
  const searchRestaurants = useCallback(async () => {
    if (!filters.latitude || !filters.longitude) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const queryParams = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== null && value !== '' && value !== 0) {
          queryParams.append(key, value);
        }
      });

      const response = await fetch(`/api/catalog/restaurants/search?${queryParams}`);
      const data = await response.json();
      
      if (data.success) {
        setRestaurants(data.data);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to search restaurants');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Handle search input change with debouncing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (filters.search_query !== undefined) {
        searchRestaurants();
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [filters.search_query, searchRestaurants]);

  // Search on filter changes (except search query)
  useEffect(() => {
    searchRestaurants();
  }, [
    filters.latitude, filters.longitude, filters.radius,
    filters.cuisine_type, filters.min_rating, filters.is_open,
    filters.delivery_fee_max, filters.min_order_max, filters.sort_by
  ]);

  // Get location on mount
  useEffect(() => {
    getUserLocation();
  }, [getUserLocation]);

  const formatCurrency = (cents) => {
    return `₹${(cents / 100).toFixed(0)}`;
  };

  const getDistanceText = (distance) => {
    if (!distance) return '';
    return distance < 1 ? `${(distance * 1000).toFixed(0)}m` : `${distance.toFixed(1)}km`;
  };

  const handleRestaurantClick = (restaurant) => {
    navigate(`/restaurant/${restaurant.id}`);
  };

  return (
    <Box p={3}>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h4" gutterBottom>
          Find Restaurants Near You
        </Typography>
        
        {userLocation && (
          <Typography variant="body2" color="text.secondary" display="flex" alignItems="center" gap={1}>
            <LocationOn fontSize="small" />
            Searching within {filters.radius}km of your location
          </Typography>
        )}
      </Box>

      {/* Search Bar */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                placeholder="Search restaurants, cuisines, dishes..."
                value={filters.search_query}
                onChange={(e) => handleFilterChange('search_query', e.target.value)}
                InputProps={{
                  startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={2}>
              <FormControl fullWidth>
                <InputLabel>Cuisine</InputLabel>
                <Select
                  value={filters.cuisine_type}
                  onChange={(e) => handleFilterChange('cuisine_type', e.target.value)}
                  label="Cuisine"
                >
                  {cuisineTypes.map(cuisine => (
                    <MenuItem key={cuisine} value={cuisine === 'All Cuisines' ? '' : cuisine}>
                      {cuisine}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={2}>
              <FormControl fullWidth>
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={filters.sort_by}
                  onChange={(e) => handleFilterChange('sort_by', e.target.value)}
                  label="Sort By"
                >
                  {sortOptions.map(option => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={2}>
              <Box display="flex" gap={1}>
                <Button
                  startIcon={<FilterList />}
                  onClick={() => setShowFilters(!showFilters)}
                  variant={showFilters ? 'contained' : 'outlined'}
                >
                  Filters
                </Button>
                <IconButton onClick={searchRestaurants}>
                  <Refresh />
                </IconButton>
              </Box>
            </Grid>
          </Grid>

          {/* Advanced Filters */}
          {showFilters && (
            <Box mt={3} p={2} bgcolor="background.paper" borderRadius={1} border={1} borderColor="divider">
              <Grid container spacing={3}>
                <Grid item xs={12} md={3}>
                  <Typography gutterBottom>Delivery Radius (km)</Typography>
                  <Slider
                    value={filters.radius}
                    onChange={(e, value) => handleFilterChange('radius', value)}
                    min={1}
                    max={25}
                    marks={[
                      { value: 1, label: '1km' },
                      { value: 5, label: '5km' },
                      { value: 10, label: '10km' },
                      { value: 25, label: '25km' }
                    ]}
                    valueLabelDisplay="auto"
                  />
                </Grid>

                <Grid item xs={12} md={3}>
                  <Typography gutterBottom>Minimum Rating</Typography>
                  <Rating
                    value={filters.min_rating}
                    onChange={(e, value) => handleFilterChange('min_rating', value || 0)}
                    precision={0.5}
                  />
                </Grid>

                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    label="Max Delivery Fee"
                    type="number"
                    value={filters.delivery_fee_max || ''}
                    onChange={(e) => handleFilterChange('delivery_fee_max', e.target.value ? parseInt(e.target.value) * 100 : null)}
                    InputProps={{ startAdornment: '₹' }}
                  />
                </Grid>

                <Grid item xs={12} md={3}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={filters.is_open}
                        onChange={(e) => handleFilterChange('is_open', e.target.checked)}
                      />
                    }
                    label="Open Now Only"
                  />
                </Grid>
              </Grid>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Results */}
      <Grid container spacing={3}>
        {loading ? (
          // Loading skeletons
          Array.from(new Array(6)).map((_, index) => (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <Card>
                <Skeleton variant="rectangular" height={200} />
                <CardContent>
                  <Skeleton variant="text" height={32} />
                  <Skeleton variant="text" height={20} />
                  <Skeleton variant="text" height={20} />
                </CardContent>
              </Card>
            </Grid>
          ))
        ) : restaurants.length === 0 ? (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box textAlign="center" py={4}>
                  <RestaurantIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    No restaurants found
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Try adjusting your search criteria or location
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          restaurants.map((restaurant) => (
            <Grid item xs={12} sm={6} md={4} key={restaurant.id}>
              <Card 
                sx={{ 
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 4
                  }
                }}
                onClick={() => handleRestaurantClick(restaurant)}
              >
                <CardMedia
                  component="img"
                  height="200"
                  image={restaurant.cover_image_url || '/api/placeholder/300/200'}
                  alt={restaurant.name}
                />
                
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                    <Typography variant="h6" component="h3" noWrap sx={{ flexGrow: 1 }}>
                      {restaurant.name}
                    </Typography>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <Star fontSize="small" sx={{ color: 'orange' }} />
                      <Typography variant="body2">
                        {restaurant.avg_rating?.toFixed(1) || '4.0'}
                      </Typography>
                    </Box>
                  </Box>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {restaurant.cuisine_type}
                  </Typography>

                  <Box display="flex" alignItems="center" gap={2} mb={2}>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <AccessTime fontSize="small" sx={{ color: 'text.secondary' }} />
                      <Typography variant="body2" color="text.secondary">
                        {restaurant.estimated_delivery_time_minutes} min
                      </Typography>
                    </Box>
                    
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <DeliveryDining fontSize="small" sx={{ color: 'text.secondary' }} />
                      <Typography variant="body2" color="text.secondary">
                        {formatCurrency(restaurant.delivery_fee_cents)}
                      </Typography>
                    </Box>

                    {restaurant.distance && (
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <LocationOn fontSize="small" sx={{ color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          {getDistanceText(restaurant.distance)}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  <Box display="flex" flex-wrap="wrap" gap={1} mb={2}>
                    {!restaurant.is_open && (
                      <Chip size="small" label="Closed" color="error" />
                    )}
                    
                    {restaurant.features?.includes('live_tracking') && (
                      <Chip size="small" label="Live Tracking" color="primary" />
                    )}
                    
                    {restaurant.features?.includes('contactless_delivery') && (
                      <Chip size="small" label="Contactless" color="success" />
                    )}

                    {restaurant.active_promotions?.length > 0 && (
                      <Badge badgeContent={restaurant.active_promotions.length} color="secondary">
                        <LocalOffer fontSize="small" sx={{ color: 'orange' }} />
                      </Badge>
                    )}
                  </Box>

                  <Typography variant="body2" color="text.secondary">
                    Min order: {formatCurrency(restaurant.min_order_amount_cents)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))
        )}
      </Grid>

      {/* Location FAB */}
      <Fab
        color="primary"
        aria-label="location"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={getUserLocation}
      >
        <LocationOn />
      </Fab>
    </Box>
  );
};

export default RestaurantSearch;