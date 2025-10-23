import React from 'react';
import { Box, Button, Container, IconButton, List, ListItem, ListItemAvatar, ListItemText, Typography, TextField } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useCart } from '../context/CartContext';

const Cart = () => {
  const { items, removeItem, setQty, totals, clear } = useCart();

  return (
    <Container sx={{ my: 4 }}>
      <Typography variant="h4" gutterBottom>Cart</Typography>
      {items.length === 0 ? (
        <Typography color="text.secondary">Your cart is empty.</Typography>
      ) : (
        <>
          <List>
            {items.map((it) => (
              <ListItem key={it.id} secondaryAction={
                <IconButton edge="end" aria-label="delete" onClick={() => removeItem(it.id)}>
                  <DeleteIcon />
                </IconButton>
              }>
                <ListItemAvatar>
                  <img src={`${it.image}&auto=format&fit=crop&w=80&q=40`} alt={it.name} width={64} height={48} style={{ borderRadius: 8, objectFit: 'cover' }} />
                </ListItemAvatar>
                <ListItemText
                  primary={it.name}
                  secondary={`$${(it.price * it.qty).toFixed(2)} ($${it.price.toFixed(2)} x ${it.qty})`}
                />
                <Box>
                  <TextField
                    type="number"
                    size="small"
                    value={it.qty}
                    onChange={(e) => setQty(it.id, Math.max(1, Number(e.target.value)))}
                    inputProps={{ min: 1, style: { width: 64 } }}
                  />
                </Box>
              </ListItem>
            ))}
          </List>

          <Box sx={{ textAlign: 'right', mt: 2 }}>
            <Typography>Subtotal: ${totals.subtotal.toFixed(2)}</Typography>
            <Typography>Tax: ${totals.tax.toFixed(2)}</Typography>
            <Typography>Delivery: ${totals.delivery.toFixed(2)}</Typography>
            <Typography variant="h6" sx={{ mt: 1 }}>Total: ${totals.total.toFixed(2)}</Typography>
            <Box sx={{ mt: 2 }}>
              <Button color="inherit" onClick={clear} sx={{ mr: 1 }}>Clear</Button>
              <Button variant="contained" href="/checkout">Checkout</Button>
            </Box>
          </Box>
        </>
      )}
    </Container>
  );
};

export default Cart;
