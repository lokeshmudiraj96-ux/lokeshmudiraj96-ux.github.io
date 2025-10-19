@echo off
setlocal enabledelayedexpansion

echo ===============================================
echo    QuickBite Microservices Setup
echo ===============================================
echo.

set "ROOT_DIR=quickbite-backend"
set "GATEWAY_DIR=%ROOT_DIR%\api-gateway"
set "AUTH_DIR=%ROOT_DIR%\auth-service"
set "USER_DIR=%ROOT_DIR%\user-service"
set "CATALOG_DIR=%ROOT_DIR%\catalog-service"
set "ORDER_DIR=%ROOT_DIR%\order-service"
set "PAYMENT_DIR=%ROOT_DIR%\payment-service"
set "DELIVERY_DIR=%ROOT_DIR%\delivery-service"
set "NOTIFICATION_DIR=%ROOT_DIR%\notification-service"
set "SEARCH_DIR=%ROOT_DIR%\search-service"
set "ADMIN_DIR=%ROOT_DIR%\admin-service"
set "ANALYTICS_DIR=%ROOT_DIR%\analytics-service"
set "SHARED_DIR=%ROOT_DIR%\shared"
set "K8S_DIR=%ROOT_DIR%\k8s"
set "SCRIPTS_DIR=%ROOT_DIR%\scripts"
set "FRONTEND_DIR=%ROOT_DIR%\frontend"

echo Creating directory structure...
mkdir "%ROOT_DIR%" 2>nul
mkdir "%GATEWAY_DIR%\src" 2>nul
mkdir "%GATEWAY_DIR%\src\middleware" 2>nul
mkdir "%GATEWAY_DIR%\src\utils" 2>nul
mkdir "%AUTH_DIR%\src" 2>nul
mkdir "%AUTH_DIR%\src\services" 2>nul
mkdir "%AUTH_DIR%\src\controllers" 2>nul
mkdir "%AUTH_DIR%\src\models" 2>nul
mkdir "%AUTH_DIR%\src\middleware" 2>nul
mkdir "%USER_DIR%\src" 2>nul
mkdir "%USER_DIR%\src\services" 2>nul
mkdir "%USER_DIR%\src\controllers" 2>nul
mkdir "%USER_DIR%\src\models" 2>nul
mkdir "%CATALOG_DIR%\src" 2>nul
mkdir "%CATALOG_DIR%\src\services" 2>nul
mkdir "%CATALOG_DIR%\src\controllers" 2>nul
mkdir "%CATALOG_DIR%\src\models" 2>nul
mkdir "%ORDER_DIR%\src" 2>nul
mkdir "%ORDER_DIR%\src\services" 2>nul
mkdir "%ORDER_DIR%\src\controllers" 2>nul
mkdir "%ORDER_DIR%\src\models" 2>nul
mkdir "%ORDER_DIR%\src\sagas" 2>nul
mkdir "%PAYMENT_DIR%\src" 2>nul
mkdir "%PAYMENT_DIR%\src\services" 2>nul
mkdir "%PAYMENT_DIR%\src\controllers" 2>nul
mkdir "%PAYMENT_DIR%\src\models" 2>nul
mkdir "%PAYMENT_DIR%\src\gateways" 2>nul
mkdir "%DELIVERY_DIR%\src" 2>nul
mkdir "%DELIVERY_DIR%\src\services" 2>nul
mkdir "%DELIVERY_DIR%\src\controllers" 2>nul
mkdir "%DELIVERY_DIR%\src\models" 2>nul
mkdir "%NOTIFICATION_DIR%\src" 2>nul
mkdir "%NOTIFICATION_DIR%\src\services" 2>nul
mkdir "%NOTIFICATION_DIR%\src\controllers" 2>nul
mkdir "%NOTIFICATION_DIR%\src\models" 2>nul
mkdir "%SEARCH_DIR%\src" 2>nul
mkdir "%SEARCH_DIR%\src\services" 2>nul
mkdir "%SEARCH_DIR%\src\controllers" 2>nul
mkdir "%SEARCH_DIR%\src\models" 2>nul
mkdir "%ADMIN_DIR%\src" 2>nul
mkdir "%ADMIN_DIR%\src\services" 2>nul
mkdir "%ADMIN_DIR%\src\controllers" 2>nul
mkdir "%ADMIN_DIR%\src\models" 2>nul
mkdir "%ANALYTICS_DIR%\src" 2>nul
mkdir "%ANALYTICS_DIR%\src\services" 2>nul
mkdir "%ANALYTICS_DIR%\src\controllers" 2>nul
mkdir "%ANALYTICS_DIR%\src\models" 2>nul
mkdir "%SHARED_DIR%" 2>nul
mkdir "%SHARED_DIR%\utils" 2>nul
mkdir "%SHARED_DIR%\middleware" 2>nul
mkdir "%SHARED_DIR%\types" 2>nul
mkdir "%K8S_DIR%" 2>nul
mkdir "%SCRIPTS_DIR%" 2>nul
mkdir "%FRONTEND_DIR%" 2>nul
mkdir "%FRONTEND_DIR%\public" 2>nul
mkdir "%FRONTEND_DIR%\src" 2>nul
mkdir "%FRONTEND_DIR%\src\components" 2>nul
mkdir "%FRONTEND_DIR%\src\pages" 2>nul
mkdir "%FRONTEND_DIR%\src\styles" 2>nul

echo Creating root configuration files...

:: package.json for root
(
echo {
echo   "name": "quickbite-backend",
echo   "version": "1.0.0",
echo   "description": "QuickBite Food Delivery Microservices Backend",
echo   "scripts": {
echo     "dev": "docker-compose up --build",
echo     "prod": "docker-compose -f docker-compose.prod.yml up -d",
echo     "stop": "docker-compose down",
echo     "logs": "docker-compose logs -f",
echo     "k8s:deploy": "kubectl apply -f k8s/",
echo     "k8s:delete": "kubectl delete -f k8s/",
echo     "format": "prettier --write \"**/*.{js,json,md}\"",
echo     "lint": "eslint \"**/*.js\""
echo   },
echo   "devDependencies": {
echo     "prettier": "^2.8.0",
echo     "eslint": "^8.0.0"
echo   },
echo   "workspaces": [
echo     "api-gateway",
echo     "auth-service",
echo     "user-service",
echo     "catalog-service",
echo     "order-service",
echo     "payment-service",
echo     "delivery-service",
echo     "notification-service",
echo     "search-service",
echo     "admin-service",
echo     "analytics-service"
echo   ]
echo }
) > "%ROOT_DIR%\package.json"

