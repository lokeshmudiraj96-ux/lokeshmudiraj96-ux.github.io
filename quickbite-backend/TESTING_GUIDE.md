# Local Testing Guide

## Quick Start (Frontend Only)

Since PostgreSQL and Redis are not installed, let's test the frontend UI first:

### Step 1: Start the React App

```powershell
cd C:\Users\DELL\source\repos\lokeshmudiraj96-ux.github.io\quickbite-backend\frontend
npm start
```

When asked "Would you like to run the app on another port instead?", type **y** and press Enter.

The app will open in your browser at `http://localhost:3001` (or another port).

### Step 2: Test the UI

You can see:
- Landing page redirect
- Login page (`/login`)
- Register page (`/register`)
- Forms and layouts

**Note:** Login/Register won't work yet because the backend isn't running.

---

## Full Setup (Frontend + Backend)

To test authentication fully, you need:

### Option 1: Install PostgreSQL & Redis (Recommended)

**Install PostgreSQL:**
1. Download from: https://www.postgresql.org/download/windows/
2. Install with default settings
3. Remember the password you set for postgres user

**Install Redis:**
1. Download from: https://github.com/microsoftarchive/redis/releases
2. Or use Docker: `docker run -d -p 6379:6379 redis:7-alpine`

**Set up database:**
```powershell
# Create database
createdb auth_db

# Run migrations
cd C:\Users\DELL\source\repos\lokeshmudiraj96-ux.github.io\quickbite-backend\auth-service
psql -U postgres -d auth_db -f src/database/schema.sql
```

**Configure & Start Auth Service:**
```powershell
cd quickbite-backend/auth-service

# Copy and edit .env
cp .env.example .env
# Edit .env with your database credentials

# Install dependencies
npm install

# Start service
npm run dev
```

**Start Frontend:**
```powershell
cd quickbite-backend/frontend
npm start
```

### Option 2: Use Docker (Easier)

I can create a `docker-compose.yml` that runs everything with one command:
```powershell
docker-compose up
```

This will start:
- PostgreSQL
- Redis
- Auth Service
- Frontend

---

## What Would You Like To Do?

**A) Just test the frontend UI** (no backend needed)
- See the login/register/profile pages
- Test the design and layout

**B) Install PostgreSQL + Redis** (full local setup)
- I'll guide you through installation
- Test complete authentication flow

**C) Use Docker Compose** (easiest)
- I'll create docker-compose.yml
- Run everything with one command

**D) Skip local testing, deploy to cloud**
- Set up AWS infrastructure
- Deploy everything online

Which option do you prefer?
