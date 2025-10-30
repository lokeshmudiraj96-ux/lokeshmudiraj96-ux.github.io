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

  // Configure axios defaults
  axios.defaults.baseURL = API_URL;
  
  useEffect(() => {
    if (tokens.accessToken) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${tokens.accessToken}`;
      loadUser();
    } else {
      setLoading(false);
    }
  }, [tokens.accessToken]); // loadUser is defined within this component and doesn't need to be in dependencies

  const loadUser = async () => {
    try {
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
    try {
      const response = await axios.post('/auth/login', { email, password });
      const { user, tokens: newTokens } = response.data;
      
      setUser(user);
      setTokens(newTokens);
      localStorage.setItem('accessToken', newTokens.accessToken);
      localStorage.setItem('refreshToken', newTokens.refreshToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newTokens.accessToken}`;
      
      return response.data;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const register = async (name, email, phone, password) => {
    try {
      const response = await axios.post('/auth/register', { name, email, phone, password });
      const { user, tokens: newTokens } = response.data;
      
      setUser(user);
      setTokens(newTokens);
      localStorage.setItem('accessToken', newTokens.accessToken);
      localStorage.setItem('refreshToken', newTokens.refreshToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newTokens.accessToken}`;
      
      return response.data;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  };

  const requestOTP = async (phone, purpose = 'login') => {
    try {
      const response = await axios.post('/auth/otp/request', { phone, purpose });
      return response.data;
    } catch (error) {
      console.error('OTP request failed:', error);
      throw error;
    }
  };

  const verifyOTP = async (phone, otp, purpose = 'login', userData = {}) => {
    try {
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
    } catch (error) {
      console.error('OTP verification failed:', error);
      throw error;
    }
  };

  const logout = async () => {
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
