import React, { useEffect, useState } from 'react';
import { Container, Grid, Typography } from '@mui/material';
import ProductCard from './ProductCard';
import { fetchProducts } from '../api/catalog';

const CatalogGrid = () => {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchProducts();
        setProducts(data.products || []);
      } catch (e) {
        console.error('Failed to load products', e);
      }
    })();
  }, []);

  return (
    <Container sx={{ my: 4 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Popular Dishes</Typography>
      <Grid container spacing={2}>
        {products.map((p) => (
          <Grid key={p.id} item xs={12} sm={6} md={4} lg={3}>
            <ProductCard product={p} />
          </Grid>
        ))}
      </Grid>
    </Container>
  );
};

export default CatalogGrid;
