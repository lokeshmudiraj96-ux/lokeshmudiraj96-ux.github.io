import React, { useState } from 'react';
import { Box, Button, Container, TextField, Typography, Alert } from '@mui/material';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

const Checkout = () => {
  const { items, totals, clear } = useCart();
  const { user, isAuthenticated } = useAuth();
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (e) => {
    e.preventDefault();
    // Demo: simulate order placement
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
        <Alert severity="success">🎉 Order placed! Track it under Orders.</Alert>
      ) : (
        <Box component="form" onSubmit={onSubmit} sx={{ maxWidth: 560 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Delivery Details</Typography>
          <TextField fullWidth label="Full Name" defaultValue={user?.name} sx={{ mb: 2 }} required />
          <TextField fullWidth label="Address" placeholder="Street, City" sx={{ mb: 2 }} required />
          <TextField fullWidth label="Phone" defaultValue={user?.phone || ''} sx={{ mb: 2 }} required />
          <Typography sx={{ mt: 2 }}>Total to pay: ${totals.total.toFixed(2)}</Typography>
          <Button type="submit" variant="contained" sx={{ mt: 2 }} disabled={items.length === 0}>Place Order</Button>
        </Box>
      )}
    </Container>
  );
};

export default Checkout;
