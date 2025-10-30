import React, { createContext, useContext, useState, useCallback } from 'react';

const LocationContext = createContext(null);

export const useLocationCtx = () => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocationCtx must be used within LocationProvider');
  }
  return context;
};

export const LocationProvider = ({ children }) => {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [watchId, setWatchId] = useState(null);

  const detect = useCallback(() => {
    setLoading(true);
    setError(null);
    
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        const errorMsg = 'Geolocation is not supported';
        setError(errorMsg);
        setLoading(false);
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
            label: `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`
          };
          setLocation(loc);
          setLoading(false);
          resolve(loc);
        },
        (err) => {
          setError('Failed to get location');
          setLoading(false);
          resolve(null);
        },
        { 
          enableHighAccuracy: true, 
          timeout: 10000,
          maximumAge: 30000
        }
      );
    });
  }, []);

  const setManualLocation = useCallback((label, lat = null, lon = null) => {
    const loc = { label, ...(lat && lon ? { lat, lon } : {}) };
    setLocation(loc);
  }, []);

  const isLocationAccurate = useCallback((threshold = 100) => {
    return location && location.accuracy && location.accuracy <= threshold;
  }, [location]);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation || watchId) return;
    
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const newLoc = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
          label: `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`
        };
        
        // Only update if more accurate or significantly different
        if (!location || 
            newLoc.accuracy < (location.accuracy || Infinity) ||
            Math.abs(newLoc.lat - location.lat) > 0.0001 ||
            Math.abs(newLoc.lon - location.lon) > 0.0001) {
          setLocation(newLoc);
        }
      },
      (err) => {
        console.warn('Location watching failed:', err);
        setError('Location tracking failed');
      },
      { 
        enableHighAccuracy: true, 
        timeout: 8000,
        maximumAge: 20000
      }
    );
    
    setWatchId(id);
  }, [watchId, location]);

  const stopWatching = useCallback(() => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
  }, [watchId]);

  const clearLocation = useCallback(() => {
    setLocation(null);
    setError(null);
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
  }, [watchId]);

  const value = {
    location,
    loading,
    error,
    detect,
    setManualLocation,
    isLocationAccurate,
    startWatching,
    stopWatching,
    clearLocation,
    isWatching: !!watchId
  };

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
};
