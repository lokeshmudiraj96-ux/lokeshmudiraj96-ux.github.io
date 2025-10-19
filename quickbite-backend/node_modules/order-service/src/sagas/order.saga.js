const { Kafka } = require('kafkajs');
const Order = require('../models/order.model');

class OrderSaga {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'order-service',
      brokers: process.env.KAFKA_BROKERS.split(',')
    });
  }

  async initiateOrder(orderData) {
    try {
      // 1. Create order in pending state
      const order = await Order.create({
        ...orderData,
        status: 'PENDING'
      });

      // 2. Request payment
      await this.requestPayment(order);

      return order;
    } catch (error) {
      await this.compensateOrder(order.id);
      throw error;
    }
  }

  async requestPayment(order) {
    const producer = this.kafka.producer();
    await producer.connect();

    await producer.send({
      topic: 'payment-requests',
      messages: [{
        key: order.id,
        value: JSON.stringify({
          orderId: order.id,
          amount: order.totalAmount,
          userId: order.userId
        })
      }]
    });
  }

  async handlePaymentResult(paymentResult) {
    const order = await Order.findById(paymentResult.orderId);
    
    if (paymentResult.status === 'SUCCESS') {
      order.status = 'PAID';
      await this.initiateDelivery(order);
    } else {
      order.status = 'PAYMENT_FAILED';
      await this.compensateOrder(order.id);
    }

    await order.save();
  }

  async initiateDelivery(order) {
    const producer = this.kafka.producer();
    await producer.connect();

    await producer.send({
      topic: 'delivery-requests',
      messages: [{
        key: order.id,
        value: JSON.stringify({
          orderId: order.id,
          deliveryAddress: order.deliveryAddress,
          restaurantId: order.restaurantId
        })
      }]
    });
  }

  async compensateOrder(orderId) {
    const order = await Order.findById(orderId);
    order.status = 'CANCELLED';
    await order.save();

    // Notify other services about cancellation
    const producer = this.kafka.producer();
    await producer.connect();

    await producer.send({
      topic: 'order-compensations',
      messages: [{
        key: orderId,
        value: JSON.stringify({ orderId })
      }]
    });
  }
}

module.exports = new OrderSaga();