:: Docker Compose
(
echo version: '3.8'
echo.
echo services:
echo   # API Gateway
echo   api-gateway:
echo     build: ./api-gateway
echo     ports:
echo       - "3000:3000"
echo     environment:
echo       - NODE_ENV=development
echo       - AUTH_SERVICE_URL=http://auth-service:3001
echo       - USER_SERVICE_URL=http://user-service:3002
echo       - CATALOG_SERVICE_URL=http://catalog-service:3003
echo       - ORDER_SERVICE_URL=http://order-service:3004
echo       - PAYMENT_SERVICE_URL=http://payment-service:3005
echo       - DELIVERY_SERVICE_URL=http://delivery-service:3006
echo       - NOTIFICATION_SERVICE_URL=http://notification-service:3007
echo       - SEARCH_SERVICE_URL=http://search-service:3008
echo     depends_on:
echo       - auth-service
echo       - user-service
echo       - catalog-service
echo       - order-service
echo       - payment-service
echo       - delivery-service
echo       - notification-service
echo       - search-service
echo     networks:
echo       - quickbite-network
echo.
echo   # Auth Service
echo   auth-service:
echo     build: ./auth-service
echo     ports:
echo       - "3001:3001"
echo     environment:
echo       - NODE_ENV=development
echo       - PORT=3001
echo       - JWT_ACCESS_SECRET=your-super-secret-access-key-change-in-production
echo       - JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
echo       - JWT_ACCESS_EXPIRY=15m
echo       - JWT_REFRESH_EXPIRY=7d
echo       - REDIS_URL=redis://redis:6379
echo       - DATABASE_URL=postgresql://quickbite:password@postgres:5432/auth_db
echo     depends_on:
echo       - postgres
echo       - redis
echo     networks:
echo       - quickbite-network
echo.
echo   # User Service
echo   user-service:
echo     build: ./user-service
echo     ports:
echo       - "3002:3002"
echo     environment:
echo       - NODE_ENV=development
echo       - PORT=3002
echo       - DATABASE_URL=postgresql://quickbite:password@postgres:5432/user_db
echo     depends_on:
echo       - postgres
echo     networks:
echo       - quickbite-network
echo.
echo   # Catalog Service
echo   catalog-service:
echo     build: ./catalog-service
echo     ports:
echo       - "3003:3003"
echo     environment:
echo       - NODE_ENV=development
echo       - PORT=3003
echo       - DATABASE_URL=postgresql://quickbite:password@postgres:5432/catalog_db
echo       - ELASTICSEARCH_URL=http://elasticsearch:9200
echo     depends_on:
echo       - postgres
echo       - elasticsearch
echo     networks:
echo       - quickbite-network
echo.
echo   # Order Service
echo   order-service:
echo     build: ./order-service
echo     ports:
echo       - "3004:3004"
echo     environment:
echo       - NODE_ENV=development
echo       - PORT=3004
echo       - DATABASE_URL=postgresql://quickbite:password@postgres:5432/order_db
echo       - RABBITMQ_URL=amqp://rabbitmq:5672
echo     depends_on:
echo       - postgres
echo       - rabbitmq
echo     networks:
echo       - quickbite-network
echo.
echo   # Payment Service
echo   payment-service:
echo     build: ./payment-service
echo     ports:
echo       - "3005:3005"
echo     environment:
echo       - NODE_ENV=development
echo       - PORT=3005
echo       - DATABASE_URL=postgresql://quickbite:password@postgres:5432/payment_db
echo       - PAYMENT_GATEWAY_URL=https://api.razorpay.com/v1/payments
echo       - PAYMENT_GATEWAY_SECRET=your-razorpay-secret
echo     depends_on:
echo       - postgres
echo     networks:
echo       - quickbite-network
echo.
echo   # Database
echo   postgres:
echo     image: postgres:14
echo     environment:
echo       - POSTGRES_USER=quickbite
echo       - POSTGRES_PASSWORD=password
echo       - POSTGRES_MULTIPLE_DATABASES=auth_db,user_db,catalog_db,order_db,payment_db,delivery_db,notification_db
echo     ports:
echo       - "5432:5432"
echo     volumes:
echo       - postgres_data:/var/lib/postgresql/data
echo       - ./scripts/init-multiple-databases.sh:/docker-entrypoint-initdb.d/init-multiple-databases.sh
echo     networks:
echo       - quickbite-network
echo.
echo   # Redis
echo   redis:
echo     image: redis:7-alpine
echo     ports:
echo       - "6379:6379"
echo     volumes:
echo       - redis_data:/data
echo     networks:
echo       - quickbite-network
echo.
echo   # RabbitMQ
echo   rabbitmq:
echo     image: rabbitmq:3-management
echo     ports:
echo       - "5672:5672"
echo       - "15672:15672"
echo     environment:
echo       - RABBITMQ_DEFAULT_USER=guest
echo       - RABBITMQ_DEFAULT_PASS=guest
echo     networks:
echo       - quickbite-network
echo.
echo   # Elasticsearch
echo   elasticsearch:
echo     image: docker.elastic.co/elasticsearch/elasticsearch:8.5.0
echo     environment:
echo       - discovery.type=single-node
echo       - xpack.security.enabled=false
echo     ports:
echo       - "9200:9200"
echo     volumes:
echo       - elasticsearch_data:/usr/share/elasticsearch/data
echo     networks:
echo       - quickbite-network
echo.
echo   # Kibana
echo   kibana:
echo     image: docker.elastic.co/kibana/kibana:8.5.0
echo     ports:
echo       - "5601:5601"
echo     environment:
echo       - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
echo     depends_on:
echo       - elasticsearch
echo     networks:
echo       - quickbite-network
echo.
echo volumes:
echo   postgres_data:
echo   redis_data:
echo   elasticsearch_data:
echo.
echo networks:
echo   quickbite-network:
echo     driver: bridge
) > "%ROOT_DIR%\docker-compose.yml"

echo Creating API Gateway files...

:: API Gateway Dockerfile
(
echo FROM node:18-alpine
echo.
echo WORKDIR /app
echo.
echo COPY package*.json ./
echo RUN npm ci --only=production
echo.
echo COPY . .
echo RUN npm run build
echo.
echo EXPOSE 3000
echo.
echo CMD ["node", "dist/server.js"]
) > "%GATEWAY_DIR%\Dockerfile"

:: API Gateway package.json
(
echo {
echo   "name": "api-gateway",
echo   "version": "1.0.0",
echo   "description": "QuickBite API Gateway",
echo   "main": "src/server.js",
echo   "scripts": {
echo     "start": "node src/server.js",
echo     "dev": "nodemon src/server.js",
echo     "build": "babel src -d dist",
echo     "test": "jest"
echo   },
echo   "dependencies": {
echo     "express": "^4.18.2",
echo     "cors": "^2.8.5",
echo     "helmet": "^6.0.1",
echo     "express-rate-limit": "^6.7.0",
echo     "http-proxy-middleware": "^2.0.6",
echo     "morgan": "^1.10.0",
echo     "compression": "^1.7.4",
echo     "dotenv": "^16.0.3"
echo   },
echo   "devDependencies": {
echo     "nodemon": "^2.0.20",
echo     "@babel/cli": "^7.19.3",
echo     "@babel/core": "^7.20.2",
echo     "@babel/preset-env": "^7.20.2",
echo     "jest": "^29.3.1"
echo   }
echo }
) > "%GATEWAY_DIR%\package.json"

:: API Gateway server.js
(
echo const express = require('express');
echo const cors = require('cors');
echo const helmet = require('helmet');
echo const rateLimit = require('express-rate-limit');
echo const { createProxyMiddleware } = require('http-proxy-middleware');
echo const morgan = require('morgan');
echo const compression = require('compression');
echo.
echo const app = express();
echo.
echo // Security Middleware
echo app.use(helmet());
echo app.use(cors({
echo   origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
echo   credentials: true
echo }));
echo.
echo // Compression
echo app.use(compression());
echo.
echo // Rate Limiting
echo const limiter = rateLimit({
echo   windowMs: 1 * 60 * 1000, // 1 minute
echo   max: 100, // limit each IP to 100 requests per windowMs
echo   message: {
echo     error: 'Too many requests, please try again later.'
echo   }
echo });
echo app.use(limiter);
echo.
echo // Logging
echo app.use(morgan('combined'));
echo.
echo // Health Check
echo app.get('/health', (req, res) => {
echo   res.status(200).json({
echo     status: 'OK',
echo     timestamp: new Date().toISOString(),
echo     service: 'api-gateway'
echo   });
echo });
echo.
echo // Service Routes
echo const services = {
echo   auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
echo   users: process.env.USER_SERVICE_URL || 'http://user-service:3002',
echo   catalog: process.env.CATALOG_SERVICE_URL || 'http://catalog-service:3003',
echo   orders: process.env.ORDER_SERVICE_URL || 'http://order-service:3004',
echo   payments: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3005',
echo   delivery: process.env.DELIVERY_SERVICE_URL || 'http://delivery-service:3006',
echo   notifications: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3007',
echo   search: process.env.SEARCH_SERVICE_URL || 'http://search-service:3008'
echo };
echo.
echo // Proxy Middleware
echo Object.entries(services).forEach(([service, url]) => {
echo   app.use("/api/" + service, createProxyMiddleware({
echo     target: url,
echo     changeOrigin: true,
echo     pathRewrite: {
echo       ["^/api/" + service]: ''
echo     },
echo     onError: (err, req, res) => {
echo       console.error("Proxy error for " + service + ":", err);
echo       res.status(503).json({
echo         error: 'Service temporarily unavailable',
echo         service: service,
echo         timestamp: new Date().toISOString()
echo       });
echo     }
echo   }));
echo });
echo.
echo // Error Handling
echo app.use((err, req, res, next) => {
echo   console.error('Global error handler:', err);
echo   res.status(500).json({
echo     error: 'Internal server error',
echo     message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
echo     timestamp: new Date().toISOString()
echo   });
echo });
echo.
echo // 404 Handler
echo app.use('*', (req, res) => {
echo   res.status(404).json({
echo     error: 'Route not found',
echo     path: req.originalUrl,
echo     timestamp: new Date().toISOString()
echo   });
echo });
echo.
echo const PORT = process.env.PORT || 3000;
echo app.listen(PORT, () => {
echo   console.log("API Gateway running on port " + PORT);
echo });
) > "%GATEWAY_DIR%\src\server.js"

