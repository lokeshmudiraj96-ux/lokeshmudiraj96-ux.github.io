# QuickBite AI-Powered Recommendation Engine 🧠🍕

An advanced machine learning recommendation system that provides personalized food recommendations using multiple AI algorithms, real-time trending analysis, and A/B testing framework.

## 🚀 Features

### Core Algorithms
- **Collaborative Filtering** - User-based and item-based recommendations using similarity metrics
- **Content-Based Filtering** - TF-IDF text analysis and feature-based recommendations  
- **Hybrid Recommendation Engine** - Combines multiple algorithms with intelligent weighting
- **Neural Networks** - Deep learning models with embeddings for advanced pattern recognition
- **Trending Analysis** - Real-time trending detection and seasonal pattern analysis

### Advanced Capabilities
- **A/B Testing Framework** - Compare algorithm performance with statistical significance testing
- **Contextual Awareness** - Time, weather, location, and meal period-based recommendations
- **Real-time Learning** - Continuous model updates based on user interactions
- **Performance Analytics** - Comprehensive metrics and algorithm performance monitoring
- **Scalable Architecture** - Redis caching, database optimization, and microservice design

## 📋 Prerequisites

- Node.js 16+ 
- PostgreSQL 13+
- Redis 6+
- Python 3.8+ (for TensorFlow.js native dependencies)

## 🛠 Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd recommendation-service
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/quickbite_recommendations
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-super-secret-jwt-key
VALID_API_KEYS=recommendation-service-key,admin-api-key

# Service Configuration
NODE_ENV=development
PORT=3007
LOG_LEVEL=info

# Algorithm Settings
ENABLE_NEURAL_NETWORK=true
ENABLE_AB_TESTING=true
ENABLE_TRENDING_ANALYSIS=true
DEFAULT_ALGORITHM=hybrid

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
```

4. **Set up the database**
```bash
npm run db:setup
```

5. **Start the service**
```bash
# Development
npm run dev

