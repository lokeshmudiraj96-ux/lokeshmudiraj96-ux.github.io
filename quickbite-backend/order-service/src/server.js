const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const compression = require('compression');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');

dotenv.config();

const { ensureSchema } = require('./models/order.model');
const routes = require('./routes/orders.routes');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO for real-time delivery location updates
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`WebSocket client connected: ${socket.id}`);
  
  socket.on('subscribe_delivery', (deliveryId) => {
    socket.join(deliveryId);
    console.log(`Client ${socket.id} subscribed to delivery ${deliveryId}`);
  });
  
  socket.on('unsubscribe_delivery', (deliveryId) => {
    socket.leave(deliveryId);
    console.log(`Client ${socket.id} unsubscribed from delivery ${deliveryId}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`WebSocket client disconnected: ${socket.id}`);
  });
});

// Make io available to route handlers
app.set('socketio', io);

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(compression());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'order-service', time: new Date().toISOString() }));
app.use('/api', routes);

const PORT = process.env.PORT || 3004;

ensureSchema()
  .then(() => {
    server.listen(PORT, () => console.log(`🧾 Order Service with WebSocket running on ${PORT}`));
  })
  .catch((e) => {
    console.error('Failed to init schema', e);
    process.exit(1);
  });

module.exports = app;
