import React from 'react';
import { Container, Typography, Alert, Box, Chip, Divider, List, ListItem, ListItemText, Stack } from '@mui/material';
import { useOrders } from '../context/OrdersContext';

const Orders = () => {
  const { orders, getStatus, getEtaSeconds, stages, tick } = useOrders();

  return (
    <Container sx={{ my: 4 }}>
      <Typography variant="h4" gutterBottom>My Orders</Typography>
      {orders.length === 0 ? (
        <Alert severity="info">No orders yet. Place an order from the Cart to see it here.</Alert>
      ) : (
        <Stack spacing={2}>
          {orders.map((o) => {
            const status = getStatus(o);
            const eta = getEtaSeconds(o);
            const isDelivered = status === 'DELIVERED';
            return (
              <Box key={o.id} sx={{ p:2, border:'1px solid #eee', borderRadius:2 }}>
                <Stack direction={{ xs:'column', sm:'row' }} justifyContent="space-between" alignItems={{ xs:'flex-start', sm:'center' }} spacing={1}>
                  <Typography variant="h6">Order {o.id}</Typography>
                  <Chip label={status.replaceAll('_',' ')} color={isDelivered ? 'success':'primary'} />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Placed at {new Date(o.createdAt).toLocaleString()} {isDelivered ? '' : `(ETA ~${eta}s)`}
                </Typography>
                {o.address && (
                  <Typography variant="body2" sx={{ mt: 1 }}>Deliver to: {o.address}{o.coordinates ? ` (${o.coordinates.lat?.toFixed(4)}, ${o.coordinates.lon?.toFixed(4)})` : ''}</Typography>
                )}
                <Divider sx={{ my: 1 }} />
                <List dense>
                  {o.items.map((it) => (
                    <ListItem key={`${o.id}-${it.id}`} disableGutters secondaryAction={<Typography>${(it.price*it.qty).toFixed(2)}</Typography>}>
                      <ListItemText primary={`${it.name} × ${it.qty}`} secondary={`$${it.price.toFixed(2)} each`} />
                    </ListItem>
                  ))}
                </List>
                <Stack direction="row" justifyContent="flex-end" spacing={2} sx={{ mt: 1 }}>
                  <Typography>Subtotal: ${o.totals.subtotal.toFixed(2)}</Typography>
                  <Typography>Tax: ${o.totals.tax.toFixed(2)}</Typography>
                  <Typography>Delivery: ${o.totals.delivery.toFixed(2)}</Typography>
                  <Typography fontWeight={700}>Total: ${o.totals.total.toFixed(2)}</Typography>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Container>
  );
};

export default Orders;