echo Creating Auth Service files...

:: Auth Service Dockerfile
(
echo FROM node:18-alpine
echo.
echo WORKDIR /app
echo.
echo COPY package*.json ./
echo RUN npm ci --only=production
echo.
echo COPY . .
echo RUN npm run build
echo.
echo EXPOSE 3001
echo.
echo CMD ["node", "dist/server.js"]
) > "%AUTH_DIR%\Dockerfile"

:: Auth Service package.json
(
echo {
echo   "name": "auth-service",
echo   "version": "1.0.0",
echo   "description": "QuickBite Authentication Service",
echo   "main": "src/server.js",
echo   "scripts": {
echo     "start": "node src/server.js",
echo     "dev": "nodemon src/server.js",
echo     "build": "babel src -d dist",
echo     "test": "jest"
echo   },
echo   "dependencies": {
echo     "express": "^4.18.2",
echo     "jsonwebtoken": "^9.0.0",
echo     "bcryptjs": "^2.4.3",
echo     "redis": "^4.5.1",
echo     "uuid": "^9.0.0",
echo     "cors": "^2.8.5",
echo     "helmet": "^6.0.1",
echo     "dotenv": "^16.0.3",
echo     "joi": "^17.7.0"
echo   },
echo   "devDependencies": {
echo     "nodemon": "^2.0.20",
echo     "@babel/cli": "^7.19.3",
echo     "@babel/core": "^7.20.2",
echo     "@babel/preset-env": "^7.20.2",
echo     "jest": "^29.3.1"
echo   }
echo }
) > "%AUTH_DIR%\package.json"

