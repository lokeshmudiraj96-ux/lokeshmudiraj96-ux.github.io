import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Avatar,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  LinearProgress,
  Alert,
  Divider,
  IconButton
} from '@mui/material';
import {
  ShoppingCart,
  Restaurant,
  LocalShipping,
  CheckCircle,
  Phone,
  MyLocation,
  Refresh,
  Cancel,
  Star
} from '@mui/icons-material';
import { io } from 'socket.io-client';
import NavigationMap from './NavigationMap';

const ORDER_STATUS_STEPS = [
  { key: 'PENDING', label: 'Order Placed', icon: ShoppingCart },
  { key: 'CONFIRMED', label: 'Restaurant Accepted', icon: Restaurant },
  { key: 'PREPARING', label: 'Preparing Food', icon: Restaurant },
  { key: 'READY_FOR_PICKUP', label: 'Ready for Pickup', icon: Restaurant },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: LocalShipping },
  { key: 'DELIVERED', label: 'Delivered', icon: CheckCircle }
];

const OrderTracker = ({ orderId, onClose }) => {
  const [order, setOrder] = useState(null);
  const [tracking, setTracking] = useState([]);
  const [driverLocation, setDriverLocation] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(false);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!orderId) return;

    const newSocket = io(process.env.REACT_APP_ORDER_SERVICE_URL || 'http://localhost:3004');
    setSocket(newSocket);
    
    newSocket.on('connect', () => {
      console.log('Connected to order tracking');
      newSocket.emit('subscribe_delivery', orderId);
    });

    newSocket.on('driver_assigned', (data) => {
      if (data.order_id === orderId) {
        fetchOrderDetails();
      }
    });

    newSocket.on('driver_location_update', (data) => {
      if (data.order_id === orderId) {
        setDriverLocation(data.driver_location);
      }
    });

    newSocket.on('food_ready', (data) => {
      if (data.order_id === orderId) {
        fetchOrderDetails();
      }
    });

    newSocket.on('order_status_updated', (data) => {
      if (data.order_id === orderId) {
        fetchOrderDetails();
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('unsubscribe_delivery', orderId);
      newSocket.disconnect();
    };
  }, [orderId]);

  const fetchOrderDetails = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });
      
      if (response.ok) {
        const orderData = await response.json();
        setOrder(orderData);
      }
    } catch (error) {
      console.error('Failed to fetch order details:', error);
    }
  }, [orderId]);

  const fetchTracking = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}/tracking`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });
      
      if (response.ok) {
        const trackingData = await response.json();
        setTracking(trackingData.tracking_events || []);
      }
    } catch (error) {
      console.error('Failed to fetch tracking:', error);
    }
  }, [orderId]);

  const fetchDriverLocation = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}/location`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });
      
      if (response.ok) {
        const locationData = await response.json();
        setDriverLocation(locationData.driver_location);
      }
    } catch (error) {
      console.error('Failed to fetch driver location:', error);
    }
  }, [orderId]);

  useEffect(() => {
    if (orderId) {
      Promise.all([
        fetchOrderDetails(),
        fetchTracking(),
        fetchDriverLocation()
      ]).finally(() => setLoading(false));
    }
  }, [orderId, fetchOrderDetails, fetchTracking, fetchDriverLocation]);

  const getCurrentStepIndex = () => {
    if (!order) return 0;
    return ORDER_STATUS_STEPS.findIndex(step => step.key === order.status);
  };

  const getStatusColor = (status) => {
    const colors = {
      'PENDING': 'warning',
      'CONFIRMED': 'info',
      'PREPARING': 'info',
      'READY_FOR_PICKUP': 'primary',
      'OUT_FOR_DELIVERY': 'primary',
      'DELIVERED': 'success',
      'CANCELLED': 'error'
    };
    return colors[status] || 'default';
  };

  const handleCancelOrder = async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({ reason: 'Customer cancellation' })
      });
      
      if (response.ok) {
        fetchOrderDetails();
      }
    } catch (error) {
      console.error('Failed to cancel order:', error);
    }
  };

  const handleContactDriver = () => {
    if (order?.driver_phone) {
      window.open(`tel:${order.driver_phone}`);
    }
  };

  const calculateProgress = () => {
    const currentStep = getCurrentStepIndex();
    return ((currentStep + 1) / ORDER_STATUS_STEPS.length) * 100;
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading order details...</Typography>
      </Box>
    );
  }

  if (!order) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Order not found</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', p: 2 }}>
      {/* Order Header */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Order #{orderId.substring(0, 8)}
            </Typography>
            <Chip 
              label={order.status.replace('_', ' ')}
              color={getStatusColor(order.status)}
              size="small"
            />
          </Box>
          
          <LinearProgress 
            variant="determinate" 
            value={calculateProgress()} 
            sx={{ mb: 2, height: 8, borderRadius: 4 }}
          />
          
          <Typography variant="body2" color="text.secondary">
            Total: ₹{(order.total_amount_cents / 100).toFixed(2)}
          </Typography>
          
          {order.estimated_delivery_time && (
            <Typography variant="body2" color="text.secondary">
              Estimated delivery: {new Date(order.estimated_delivery_time).toLocaleTimeString()}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Driver Info */}
      {order.driver_id && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
                  <LocalShipping />
                </Avatar>
                <Box>
                  <Typography variant="subtitle1">Delivery Partner</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {order.driver_phone}
                  </Typography>
                </Box>
              </Box>
              
              <Box>
                <IconButton onClick={handleContactDriver} color="primary">
                  <Phone />
                </IconButton>
                <IconButton onClick={() => setShowMap(true)} color="primary">
                  <MyLocation />
                </IconButton>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Order Progress */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Order Progress</Typography>
          <Stepper activeStep={getCurrentStepIndex()} orientation="vertical">
            {ORDER_STATUS_STEPS.map((step, index) => {
              const StepIcon = step.icon;
              const isCompleted = getCurrentStepIndex() >= index;
              const isActive = getCurrentStepIndex() === index;
              
              return (
                <Step key={step.key}>
                  <StepLabel
                    StepIconComponent={() => (
                      <Avatar 
                        sx={{ 
                          bgcolor: isCompleted ? 'success.main' : isActive ? 'primary.main' : 'grey.300',
                          color: 'white',
                          width: 32,
                          height: 32
                        }}
                      >
                        <StepIcon fontSize="small" />
                      </Avatar>
                    )}
                  >
                    <Typography variant="subtitle2">{step.label}</Typography>
                  </StepLabel>
                  {isActive && (
                    <StepContent>
                      <Typography variant="body2" color="text.secondary">
                        {step.key === 'PREPARING' && 'Your food is being prepared with care'}
                        {step.key === 'OUT_FOR_DELIVERY' && 'Your order is on the way!'}
                        {step.key === 'READY_FOR_PICKUP' && 'Food is ready for pickup'}
                      </Typography>
                    </StepContent>
                  )}
                </Step>
              );
            })}
          </Stepper>
        </CardContent>
      </Card>

      {/* Order Items */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Order Items</Typography>
          {order.items?.map((item, index) => (
            <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">
                {item.quantity}x {item.item_name || `Item ${item.item_id.substring(0, 8)}`}
              </Typography>
              <Typography variant="body2">
                ₹{((item.price_cents * item.quantity) / 100).toFixed(2)}
              </Typography>
            </Box>
          ))}
        </CardContent>
      </Card>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mb: 2 }}>
        {['PENDING', 'CONFIRMED', 'PREPARING'].includes(order.status) && (
          <Button
            variant="outlined"
            color="error"
            startIcon={<Cancel />}
            onClick={handleCancelOrder}
          >
            Cancel Order
          </Button>
        )}
        
        {order.status === 'DELIVERED' && (
          <Button
            variant="contained"
            startIcon={<Star />}
            onClick={() => {/* Open rating dialog */}}
          >
            Rate Order
          </Button>
        )}
        
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={() => {
            fetchOrderDetails();
            fetchTracking();
            fetchDriverLocation();
          }}
        >
          Refresh
        </Button>
      </Box>

      {/* Live Map Dialog */}
      <Dialog 
        open={showMap} 
        onClose={() => setShowMap(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Live Delivery Tracking</DialogTitle>
        <DialogContent sx={{ height: 400 }}>
          {driverLocation && (
            <NavigationMap
              destination={{
                lat: driverLocation.latitude,
                lon: driverLocation.longitude,
                label: 'Delivery Driver'
              }}
              deliveryAgent={{
                lat: driverLocation.latitude,
                lon: driverLocation.longitude,
                name: 'Delivery Partner',
                speed: driverLocation.speed
              }}
              showTrafficLayer={true}
              enableRealTimeTracking={true}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Live Updates */}
      {tracking.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Live Updates</Typography>
            {tracking.slice(-3).reverse().map((event, index) => (
              <Box key={index} sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight="medium">
                  {event.event_message}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(event.timestamp).toLocaleString()}
                </Typography>
                {index < tracking.slice(-3).length - 1 && <Divider sx={{ mt: 1 }} />}
              </Box>
            ))}
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default OrderTracker;