# Azure App Service Quota Increase Request

## Current Issue
Cannot deploy to Azure App Service due to quota limit:
- **Resource**: Basic App Service Plan VMs
- **Current Limit**: 0
- **Required**: At least 1 (recommend 2 for future scaling)
- **Region**: West US (or any region)

## How to Request Quota Increase

### Method 1: Azure Portal (Recommended)
1. Go to Azure Portal: https://portal.azure.com
2. Navigate to **Subscriptions** → Select "Azure subscription 1"
3. Click **Usage + quotas** in the left sidebar
4. Search for "App Service" or "Basic"
5. Find "Basic App Service Plan VMs" or similar
6. Click the **pencil icon** or **Request increase**
7. Fill out the form:
   - **New quota limit**: 2 (or higher)
   - **Justification**: "Need to deploy containerized Node.js authentication service for development/testing"
8. Submit the request

**Approval time**: Usually 1-24 hours for small increases like this

### Method 2: Azure CLI (Alternative)
```powershell
# Create support ticket for quota increase
az support tickets create `
  --ticket-name "AppServiceQuota-$(Get-Date -Format 'yyyyMMdd')" `
  --title "Request Basic App Service Plan Quota Increase" `
  --description "Need to increase Basic App Service Plan VM quota from 0 to 2 for deploying containerized applications" `
  --severity "minimal" `
  --problem-classification "/providers/Microsoft.Support/services/quota_service_guid/problemClassifications/app_service_problem_class_guid" `
  --contact-first-name "Your" `
  --contact-last-name "Name" `
  --contact-email "your@email.com" `
  --contact-phone-number "+1234567890" `
  --contact-timezone "Pacific Standard Time" `
  --contact-country "US"
```

### Method 3: Support Request Form
Direct link: https://portal.azure.com/#create/Microsoft.Support/Parameters/%7B%22subId%22%3A%22e2392f4b-fe97-4390-a149-e717ece64e6d%22%2C%22pesId%22%3A%2206bfd9d3-516b-d5c6-5802-169c800dec89%22%7D

---

## What Happens After Approval

Once your quota is approved:

1. **Automatic Deployment**: The GitHub Actions workflow will run automatically on next push
2. **Manual Trigger**: Or trigger manually:
   ```powershell
   gh workflow run deploy-auth-azure.yml
   ```
3. **Check Status**:
   ```powershell
   gh run list --workflow=deploy-auth-azure.yml --limit 1
   gh run watch <run-id>
   ```

---

## Current Setup Status ✅

- ✅ Azure SQL Database configured and firewall open
- ✅ Container Registry (ACR) created with admin access
- ✅ Docker image built and pushed successfully
- ✅ GitHub Actions workflow configured
- ✅ All GitHub secrets set (9/9)
- ✅ Service Principal with proper permissions
- ✅ Database schema ready to load
- ✅ Code migrated from PostgreSQL to SQL Server

**Only blocker**: App Service quota limit

---

## Meanwhile: Load Database Schema

1. Open Azure Portal Query Editor: 
   https://portal.azure.com → SQL Database "quickbite" → Query editor
   
2. Login with your Azure AD account (automatic)

3. Copy/paste the schema from:
   `quickbite-backend/auth-service/src/database/schema-sqlserver.sql`
   
4. Execute to create all tables

---

## Alternative: Deploy Locally for Testing

While waiting for quota approval, you can test locally:

```powershell
cd quickbite-backend/auth-service

# Set environment variables
$env:DATABASE_URL="Server=quickbite.database.windows.net;Database=quickbite;..."
$env:JWT_SECRET="your-secret-key"
$env:PORT="3001"
$env:NODE_ENV="development"

# Install and run
npm install
npm start
```

The service will run on http://localhost:3001 with /health endpoint available.
