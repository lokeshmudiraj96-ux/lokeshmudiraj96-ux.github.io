const redis = require('redis');

let redisClient;

const connectRedis = async () => {
  // Skip Redis if not configured (dev mode)
  if (!process.env.REDIS_URL) {
    console.log('⚠️ REDIS_URL not set - rate limiting disabled (dev mode)');
    return;
  }

  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: false // Don't spam reconnection attempts
      }
    });

    redisClient.on('error', (err) => console.error('❌ Redis Client Error:', err));
    redisClient.on('connect', () => console.log('✅ Redis connected'));

    await redisClient.connect();
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
  }
};

const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
};

module.exports = { connectRedis, getRedisClient };