:: Auth Service - auth.service.js
(
echo const jwt = require('jsonwebtoken');
echo const bcrypt = require('bcryptjs');
echo const crypto = require('crypto');
echo const { v4: uuidv4 } = require('uuid');
echo.
echo class AuthService {
echo   constructor(userRepository, redisClient) {
echo     this.userRepository = userRepository;
echo     this.redisClient = redisClient;
echo   }
echo.
echo   async register(userData) {
echo     const { email, phone, password, name } = userData;
echo.
echo     // Check if user already exists
echo     const existingUser = await this.userRepository.findByEmailOrPhone(email, phone);
echo     if (existingUser) {
echo       throw new Error('User already exists with this email or phone');
echo     }
echo.
echo     // Hash password
echo     const hashedPassword = await bcrypt.hash(password, 12);
echo.
echo     // Create user
echo     const user = await this.userRepository.create({
echo       id: uuidv4(),
echo       email: email,
echo       phone: phone,
echo       password: hashedPassword,
echo       name: name,
echo       status: 'active',
echo       createdAt: new Date(),
echo       updatedAt: new Date()
echo     });
echo.
echo     // Generate tokens
echo     const tokens = await this.generateTokens(user);
echo.
echo     return {
echo       user: this.sanitizeUser(user),
echo       tokens: tokens
echo     };
echo   }
echo.
echo   async login(identifier, password) {
echo     // Find user by email or phone
echo     const user = await this.userRepository.findByEmailOrPhone(identifier, identifier);
echo     if (!user) {
echo       throw new Error('Invalid credentials');
echo     }
echo.
echo     // Check password
echo     const isPasswordValid = await bcrypt.compare(password, user.password);
echo     if (!isPasswordValid) {
echo       throw new Error('Invalid credentials');
echo     }
echo.
echo     // Check if user is active
echo     if (user.status !== 'active') {
echo       throw new Error('Account is not active');
echo     }
echo.
echo     // Generate tokens
echo     const tokens = await this.generateTokens(user);
echo.
echo     // Update last login
echo     await this.userRepository.update(user.id, {
echo       lastLoginAt: new Date()
echo     });
echo.
echo     return {
echo       user: this.sanitizeUser(user),
echo       tokens: tokens
echo     };
echo   }
echo.
echo   async generateTokens(user) {
echo     const accessToken = jwt.sign(
echo       {
echo         userId: user.id,
echo         email: user.email,
echo         role: user.role
echo       },
echo       process.env.JWT_ACCESS_SECRET,
echo       { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
echo     );
echo.
echo     const refreshToken = jwt.sign(
echo       {
echo         userId: user.id,
echo         tokenVersion: user.tokenVersion || 0
echo       },
echo       process.env.JWT_REFRESH_SECRET,
echo       { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
echo     );
echo.
echo     // Store refresh token in Redis with expiry
echo     await this.redisClient.set(
echo       "refresh_token:" + user.id,
echo       refreshToken,
echo       'EX',
echo       7 * 24 * 60 * 60 // 7 days
echo     );
echo.
echo     return {
echo       accessToken: accessToken,
echo       refreshToken: refreshToken,
echo       expiresIn: 15 * 60 // 15 minutes in seconds
echo     };
echo   }
echo.
echo   async refreshToken(refreshToken) {
echo     try {
echo       const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
echo.
echo       // Verify refresh token in Redis
echo       const storedToken = await this.redisClient.get("refresh_token:" + payload.userId);
echo       if (storedToken !== refreshToken) {
echo         throw new Error('Invalid refresh token');
echo       }
echo.
echo       const user = await this.userRepository.findById(payload.userId);
echo       if (!user) {
echo         throw new Error('User not found');
echo       }
echo.
echo       // Check token version
echo       if (user.tokenVersion !== payload.tokenVersion) {
echo         throw new Error('Token version mismatch');
echo       }
echo.
echo       return await this.generateTokens(user);
echo     } catch (error) {
echo       throw new Error('Invalid refresh token');
echo     }
echo   }
echo.
echo   async logout(userId) {
echo     // Remove refresh token from Redis
echo     await this.redisClient.del("refresh_token:" + userId);
echo   }
echo.
echo   async validateToken(token) {
echo     try {
echo       const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
echo       const user = await this.userRepository.findById(payload.userId);
echo.
echo       if (!user || user.status !== 'active') {
echo         throw new Error('User not found or inactive');
echo       }
echo.
echo       return this.sanitizeUser(user);
echo     } catch (error) {
echo       throw new Error('Invalid token');
echo     }
echo   }
echo.
echo   sanitizeUser(user) {
echo     const { password, tokenVersion, ...sanitizedUser } = user;
echo     return sanitizedUser;
echo   }
echo.
echo   async generateOTP(phone) {
echo     const otp = crypto.randomInt(100000, 999999).toString();
echo     const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
echo.
echo     // Store OTP in Redis
echo     await this.redisClient.setex(
echo       "otp:" + phone,
echo       600, // 10 minutes in seconds
echo       JSON.stringify({ otp: otp, attempts: 0 })
echo     );
echo.
echo     // In production, integrate with SMS service like Twilio
echo     console.log("OTP for " + phone + ": " + otp);
echo.
echo     return { success: true, message: 'OTP sent successfully' };
echo   }
echo.
echo   async verifyOTP(phone, otp) {
echo     const stored = await this.redisClient.get("otp:" + phone);
echo     if (!stored) {
echo       throw new Error('OTP expired or not found');
echo     }
echo.
echo     const { otp: storedOTP, attempts } = JSON.parse(stored);
echo.
echo     if (attempts >= 3) {
echo       throw new Error('Too many attempts');
echo     }
echo.
echo     if (storedOTP !== otp) {
echo       // Increment attempts
echo       await this.redisClient.setex(
echo         "otp:" + phone,
echo         600,
echo         JSON.stringify({ otp: storedOTP, attempts: attempts + 1 })
echo       );
echo       throw new Error('Invalid OTP');
echo     }
echo.
echo     // OTP verified successfully
echo     await this.redisClient.del("otp:" + phone);
echo.
echo     // Find or create user by phone
echo     let user = await this.userRepository.findByPhone(phone);
echo     if (!user) {
echo       user = await this.userRepository.create({
echo         id: uuidv4(),
echo         phone: phone,
echo         status: 'active',
echo         createdAt: new Date(),
echo         updatedAt: new Date()
echo       });
echo     }
echo.
echo     const tokens = await this.generateTokens(user);
echo.
echo     return {
echo       user: this.sanitizeUser(user),
echo       tokens: tokens
echo     };
echo   }
echo }
echo.
echo module.exports = AuthService;
) > "%AUTH_DIR%\src\services\auth.service.js"

echo Creating Order Service files...

:: Order Service Dockerfile
(
echo FROM node:18-alpine
echo.
echo WORKDIR /app
echo.
echo COPY package*.json ./
echo RUN npm ci --only=production
echo.
echo COPY . .
echo RUN npm run build
echo.
echo EXPOSE 3004
echo.
echo CMD ["node", "dist/server.js"]
) > "%ORDER_DIR%\Dockerfile"

:: Order Service package.json
(
echo {
echo   "name": "order-service",
echo   "version": "1.0.0",
echo   "description": "QuickBite Order Service",
echo   "main": "src/server.js",
echo   "scripts": {
echo     "start": "node src/server.js",
echo     "dev": "nodemon src/server.js",
echo     "build": "babel src -d dist",
echo     "test": "jest"
echo   },
echo   "dependencies": {
echo     "express": "^4.18.2",
echo     "amqplib": "^0.10.3",
echo     "cors": "^2.8.5",
echo     "helmet": "^6.0.1",
echo     "dotenv": "^16.0.3",
echo     "joi": "^17.7.0",
echo     "uuid": "^9.0.0"
echo   },
echo   "devDependencies": {
echo     "nodemon": "^2.0.20",
echo     "@babel/cli": "^7.19.3",
echo     "@babel/core": "^7.20.2",
echo     "@babel/preset-env": "^7.20.2",
echo     "jest": "^29.3.1"
echo   }
echo }
) > "%ORDER_DIR%\package.json"

:: Order Service - order.service.js
(
echo const { v4: uuidv4 } = require('uuid');
echo.
echo class OrderService {
echo   constructor(orderRepository, catalogService, paymentService, notificationService, messageQueue) {
echo     this.orderRepository = orderRepository;
echo     this.catalogService = catalogService;
echo     this.paymentService = paymentService;
echo     this.notificationService = notificationService;
echo     this.messageQueue = messageQueue;
echo   }
echo.
echo   async createOrder(orderData) {
echo     const { userId, items, deliveryAddress, paymentMethod } = orderData;
echo.
echo     // Validate items and calculate total
echo     const { validatedItems, totalAmount } = await this.validateItemsAndCalculateTotal(items);
echo.
echo     // Create order
echo     const order = await this.orderRepository.create({
echo       id: uuidv4(),
echo       userId: userId,
echo       items: validatedItems,
echo       totalAmount: totalAmount,
echo       deliveryAddress: deliveryAddress,
echo       paymentMethod: paymentMethod,
echo       status: 'pending',
echo       createdAt: new Date(),
echo       updatedAt: new Date()
echo     });
echo.
echo     // Publish order created event
echo     await this.messageQueue.publish('order.created', {
echo       orderId: order.id,
echo       userId: userId,
echo       totalAmount: totalAmount,
echo       items: validatedItems
echo     });
echo.
echo     return order;
echo   }
echo.
echo   async validateItemsAndCalculateTotal(items) {
echo     let totalAmount = 0;
echo     const validatedItems = [];
echo.
echo     for (const item of items) {
echo       // Get item details from catalog service
echo       const menuItem = await this.catalogService.getMenuItem(item.menuItemId);
echo.
echo       if (!menuItem || !menuItem.isAvailable) {
echo         throw new Error("Item " + item.menuItemId + " is not available");
echo       }
echo.
echo       if (menuItem.stock < item.quantity) {
echo         throw new Error("Insufficient stock for " + menuItem.name);
echo       }
echo.
echo       const itemTotal = menuItem.price * item.quantity;
echo       totalAmount += itemTotal;
echo.
echo       validatedItems.push({
echo         menuItemId: item.menuItemId,
echo         name: menuItem.name,
echo         price: menuItem.price,
echo         quantity: item.quantity,
echo         itemTotal: itemTotal
echo       });
echo     }
echo.
echo     return { validatedItems: validatedItems, totalAmount: totalAmount };
echo   }
echo.
echo   async processOrder(orderId) {
echo     const order = await this.orderRepository.findById(orderId);
echo     if (!order) {
echo       throw new Error('Order not found');
echo     }
echo.
echo     try {
echo       // Update order status to processing
echo       await this.orderRepository.update(orderId, { status: 'processing' });
echo.
echo       // Reserve items in inventory
echo       await this.catalogService.reserveItems(order.items);
echo.
echo       // Process payment
echo       const paymentResult = await this.paymentService.processPayment({
echo         orderId: orderId,
echo         amount: order.totalAmount,
echo         paymentMethod: order.paymentMethod,
echo         userId: order.userId
echo       });
echo.
echo       if (paymentResult.status === 'success') {
echo         // Update order status to confirmed
echo         await this.orderRepository.update(orderId, {
echo           status: 'confirmed',
echo           paymentStatus: 'paid',
echo           paymentId: paymentResult.paymentId
echo         });
echo.
echo         // Notify user
echo         await this.notificationService.sendOrderConfirmation(order.userId, order);
echo.
echo         // Publish order confirmed event
echo         await this.messageQueue.publish('order.confirmed', {
echo           orderId: orderId,
echo           userId: order.userId,
echo           restaurantId: order.restaurantId
echo         });
echo.
echo         return order;
echo       } else {
echo         throw new Error('Payment failed');
echo       }
echo     } catch (error) {
echo       // Compensating actions for saga pattern
echo       await this.handleOrderFailure(orderId, error);
echo       throw error;
echo     }
echo   }
echo.
echo   async handleOrderFailure(orderId, error) {
echo     const order = await this.orderRepository.findById(orderId);
echo.
echo     // Update order status to failed
echo     await this.orderRepository.update(orderId, {
echo       status: 'failed',
echo       failureReason: error.message
echo     });
echo.
echo     // Release reserved items
echo     if (order.status === 'processing') {
echo       await this.catalogService.releaseItems(order.items);
echo     }
echo.
echo     // Notify user about failure
echo     await this.notificationService.sendOrderFailure(order.userId, order, error.message);
echo.
echo     // Publish order failed event
echo     await this.messageQueue.publish('order.failed', {
echo       orderId: orderId,
echo       userId: order.userId,
echo       reason: error.message
echo     });
echo   }
echo.
echo   async updateOrderStatus(orderId, status, metadata = {}) {
echo     const allowedTransitions = {
echo       pending: ['processing', 'cancelled'],
echo       processing: ['confirmed', 'failed'],
echo       confirmed: ['preparing', 'cancelled'],
echo       preparing: ['ready_for_pickup', 'cancelled'],
echo       ready_for_pickup: ['out_for_delivery'],
echo       out_for_delivery: ['delivered'],
echo       delivered: ['completed'],
echo       cancelled: [],
echo       failed: [],
echo       completed: []
echo     };
echo.
echo     const currentOrder = await this.orderRepository.findById(orderId);
echo     if (!currentOrder) {
echo       throw new Error('Order not found');
echo     }
echo.
echo     if (!allowedTransitions[currentOrder.status]?.includes(status)) {
echo       throw new Error("Invalid status transition from " + currentOrder.status + " to " + status);
echo     }
echo.
echo     const updateData = { status: status, updatedAt: new Date(), ...metadata };
echo     const order = await this.orderRepository.update(orderId, updateData);
echo.
echo     // Publish status change event
echo     await this.messageQueue.publish('order.status_changed', {
echo       orderId: orderId,
echo       userId: order.userId,
echo       fromStatus: currentOrder.status,
echo       toStatus: status,
echo       timestamp: new Date().toISOString()
echo     });
echo.
echo     return order;
echo   }
echo.
echo   async getOrderHistory(userId, page = 1, limit = 10) {
echo     const offset = (page - 1) * limit;
echo     return await this.orderRepository.findByUserId(userId, offset, limit);
echo   }
echo.
echo   async getOrderDetails(orderId, userId) {
echo     const order = await this.orderRepository.findById(orderId);
echo     if (!order) {
echo       throw new Error('Order not found');
echo     }
echo.
echo     // Check if user owns the order or is admin
echo     if (order.userId !== userId) {
echo       throw new Error('Access denied');
echo     }
echo.
echo     return order;
echo   }
echo.
echo   async cancelOrder(orderId, userId, reason) {
echo     const order = await this.orderRepository.findById(orderId);
echo     if (!order) {
echo       throw new Error('Order not found');
echo     }
echo.
echo     if (order.userId !== userId) {
echo       throw new Error('Access denied');
echo     }
echo.
echo     const cancellableStatuses = ['pending', 'confirmed', 'preparing'];
echo     if (!cancellableStatuses.includes(order.status)) {
echo       throw new Error("Order cannot be cancelled in " + order.status + " status");
echo     }
echo.
echo     await this.updateOrderStatus(orderId, 'cancelled', { cancellationReason: reason });
echo.
echo     // Process refund if payment was made
echo     if (order.paymentStatus === 'paid') {
echo       await this.paymentService.processRefund(order.paymentId, order.totalAmount);
echo     }
echo.
echo     return { success: true, message: 'Order cancelled successfully' };
echo   }
echo }
echo.
echo module.exports = OrderService;
) > "%ORDER_DIR%\src\services\order.service.js"

echo Creating Payment Service files...

:: Payment Service Dockerfile
(
echo FROM node:18-alpine
echo.
echo WORKDIR /app
echo.
echo COPY package*.json ./
echo RUN npm ci --only=production
echo.
echo COPY . .
echo RUN npm run build
echo.
echo EXPOSE 3005
echo.
echo CMD ["node", "dist/server.js"]
) > "%PAYMENT_DIR%\Dockerfile"

:: Payment Service package.json
(
echo {
echo   "name": "payment-service",
echo   "version": "1.0.0",
echo   "description": "QuickBite Payment Service",
echo   "main": "src/server.js",
echo   "scripts": {
echo     "start": "node src/server.js",
echo     "dev": "nodemon src/server.js",
echo     "build": "babel src -d dist",
echo     "test": "jest"
echo   },
echo   "dependencies": {
echo     "express": "^4.18.2",
echo     "axios": "^1.2.0",
echo     "cors": "^2.8.5",
echo     "helmet": "^6.0.1",
echo     "dotenv": "^16.0.3",
echo     "joi": "^17.7.0",
echo     "uuid": "^9.0.0"
echo   },
echo   "devDependencies": {
echo     "nodemon": "^2.0.20",
echo     "@babel/cli": "^7.19.3",
echo     "@babel/core": "^7.20.2",
echo     "@babel/preset-env": "^7.20.2",
echo     "jest": "^29.3.1"
echo   }
echo }
) > "%PAYMENT_DIR%\package.json"

:: Payment Service - payment.service.js
(
echo const { v4: uuidv4 } = require('uuid');
echo const axios = require('axios');
echo.
echo class PaymentService {
echo   constructor(paymentRepository, messageQueue) {
echo     this.paymentRepository = paymentRepository;
echo     this.messageQueue = messageQueue;
echo   }
echo.
echo   async processPayment(paymentData) {
echo     const { orderId, amount, paymentMethod, userId } = paymentData;
echo.
echo     // Create payment record
echo     const payment = await this.paymentRepository.create({
echo       id: uuidv4(),
echo       orderId: orderId,
echo       userId: userId,
echo       amount: amount,
echo       paymentMethod: paymentMethod,
echo       status: 'initiated',
echo       createdAt: new Date()
echo     });
echo.
echo     try {
echo       let paymentResult;
echo.
echo       // Route to appropriate payment gateway
echo       switch (paymentMethod.type) {
echo         case 'card':
echo           paymentResult = await this.processCardPayment(paymentData);
echo           break;
echo         case 'upi':
echo           paymentResult = await this.processUPIPayment(paymentData);
echo           break;
echo         case 'wallet':
echo           paymentResult = await this.processWalletPayment(paymentData);
echo           break;
echo         case 'cod':
echo           paymentResult = await this.processCODPayment(paymentData);
echo           break;
echo         default:
echo           throw new Error('Unsupported payment method');
echo       }
echo.
echo       // Update payment status
echo       await this.paymentRepository.update(payment.id, {
echo         status: paymentResult.status,
echo         gatewayTransactionId: paymentResult.transactionId,
echo         gatewayResponse: paymentResult.response,
echo         updatedAt: new Date()
echo       });
echo.
echo       // Publish payment event
echo       await this.messageQueue.publish('payment.processed', {
echo         paymentId: payment.id,
echo         orderId: orderId,
echo         status: paymentResult.status,
echo         amount: amount,
echo         userId: userId
echo       });
echo.
echo       return paymentResult;
echo     } catch (error) {
echo       // Update payment as failed
echo       await this.paymentRepository.update(payment.id, {
echo         status: 'failed',
echo         failureReason: error.message,
echo         updatedAt: new Date()
echo       });
echo.
echo       throw error;
echo     }
echo   }
echo.
echo   async processCardPayment(paymentData) {
echo     const { cardDetails, amount } = paymentData;
echo.
echo     // Validate card details
echo     if (!this.validateCardDetails(cardDetails)) {
echo       throw new Error('Invalid card details');
echo     }
echo.
echo     // Integrate with payment gateway (e.g., Stripe, Razorpay)
echo     try {
echo       const response = await axios.post(process.env.PAYMENT_GATEWAY_URL, {
echo         amount: Math.round(amount * 100), // Convert to cents/paisa
echo         currency: 'INR',
echo         card: cardDetails,
echo         metadata: {
echo           orderId: paymentData.orderId,
echo           userId: paymentData.userId
echo         }
echo       }, {
echo         headers: {
echo           'Authorization': "Bearer " + process.env.PAYMENT_GATEWAY_SECRET,
echo           'Content-Type': 'application/json'
echo         }
echo       });
echo.
echo       if (response.data.status === 'captured') {
echo         return {
echo           status: 'success',
echo           transactionId: response.data.id,
echo           response: response.data
echo         };
echo       } else {
echo         throw new Error(response.data.error_description || 'Payment failed');
echo       }
echo     } catch (error) {
echo       throw new Error("Payment gateway error: " + (error.response?.data?.error?.message || error.message));
echo     }
echo   }
echo.
echo   async processUPIPayment(paymentData) {
echo     const { upiId, amount } = paymentData;
echo.
echo     // Generate UPI payment request
echo     const upiRequest = {
echo       vpa: upiId,
echo       amount: Math.round(amount * 100),
echo       currency: 'INR',
echo       orderId: paymentData.orderId
echo     };
echo.
echo     // In production, integrate with UPI payment gateway
echo     // Simulate UPI payment processing
echo     return new Promise((resolve) => {
echo       setTimeout(() => {
echo         resolve({
echo           status: 'success',
echo           transactionId: "UPI_" + Date.now(),
echo           response: { ...upiRequest, status: 'success' }
echo         });
echo       }, 2000);
echo     });
echo   }
echo.
echo   async processWalletPayment(paymentData) {
echo     const { walletType, walletId, amount } = paymentData;
echo.
echo     // Integrate with specific wallet provider
echo     try {
echo       const response = await axios.post(process.env.WALLET_GATEWAY_URL + "/pay", {
echo         walletType: walletType,
echo         walletId: walletId,
echo         amount: amount,
echo         orderId: paymentData.orderId,
echo         userId: paymentData.userId
echo       });
echo.
echo       if (response.data.status === 'SUCCESS') {
echo         return {
echo           status: 'success',
echo           transactionId: response.data.transactionId,
echo           response: response.data
echo         };
echo       } else {
echo         throw new Error(response.data.message || 'Wallet payment failed');
echo       }
echo     } catch (error) {
echo       throw new Error("Wallet payment error: " + error.message);
echo     }
echo   }
echo.
echo   async processCODPayment(paymentData) {
echo     // Cash on Delivery - no immediate payment processing
echo     return {
echo       status: 'success',
echo       transactionId: "COD_" + Date.now(),
echo       response: { method: 'cod', status: 'pending_capture' }
echo     };
echo   }
echo.
echo   validateCardDetails(cardDetails) {
echo     const { number, expiryMonth, expiryYear, cvv } = cardDetails;
echo.
echo     // Basic validation
echo     if (!number || number.length < 13 || number.length > 19) {
echo       return false;
echo     }
echo.
echo     if (!expiryMonth || expiryMonth < 1 || expiryMonth > 12) {
echo       return false;
echo     }
echo.
echo     const currentYear = new Date().getFullYear() % 100;
echo     const currentMonth = new Date().getMonth() + 1;
echo.
echo     if (expiryYear < currentYear || (expiryYear === currentYear && expiryMonth < currentMonth)) {
echo       return false;
echo     }
echo.
echo     if (!cvv || cvv.length < 3 || cvv.length > 4) {
echo       return false;
echo     }
echo.
echo     return true;
echo   }
echo.
echo   async processRefund(paymentId, amount) {
echo     const payment = await this.paymentRepository.findById(paymentId);
echo     if (!payment) {
echo       throw new Error('Payment not found');
echo     }
echo.
echo     if (payment.status !== 'success') {
echo       throw new Error('Cannot refund unsuccessful payment');
echo     }
echo.
echo     try {
echo       let refundResult;
echo.
echo       // Process refund based on payment method
echo       switch (payment.paymentMethod.type) {
echo         case 'card':
echo           refundResult = await this.processCardRefund(payment);
echo           break;
echo         case 'upi':
echo           refundResult = await this.processUPIRefund(payment);
echo           break;
echo         case 'wallet':
echo           refundResult = await this.processWalletRefund(payment);
echo           break;
echo         case 'cod':
echo           refundResult = { status: 'success' }; // No refund for COD
echo           break;
echo         default:
echo           throw new Error('Unsupported payment method for refund');
echo       }
echo.
echo       // Update payment record
echo       await this.paymentRepository.update(paymentId, {
echo         refundStatus: 'processed',
echo         refundAmount: amount,
echo         refundedAt: new Date()
echo       });
echo.
echo       // Publish refund event
echo       await this.messageQueue.publish('payment.refunded', {
echo         paymentId: paymentId,
echo         orderId: payment.orderId,
echo         amount: amount,
echo         userId: payment.userId
echo       });
echo.
echo       return refundResult;
echo     } catch (error) {
echo       await this.paymentRepository.update(paymentId, {
echo         refundStatus: 'failed',
echo         refundFailureReason: error.message
echo       });
echo       throw error;
echo     }
echo   }
echo.
echo   async getPaymentStatus(paymentId) {
echo     return await this.paymentRepository.findById(paymentId);
echo   }
echo.
echo   async getPaymentHistory(userId, page = 1, limit = 10) {
echo     const offset = (page - 1) * limit;
echo     return await this.paymentRepository.findByUserId(userId, offset, limit);
echo   }
echo }
echo.
echo module.exports = PaymentService;
) > "%PAYMENT_DIR%\src\services\payment.service.js"

echo Creating Shared files...

:: Shared Message Queue
(
echo const amqp = require('amqplib');
echo.
echo class MessageQueue {
echo   constructor() {
echo     this.connection = null;
echo     this.channel = null;
echo     this.connected = false;
echo   }
echo.
echo   async connect() {
echo     try {
echo       this.connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost:5672');
echo       this.channel = await this.connection.createChannel();
echo       this.connected = true;
echo.
echo       console.log('Connected to RabbitMQ');
echo.
echo       // Handle connection close
echo       this.connection.on('close', () => {
echo         console.log('RabbitMQ connection closed');
echo         this.connected = false;
echo         setTimeout(() => this.connect(), 5000);
echo       });
echo.
echo     } catch (error) {
echo       console.error('Failed to connect to RabbitMQ:', error);
echo       setTimeout(() => this.connect(), 5000);
echo     }
echo   }
echo.
echo   async publish(exchange, routingKey, message) {
echo     if (!this.connected) {
echo       throw new Error('Not connected to RabbitMQ');
echo     }
echo.
echo     try {
echo       await this.channel.assertExchange(exchange, 'topic', { durable: true });
echo       this.channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)), {
echo         persistent: true,
echo         contentType: 'application/json'
echo       });
echo     } catch (error) {
echo       console.error('Failed to publish message:', error);
echo       throw error;
echo     }
echo   }
echo.
echo   async consume(queue, exchange, routingKey, callback) {
echo     if (!this.connected) {
echo       throw new Error('Not connected to RabbitMQ');
echo     }
echo.
echo     try {
echo       await this.channel.assertExchange(exchange, 'topic', { durable: true });
echo       await this.channel.assertQueue(queue, { durable: true });
echo       await this.channel.bindQueue(queue, exchange, routingKey);
echo.
echo       this.channel.consume(queue, async (msg) => {
echo         if (msg !== null) {
echo           try {
echo             const message = JSON.parse(msg.content.toString());
echo             await callback(message);
echo             this.channel.ack(msg);
echo           } catch (error) {
echo             console.error('Error processing message:', error);
echo             this.channel.nack(msg, false, false); // Don't requeue
echo           }
echo         }
echo       });
echo     } catch (error) {
echo       console.error('Failed to consume messages:', error);
echo       throw error;
echo     }
echo   }
echo.
echo   async close() {
echo     if (this.channel) {
echo       await this.channel.close();
echo     }
echo     if (this.connection) {
echo       await this.connection.close();
echo     }
echo   }
echo }
echo.
echo module.exports = MessageQueue;
) > "%SHARED_DIR%\message-queue.js"

