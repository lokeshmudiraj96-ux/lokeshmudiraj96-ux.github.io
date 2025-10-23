import React from 'react';
import { Card, CardActions, CardContent, CardMedia, Button, Typography, Chip, Stack } from '@mui/material';
import { useCart } from '../context/CartContext';

const ProductCard = ({ product }) => {
  const { addItem } = useCart();
  const { name, price, image, tags = [] } = product;

  return (
    <Card>
      {image && (
        <CardMedia component="img" height="160" image={`${image}&auto=format&fit=crop&w=800&q=60`} alt={name} />
      )}
      <CardContent>
        <Typography variant="h6" gutterBottom>{name}</Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          {tags.map((t) => (
            <Chip key={t} label={t} size="small" />
          ))}
        </Stack>
        <Typography color="text.secondary">${price.toFixed(2)}</Typography>
      </CardContent>
      <CardActions>
        <Button variant="contained" onClick={() => addItem(product, 1)}>Add to Cart</Button>
      </CardActions>
    </Card>
  );
};

export default ProductCard;
