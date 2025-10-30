const express = require('express');
const cors = require('cors');
const path = require('path');

// QuickBite Production Server
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:8080', 
    'http://127.0.0.1:8080',
    'https://lokeshmudiraj96-ux.github.io',
    'https://quickbite-demo.netlify.app'
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Demo users for testing
const demoUsers = {
  'demo@quickbite.com': {
    id: '1',
    name: 'Demo Customer',
    email: 'demo@quickbite.com',
    phone: '+1234567890',
    role: 'customer',
    password: 'demo123',
    isVerified: true
  },
  'admin@quickbite.com': {
    id: '2',
    name: 'Admin User',
    email: 'admin@quickbite.com',
    phone: '+1234567891',
    role: 'admin',
    password: 'admin123',
    isVerified: true
  },
  'driver@quickbite.com': {
    id: '3',
    name: 'Demo Driver',
    email: 'driver@quickbite.com',
    phone: '+1234567892',
    role: 'driver',
    password: 'driver123',
    isVerified: true
  }
};

// Demo restaurants and menu data
const demoRestaurants = [
  {
    id: '1',
    name: 'Pizza Palace',
    description: 'Authentic Italian pizzas made fresh',
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=300',
    rating: 4.5,
    deliveryTime: '25-35 min',
    category: 'Italian',
    menu: [
      {
        id: '1',
        name: 'Margherita Pizza',
        description: 'Fresh tomatoes, mozzarella, and basil',
        price: 12.99,
        image: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=300',
        category: 'Pizza'
      },
      {
        id: '2',
        name: 'Pepperoni Pizza',
        description: 'Classic pepperoni with mozzarella cheese',
        price: 14.99,
        image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=300',
        category: 'Pizza'
      }
    ]
  },
  {
    id: '2',
    name: 'Burger Barn',
    description: 'Gourmet burgers and crispy fries',
    image: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=300',
    rating: 4.3,
    deliveryTime: '20-30 min',
    category: 'American',
    menu: [
      {
        id: '3',
        name: 'Classic Cheeseburger',
        description: 'Beef patty with cheese, lettuce, and tomato',
        price: 9.99,
        image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300',
        category: 'Burgers'
      },
      {
        id: '4',
        name: 'Crispy Chicken Burger',
        description: 'Fried chicken breast with spicy mayo',
        price: 11.99,
        image: 'https://images.unsplash.com/photo-1606755962773-d324e2d53401?w=300',
        category: 'Burgers'
      }
    ]
  }
];

// Generate JWT token (simplified for demo)
function generateDemoToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };
  
  // In a real app, you'd use proper JWT signing
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'demo-server',
    message: 'QuickBite Demo Server Running',
    timestamp: new Date().toISOString() 
  });
});

// Authentication endpoints
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  console.log(`🔐 Login attempt: ${email}`);
  
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required'
    });
  }

  const user = demoUsers[email.toLowerCase()];
  
  if (!user || user.password !== password) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  const token = generateDemoToken(user);
  
  console.log(`✅ Login successful: ${user.name} (${user.role})`);
  
  res.json({
    success: true,
    message: 'Login successful',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isVerified: user.isVerified
    },
    tokens: {
      accessToken: token,
      refreshToken: token + '_refresh'
    },
    token_type: 'Bearer'
  });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  
  if (demoUsers[email.toLowerCase()]) {
    return res.status(400).json({
      success: false,
      message: 'Email already registered'
    });
  }

  const newUser = {
    id: String(Object.keys(demoUsers).length + 1),
    name,
    email: email.toLowerCase(),
    role: 'customer',
    password,
    isVerified: true
  };
  
  demoUsers[email.toLowerCase()] = newUser;
  const token = generateDemoToken(newUser);
  
  console.log(`📝 New user registered: ${name}`);
  
  res.status(201).json({
    success: true,
    message: 'Registration successful',
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      isVerified: newUser.isVerified
    },
    tokens: {
      accessToken: token,
      refreshToken: token + '_refresh'
    }
  });
});

