import React from 'react';
import { AppBar, Badge, Box, Button, IconButton, Toolbar, Typography } from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const NavBar = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const { count } = useCart();

  return (
    <AppBar position="sticky" sx={{ bgcolor: 'white', color: 'black' }}>
      <Toolbar>
        <Typography
          variant="h6"
          component={Link}
          to="/"
          sx={{ flexGrow: 1, textDecoration: 'none', color: '#fc8019', fontWeight: 'bold' }}
        >
          QuickBite
        </Typography>

        <Button component={Link} to="/catalog" sx={{ color: '#424242', mr: 1 }}>
          Browse
        </Button>

        <IconButton component={Link} to="/cart" aria-label="cart">
          <Badge badgeContent={count} color="primary">
            <ShoppingCartIcon />
          </Badge>
        </IconButton>

        {isAuthenticated ? (
          <>
            <Button component={Link} to="/orders" sx={{ ml: 1 }}>Orders</Button>
            <Button component={Link} to="/profile" sx={{ ml: 1 }}>{user?.name || 'Profile'}</Button>
            <Button onClick={logout} sx={{ ml: 1 }}>Logout</Button>
          </>
        ) : (
          <Box>
            <Button component={Link} to="/login" sx={{ ml: 1 }}>Login</Button>
            <Button component={Link} to="/register" sx={{ ml: 1 }}>Sign Up</Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default NavBar;
