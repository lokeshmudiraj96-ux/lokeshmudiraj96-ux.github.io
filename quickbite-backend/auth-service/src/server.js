const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const { errorHandler } = require('./middleware/error.middleware');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');

// Load environment variables
dotenv.config();

// Initialize database connections
connectDB();
connectRedis();

const app = express();

// Middleware
app.use(helmet());

// CORS: support multiple origins (e.g., 3000 for React, 8080 for static page)
const rawOrigins = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:8080';
const allowedOrigins = rawOrigins.split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl) and same-origin
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Auth Service running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
