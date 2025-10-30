const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const Order = require('../models/order.model');

const CATALOG_BASE = process.env.CATALOG_BASE_URL || 'http://localhost:3003/api/catalog';
const NOTIF_BASE = process.env.NOTIF_BASE_URL || 'http://localhost:3007/api/notifications';
const DELIVERY_BASE = process.env.DELIVERY_BASE_URL || 'http://localhost:3006/api/delivery';

const createOrderSchema = Joi.object({
  merchant_id: Joi.string().guid({ version: 'uuidv4' }).required(),
  items: Joi.array().items(Joi.object({
    item_id: Joi.string().guid({ version: 'uuidv4' }).required(),
    quantity: Joi.number().integer().min(1).required(),
  })).min(1).required(),
  delivery_address: Joi.string().min(3).required(),
  instructions: Joi.string().max(500).optional(),
});

async function fetchJson(url, options = {}) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error(`Upstream ${url} failed: ${r.status}`);
  return r.json();
}

async function sendNotification(userId, type, title, message, orderId, priority = 'MEDIUM', token) {
  try {
    if (!token) {
      console.warn('No auth token available for notification; skipping');
      return null;
    }
    const resp = await fetch(`${NOTIF_BASE}/send`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, type, title, message, order_id: orderId, priority }),
    });
    if (resp.ok) {
      const data = await resp.json();
      console.log(`Notification sent: ${data.notification_id}`);
      return data.notification_id;
    } else {
      console.warn(`Notification send failed: ${resp.status}`);
      return null;
    }
  } catch (e) {
    console.error('Failed to send notification:', e.message);
    return null;
  }
}

async function assignDelivery(orderId, retryCount = 0, token) {
  const maxRetries = parseInt(process.env.MAX_DELIVERY_RETRIES || '3', 10);
  try {
    if (!token) {
      console.warn('No auth token for delivery assignment; skipping');
      return { success: false, reason: 'NO_TOKEN' };
    }
    // In production, fetch available agent from a pool/queue
    const agentResp = await fetch(`${DELIVERY_BASE}/debug/agents`);
    if (!agentResp.ok) throw new Error('Cannot fetch agents');
    const agentsData = await agentResp.json();
    const agent = agentsData.agents?.[0];
    if (!agent || !agent.id) throw new Error('No agents available');

    const resp = await fetch(`${DELIVERY_BASE}/assign`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, agent_id: agent.id }),
    });
    if (resp.ok) {
      const data = await resp.json();
      return { success: true, delivery_id: data.delivery_id, agent_id: data.agent_id };
    } else if (resp.status === 503 || resp.status === 409) {
      // No agent available or agent at capacity
      if (retryCount < maxRetries) {
        console.log(`Delivery assignment retry ${retryCount + 1}/${maxRetries} for order ${orderId}`);
        await new Promise(res => setTimeout(res, 2000 * (retryCount + 1))); // backoff
        return assignDelivery(orderId, retryCount + 1, token);
      } else {
        return { success: false, reason: 'MAX_RETRIES_EXCEEDED' };
      }
    } else {
      throw new Error(`Delivery assign failed: ${resp.status}`);
    }
  } catch (e) {
    console.error('Delivery assignment error:', e.message);
    if (retryCount < maxRetries) {
      await new Promise(res => setTimeout(res, 2000 * (retryCount + 1)));
      return assignDelivery(orderId, retryCount + 1, token);
    }
    return { success: false, reason: e.message };
  }
}

