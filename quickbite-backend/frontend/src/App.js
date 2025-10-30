import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { OrdersProvider } from './context/OrdersContext';
import { LocationProvider } from './context/LocationContext';
import PrivateRoute from './components/PrivateRoute';
import LandingPage from './components/LandingPage';
import Login from './components/Login';
import Register from './components/Register';
import Profile from './components/Profile';
import NavBar from './components/NavBar';
import Footer from './components/Footer';
import Catalog from './pages/Catalog';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Orders from './pages/Orders';

const theme = createTheme({
  palette: {
    primary: {
      main: '#fc8019', // QuickBite orange
    },
    secondary: {
      main: '#48c479', // Success green
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <CartProvider>
          <OrdersProvider>
            <LocationProvider>
              <Router>
            <NavBar />
            <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* Protected Routes */}
            <Route 
              path="/profile" 
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/checkout" 
              element={
                <PrivateRoute>
                  <Checkout />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/orders" 
              element={
                <PrivateRoute>
                  <Orders />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/dashboard" 
              element={
                <PrivateRoute>
                  <Navigate to="/profile" />
                </PrivateRoute>
              } 
            />
                </Routes>
                <Footer />
              </Router>
            </LocationProvider>
          </OrdersProvider>
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