# Production
npm start
```

## 🏗 Architecture

```
recommendation-service/
├── src/
│   ├── algorithms/          # ML Algorithm Implementations
│   │   ├── collaborative-filtering.js
│   │   ├── content-based-filtering.js
│   │   ├── hybrid-recommendation.js
│   │   ├── neural-recommendation.js
│   │   └── trending-seasonal.js
│   ├── config/             # Database and Configuration
│   │   └── database.js
│   ├── controllers/        # API Controllers
│   │   └── recommendation.controller.js
│   ├── middleware/         # Authentication & Validation
│   │   ├── auth.js
│   │   └── validation.js
│   ├── models/            # Data Models
│   │   └── recommendation.model.js
│   ├── routes/            # API Routes
│   │   └── recommendation.routes.js
│   ├── services/          # Business Logic
│   │   └── recommendation.service.js
│   └── testing/           # A/B Testing Framework
│       └── ab-testing.js
├── app.js                 # Main Application
├── package.json
└── README.md
```

## 🎯 API Endpoints

### Core Recommendations

#### Get Personalized Recommendations
```http
GET /api/v1/users/{userId}/recommendations
```

**Query Parameters:**
- `limit` (number, 1-50): Number of recommendations (default: 10)
- `algorithm` (string): Specific algorithm to use
- `context` (JSON): Contextual information
- `includeExplanations` (boolean): Include recommendation explanations
- `diversityFactor` (number, 0-1): Diversity level (default: 0.3)

**Example:**
```bash
curl -H "X-API-Key: your-api-key" \
  "http://localhost:3007/api/v1/users/123e4567-e89b-12d3-a456-426614174000/recommendations?limit=10&context={\"timeOfDay\":12,\"location\":{\"latitude\":40.7128,\"longitude\":-74.0060}}"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "itemId": "item_123",
        "score": 0.95,
        "confidence": 0.87,
        "recommendationType": "hybrid",
        "algorithm": "adaptive_hybrid",
        "explanation": "Recommended because users with similar taste like it and it matches your preferences",
        "itemDetails": {
          "name": "Margherita Pizza",
          "category": "pizza",
          "cuisine_type": "italian",
          "price": 18.99,
          "rating_average": 4.5
        }
      }
    ],
    "algorithm": "hybrid",
    "totalGenerated": 25
  }
}
```

#### Get Trending Recommendations
```http
GET /api/v1/trending
```

**Query Parameters:**
- `limit` (number): Number of items
- `timePeriod` (string): 'day' | 'week' | 'month'
- `category` (string): Filter by category
- `mealPeriod` (string): 'breakfast' | 'lunch' | 'dinner' | 'snack'

#### Track User Interactions
```http
POST /api/v1/users/{userId}/interactions/{itemId}
```

**Request Body:**
```json
{
  "interactionType": "click",
  "interactionValue": 4.5,
  "metadata": {
    "source": "web",
    "position": 2,
    "context": {
      "timeOfDay": 12,
      "mealPeriod": "lunch"
    }
  }
}
```

### A/B Testing

#### Create Experiment
```http
POST /api/v1/experiments
Authorization: Bearer <jwt-token>
```

**Request Body:**
```json
{
  "name": "Collaborative vs Neural",
  "description": "Compare collaborative filtering with neural network recommendations",
  "controlAlgorithm": "collaborative",
  "treatmentAlgorithm": "neural",
  "trafficSplit": 0.5,
  "targetMetrics": ["ctr", "conversion_rate"],
  "duration": 14
}
```

#### Get Experiment Results
```http
GET /api/v1/experiments/{experimentId}/results
Authorization: Bearer <jwt-token>
```

### Neural Network Management

#### Train Neural Model
```http
POST /api/v1/neural/train
Authorization: Bearer <jwt-token>
```

#### Get Training Status
```http
GET /api/v1/neural/status
Authorization: Bearer <jwt-token>
```

### Analytics

#### Get Algorithm Performance
```http
GET /api/v1/performance
Authorization: Bearer <jwt-token>
```

#### Service Status
```http
GET /api/v1/status
Authorization: Bearer <jwt-token>
```

## 🤖 Machine Learning Algorithms

### 1. Collaborative Filtering
- **User-Based CF**: Find similar users and recommend items they liked
- **Item-Based CF**: Recommend items similar to what user has interacted with
- **Similarity Metrics**: Cosine similarity, Pearson correlation, Jaccard similarity
- **Matrix Factorization**: SVD for dimensionality reduction

### 2. Content-Based Filtering
- **TF-IDF Analysis**: Text similarity for item descriptions
- **Feature Vectors**: Numerical features (price, rating, nutrition)
- **User Profiling**: Learn user preferences from interaction history
- **NLP Processing**: Natural language processing for ingredient analysis

### 3. Hybrid Engine
- **Adaptive Weighting**: Dynamic algorithm selection based on user profile
- **Multiple Strategies**: Weighted, switching, cascade, and mixed approaches
- **Cold Start Handling**: Smart fallbacks for new users/items
- **Context Integration**: Time, weather, location-aware recommendations

### 4. Neural Networks
- **Deep Learning**: Multi-layer neural networks with embeddings
- **User/Item Embeddings**: Learn latent representations
- **Feature Engineering**: Automated feature extraction
- **Real-time Prediction**: Fast inference for live recommendations

### 5. Trending Analysis
- **Real-time Trends**: Detect sudden popularity spikes
- **Seasonal Patterns**: Meal period and seasonal recommendations
- **Momentum Scoring**: Weighted popularity based on recency
- **Growth Detection**: Identify emerging trends

## 📊 A/B Testing Framework

### Experiment Configuration
```javascript
{
  name: "Algorithm Comparison",
  controlAlgorithm: "collaborative",
  treatmentAlgorithm: "neural",
  trafficSplit: 0.5,
  targetMetrics: ["ctr", "conversion_rate", "user_engagement"],
  segmentFilters: {
    minInteractions: 10,
    preferredCategories: ["pizza", "burger"]
  },
  duration: 14
}
```

### Statistical Testing
- **Two-proportion Z-test**: Compare conversion rates
- **Significance Level**: Configurable (default: 0.05)
- **Confidence Intervals**: 95% confidence intervals for effect size
- **Sample Size Validation**: Minimum sample requirements
- **Power Analysis**: Statistical power calculation

### Metrics Tracked
- **Click-through Rate (CTR)**: Clicks / Impressions
- **Conversion Rate**: Purchases / Clicks  
- **User Engagement**: Active users / Total users
- **Revenue per User**: Average revenue impact
- **Item Diversity**: Recommendation variety metrics

## 🔧 Configuration

### Algorithm Parameters
```javascript
// Collaborative Filtering
{
  minSimilarUsers: 5,
  minCommonItems: 3,
  similarityThreshold: 0.1,
  maxNeighbors: 50
}

// Content-Based
{
  minContentSimilarity: 0.1,
  diversityFactor: 0.2,
  maxFeatures: 1000,
  ngramRange: [1, 2]
}

