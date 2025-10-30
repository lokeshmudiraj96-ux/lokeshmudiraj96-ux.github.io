# QuickBite Advanced User Management Service

A comprehensive user management microservice built for the QuickBite food delivery platform, featuring advanced user profiles, social connections, loyalty programs, referral systems, and personalized preferences.

## 🚀 Features

### Core User Management
- **Advanced User Profiles** - Comprehensive profile management with image uploads
- **Multi-Address Management** - Support for multiple delivery addresses with validation
- **Account Security** - Password management, account deactivation, and security controls

### Social Features
- **User Connections** - Friend/family/colleague connection system
- **Social Scoring** - Dynamic social scores based on activity and connections
- **Connection Suggestions** - AI-powered friend recommendations
- **Activity Feeds** - User activity tracking and social feeds

### Loyalty Program
- **Multi-Tier System** - Bronze, Silver, Gold, Platinum, Diamond tiers
- **Points & Rewards** - Earn points, redeem rewards, tier-based benefits
- **Birthday Bonuses** - Special rewards on user birthdays
- **Transaction History** - Complete loyalty transaction tracking

### Referral System
- **Referral Codes** - Unique 8-character referral codes for each user
- **Reward Structure** - Rewards for both referrer and referee
- **Conversion Tracking** - Track referral success and earnings
- **Social Sharing** - Built-in social media sharing links

### Smart Preferences
- **Personalized Preferences** - Food, delivery, dietary, and notification preferences
- **Behavioral Learning** - AI learns from user behavior to improve recommendations
- **Recommendation Engine** - Personalized restaurant and dish recommendations
- **Preference Analytics** - Detailed preference insights and analytics

### Advanced Analytics
- **User Behavior Tracking** - Comprehensive user activity analytics
- **Engagement Metrics** - User engagement and retention analytics
- **Performance Insights** - Service performance and usage analytics

## 🏗️ Architecture

### Technology Stack
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL with connection pooling
- **Caching**: Redis (optional)
- **Authentication**: JWT tokens
- **File Storage**: Local storage with Sharp image processing
- **Security**: Helmet, CORS, rate limiting, input validation

### Database Schema
```sql
-- 15+ interconnected tables supporting:
- User profiles and authentication
- Address management with geolocation
- Social connections and activities
- Loyalty programs and transactions
- Referral tracking and rewards
- User preferences and analytics
- Notification settings
- Session management
```

## 📁 Project Structure

```
user-service/
├── src/
│   ├── config/
│   │   ├── index.js          # Configuration management
│   │   └── database.js       # PostgreSQL connection setup
│   ├── controllers/
│   │   ├── user.controller.js      # User profile management
│   │   ├── address.controller.js   # Address CRUD operations
│   │   ├── social.controller.js    # Social connections
│   │   ├── loyalty.controller.js   # Loyalty & referral systems
│   │   └── preferences.controller.js # User preferences
│   ├── models/
│   │   └── user.model.js     # Comprehensive user data models
│   ├── routes/
│   │   ├── user.routes.js    # User-related endpoints
│   │   ├── address.routes.js # Address management endpoints
│   │   ├── social.routes.js  # Social feature endpoints
│   │   ├── loyalty.routes.js # Loyalty & referral endpoints
│   │   └── preferences.routes.js # Preferences endpoints
│   ├── middleware/
│   │   └── index.js          # Security, auth, validation middleware
│   └── server.js             # Main application server
├── uploads/                  # File uploads directory
├── package.json              # Dependencies and scripts
├── .env.example             # Environment configuration template
└── README.md                # This file
```

## 🚦 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- Redis (optional, for caching)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd user-service
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Configure PostgreSQL**
   ```bash
   # Create database
   createdb quickbite_users
   
   # Update .env with your PostgreSQL credentials
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=quickbite_users
   DB_USER=postgres
   DB_PASSWORD=your_password
   ```

5. **Start the service**
   ```bash
   # Development mode with auto-reload
   npm run dev
   
   # Production mode
   npm start
   ```

### Database Setup

The service automatically creates all required tables on first run. The schema includes:

- **users** - Main user profiles
- **user_addresses** - Multiple delivery addresses
- **user_preferences** - Personalized preferences
- **user_loyalty** - Loyalty program data
- **loyalty_transactions** - Points and redemptions
- **user_connections** - Social connections
- **user_activities** - Activity tracking
- **user_referrals** - Referral system
- **notification_preferences** - Notification settings
- And more...

## 📚 API Documentation

### Base URL
```
http://localhost:3005/api
```

### Key Endpoints

#### User Profile Management
```bash
GET    /api/users/profile              # Get user profile
PUT    /api/users/profile              # Update profile
POST   /api/users/profile/image        # Upload profile image
PUT    /api/users/password             # Change password
POST   /api/users/deactivate           # Deactivate account
```

