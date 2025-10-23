# QuickBite - Local Development Setup

Complete guide to run the auth service + frontend locally.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+

## Step 1: Set Up PostgreSQL

```powershell
# Create database
createdb auth_db

# Or using psql
psql -U postgres
CREATE DATABASE auth_db;
\q
```

## Step 2: Set Up Auth Service

```powershell
cd quickbite-backend/auth-service

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your database credentials
# DATABASE_URL=postgresql://your_user:your_password@localhost:5432/auth_db

# Run database migrations
psql -U your_user -d auth_db -f src/database/schema.sql

# Start Redis (separate terminal)
redis-server

# Start auth service
npm run dev
```

Auth service will run on `http://localhost:3001`

## Step 3: Set Up Frontend

```powershell
cd quickbite-backend/frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env
# REACT_APP_API_URL=http://localhost:3001/api

# Start frontend
npm start
```

Frontend will open at `http://localhost:3000`

## Step 4: Test the App

1. **Register a new account:**
   - Go to `http://localhost:3000/register`
   - Choose "Email" tab
   - Fill in: Name, Email, Phone, Password
   - Click "Register"

2. **Login:**
   - Go to `http://localhost:3000/login`
   - Enter your email and password
   - Click "Login"

3. **View Profile:**
   - After login, you'll be redirected to `/profile`
   - View your user details

4. **Test OTP Flow (Development):**
   - Go to Login/Register
   - Choose "Phone OTP" tab
   - Enter phone number
   - Check your terminal running auth-service for the OTP code
   - Enter OTP and verify

## Troubleshooting

### Database Connection Error
```powershell
# Check if PostgreSQL is running
psql -U postgres -c "SELECT version();"

# If not, start it
# Windows: Open Services and start PostgreSQL
# Or use pg_ctl start
```

### Redis Connection Error
```powershell
# Check if Redis is running
redis-cli ping
# Should return PONG

# If not, start it
redis-server
```

### Port Already in Use
```powershell
# Change port in .env files
# Auth service: PORT=3002
# Frontend will auto-pick another port if 3000 is busy
```

### CORS Error
Make sure `FRONTEND_URL` in auth service `.env` matches your frontend URL:
```
FRONTEND_URL=http://localhost:3000
```

## Next Steps

- Test all authentication flows
- Check JWT token refresh
- Test logout functionality
- Verify error handling
- Ready to deploy to AWS!