// Neural Network
{
  embeddingDim: 50,
  hiddenLayers: [128, 64, 32],
  dropoutRate: 0.3,
  learningRate: 0.001,
  batchSize: 256,
  epochs: 100
}

// Hybrid Engine
{
  collaborativeWeight: 0.6,
  contentBasedWeight: 0.4,
  popularityWeight: 0.1,
  coldStartUserThreshold: 5
}
```

### Performance Tuning
- **Redis Caching**: 30-minute cache for recommendations
- **Database Indexing**: Optimized queries for large datasets
- **Batch Processing**: Efficient bulk operations
- **Connection Pooling**: PostgreSQL connection management
- **Memory Management**: TensorFlow.js memory optimization

## 📈 Monitoring & Analytics

### Key Metrics
- **Recommendation Accuracy**: Precision, recall, F1-score
- **User Engagement**: Click-through rates, conversion rates
- **Algorithm Performance**: Response times, cache hit rates
- **System Health**: CPU, memory, database performance
- **Business Impact**: Revenue lift, user satisfaction

### Logging
- **Structured Logging**: JSON format with correlation IDs
- **Error Tracking**: Comprehensive error monitoring
- **Performance Logging**: API response times and database queries
- **Audit Trail**: User interactions and recommendation history

### Dashboards
- **Real-time Metrics**: Live recommendation performance
- **A/B Test Results**: Experiment outcomes and significance
- **Algorithm Comparison**: Performance across different methods
- **User Behavior Analysis**: Interaction patterns and preferences

## 🛡 Security & Compliance

### Authentication
- **API Key Validation**: Service-to-service authentication
- **JWT Tokens**: User session management
- **Role-Based Access**: Admin vs user permissions
- **Rate Limiting**: Prevent API abuse

### Data Protection
- **Input Validation**: Comprehensive request validation
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Input sanitization
- **HTTPS Enforcement**: Secure data transmission

### Privacy
- **Data Anonymization**: User privacy protection
- **GDPR Compliance**: Right to be forgotten
- **Consent Management**: User preference tracking
- **Audit Logging**: Compliance monitoring

## 🚀 Deployment

### Docker
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3007
CMD ["npm", "start"]
```

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: recommendation-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: recommendation-service
  template:
    metadata:
      labels:
        app: recommendation-service
    spec:
      containers:
      - name: recommendation-service
        image: quickbite/recommendation-service:latest
        ports:
        - containerPort: 3007
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
```

### Environment Setup
```bash
# Production deployment
docker build -t quickbite/recommendation-service .
docker run -p 3007:3007 --env-file .env.production quickbite/recommendation-service

# Kubernetes deployment
kubectl apply -f k8s/
kubectl scale deployment recommendation-service --replicas=5
```

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Performance Tests
```bash
npm run test:performance
```

### A/B Test Validation
```bash
npm run test:experiments
```

## 📚 Algorithm Details

### Similarity Calculations

#### Cosine Similarity
```
similarity(A,B) = (A·B) / (||A|| × ||B||)
```

#### Pearson Correlation
```
r = Σ[(xi - x̄)(yi - ȳ)] / √[Σ(xi - x̄)²Σ(yi - ȳ)²]
```

#### Jaccard Similarity
```
J(A,B) = |A ∩ B| / |A ∪ B|
```

### Neural Network Architecture
```
Input Layer: [user_id, item_id, features]
    ↓
Embedding Layer: [user_embedding, item_embedding]
    ↓
Hidden Layer 1: 128 neurons + ReLU + Dropout(0.3)
    ↓
Hidden Layer 2: 64 neurons + ReLU + Dropout(0.3)
    ↓
Hidden Layer 3: 32 neurons + ReLU + Dropout(0.3)
    ↓
Output Layer: [rating_prediction, category_probability]
```

### Trending Score Calculation
```
trending_score = (interactions × 0.3) + 
                (unique_users × 0.25) + 
                (momentum × 0.2) + 
                (purchases × 0.15) + 
                (rating × 0.1)
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [https://docs.quickbite.com/recommendation-api](https://docs.quickbite.com/recommendation-api)
- **Issues**: [GitHub Issues](https://github.com/quickbite/recommendation-service/issues)
- **Email**: [support@quickbite.com](mailto:support@quickbite.com)

## 🙏 Acknowledgments

- TensorFlow.js team for neural network capabilities
- Scikit-learn for algorithm inspiration
- Redis team for caching solutions
- PostgreSQL community for database performance

---

**Built with ❤️ by the QuickBite AI Team**

*Delivering intelligent food recommendations at scale* 🚀