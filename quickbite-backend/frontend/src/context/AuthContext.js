import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState({
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken')
  });

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
  const DEMO_MODE = process.env.REACT_APP_DEMO_MODE === 'true';

  // Configure axios defaults
  axios.defaults.baseURL = API_URL;
  
  useEffect(() => {
    if (tokens.accessToken) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${tokens.accessToken}`;
      loadUser();
    } else {
      setLoading(false);
    }
  }, [tokens.accessToken]);

  const loadUser = async () => {
    try {
      if (DEMO_MODE && tokens.accessToken) {
        // Mock user data for demo
        const mockUser = {
          id: '1',
          name: localStorage.getItem('demoUserName') || 'Demo User',
          email: localStorage.getItem('demoUserEmail') || 'demo@quickbite.com',
          phone: localStorage.getItem('demoUserPhone') || '+1234567890',
          role: 'customer',
          isVerified: true
        };
        setUser(mockUser);
        setLoading(false);
        return;
      }
      
      const response = await axios.get('/users/me');
      setUser(response.data.user);
    } catch (error) {
      console.error('Failed to load user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    if (DEMO_MODE) {
      // Mock login for demo
      const mockUser = {
        id: '1',
        name: 'Demo User',
        email: email,
        phone: '+1234567890',
        role: 'customer',
        isVerified: true
      };
      const mockTokens = {
        accessToken: 'demo-access-token',
        refreshToken: 'demo-refresh-token',
        expiresIn: 900
      };
      
      setUser(mockUser);
      setTokens(mockTokens);
      localStorage.setItem('accessToken', mockTokens.accessToken);
      localStorage.setItem('refreshToken', mockTokens.refreshToken);
      localStorage.setItem('demoUser', JSON.stringify(mockUser));
      axios.defaults.headers.common['Authorization'] = `Bearer ${mockTokens.accessToken}`;
      
      return { user: mockUser, tokens: mockTokens, success: true, message: 'Demo login successful' };
    }

    const response = await axios.post('/auth/login', { email, password });
    const { user, tokens: newTokens } = response.data;
    
    setUser(user);
    setTokens(newTokens);
    localStorage.setItem('accessToken', newTokens.accessToken);
    localStorage.setItem('refreshToken', newTokens.refreshToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newTokens.accessToken}`;
    
    return response.data;
  };

  const register = async (name, email, phone, password) => {
    if (DEMO_MODE) {
      // Mock register for demo
      const mockUser = {
        id: '1',
        name: name,
        email: email,
        phone: phone,
        role: 'customer',
        isVerified: true
      };
      const mockTokens = {
        accessToken: 'demo-access-token',
        refreshToken: 'demo-refresh-token',
        expiresIn: 900
      };
      
      setUser(mockUser);
      setTokens(mockTokens);
      localStorage.setItem('accessToken', mockTokens.accessToken);
      localStorage.setItem('refreshToken', mockTokens.refreshToken);
      localStorage.setItem('demoUser', JSON.stringify(mockUser));
      axios.defaults.headers.common['Authorization'] = `Bearer ${mockTokens.accessToken}`;
      
      return { user: mockUser, tokens: mockTokens, success: true, message: 'Demo registration successful' };
    }

    const response = await axios.post('/auth/register', { name, email, phone, password });
    const { user, tokens: newTokens } = response.data;
    
    setUser(user);
    setTokens(newTokens);
    localStorage.setItem('accessToken', newTokens.accessToken);
    localStorage.setItem('refreshToken', newTokens.refreshToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newTokens.accessToken}`;
    
    return response.data;
  };

  const requestOTP = async (phone, purpose = 'login') => {
    if (DEMO_MODE) {
      // Mock OTP request for demo
      console.log(`📱 Demo Mode: OTP sent to ${phone}`);
      console.log(`📱 Demo OTP Code: 123456`);
      return { 
        success: true, 
        message: 'Demo OTP sent successfully. Use code: 123456',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      };
    }
    
    const response = await axios.post('/auth/otp/request', { phone, purpose });
    return response.data;
  };

  const verifyOTP = async (phone, otp, purpose = 'login', userData = {}) => {
    if (DEMO_MODE) {
      // Mock OTP verification
      const mockUser = {
        id: '1',
        name: userData.name || 'Demo User',
        email: userData.email || 'demo@quickbite.com',
        phone: phone,
        role: 'customer',
        isVerified: true
      };
      const mockTokens = {
        accessToken: 'demo-access-token',
        refreshToken: 'demo-refresh-token',
        expiresIn: 900
      };
      
      setUser(mockUser);
      setTokens(mockTokens);
      localStorage.setItem('accessToken', mockTokens.accessToken);
      localStorage.setItem('refreshToken', mockTokens.refreshToken);
      localStorage.setItem('demoUser', JSON.stringify(mockUser));
      axios.defaults.headers.common['Authorization'] = `Bearer ${mockTokens.accessToken}`;
      
      return { user: mockUser, tokens: mockTokens, success: true, message: 'Demo OTP verification successful' };
    }

    const response = await axios.post('/auth/otp/verify', { 
      phone, 
      otp, 
      purpose,
      ...userData 
    });
    const { user, tokens: newTokens } = response.data;
    
    setUser(user);
    setTokens(newTokens);
    localStorage.setItem('accessToken', newTokens.accessToken);
    localStorage.setItem('refreshToken', newTokens.refreshToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newTokens.accessToken}`;
    
    return response.data;
  };

  const logout = async () => {
    if (DEMO_MODE) {
      // Demo mode logout
      setUser(null);
      setTokens({ accessToken: null, refreshToken: null });
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('demoUser');
      delete axios.defaults.headers.common['Authorization'];
      return;
    }

    try {
      if (tokens.refreshToken) {
        await axios.post('/auth/logout', { refreshToken: tokens.refreshToken });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setTokens({ accessToken: null, refreshToken: null });
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      delete axios.defaults.headers.common['Authorization'];
    }
  };

  const refreshAccessToken = async () => {
    try {
      const response = await axios.post('/auth/refresh', { 
        refreshToken: tokens.refreshToken 
      });
      const newTokens = response.data.tokens;
      
      setTokens(newTokens);
      localStorage.setItem('accessToken', newTokens.accessToken);
      localStorage.setItem('refreshToken', newTokens.refreshToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newTokens.accessToken}`;
      
      return newTokens;
    } catch (error) {
      logout();
      throw error;
    }
  };

  const value = {
    user,
    loading,
    login,
    register,
    requestOTP,
    verifyOTP,
    logout,
    refreshAccessToken,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