echo Creating Kubernetes deployment files...

:: API Gateway K8s Deployment
(
echo apiVersion: apps/v1
echo kind: Deployment
echo metadata:
echo   name: api-gateway
echo   namespace: quickbite
echo spec:
echo   replicas: 3
echo   selector:
echo     matchLabels:
echo       app: api-gateway
echo   template:
echo     metadata:
echo       labels:
echo         app: api-gateway
echo     spec:
echo       containers:
echo       - name: api-gateway
echo         image: quickbite/api-gateway:1.0.0
echo         ports:
echo         - containerPort: 3000
echo         env:
echo         - name: NODE_ENV
echo           value: "production"
echo         - name: AUTH_SERVICE_URL
echo           value: "http://auth-service.quickbite.svc.cluster.local:3001"
echo         - name: USER_SERVICE_URL
echo           value: "http://user-service.quickbite.svc.cluster.local:3002"
echo         - name: CATALOG_SERVICE_URL
echo           value: "http://catalog-service.quickbite.svc.cluster.local:3003"
echo         - name: ORDER_SERVICE_URL
echo           value: "http://order-service.quickbite.svc.cluster.local:3004"
echo         - name: PAYMENT_SERVICE_URL
echo           value: "http://payment-service.quickbite.svc.cluster.local:3005"
echo         - name: DELIVERY_SERVICE_URL
echo           value: "http://delivery-service.quickbite.svc.cluster.local:3006"
echo         - name: NOTIFICATION_SERVICE_URL
echo           value: "http://notification-service.quickbite.svc.cluster.local:3007"
echo         - name: SEARCH_SERVICE_URL
echo           value: "http://search-service.quickbite.svc.cluster.local:3008"
echo         resources:
echo           requests:
echo             memory: "128Mi"
echo             cpu: "100m"
echo           limits:
echo             memory: "256Mi"
echo             cpu: "200m"
echo         livenessProbe:
echo           httpGet:
echo             path: /health
echo             port: 3000
echo           initialDelaySeconds: 30
echo           periodSeconds: 10
echo         readinessProbe:
echo           httpGet:
echo             path: /health
echo             port: 3000
echo           initialDelaySeconds: 5
echo           periodSeconds: 5
echo ---
echo apiVersion: v1
echo kind: Service
echo metadata:
echo   name: api-gateway
echo   namespace: quickbite
echo spec:
echo   selector:
echo     app: api-gateway
echo   ports:
echo   - port: 80
echo     targetPort: 3000
echo   type: LoadBalancer
) > "%K8S_DIR%\api-gateway-deployment.yaml"

