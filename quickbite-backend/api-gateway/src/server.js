const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Service routes
const routes = {
  auth: createProxyMiddleware({ 
    target: process.env.AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {'^/api/auth': ''}
  }),
  orders: createProxyMiddleware({ 
    target: process.env.ORDER_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {'^/api/orders': ''}
  })
};

// Route registration
app.use('/api/auth', routes.auth);
app.use('/api/orders', routes.orders);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});