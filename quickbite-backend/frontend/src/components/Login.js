import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Box,
  Container,
  TextField,
  Button,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  AppBar,
  Toolbar
} from '@mui/material';

const Login = () => {
  const navigate = useNavigate();
  const { login, requestOTP, verifyOTP } = useAuth();
  
  const [authMethod, setAuthMethod] = useState('email'); // 'email' or 'otp'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // Email/Password state
  const [emailData, setEmailData] = useState({
    email: '',
    password: ''
  });

  // OTP state
  const [otpData, setOtpData] = useState({
    phone: '',
    otp: ''
  });

  const handleEmailChange = (e) => {
    setEmailData({ ...emailData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleOtpChange = (e) => {
    setOtpData({ ...otpData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(emailData.email, emailData.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await requestOTP(otpData.phone, 'login');
      setOtpSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await verifyOTP(otpData.phone, otpData.otp, 'login');
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fafafa' }}>
      {/* Navigation Header */}
      <AppBar position="static" sx={{ bgcolor: 'white', boxShadow: 1 }}>
        <Toolbar>
          <Typography 
            variant="h6" 
            component={Link}
            to="/"
            sx={{ 
              flexGrow: 1, 
              color: '#fc8019', 
              fontWeight: 'bold',
              textDecoration: 'none'
            }}
          >
            QuickBite
          </Typography>
          <Button 
            component={Link} 
            to="/register" 
            sx={{ color: '#616161' }}
          >
            Sign Up
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="sm">
        <Box sx={{ mt: 8, mb: 4 }}>
          <Paper elevation={3} sx={{ p: 4 }}>
            <Typography variant="h4" align="center" gutterBottom>
              Welcome Back
            </Typography>
          <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 3 }}>
            Login to your account
          </Typography>

          <Tabs 
            value={authMethod} 
            onChange={(e, newValue) => {
              setAuthMethod(newValue);
              setError('');
              setOtpSent(false);
            }}
            centered
            sx={{ mb: 3 }}
          >
            <Tab label="Email" value="email" />
            <Tab label="Phone OTP" value="otp" />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {authMethod === 'email' ? (
            <form onSubmit={handleEmailLogin}>
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={emailData.email}
                onChange={handleEmailChange}
                margin="normal"
                required
                autoComplete="email"
              />
              <TextField
                fullWidth
                label="Password"
                name="password"
                type="password"
                value={emailData.password}
                onChange={handleEmailChange}
                margin="normal"
                required
                autoComplete="current-password"
              />
              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ mt: 3, mb: 2 }}
              >
                {loading ? <CircularProgress size={24} /> : 'Login'}
              </Button>
            </form>
          ) : (
            <>
              {!otpSent ? (
                <form onSubmit={handleRequestOTP}>
                  <TextField
                    fullWidth
                    label="Phone Number"
                    name="phone"
                    type="tel"
                    value={otpData.phone}
                    onChange={handleOtpChange}
                    margin="normal"
                    required
                    placeholder="+1234567890"
                    helperText="Enter phone with country code"
                  />
                  <Button
                    fullWidth
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={loading}
                    sx={{ mt: 3, mb: 2 }}
                  >
                    {loading ? <CircularProgress size={24} /> : 'Send OTP'}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOTP}>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    OTP sent to {otpData.phone}
                  </Alert>
                  <TextField
                    fullWidth
                    label="Enter OTP"
                    name="otp"
                    type="text"
                    value={otpData.otp}
                    onChange={handleOtpChange}
                    margin="normal"
                    required
                    inputProps={{ maxLength: 6 }}
                  />
                  <Button
                    fullWidth
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={loading}
                    sx={{ mt: 3, mb: 2 }}
                  >
                    {loading ? <CircularProgress size={24} /> : 'Verify OTP'}
                  </Button>
                  <Button
                    fullWidth
                    variant="text"
                    onClick={() => setOtpSent(false)}
                    disabled={loading}
                  >
                    Change Phone Number
                  </Button>
                </form>
              )}
            </>
          )}

          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="body2">
              Don't have an account?{' '}
              <Link to="/register" style={{ textDecoration: 'none', color: '#1976d2' }}>
                Register here
              </Link>
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
    </Box>
  );
};

export default Login;
