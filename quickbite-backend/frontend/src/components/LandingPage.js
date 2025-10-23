import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Container, Box, Typography, Button } from '@mui/material';

const LandingPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();

  useEffect(() => {
    // Redirect authenticated users to profile
    if (isAuthenticated) {
      navigate('/profile');
    }
  }, [isAuthenticated, navigate]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fafafa' }}>
      {/* Hero Section */}
      <Container maxWidth="lg">
        <Box sx={{ 
          textAlign: 'center', 
          py: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 200px)'
        }}>
          <Typography 
            variant="h2" 
            sx={{ 
              color: '#fc8019', 
              mb: 3,
              fontWeight: 'bold'
            }}
          >
            Welcome to QuickBite
          </Typography>
          <Typography 
            variant="h5" 
            sx={{ 
              color: '#616161', 
              mb: 4,
              maxWidth: '600px'
            }}
          >
            Order your favorite food from the best restaurants near you
          </Typography>
          
          {!isAuthenticated && (
            <Box sx={{ display: 'flex', gap: 2, mt: 4 }}>
              <Button 
                component={Link}
                to="/register"
                variant="contained"
                size="large"
                sx={{ 
                  bgcolor: '#fc8019', 
                  px: 4,
                  py: 1.5,
                  fontSize: '1.1rem',
                  '&:hover': { bgcolor: '#e56513' }
                }}
              >
                Get Started
              </Button>
              <Button 
                component={Link}
                to="/login"
                variant="outlined"
                size="large"
                sx={{ 
                  borderColor: '#fc8019', 
                  color: '#fc8019',
                  px: 4,
                  py: 1.5,
                  fontSize: '1.1rem',
                  '&:hover': { borderColor: '#e56513', color: '#e56513' }
                }}
              >
                Sign In
              </Button>
            </Box>
          )}

          {/* Feature Highlights */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: 4,
            mt: 8,
            width: '100%'
          }}>
            <Box sx={{ textAlign: 'center', p: 3 }}>
              <Typography variant="h4" sx={{ color: '#fc8019', mb: 2 }}>🍔</Typography>
              <Typography variant="h6" sx={{ mb: 1, fontWeight: 'bold' }}>
                Wide Selection
              </Typography>
              <Typography sx={{ color: '#757575' }}>
                Choose from hundreds of restaurants and cuisines
              </Typography>
            </Box>
            
            <Box sx={{ textAlign: 'center', p: 3 }}>
              <Typography variant="h4" sx={{ color: '#fc8019', mb: 2 }}>🚚</Typography>
              <Typography variant="h6" sx={{ mb: 1, fontWeight: 'bold' }}>
                Fast Delivery
              </Typography>
              <Typography sx={{ color: '#757575' }}>
                Get your food delivered hot and fresh in minutes
              </Typography>
            </Box>
            
            <Box sx={{ textAlign: 'center', p: 3 }}>
              <Typography variant="h4" sx={{ color: '#fc8019', mb: 2 }}>💳</Typography>
              <Typography variant="h6" sx={{ mb: 1, fontWeight: 'bold' }}>
                Easy Payment
              </Typography>
              <Typography sx={{ color: '#757575' }}>
                Multiple payment options for your convenience
              </Typography>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
};

export default LandingPage;