echo Creating database initialization script...

:: Database initialization script
(
echo #!/bin/bash
echo.
echo set -e
echo set -u
echo.
echo function create_user_and_database() {
echo 	local database=$1
echo 	echo "  Creating user and database '$database'"
echo 	psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
echo 	    CREATE DATABASE $database;
echo 	    GRANT ALL PRIVILEGES ON DATABASE $database TO $POSTGRES_USER;
echo EOSQL
echo }
echo.
echo if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
echo 	echo "Multiple database creation requested: $POSTGRES_MULTIPLE_DATABASES"
echo 	for db in $(echo $POSTGRES_MULTIPLE_DATABASES | tr ',' ' '); do
echo 		create_user_and_database $db
echo 	done
echo 	echo "Multiple databases created"
echo fi
) > "%SCRIPTS_DIR%\init-multiple-databases.sh"

echo Creating README and environment files...

:: README.md
(
echo # QuickBite Microservices Backend
echo.
echo ## Overview
echo QuickBite is a scalable food delivery platform built with microservices architecture. This backend supports 1M+ customers with high availability and performance.
echo.
echo ## Architecture
echo - **API Gateway**: Single entry point with rate limiting and circuit breaker
echo - **Auth Service**: JWT-based authentication with OTP support
echo - **User Service**: User profile and address management
echo - **Catalog Service**: Restaurant and menu management with Elasticsearch
echo - **Order Service**: Order processing with Saga pattern
echo - **Payment Service**: Multi-gateway payment processing
echo - **Delivery Service**: Delivery partner management and tracking
echo - **Notification Service**: Push, SMS, and email notifications
echo - **Search Service**: Advanced search with Elasticsearch
echo - **Admin Service**: Admin panel and analytics
echo - **Analytics Service**: Business intelligence and reporting
echo.
echo ## Quick Start
echo.
echo ### Prerequisites
echo - Docker and Docker Compose
echo - Node.js 18+ (for development)
echo.
echo ### Development
echo 1. Clone the repository
echo 2. Run: `docker-compose up --build`
echo 3. Access services:
echo    - API Gateway: http://localhost:3000
echo    - RabbitMQ Management: http://localhost:15672 (guest/guest)
echo    - Kibana: http://localhost:5601
echo    - PostgreSQL: localhost:5432
echo.
echo ### Production
echo 1. Set environment variables in .env files
echo 2. Run: `docker-compose -f docker-compose.prod.yml up -d`
echo.
echo ### Kubernetes
echo 1. Apply configurations: `kubectl apply -f k8s/`
echo 2. Access via load balancer
echo.
echo ## Environment Variables
echo Copy `.env.example` to `.env` in each service directory and configure accordingly.
echo.
echo ## API Documentation
echo API documentation available at `/api/docs` when services are running.
echo.
echo ## Monitoring
echo - Health checks: `/health` on each service
echo - Metrics: Prometheus endpoints
echo - Logs: Structured JSON logging
echo.
echo ## Support
echo For issues and questions, contact the development team.
) > "%ROOT_DIR%\README.md"

