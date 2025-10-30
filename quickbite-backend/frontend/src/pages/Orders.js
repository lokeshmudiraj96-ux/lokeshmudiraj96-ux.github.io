import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Alert, 
  Box, 
  Chip, 
  Divider, 
  Button,
  Card,
  CardContent,
  CardActions,
  Dialog,
  DialogTitle,
  IconButton,
  Grid
} from '@mui/material';
import { 
  Visibility, 
  Close, 
  LocalShipping, 
  Restaurant,
  Schedule
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import OrderTracker from '../components/OrderTracker';

const Orders = () => {
  const { isAuthenticated } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showTracker, setShowTracker] = useState(false);

  // Fetch orders from backend
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchOrders = async () => {
      try {
        const response = await fetch('/api/orders', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setOrders(data.orders || []);
        }
      } catch (error) {
        console.error('Failed to fetch orders:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [isAuthenticated]);

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

  const getStatusIcon = (status) => {
    const icons = {
      'PENDING': Schedule,
      'CONFIRMED': Restaurant,
      'PREPARING': Restaurant,
      'READY_FOR_PICKUP': LocalShipping,
      'OUT_FOR_DELIVERY': LocalShipping,
      'DELIVERED': LocalShipping,
      'CANCELLED': Close
    };
    const IconComponent = icons[status] || Schedule;
    return <IconComponent />;
  };

  const handleTrackOrder = (orderId) => {
    setSelectedOrderId(orderId);
    setShowTracker(true);
  };

  if (!isAuthenticated) {
    return (
      <Container sx={{ my: 4 }}>
        <Alert severity="warning">Please login to view your orders.</Alert>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container sx={{ my: 4 }}>
        <Typography variant="h4" gutterBottom>My Orders</Typography>
        <Typography>Loading your orders...</Typography>
      </Container>
    );
  }

  return (
    <Container sx={{ my: 4 }}>
      <Typography variant="h4" gutterBottom>My Orders</Typography>
      
      {orders.length === 0 ? (
        <Alert severity="info">
          No orders yet. Place an order from the menu to see it here.
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {orders.map((order) => (
            <Grid item xs={12} md={6} key={order.id}>
              <Card elevation={2}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">
                      Order #{order.id.substring(0, 8)}
                    </Typography>
                    <Chip
                      icon={getStatusIcon(order.status)}
                      label={order.status.replace('_', ' ')}
                      color={getStatusColor(order.status)}
                      size="small"
                    />
                  </Box>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Placed: {new Date(order.created_at).toLocaleString()}
                  </Typography>

                  {order.estimated_delivery_time && (
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Estimated delivery: {new Date(order.estimated_delivery_time).toLocaleTimeString()}
                    </Typography>
                  )}

                  <Typography variant="body2" gutterBottom>
                    Deliver to: {order.delivery_address}
                  </Typography>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="subtitle2" gutterBottom>
                    Items ({order.items?.length || 0})
                  </Typography>
                  
                  {order.items?.slice(0, 2).map((item, index) => (
                    <Typography key={index} variant="body2" color="text.secondary">
                      {item.quantity}x {item.item_name || `Item ${item.item_id.substring(0, 8)}`}
                    </Typography>
                  ))}
                  
                  {order.items?.length > 2 && (
                    <Typography variant="body2" color="text.secondary">
                      +{order.items.length - 2} more items
                    </Typography>
                  )}

                  <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">
                      ₹{(order.total_amount_cents / 100).toFixed(2)}
                    </Typography>
                    
                    {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
                      <Chip 
                        label="Live" 
                        color="success" 
                        size="small" 
                        variant="outlined"
                      />
                    )}
                  </Box>
                </CardContent>
                
                <CardActions>
                  <Button 
                    size="small" 
                    startIcon={<Visibility />}
                    onClick={() => handleTrackOrder(order.id)}
                  >
                    Track Order
                  </Button>
                  
                  {order.status === 'DELIVERED' && (
                    <Button size="small" color="primary">
                      Rate & Review
                    </Button>
                  )}
                  
                  {['PENDING', 'CONFIRMED'].includes(order.status) && (
                    <Button size="small" color="error">
                      Cancel
                    </Button>
                  )}
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Order Tracking Dialog */}
      <Dialog
        open={showTracker}
        onClose={() => setShowTracker(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Order Tracking</Typography>
            <IconButton onClick={() => setShowTracker(false)}>
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        {selectedOrderId && (
          <OrderTracker 
            orderId={selectedOrderId} 
            onClose={() => setShowTracker(false)}
          />
        )}
      </Dialog>
    </Container>
  );
};

export default Orders;
