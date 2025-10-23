import React from 'react';
import { Box, Container, Link, Typography } from '@mui/material';

const Footer = () => {
  return (
    <Box component="footer" sx={{ bgcolor: '#fafafa', py: 4, mt: 6, borderTop: '1px solid #eee' }}>
      <Container maxWidth="lg">
        <Typography variant="body2" color="text.secondary">
          © {new Date().getFullYear()} QuickBite — All rights reserved.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          <Link href="/pages/index.html" underline="hover">Landing</Link> ·{' '}
          <Link href="/login" underline="hover">Login</Link> ·{' '}
          <Link href="/register" underline="hover">Register</Link>
        </Typography>
      </Container>
    </Box>
  );
};

export default Footer;