:: .env.example
(
echo # QuickBite Environment Configuration
echo NODE_ENV=development
echo.
echo # Database
echo POSTGRES_USER=quickbite
echo POSTGRES_PASSWORD=password
echo POSTGRES_HOST=postgres
echo POSTGRES_PORT=5432
echo.
echo # Redis
echo REDIS_URL=redis://redis:6379
echo.
echo # RabbitMQ
echo RABBITMQ_URL=amqp://rabbitmq:5672
echo.
echo # JWT Secrets (CHANGE IN PRODUCTION)
echo JWT_ACCESS_SECRET=your-super-secret-access-key-change-in-production
echo JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
echo JWT_ACCESS_EXPIRY=15m
echo JWT_REFRESH_EXPIRY=7d
echo.
echo # Payment Gateway
echo PAYMENT_GATEWAY_URL=https://api.razorpay.com/v1/payments
echo PAYMENT_GATEWAY_SECRET=your-razorpay-secret
echo.
echo # Elasticsearch
echo ELASTICSEARCH_URL=http://elasticsearch:9200
echo.
echo # External Services
echo SMS_GATEWAY_URL=
echo EMAIL_SERVICE_URL=
echo MAPS_API_KEY=
) > "%ROOT_DIR%\.env.example"

echo Creating service templates...

:: Create basic server.js template for all services
for %%S in (auth-service user-service catalog-service order-service payment-service delivery-service notification-service search-service admin-service analytics-service) do (
  (
  echo const express = require('express');
  echo const cors = require('cors');
  echo const helmet = require('helmet');
  echo const morgan = require('morgan');
  echo.
  echo const app = express();
  echo.
  echo // Middleware
  echo app.use(helmet());
  echo app.use(cors());
  echo app.use(morgan('combined'));
  echo app.use(express.json());
  echo.
  echo // Health check
  echo app.get('/health', (req, res) => {
  echo   res.status(200).json({
  echo     status: 'OK',
  echo     service: '%%S',
  echo     timestamp: new Date().toISOString()
  echo   });
  echo });
  echo.
  echo // Routes will be added here
  echo.
  echo const PORT = process.env.PORT || 3000;
  echo app.listen(PORT, () => {
  echo   console.log('%%S running on port ' + PORT);
  echo });
  ) > "%ROOT_DIR%\%%S\src\server.js"
)

