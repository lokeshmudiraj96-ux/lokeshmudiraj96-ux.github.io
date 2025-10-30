const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const ORDER_STATUSES = ['PENDING','CONFIRMED','PREPARING','READY_FOR_PICKUP','DISPATCHED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'];

// Enhanced order tracking states with precise timing
const ORDER_TRACKING_EVENTS = {
  ORDER_PLACED: 'Order placed successfully',
  PAYMENT_CONFIRMED: 'Payment confirmed',
  RESTAURANT_ACCEPTED: 'Restaurant accepted your order',
  FOOD_PREPARING: 'Your food is being prepared',
  FOOD_READY: 'Food is ready for pickup',
  DRIVER_ASSIGNED: 'Delivery driver assigned',
  DRIVER_AT_RESTAURANT: 'Driver arrived at restaurant',
  ORDER_PICKED_UP: 'Order picked up by driver',
  OUT_FOR_DELIVERY: 'Order is out for delivery',
  DRIVER_NEARBY: 'Driver is nearby (within 5 minutes)',
  ORDER_DELIVERED: 'Order delivered successfully'
};

async function ensureSchema() {
  // Enhanced schema for advanced tracking
  const sql = `
  CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY,
    user_id UUID,
    merchant_id UUID NOT NULL,
    status TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    delivery_coordinates JSONB,
    instructions TEXT,
    total_amount_cents INTEGER NOT NULL,
    estimated_delivery_time TIMESTAMP,
    actual_delivery_time TIMESTAMP,
    delivery_fee_cents INTEGER DEFAULT 0,
    driver_id UUID,
    driver_phone TEXT,
    preparation_time_minutes INTEGER DEFAULT 20,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_id UUID NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    price_cents INTEGER NOT NULL,
    customizations JSONB
  );
  
  CREATE TABLE IF NOT EXISTS order_tracking (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_message TEXT NOT NULL,
    event_data JSONB,
    driver_location JSONB,
    estimated_time_remaining INTEGER, -- minutes
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS delivery_locations (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    accuracy DECIMAL(6,2),
    speed DECIMAL(5,2), -- km/h
    bearing INTEGER, -- degrees 0-360
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_order_tracking_order ON order_tracking(order_id);
  CREATE INDEX IF NOT EXISTS idx_delivery_locations_order ON delivery_locations(order_id);
  CREATE INDEX IF NOT EXISTS idx_delivery_locations_driver ON delivery_locations(driver_id);
  `;
  await pool.query(sql);
}

