import React from 'react';
import { Container, Typography, Alert } from '@mui/material';

const Orders = () => {
  // Placeholder page; later wire to order-service via API gateway
  return (
    <Container sx={{ my: 4 }}>
      <Typography variant="h4" gutterBottom>My Orders</Typography>
      <Alert severity="info">Order history will appear here once backend orders API is connected.</Alert>
    </Container>
  );
};

export default Orders;