#### Address Management
```bash
GET    /api/addresses                  # Get all addresses
POST   /api/addresses                  # Add new address
PUT    /api/addresses/:id              # Update address
PUT    /api/addresses/:id/default      # Set as default
DELETE /api/addresses/:id              # Delete address
POST   /api/addresses/validate         # Validate address
```

#### Social Features
```bash
POST   /api/social/connections/request    # Send connection request
GET    /api/social/connections/pending    # Get pending requests
PUT    /api/social/connections/:id/respond # Accept/reject request
GET    /api/social/connections            # Get friends list
GET    /api/social/suggestions            # Get friend suggestions
```

#### Loyalty Program
```bash
GET    /api/loyalty/overview            # Loyalty overview
GET    /api/loyalty/transactions        # Transaction history
POST   /api/loyalty/redeem              # Redeem points
GET    /api/loyalty/rewards             # Available rewards
POST   /api/loyalty/birthday-bonus      # Claim birthday bonus
```

#### Referral System
```bash
GET    /api/referrals/overview          # Referral stats
GET    /api/referrals/history           # Referral history
POST   /api/referrals/process           # Process referral code
GET    /api/referrals/link              # Generate referral link
```

#### User Preferences
```bash
GET    /api/preferences                 # Get all preferences
PUT    /api/preferences                 # Update preferences
PUT    /api/preferences/dietary         # Set dietary preferences
PUT    /api/preferences/delivery        # Set delivery preferences
PUT    /api/preferences/notifications   # Set notification preferences
GET    /api/preferences/recommendations # Get personalized recommendations
POST   /api/preferences/learn           # Learn from behavior
```

### Authentication

All API endpoints (except health check) require JWT authentication:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     https://api.quickbite.app/users/profile
```

## 🔧 Configuration

### Environment Variables

Key configuration options in `.env`:

```env
# Database
DB_HOST=localhost
DB_NAME=quickbite_users
DB_USER=postgres
DB_PASSWORD=your_password

# Security
JWT_SECRET=your-secret-key

# Features
ENABLE_SOCIAL=true
ENABLE_LOYALTY=true
ENABLE_REFERRAL=true
ENABLE_ANALYTICS=true

# Services
AUTH_SERVICE_URL=http://localhost:3001
ORDER_SERVICE_URL=http://localhost:3002
```

### Feature Flags

Enable/disable features using environment variables:
- `ENABLE_SOCIAL` - Social connections and activities
- `ENABLE_LOYALTY` - Loyalty program features
- `ENABLE_REFERRAL` - Referral system
- `ENABLE_ANALYTICS` - Advanced analytics
- `ENABLE_REALTIME` - Real-time notifications

## 🛡️ Security Features

- **JWT Authentication** - Secure token-based authentication
- **Rate Limiting** - API rate limiting to prevent abuse
- **Input Validation** - Comprehensive request validation
- **SQL Injection Protection** - Parameterized queries
- **CORS Configuration** - Proper CORS setup
- **Security Headers** - Helmet.js security headers
- **File Upload Security** - Secure file upload with type validation

## 📊 Monitoring & Health

### Health Check
```bash
GET /health
```

Response:
```json
{
  "success": true,
  "service": "QuickBite User Service",
  "version": "1.0.0",
  "environment": "development",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "memory": {...}
}
```

### Logging

Comprehensive logging with:
- Request/response logging
- Error tracking
- Performance metrics
- User activity tracking

## 🚀 Deployment

### Docker Deployment
```bash
# Build image
docker build -t quickbite-user-service .

# Run container
docker run -p 3005:3005 \
  -e DB_HOST=your_db_host \
  -e DB_PASSWORD=your_password \
  quickbite-user-service
```

### Production Considerations

1. **Database**: Use managed PostgreSQL (AWS RDS, Google Cloud SQL)
2. **Caching**: Enable Redis for improved performance
3. **File Storage**: Use cloud storage (AWS S3, Google Cloud Storage)
4. **Monitoring**: Set up application monitoring (New Relic, DataDog)
5. **SSL**: Enable HTTPS in production
6. **Backup**: Regular database backups
7. **Scaling**: Use load balancers for horizontal scaling

## 📈 Performance

### Optimization Features
- **Connection Pooling** - PostgreSQL connection pooling
- **Response Compression** - Gzip compression
- **Query Optimization** - Optimized database queries
- **Caching** - Redis caching for frequently accessed data
- **Image Processing** - Sharp for efficient image processing

### Scalability
- **Microservice Architecture** - Independent scaling
- **Database Indexing** - Optimized database indexes
- **Async Operations** - Non-blocking operations
- **Load Balancing** - Ready for horizontal scaling

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is part of the QuickBite food delivery platform.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the API documentation

---

**Built with ❤️ for QuickBite - Advanced User Management Service**