async function createOrder({ id, userId, merchantId, deliveryAddress, instructions, items, totalCents }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO orders(id, user_id, merchant_id, status, delivery_address, instructions, total_amount_cents)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [id, userId || null, merchantId, 'PENDING', deliveryAddress, instructions || null, totalCents]
    );
    for (const it of items) {
      const itemRowId = uuidv4();
      await client.query(
        `INSERT INTO order_items(id, order_id, item_id, quantity, price_cents)
         VALUES($1, $2, $3, $4, $5)`,
        [itemRowId, id, it.item_id, it.quantity, it.price_cents]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getOrder(id) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  if (rows.length === 0) return null;
  const order = rows[0];
  const items = await pool.query('SELECT item_id, item_name, quantity, price_cents, customizations FROM order_items WHERE order_id = $1', [id]);
  order.items = items.rows;
  return order;
}

async function getUserOrders(userId, limit = 20, offset = 0) {
  const { rows } = await pool.query(
    `SELECT id, merchant_id, status, delivery_address, total_amount_cents, 
            estimated_delivery_time, created_at, updated_at
     FROM orders WHERE user_id = $1 
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  
  // Get items for each order
  for (const order of rows) {
    const items = await pool.query(
      'SELECT item_id, item_name, quantity, price_cents FROM order_items WHERE order_id = $1', 
      [order.id]
    );
    order.items = items.rows;
  }
  
  return rows;
}

function canTransition(from, to) {
  const idx = ORDER_STATUSES.indexOf(from);
  const nextMap = {
    'PENDING': ['CONFIRMED','CANCELLED'],
    'CONFIRMED': ['PREPARING','CANCELLED'],
    'PREPARING': ['DISPATCHED','CANCELLED'],
    'DISPATCHED': ['DELIVERED'],
    'DELIVERED': [],
    'CANCELLED': [],
  };
  return nextMap[from]?.includes(to) || false;
}

async function updateStatus(id, newStatus, eventData = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Update order status
    const { rows } = await client.query(
      'UPDATE orders SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *', 
      [id, newStatus]
    );
    
    if (rows.length === 0) {
      throw new Error('Order not found');
    }
    
    // Add tracking event
    const eventMessage = ORDER_TRACKING_EVENTS[newStatus] || `Order status changed to ${newStatus}`;
    await addTrackingEvent(client, id, newStatus, eventMessage, eventData);
    
    await client.query('COMMIT');
    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function addTrackingEvent(client, orderId, eventType, message, eventData = {}, estimatedTimeRemaining = null) {
  const trackingId = uuidv4();
  await client.query(
    `INSERT INTO order_tracking (id, order_id, event_type, event_message, event_data, estimated_time_remaining)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [trackingId, orderId, eventType, message, JSON.stringify(eventData), estimatedTimeRemaining]
  );
}

async function updateDriverLocation(orderId, driverId, latitude, longitude, accuracy, speed, bearing) {
  const locationId = uuidv4();
  await pool.query(
    `INSERT INTO delivery_locations (id, order_id, driver_id, latitude, longitude, accuracy, speed, bearing)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [locationId, orderId, driverId, latitude, longitude, accuracy, speed, bearing]
  );
  
  // Get latest location for real-time updates
  return {
    orderId,
    driverId,
    latitude,
    longitude,
    accuracy,
    speed,
    bearing,
    timestamp: new Date()
  };
}

async function getOrderTracking(orderId) {
  const { rows } = await pool.query(
    `SELECT event_type, event_message, event_data, driver_location, estimated_time_remaining, timestamp
     FROM order_tracking WHERE order_id = $1 ORDER BY timestamp ASC`,
    [orderId]
  );
  return rows;
}

async function getDriverLocation(orderId) {
  const { rows } = await pool.query(
    `SELECT latitude, longitude, accuracy, speed, bearing, timestamp
     FROM delivery_locations WHERE order_id = $1 
     ORDER BY timestamp DESC LIMIT 1`,
    [orderId]
  );
  return rows[0] || null;
}

async function estimateDeliveryTime(orderId, restaurantCoords, deliveryCoords) {
  // Simple estimation algorithm - can be enhanced with real traffic data
  const distance = calculateDistance(
    restaurantCoords.lat, restaurantCoords.lon,
    deliveryCoords.lat, deliveryCoords.lon
  );
  
  const averageSpeed = 25; // km/h in city
  const preparationTime = 20; // minutes
  const estimatedMinutes = preparationTime + Math.ceil((distance / averageSpeed) * 60);
  
  const estimatedDeliveryTime = new Date();
  estimatedDeliveryTime.setMinutes(estimatedDeliveryTime.getMinutes() + estimatedMinutes);
  
  await pool.query(
    'UPDATE orders SET estimated_delivery_time = $2 WHERE id = $1',
    [orderId, estimatedDeliveryTime]
  );
  
  return {
    estimatedMinutes,
    estimatedDeliveryTime,
    distance: Math.round(distance * 100) / 100 // round to 2 decimals
  };
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  // Haversine formula for distance calculation
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function assignDriver(orderId, driverId, driverPhone) {
  const { rows } = await pool.query(
    `UPDATE orders SET driver_id = $2, driver_phone = $3, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $1 RETURNING *`,
    [orderId, driverId, driverPhone]
  );
  
  if (rows.length > 0) {
    // Add tracking event
    const client = await pool.connect();
    try {
      await addTrackingEvent(
        client, 
        orderId, 
        'DRIVER_ASSIGNED', 
        'Delivery driver assigned to your order',
        { driverId, driverPhone }
      );
    } finally {
      client.release();
    }
  }
  
  return rows[0] || null;
}

module.exports = { 
  ensureSchema, 
  createOrder, 
  getOrder,
  getUserOrders,
  updateStatus, 
  canTransition, 
  ORDER_STATUSES,
  ORDER_TRACKING_EVENTS,
  addTrackingEvent,
  updateDriverLocation,
  getOrderTracking,
  getDriverLocation,
  estimateDeliveryTime,
  calculateDistance,
  assignDriver
};
