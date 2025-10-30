import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  LinearProgress,
  Alert,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Avatar,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Restaurant,
  LocalShipping,
  CheckCircle,
  Phone,
  Message,
  Refresh,
  Navigation,
  AccessTime,
  LocationOn
} from '@mui/icons-material';
import NavigationMap from './NavigationMap';
import navigationService from '../services/NavigationService';
import { useLocationCtx } from '../context/LocationContext';

const DeliveryTracker = ({ orderId, orderData, onStatusUpdate }) => {
  const { location } = useLocationCtx();
  const [deliveryStatus, setDeliveryStatus] = useState('preparing');
  const [deliveryAgent, setDeliveryAgent] = useState(null);
  const [estimatedTime, setEstimatedTime] = useState(null);
  const [actualRoute, setActualRoute] = useState(null);
  const [showFullMap, setShowFullMap] = useState(false);
  const [trackingError, setTrackingError] = useState(null);

  // Delivery status steps
  const deliverySteps = [
    {
      label: 'Order Confirmed',
      description: 'Restaurant is preparing your order',
      status: 'confirmed',
      icon: <Restaurant />
    },
    {
      label: 'Being Prepared',
      description: 'Your food is being cooked',
      status: 'preparing',
      icon: <Restaurant />
    },
    {
      label: 'Ready for Pickup',
      description: 'Order is ready, waiting for delivery agent',
      status: 'ready',
      icon: <CheckCircle />
    },
    {
      label: 'Out for Delivery',
      description: 'Delivery agent is on the way',
      status: 'in_transit',
      icon: <LocalShipping />
    },
    {
      label: 'Delivered',
      description: 'Order has been delivered',
      status: 'delivered',
      icon: <CheckCircle />
    }
  ];

  const getCurrentStepIndex = () => {
    return deliverySteps.findIndex(step => step.status === deliveryStatus);
  };

  // Simulate delivery status updates (replace with real API calls)
  const simulateDeliveryProgress = useCallback(() => {
    const statusProgression = ['confirmed', 'preparing', 'ready', 'in_transit', 'delivered'];
    let currentIndex = statusProgression.indexOf(deliveryStatus);

    const progressInterval = setInterval(() => {
      currentIndex++;
      if (currentIndex < statusProgression.length) {
        const newStatus = statusProgression[currentIndex];
        setDeliveryStatus(newStatus);
        
        if (onStatusUpdate) {
          onStatusUpdate(newStatus);
        }

        // Assign delivery agent when order is ready
        if (newStatus === 'ready') {
          setDeliveryAgent({
            id: 'DA001',
            name: 'Raj Kumar',
            phone: '+91 9876543210',
            rating: 4.8,
            vehicle: 'Bike',
            lat: orderData.restaurant.lat + 0.001,
            lon: orderData.restaurant.lon + 0.001,
            photo: '/api/placeholder/40/40'
          });
        }

        // Update agent location during transit
        if (newStatus === 'in_transit' && deliveryAgent && location) {
          updateAgentLocation();
        }

      } else {
        clearInterval(progressInterval);
      }
    }, 30000); // Progress every 30 seconds for demo

    return () => clearInterval(progressInterval);
  }, [deliveryStatus, deliveryAgent, location, orderData, onStatusUpdate]);

  // Update delivery agent location (simulate movement)
  const updateAgentLocation = useCallback(async () => {
    if (!deliveryAgent || !location || !orderData.restaurant) return;

    try {
      const route = await navigationService.calculateRoute(
        { lat: orderData.restaurant.lat, lng: orderData.restaurant.lon },
        { lat: location.lat, lng: location.lon }
      );

      setActualRoute(route);

      // Simulate agent movement along the route
      const steps = route.steps;
      let currentStepIndex = 0;

      const moveAgent = () => {
        if (currentStepIndex < steps.length && deliveryStatus === 'in_transit') {
          const step = steps[currentStepIndex];
          setDeliveryAgent(prev => ({
            ...prev,
            lat: step.startLocation.lat,
            lon: step.startLocation.lng
          }));
          currentStepIndex++;
          setTimeout(moveAgent, 10000); // Move every 10 seconds
        }
      };

      moveAgent();
    } catch (error) {
      console.error('Failed to update agent location:', error);
      setTrackingError('Unable to track delivery agent location');
    }
  }, [deliveryAgent, location, orderData, deliveryStatus]);

  // Calculate ETA
  const calculateETA = useCallback(async () => {
    if (!deliveryAgent || !location) return;

    try {
      const eta = await navigationService.calculateETA(
        { lat: deliveryAgent.lat, lng: deliveryAgent.lon },
        { lat: location.lat, lng: location.lon }
      );
      setEstimatedTime(eta);
    } catch (error) {
      console.error('Failed to calculate ETA:', error);
    }
  }, [deliveryAgent, location]);

  // Contact delivery agent
  const contactAgent = (method) => {
    if (!deliveryAgent) return;

    if (method === 'call') {
      window.open(`tel:${deliveryAgent.phone}`);
    } else if (method === 'message') {
      window.open(`sms:${deliveryAgent.phone}`);
    }
  };

  // Initialize delivery tracking
  useEffect(() => {
    const cleanup = simulateDeliveryProgress();
    return cleanup;
  }, [simulateDeliveryProgress]);

  // Update ETA when agent location changes
  useEffect(() => {
    if (deliveryStatus === 'in_transit') {
      calculateETA();
    }
  }, [deliveryAgent, calculateETA, deliveryStatus]);

  const handleRouteCalculated = (route) => {
    setActualRoute(route);
  };

  return (
    <Box>
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Order #{orderId}</Typography>
            <Chip 
              label={deliverySteps[getCurrentStepIndex()]?.label || 'Unknown Status'}
              color={deliveryStatus === 'delivered' ? 'success' : 'primary'}
              variant={deliveryStatus === 'delivered' ? 'filled' : 'outlined'}
            />
          </Box>

          {/* Progress Bar */}
          <Box mb={3}>
            <LinearProgress 
              variant="determinate" 
              value={(getCurrentStepIndex() / (deliverySteps.length - 1)) * 100}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>

          {/* Current Status */}
          <Alert 
            severity={deliveryStatus === 'delivered' ? 'success' : 'info'}
            sx={{ mb: 3 }}
          >
            {deliverySteps[getCurrentStepIndex()]?.description || 'Status unknown'}
          </Alert>

          {/* ETA Display */}
          {estimatedTime && deliveryStatus === 'in_transit' && (
            <Box display="flex" alignItems="center" mb={2}>
              <AccessTime sx={{ mr: 1, color: 'primary.main' }} />
              <Typography>
                Estimated arrival: <strong>{estimatedTime.estimatedTimeText}</strong>
              </Typography>
            </Box>
          )}

          {/* Delivery Agent Info */}
          {deliveryAgent && deliveryStatus !== 'delivered' && (
            <Card variant="outlined" sx={{ mb: 3 }}>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box display="flex" alignItems="center">
                    <Avatar src={deliveryAgent.photo} sx={{ mr: 2 }}>
                      {deliveryAgent.name.charAt(0)}
                    </Avatar>
                    <Box>
                      <Typography variant="subtitle1">{deliveryAgent.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        ⭐ {deliveryAgent.rating} • {deliveryAgent.vehicle}
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Box display="flex" gap={1}>
                    <IconButton 
                      onClick={() => contactAgent('call')}
                      color="primary"
                      size="small"
                    >
                      <Phone />
                    </IconButton>
                    <IconButton 
                      onClick={() => contactAgent('message')}
                      color="primary"
                      size="small"
                    >
                      <Message />
                    </IconButton>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Mini Map */}
          {deliveryStatus === 'in_transit' && location && deliveryAgent && (
            <Box mb={2}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="subtitle2">Live Tracking</Typography>
                <Button 
                  size="small" 
                  onClick={() => setShowFullMap(true)}
                  startIcon={<Navigation />}
                >
                  Full Map
                </Button>
              </Box>
              
              <Box height="200px">
                <NavigationMap
                  destination={{ lat: location.lat, lon: location.lon }}
                  deliveryAgent={deliveryAgent}
                  restaurants={[orderData.restaurant]}
                  onRouteCalculated={handleRouteCalculated}
                  enableRealTimeTracking={true}
                />
              </Box>
            </Box>
          )}

          {/* Detailed Status Steps */}
          <Stepper activeStep={getCurrentStepIndex()} orientation="vertical">
            {deliverySteps.map((step, index) => (
              <Step key={step.status}>
                <StepLabel
                  icon={step.icon}
                  optional={
                    index === getCurrentStepIndex() && estimatedTime ? (
                      <Typography variant="caption">
                        ETA: {estimatedTime.estimatedTimeText}
                      </Typography>
                    ) : null
                  }
                >
                  {step.label}
                </StepLabel>
                <StepContent>
                  <Typography variant="body2" color="text.secondary">
                    {step.description}
                  </Typography>
                </StepContent>
              </Step>
            ))}
          </Stepper>

          {/* Error Display */}
          {trackingError && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {trackingError}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Full Screen Map Dialog */}
      <Dialog 
        open={showFullMap} 
        onClose={() => setShowFullMap(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography>Live Delivery Tracking</Typography>
            <IconButton onClick={calculateETA}>
              <Refresh />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box height="500px">
            {location && deliveryAgent && (
              <NavigationMap
                destination={{ lat: location.lat, lon: location.lon }}
                deliveryAgent={deliveryAgent}
                restaurants={[orderData.restaurant]}
                onRouteCalculated={handleRouteCalculated}
                enableRealTimeTracking={true}
                showTrafficLayer={true}
              />
            )}
          </Box>
          
          {actualRoute && (
            <Box mt={2}>
              <Typography variant="subtitle2" gutterBottom>Route Details</Typography>
              <Box display="flex" gap={2}>
                <Chip 
                  icon={<LocationOn />} 
                  label={`Distance: ${actualRoute.summary.distance}`} 
                />
                <Chip 
                  icon={<AccessTime />} 
                  label={`Duration: ${actualRoute.summary.duration}`} 
                />
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowFullMap(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DeliveryTracker;