exports.create = async (req, res) => {
  try {
    const { error, value } = createOrderSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Invalid request', details: error.details });

    const { merchant_id, items, delivery_address, instructions } = value;

    // Validate merchant exists
    const merchant = await fetchJson(`${CATALOG_BASE}/merchants/${merchant_id}`);
    if (!merchant?.id) return res.status(404).json({ success: false, message: 'Merchant not found' });

    // Validate items and availability; compute total
    const menuResp = await fetchJson(`${CATALOG_BASE}/merchants/${merchant_id}/menu`);
    const menuMap = new Map((menuResp.items || []).map(i => [i.id, i]));

    let total = 0;
    const enriched = [];
    for (const it of items) {
      const mi = menuMap.get(it.item_id);
      if (!mi) return res.status(404).json({ success: false, message: `Item not found: ${it.item_id}`, code: 'ITEM_NOT_FOUND' });
      if (mi.is_out_of_stock) return res.status(409).json({ success: false, message: `Item out of stock: ${it.item_id}`, code: 'ITEM_OUT_OF_STOCK' });
      const line = mi.price_cents * it.quantity;
      total += line;
      enriched.push({ item_id: it.item_id, quantity: it.quantity, price_cents: mi.price_cents });
    }

    const id = uuidv4();
    await Order.createOrder({
      id,
      userId: req.userId || null,
      merchantId: merchant_id,
      deliveryAddress: delivery_address,
      instructions,
      items: enriched,
      totalCents: total,
    });

    return res.status(201).json({ order_id: id, status: 'PENDING', total_amount_cents: total });
  } catch (e) {
    console.error('create order failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

exports.getById = async (req, res) => {
  try {
    const id = req.params.id;
    const order = await Order.getOrder(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    return res.json({
      order_id: order.id,
      status: order.status,
      total_amount_cents: order.total_amount_cents,
      items: order.items,
    });
  } catch (e) {
    console.error('get order failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

const updateSchema = Joi.object({
  status: Joi.string().valid('CONFIRMED','PREPARING','DISPATCHED','DELIVERED','CANCELLED').required(),
});

exports.updateStatus = async (req, res) => {
  try {
    const id = req.params.id;
    const { error, value } = updateSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: 'Invalid status' });
    const order = await Order.getOrder(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!Order.canTransition(order.status, value.status)) {
      return res.status(400).json({ success: false, message: 'Invalid status transition' });
    }
    const updated = await Order.updateStatus(id, value.status);
    
    // Send notification on status change
    if (updated.user_id) {
      const messages = {
        'CONFIRMED': { title: 'Order Confirmed', message: `Your order #${id.substring(0, 8)} has been confirmed and is being prepared.`, priority: 'HIGH' },
        'PREPARING': { title: 'Order Preparing', message: `Your order is being prepared by the restaurant.` },
        'DISPATCHED': { title: 'Order Dispatched', message: `Your order is on the way!`, priority: 'HIGH' },
        'DELIVERED': { title: 'Order Delivered', message: `Your order has been delivered. Enjoy your meal!`, priority: 'HIGH' },
        'CANCELLED': { title: 'Order Cancelled', message: `Your order #${id.substring(0, 8)} has been cancelled.`, priority: 'MEDIUM' },
      };
      const notifData = messages[value.status];
      if (notifData) {
        await sendNotification(updated.user_id, 'PUSH', notifData.title, notifData.message, id, notifData.priority || 'MEDIUM', req.accessToken);
      }
    }

    return res.json({
      order_id: updated.id,
      status: updated.status,
      total_amount_cents: updated.total_amount_cents,
      items: order.items,
    });
  } catch (e) {
    console.error('update status failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

// Payment webhook handler (called by Payment Service)
const confirmPaymentSchema = Joi.object({
  order_id: Joi.string().guid({ version: 'uuidv4' }).required(),
  status: Joi.string().valid('SUCCESS', 'FAILED').required(),
  payment_id: Joi.string().optional(),
});

exports.confirmPayment = async (req, res) => {
  try {
    const { error, value } = confirmPaymentSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: 'Invalid request' });
    const { order_id, status, payment_id } = value;

    const order = await Order.getOrder(order_id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (status === 'SUCCESS') {
      // Payment successful → move to CONFIRMED
      if (Order.canTransition(order.status, 'CONFIRMED')) {
        const updated = await Order.updateStatus(order_id, 'CONFIRMED');
        // Notify user
        if (updated.user_id) {
          await sendNotification(updated.user_id, 'PUSH', 'Payment Successful', `Your payment for order #${order_id.substring(0, 8)} was successful. Your order is confirmed!`, order_id, 'HIGH', req.accessToken);
        }
        // Attempt delivery assignment
        const deliveryResult = await assignDelivery(order_id, 0, req.accessToken);
        if (!deliveryResult.success) {
          // Mark order as DELIVERY_DELAYED
          await Order.updateStatus(order_id, 'PENDING'); // Or add new status 'DELIVERY_DELAYED' if model supports
          if (updated.user_id) {
            await sendNotification(updated.user_id, 'PUSH', 'Delivery Delayed', `We're finding a delivery partner for your order. You'll be notified soon.`, order_id, 'MEDIUM', req.accessToken);
          }
        }
        return res.json({ success: true, order_status: 'CONFIRMED' });
      } else {
        return res.status(400).json({ success: false, message: 'Invalid order state for payment confirmation' });
      }
    } else if (status === 'FAILED') {
      // Payment failed → notify user
      if (order.user_id) {
        await sendNotification(order.user_id, 'PUSH', 'Payment Failed', `Your payment for order #${order_id.substring(0, 8)} failed. Please retry or choose another payment method.`, order_id, 'HIGH', req.accessToken);
      }
      // Optionally update order status to PAYMENT_FAILED if model supports, or leave as PENDING
      return res.json({ success: true, order_status: order.status });
    } else {
      return res.status(400).json({ success: false, message: 'Unknown payment status' });
    }
  } catch (e) {
    console.error('confirm payment failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

// Delivery location update handler (called by Delivery Service or via WebSocket)
const deliveryLocationSchema = Joi.object({
  delivery_id: Joi.string().guid({ version: 'uuidv4' }).required(),
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
});

// Enhanced real-time tracking methods
exports.getUserOrders = async (req, res) => {
  try {
    const userId = req.userId;
    const orders = await Order.getUserOrders(userId);
    return res.json({ orders });
  } catch (e) {
    console.error('get user orders failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

exports.getOrderTracking = async (req, res) => {
  try {
    const orderId = req.params.id;
    const tracking = await Order.getOrderTracking(orderId);
    return res.json({ order_id: orderId, tracking_events: tracking });
  } catch (e) {
    console.error('get order tracking failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

exports.getDriverLocation = async (req, res) => {
  try {
    const orderId = req.params.id;
    const location = await Order.getDriverLocation(orderId);
    if (!location) {
      return res.status(404).json({ success: false, message: 'No driver location available' });
    }
    return res.json({ order_id: orderId, driver_location: location });
  } catch (e) {
    console.error('get driver location failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

exports.estimateDeliveryTime = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { restaurant_coords, delivery_coords } = req.body;
    
    const estimation = await Order.estimateDeliveryTime(orderId, restaurant_coords, delivery_coords);
    return res.json({ 
      order_id: orderId, 
      estimated_delivery_time: estimation.estimatedDeliveryTime,
      estimated_minutes: estimation.estimatedMinutes,
      distance_km: estimation.distance
    });
  } catch (e) {
    console.error('estimate delivery time failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

exports.assignDriver = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { driver_id, driver_phone } = req.body;
    
    const order = await Order.assignDriver(orderId, driver_id, driver_phone);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    // Notify customer
    if (order.user_id) {
      await sendNotification(
        order.user_id, 
        'PUSH', 
        'Driver Assigned', 
        `A delivery driver has been assigned to your order. They will contact you at ${driver_phone}`, 
        orderId, 
        'HIGH', 
        req.accessToken
      );
    }
    
    // Broadcast via WebSocket
    const io = req.app.get('socketio');
    if (io) {
      io.to(orderId).emit('driver_assigned', { 
        order_id: orderId, 
        driver_id, 
        driver_phone, 
        timestamp: new Date().toISOString() 
      });
    }
    
    return res.json({ success: true, driver_assigned: true });
  } catch (e) {
    console.error('assign driver failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

exports.updateDriverLocation = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { driver_id, latitude, longitude, accuracy, speed, bearing } = req.body;
    
    const location = await Order.updateDriverLocation(
      orderId, driver_id, latitude, longitude, accuracy, speed, bearing
    );
    
    // Broadcast location via WebSocket
    const io = req.app.get('socketio');
    if (io) {
      io.to(orderId).emit('driver_location_update', {
        order_id: orderId,
        driver_location: {
          latitude,
          longitude,
          accuracy,
          speed,
          bearing,
          timestamp: location.timestamp
        }
      });
    }
    
    return res.json({ success: true, location_updated: true });
  } catch (e) {
    console.error('update driver location failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

exports.restaurantAccept = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { preparation_time_minutes } = req.body;
    
    const order = await Order.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    const updated = await Order.updateStatus(orderId, 'CONFIRMED', {
      preparation_time_minutes: preparation_time_minutes || 20
    });
    
    // Notify customer
    if (updated.user_id) {
      await sendNotification(
        updated.user_id,
        'PUSH',
        'Order Accepted',
        `Restaurant has accepted your order. Estimated preparation time: ${preparation_time_minutes || 20} minutes`,
        orderId,
        'HIGH',
        req.accessToken
      );
    }
    
    return res.json({ success: true, status: 'CONFIRMED', preparation_time_minutes });
  } catch (e) {
    console.error('restaurant accept failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

exports.markFoodReady = async (req, res) => {
  try {
    const orderId = req.params.id;
    
    const updated = await Order.updateStatus(orderId, 'READY_FOR_PICKUP', {
      food_ready_time: new Date()
    });
    
    // Notify driver and customer
    if (updated.user_id) {
      await sendNotification(
        updated.user_id,
        'PUSH',
        'Food Ready',
        'Your food is ready for pickup! Driver will collect it soon.',
        orderId,
        'HIGH',
        req.accessToken
      );
    }
    
    // Broadcast via WebSocket
    const io = req.app.get('socketio');
    if (io) {
      io.to(orderId).emit('food_ready', { 
        order_id: orderId, 
        timestamp: new Date().toISOString() 
      });
    }
    
    return res.json({ success: true, status: 'READY_FOR_PICKUP' });
  } catch (e) {
    console.error('mark food ready failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

exports.markOrderPickedUp = async (req, res) => {
  try {
    const orderId = req.params.id;
    
    const updated = await Order.updateStatus(orderId, 'OUT_FOR_DELIVERY', {
      pickup_time: new Date()
    });
    
    // Notify customer
    if (updated.user_id) {
      await sendNotification(
        updated.user_id,
        'PUSH',
        'Order Picked Up',
        'Your order has been picked up and is on the way!',
        orderId,
        'HIGH',
        req.accessToken
      );
    }
    
    return res.json({ success: true, status: 'OUT_FOR_DELIVERY' });
  } catch (e) {
    console.error('mark order picked up failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

exports.markOrderDelivered = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { delivery_photo, delivery_notes } = req.body;
    
    const updated = await Order.updateStatus(orderId, 'DELIVERED', {
      delivery_time: new Date(),
      delivery_photo,
      delivery_notes
    });
    
    // Notify customer
    if (updated.user_id) {
      await sendNotification(
        updated.user_id,
        'PUSH',
        'Order Delivered',
        'Your order has been delivered! Enjoy your meal and don\'t forget to rate us.',
        orderId,
        'HIGH',
        req.accessToken
      );
    }
    
    return res.json({ success: true, status: 'DELIVERED' });
  } catch (e) {
    console.error('mark order delivered failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { reason } = req.body;
    
    const order = await Order.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    // Check if cancellation is allowed
    if (!['PENDING', 'CONFIRMED', 'PREPARING'].includes(order.status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order cannot be cancelled at this stage' 
      });
    }
    
    const updated = await Order.updateStatus(orderId, 'CANCELLED', {
      cancellation_reason: reason,
      cancelled_by: 'customer'
    });
    
    return res.json({ success: true, status: 'CANCELLED' });
  } catch (e) {
    console.error('cancel order failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

exports.rateOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { rating, review, delivery_rating, food_rating } = req.body;
    
    // Implementation would save rating to database
    // For now, just return success
    
    return res.json({ success: true, rating_submitted: true });
  } catch (e) {
    console.error('rate order failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

exports.updateDeliveryLocation = async (req, res) => {
  try {
    const { error, value } = deliveryLocationSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: 'Invalid request' });
    const { delivery_id, lat, lng } = value;
    // Broadcast location via WebSocket to subscribed clients (implementation below)
    const io = req.app.get('socketio');
    if (io) {
      io.to(delivery_id).emit('location_update', { delivery_id, lat, lng, timestamp: new Date().toISOString() });
    }
    return res.json({ success: true });
  } catch (e) {
    console.error('update delivery location failed', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};
