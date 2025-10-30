import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Grid,
  Typography,
  TextField,
  InputAdornment,
  Card,
  CardContent,
  Button,
  Alert,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Search,
  MyLocation,
  Close
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useLocationCtx } from '../context/LocationContext';
import RestaurantFinder from '../components/RestaurantFinder';
import NavigationMap from '../components/NavigationMap';

// Popular food categories
const popularCategories = [
  { id: 1, name: 'Pizza', icon: '🍕', color: '#FF6B6B' },
  { id: 2, name: 'Burgers', icon: '🍔', color: '#4ECDC4' },
  { id: 3, name: 'Indian', icon: '🍛', color: '#45B7D1' },
  { id: 4, name: 'Chinese', icon: '🥢', color: '#FFA07A' },
  { id: 5, name: 'Desserts', icon: '🍰', color: '#98D8C8' },
  { id: 6, name: 'Healthy', icon: '🥗', color: '#81C784' },
  { id: 7, name: 'Coffee', icon: '☕', color: '#D4B483' },
  { id: 8, name: 'Biryani', icon: '🍚', color: '#FFB74D' }
];

const HomePage = () => {
  const { isAuthenticated, user } = useAuth();
  const { location, detect, loading: locationLoading } = useLocationCtx();
  
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);

  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  const handleRestaurantSelect = (restaurant) => {
    setSelectedRestaurant(restaurant);
    setSelectedTab(1); // Switch to map tab
  };

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    setSearchQuery(category.name);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '🌅 Good Morning';
    if (hour < 17) return '☀️ Good Afternoon';
    return '🌙 Good Evening';
  };

  // Request location on component mount
  useEffect(() => {
    if (!location && !locationLoading) {
      detect();
    }
  }, [location, locationLoading, detect]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fafafa' }}>
      {/* Header Section */}
      <Box sx={{ bgcolor: '#fc8019', color: 'white', py: 3 }}>
        <Container maxWidth="lg">
          <Grid container alignItems="center" spacing={3}>
            <Grid item xs={12} md={8}>
              <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
                {isAuthenticated ? `${getGreeting()}, ${user?.name || 'User'}!` : 'Welcome to QuickBite'}
              </Typography>
              <Typography variant="h6" sx={{ opacity: 0.9 }}>
                {location 
                  ? `Delivering to ${location.label || 'your location'}`
                  : 'Discover restaurants near you'
                }
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box display="flex" justifyContent="flex-end" gap={1}>
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<MyLocation />}
                  onClick={() => setShowLocationDialog(true)}
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}
                >
                  {location ? 'Change Location' : 'Set Location'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Main Content */}
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Location Warning */}
        {!location && !locationLoading && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography>
              Please enable location services to find restaurants near you.
            </Typography>
            <Button 
              onClick={detect} 
              variant="contained" 
              size="small" 
              sx={{ mt: 1 }}
              startIcon={<MyLocation />}
            >
              Enable Location
            </Button>
          </Alert>
        )}

        {/* Search Bar */}
        <Box sx={{ mb: 4 }}>
          <TextField
            fullWidth
            placeholder="Search for restaurants, cuisines, or dishes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
              sx: {
                borderRadius: 3,
                bgcolor: 'white',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }
            }}
          />
        </Box>

        {/* Popular Categories */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" sx={{ mb: 3, fontWeight: 'bold' }}>
            What's on your mind?
          </Typography>
          <Grid container spacing={2}>
            {popularCategories.map((category) => (
              <Grid item xs={6} sm={3} md={1.5} key={category.id}>
                <Card 
                  sx={{ 
                    textAlign: 'center', 
                    p: 2,
                    cursor: 'pointer',
                    '&:hover': { 
                      transform: 'translateY(-4px)', 
                      transition: 'all 0.2s',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                    },
                    borderRadius: 3,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    bgcolor: selectedCategory?.id === category.id ? category.color + '20' : 'white',
                    border: selectedCategory?.id === category.id ? `2px solid ${category.color}` : 'none'
                  }}
                  onClick={() => handleCategorySelect(category)}
                >
                  <Typography variant="h3" sx={{ mb: 1 }}>{category.icon}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                    {category.name}
                  </Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Main Content Tabs */}
        <Box sx={{ mb: 3 }}>
          <Tabs 
            value={selectedTab} 
            onChange={handleTabChange}
            sx={{ 
              borderBottom: 1, 
              borderColor: 'divider',
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600
              }
            }}
          >
            <Tab label="🍽️ Restaurants" />
            <Tab label="🗺️ Map View" />
          </Tabs>
        </Box>

        {/* Tab Content */}
        {selectedTab === 0 && (
          <RestaurantFinder 
            onRestaurantSelect={handleRestaurantSelect}
            initialSearchQuery={searchQuery}
            selectedCategory={selectedCategory}
          />
        )}

        {selectedTab === 1 && (
          <Box>
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 'bold' }}>
              Map View
            </Typography>
            <NavigationMap 
              destination={selectedRestaurant ? {
                lat: selectedRestaurant.lat,
                lon: selectedRestaurant.lon
              } : null}
              onRouteCalculated={(routeData) => {
                console.log('Route calculated:', routeData);
              }}
            />
            {selectedRestaurant && (
              <Card sx={{ mt: 3 }}>
                <CardContent>
                  <Typography variant="h6">{selectedRestaurant.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedRestaurant.cuisine} • {selectedRestaurant.address}
                  </Typography>
                </CardContent>
              </Card>
            )}
          </Box>
        )}


      </Container>

      {/* Location Dialog */}
      <Dialog open={showLocationDialog} onClose={() => setShowLocationDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Set Your Location</Typography>
            <Button onClick={() => setShowLocationDialog(false)}>
              <Close />
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box py={2}>
            <Alert severity="info" sx={{ mb: 2 }}>
              We need your location to find restaurants nearby and provide accurate delivery estimates.
            </Alert>
            
            {location ? (
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  Current Location:
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {location.label || `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Accuracy: {location.accuracy ? `${Math.round(location.accuracy)}m` : 'Unknown'}
                </Typography>
              </Box>
            ) : (
              <Typography>No location detected yet.</Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowLocationDialog(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => {
              detect();
              setShowLocationDialog(false);
            }} 
            variant="contained"
            startIcon={<MyLocation />}
          >
            Update Location
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default HomePage;