// User profile endpoint
app.get('/api/users/me', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }

  try {
    const token = authHeader.substring(7);
    const payload = JSON.parse(Buffer.from(token, 'base64').toString());
    
    // Find user by ID from token
    const user = Object.values(demoUsers).find(u => u.id === payload.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👤 User profile requested: ${user.name}`);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

// OTP endpoints for mobile compatibility
app.post('/api/auth/otp/request', (req, res) => {
  const { phone } = req.body;
  console.log(`📱 OTP requested for: ${phone}`);
  
  res.json({
    success: true,
    status: 'OTP_SENT',
    message: 'OTP sent successfully (Demo: use 123456)',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  });
});

app.post('/api/auth/otp', (req, res) => {
  const { phone } = req.body;
  console.log(`📱 OTP requested for: ${phone}`);
  
  res.json({
    success: true,
    status: 'OTP_SENT',
    message: 'OTP sent successfully (Demo: use 123456)',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  });
});

app.post('/api/auth/otp/verify', (req, res) => {
  const { phone, otp, name } = req.body;
  
  console.log(`📱 OTP verification: ${phone} with ${otp}`);
  
  if (otp !== '123456') {
    return res.status(400).json({
      success: false,
      message: 'Invalid OTP (Demo: use 123456)',
      code: 'OTP_INVALID'
    });
  }

  // Find or create user for this phone
  let user = Object.values(demoUsers).find(u => u.phone === phone);
  
  if (!user) {
    user = {
      id: String(Object.keys(demoUsers).length + 1),
      name: name || `User ${phone.slice(-4)}`,
      phone,
      role: 'customer',
      isVerified: true
    };
    demoUsers[`phone_${phone}`] = user;
  }

  const token = generateDemoToken(user);
  
  console.log(`✅ OTP verified: ${user.name}`);
  
  res.json({
    success: true,
    message: 'Login successful',
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      isVerified: user.isVerified
    },
    tokens: {
      accessToken: token,
      refreshToken: token + '_refresh'
    },
    token_type: 'Bearer'
  });
});

app.post('/api/auth/verify', (req, res) => {
  const { phone, otp, name } = req.body;
  
  console.log(`📱 OTP verification: ${phone} with ${otp}`);
  
  if (otp !== '123456') {
    return res.status(400).json({
      success: false,
      message: 'Invalid OTP (Demo: use 123456)',
      code: 'OTP_INVALID'
    });
  }

  // Find or create user for this phone
  let user = Object.values(demoUsers).find(u => u.phone === phone);
  
  if (!user) {
    user = {
      id: String(Object.keys(demoUsers).length + 1),
      name: name || `User ${phone.slice(-4)}`,
      phone,
      role: 'customer',
      isVerified: true
    };
    demoUsers[`phone_${phone}`] = user;
  }

  const token = generateDemoToken(user);
  
  console.log(`✅ OTP verified: ${user.name}`);
  
  res.json({
    success: true,
    message: 'Login successful',
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      isVerified: user.isVerified
    },
    tokens: {
      accessToken: token,
      refreshToken: token + '_refresh'
    },
    token_type: 'Bearer'
  });
});

// Restaurant and menu endpoints
app.get('/api/restaurants', (req, res) => {
  console.log('🍽️ Fetching restaurants');
  res.json({
    success: true,
    data: demoRestaurants
  });
});

app.get('/api/restaurants/:id', (req, res) => {
  const restaurant = demoRestaurants.find(r => r.id === req.params.id);
  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: 'Restaurant not found'
    });
  }
  
  console.log(`🍽️ Fetching restaurant: ${restaurant.name}`);
  res.json({
    success: true,
    data: restaurant
  });
});

app.get('/api/restaurants/:id/menu', (req, res) => {
  const restaurant = demoRestaurants.find(r => r.id === req.params.id);
  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: 'Restaurant not found'
    });
  }
  
  console.log(`📋 Fetching menu for: ${restaurant.name}`);
  res.json({
    success: true,
    data: restaurant.menu
  });
});

// Order endpoints
let orders = [];
let orderIdCounter = 1;

app.post('/api/orders', (req, res) => {
  const { restaurantId, items, deliveryAddress } = req.body;
  
  const restaurant = demoRestaurants.find(r => r.id === restaurantId);
  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: 'Restaurant not found'
    });
  }

  const order = {
    id: String(orderIdCounter++),
    restaurantId,
    restaurantName: restaurant.name,
    items,
    deliveryAddress,
    status: 'confirmed',
    total: items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    estimatedDelivery: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  };
  
  orders.push(order);
  
  console.log(`🛒 New order created: ${order.id} from ${restaurant.name}`);
  
  res.status(201).json({
    success: true,
    message: 'Order placed successfully',
    data: order
  });
});

app.get('/api/orders', (req, res) => {
  console.log(`📦 Fetching ${orders.length} orders`);
  res.json({
    success: true,
    data: orders
  });
});

app.get('/api/orders/:id', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }
  
  console.log(`📦 Fetching order: ${order.id}`);
  res.json({
    success: true,
    data: order
  });
});

// Demo data endpoint
app.get('/api/demo-info', (req, res) => {
  res.json({
    success: true,
    message: 'QuickBite Demo Server',
    users: Object.keys(demoUsers).length,
    restaurants: demoRestaurants.length,
    orders: orders.length
  });
});

// Default response for unknown routes
app.get('/', (req, res) => {
  res.json({
    message: 'QuickBite Demo API Server',
    status: 'running',
    endpoints: {
      auth: '/api/auth/*',
      restaurants: '/api/restaurants',
      orders: '/api/orders',
      demo: '/api/demo-info'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 QuickBite Demo Server Running!`);
  console.log(`📍 Local URL: http://localhost:${PORT}`);
  console.log(`🌐 Network URL: http://127.0.0.1:${PORT}`);
  console.log(`\n🔐 Demo Login Credentials:`);
  console.log(`   Customer: demo@quickbite.com / demo123`);
  console.log(`   Admin: admin@quickbite.com / admin123`);
  console.log(`   Driver: driver@quickbite.com / driver123`);
  console.log(`\n📱 OTP Login: Use any phone number with OTP: 123456`);
  console.log(`\n🛠️  API Endpoints:`);
  console.log(`   POST /api/auth/login - Email/password login`);
  console.log(`   POST /api/auth/otp - Request OTP`);
  console.log(`   POST /api/auth/verify - Verify OTP`);
  console.log(`   GET /api/restaurants - List restaurants`);
  console.log(`   POST /api/orders - Place order`);
  console.log(`\n✨ Ready for testing!`);
});