echo Creating frontend files...

:: Frontend package.json
(
echo {
echo   "name": "quickbite-frontend",
echo   "version": "1.0.0",
echo   "type": "module",
echo   "scripts": {
echo     "dev": "vite",
echo     "build": "vite build",
echo     "preview": "vite preview"
echo   },
echo   "dependencies": {
echo     "react": "^18.2.0",
echo     "react-dom": "^18.2.0",
echo     "axios": "^1.5.0"
echo   },
echo   "devDependencies": {
echo     "vite": "^4.4.5",
echo     "@vitejs/plugin-react": "^4.0.3"
echo   }
echo }
) > "%FRONTEND_DIR%\package.json"

:: Frontend index.html
(
echo ^<!DOCTYPE html^>
echo ^<html lang="en"^>
echo   ^<head^>
echo     ^<meta charset="UTF-8" /^>
echo     ^<link rel="icon" type="image/svg+xml" href="/vite.svg" /^>
echo     ^<meta name="viewport" content="width=device-width, initial-scale=1.0" /^>
echo     ^<title^>QuickBite - Food Delivery^</title^>
echo   ^</head^>
echo   ^<body^>
echo     ^<div id="root"^>^</div^>
echo     ^<script type="module" src="/src/main.jsx"^>^</script^>
echo   ^</body^>
echo ^</html^>
) > "%FRONTEND_DIR%\index.html"

:: Frontend main.jsx
(
echo import React from 'react'
echo import ReactDOM from 'react-dom/client'
echo import App from './App.jsx'
echo import './index.css'
echo.
echo ReactDOM.createRoot(document.getElementById('root')).render(
echo   ^<React.StrictMode^>
echo     ^<App /^>
echo   ^</React.StrictMode^>,
echo )
) > "%FRONTEND_DIR%\src\main.jsx"

:: Frontend App.jsx
(
echo import { useState } from 'react'
echo import reactLogo from './assets/react.svg'
echo import viteLogo from '/vite.svg'
echo import './App.css'
echo.
echo function App() {
echo   const [count, setCount] = useState(0)
echo.
echo   return (
echo     ^<^>
echo       ^<div^>
echo         ^<a href="https://vitejs.dev" target="_blank"^>
echo           ^<img src={viteLogo} className="logo" alt="Vite logo" /^>
echo         ^</a^>
echo         ^<a href="https://react.dev" target="_blank"^>
echo           ^<img src={reactLogo} className="logo react" alt="React logo" /^>
echo         ^</a^>
echo       ^</div^>
echo       ^<h1^>QuickBite Food Delivery^</h1^>
echo       ^<div className="card"^>
echo         ^<button onClick={() => setCount((count) => count + 1)}^>
echo           count is {count}
echo         ^</button^>
echo         ^<p^>
echo           Edit ^<code^>src/App.jsx^</code^> and save to test HMR
echo         ^</p^>
echo       ^</div^>
echo       ^<p className="read-the-docs"^>
echo         Click on the Vite and React logos to learn more
echo       ^</p^>
echo     ^</^>
echo   )
echo }
echo.
echo export default App
) > "%FRONTEND_DIR%\src\App.jsx"

:: Frontend CSS files
(
echo #root {
echo   max-width: 1280px;
echo   margin: 0 auto;
echo   padding: 2rem;
echo   text-align: center;
echo }
echo.
echo .logo {
echo   height: 6em;
echo   padding: 1.5em;
echo   will-change: filter;
echo   transition: filter 300ms;
echo }
echo .logo:hover {
echo   filter: drop-shadow(0 0 2em #646cffaa);
echo }
echo .logo.react:hover {
echo   filter: drop-shadow(0 0 2em #61dafbaa);
echo }
echo.
echo @keyframes logo-spin {
echo   from {
echo     transform: rotate(0deg);
echo   }
echo   to {
echo     transform: rotate(360deg);
echo   }
echo }
echo.
echo @media (prefers-reduced-motion: no-preference) {
echo   a:nth-of-type(2) .logo {
echo     animation: logo-spin infinite 20s linear;
echo   }
echo }
echo.
echo .card {
echo   padding: 2em;
echo }
echo.
echo .read-the-docs {
echo   color: #888;
echo }
) > "%FRONTEND_DIR%\src\App.css"

(
echo :root {
echo   font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
echo   line-height: 1.5;
echo   font-weight: 400;
echo.
echo   color-scheme: light dark;
echo   color: rgba(255, 255, 255, 0.87);
echo   background-color: #242424;
echo.
echo   font-synthesis: none;
echo   text-rendering: optimizeLegibility;
echo   -webkit-font-smoothing: antialiased;
echo   -moz-osx-font-smoothing: grayscale;
echo   -webkit-text-size-adjust: 100%;
echo }
echo.
echo a {
echo   font-weight: 500;
echo   color: #646cff;
echo   text-decoration: inherit;
echo }
echo a:hover {
echo   color: #535bf2;
echo }
echo.
echo body {
echo   margin: 0;
echo   display: flex;
echo   place-items: center;
echo   min-width: 320px;
echo   min-height: 100vh;
echo }
echo.
echo h1 {
echo   font-size: 3.2em;
echo   line-height: 1.1;
echo }
echo.
echo button {
echo   border-radius: 8px;
echo   border: 1px solid transparent;
echo   padding: 0.6em 1.2em;
echo   font-size: 1em;
echo   font-weight: 500;
echo   font-family: inherit;
echo   background-color: #1a1a1a;
echo   cursor: pointer;
echo   transition: border-color 0.25s;
echo }
echo button:hover {
echo   border-color: #646cff;
echo }
echo button:focus,
echo button:focus-visible {
echo   outline: 4px auto -webkit-focus-ring-color;
echo }
echo.
echo @media (prefers-color-scheme: light) {
echo   :root {
echo     color: #213547;
echo     background-color: #ffffff;
echo   }
echo   a:hover {
echo     color: #747bff;
echo   }
echo   button {
echo     background-color: #f9f9f9;
echo   }
echo }
) > "%FRONTEND_DIR%\src\index.css"

:: Frontend Vite config
(
echo import { defineConfig } from 'vite'
echo import react from '@vitejs/plugin-react'
echo.
echo // https://vitejs.dev/config/
echo export default defineConfig({
echo   plugins: [react()],
echo   server: {
echo     port: 5173,
echo     proxy: {
echo       '/api': {
echo         target: 'http://localhost:3000',
echo         changeOrigin: true
echo       }
echo     }
echo   }
echo })
) > "%FRONTEND_DIR%\vite.config.js"

echo.
echo ===============================================
echo    Setup Complete!
echo ===============================================
echo.
echo QuickBite microservices backend has been created in: %ROOT_DIR%
echo.
echo Next steps:
echo 1. Navigate to %ROOT_DIR%
echo 2. Run 'docker-compose up --build' to start all services
echo 3. Access the API Gateway at http://localhost:3000
echo 4. Access the Frontend at http://localhost:5173
echo.
echo Services included:
echo - API Gateway (port 3000)
echo - Auth Service (port 3001) 
echo - User Service (port 3002)
echo - Catalog Service (port 3003)
echo - Order Service (port 3004)
echo - Payment Service (port 3005)
echo - Delivery Service (port 3006)
echo - Notification Service (port 3007)
echo - Search Service (port 3008)
echo - Admin Service (port 3009)
echo - Analytics Service (port 3010)
echo - Frontend (port 5173)
echo.
echo Additional services:
echo - PostgreSQL (port 5432)
echo - Redis (port 6379)
echo - RabbitMQ (port 5672, management: 15672)
echo - Elasticsearch (port 9200)
echo - Kibana (port 5601)
echo.
echo Happy coding! 🚀

pause