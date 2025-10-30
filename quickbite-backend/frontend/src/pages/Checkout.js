import React, { useState } from 'react';
import { Box, Button, Container, TextField, Typography, Alert, Stack } from '@mui/material';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useLocationCtx } from '../context/LocationContext';
import { useOrders } from '../context/OrdersContext';

const Checkout = () => {
  const { items, totals, clear } = useCart();
  const { user, isAuthenticated } = useAuth();
  const { location, detect, loading: locating } = useLocationCtx();
  const { placeOrder } = useOrders();
  const [submitted, setSubmitted] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const [form, setForm] = useState({
    name: user?.name || '',
    address: '',
    phone: user?.phone || ''
  });

  const onSubmit = (e) => {
    e.preventDefault();
    // Simulate order placement via OrdersContext
    const order = placeOrder({
      items,
      totals,
      customer: { name: form.name, phone: form.phone },
      address: form.address,
      coordinates: location ? { lat: location.lat, lon: location.lon } : null,
    });
    setOrderId(order.id);
    setSubmitted(true);
    clear();
  };

  if (!isAuthenticated) {
    return (
      <Container sx={{ my: 4 }}>
        <Alert severity="warning">Please login to proceed with checkout.</Alert>
      </Container>
    );
  }

  return (
    <Container sx={{ my: 4 }}>
      <Typography variant="h4" gutterBottom>Checkout</Typography>
      {submitted ? (
        <Alert severity="success">🎉 Order placed! Track it under Orders. {orderId ? `Order ID: ${orderId}` : ''}</Alert>
      ) : (
        <Box component="form" onSubmit={onSubmit} sx={{ maxWidth: 560 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Delivery Details</Typography>
          <TextField fullWidth label="Full Name" value={form.name} onChange={(e)=>setForm(f=>({...f,name:e.target.value}))} sx={{ mb: 2 }} required />
          <Stack direction={{ xs:'column', sm:'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField fullWidth label="Address" placeholder="Street, City" value={form.address} onChange={(e)=>setForm(f=>({...f,address:e.target.value}))} required />
            <Button onClick={detect} disabled={locating} variant="outlined" sx={{ whiteSpace:'nowrap' }}>
              {locating ? 'Detecting…' : (location?.label ? 'Use my location' : 'Detect location')}
            </Button>
          </Stack>
          {location?.label && (
            <Alert severity="info" sx={{ mb: 2 }}>Using location: {location.label}</Alert>
          )}
          <TextField fullWidth label="Phone" value={form.phone} onChange={(e)=>setForm(f=>({...f,phone:e.target.value}))} sx={{ mb: 2 }} required />
          <Typography sx={{ mt: 2 }}>Total to pay: ${totals.total.toFixed(2)}</Typography>
          <Button type="submit" variant="contained" sx={{ mt: 2 }} disabled={items.length === 0}>Place Order</Button>
        </Box>
      )}
    </Container>
  );
};

export default Checkout;
