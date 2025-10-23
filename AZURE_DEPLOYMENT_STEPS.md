# Azure Deployment - Final Steps

## ✅ Completed So Far
1. Azure CLI installed
2. Logged in to Azure
3. Resource Group created: `quickbite-rg` (westus)
4. ACR created: `quickbiteacr8732`
5. Service Principal created (credentials saved to `infra/outputs/azure-credentials.json`)
6. Providers registering: Microsoft.ContainerRegistry (done), Microsoft.DBforPostgreSQL (in progress)

## 🔄 Step 3 - Complete PostgreSQL Setup (wait ~2 mins for provider registration)

Check registration status:
```powershell
& "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" provider show -n Microsoft.DBforPostgreSQL --query "registrationState" -o tsv
```

When it shows "Registered", create PostgreSQL:
```powershell
& "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" postgres flexible-server create `
  -g quickbite-rg `
  -n quickbite-pg-server `
  -l westus `
  --admin-user quickbiteadmin `
  --admin-password "QuickBite2025!Secure" `
  --tier Burstable `
  --sku-name Standard_B1ms `
  --storage-size 32 `
  --version 14 `
  --public-access 0.0.0.0-255.255.255.255 `
  --yes
```

Create the quickbite database:
```powershell
& "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" postgres flexible-server db create -g quickbite-rg -s quickbite-pg-server -d quickbite
```

Your DATABASE_URL will be:
```
postgres://quickbiteadmin:QuickBite2025!Secure@quickbite-pg-server.postgres.database.azure.com:5432/quickbite?sslmode=require
```

## Step 4 - Load Schema

If you have `psql` installed:
```powershell
$env:PGPASSWORD="QuickBite2025!Secure"
psql -h quickbite-pg-server.postgres.database.azure.com -U quickbiteadmin -d quickbite -f quickbite-backend\auth-service\src\database\schema.sql
```

Or use Azure Data Studio/pgAdmin to run `quickbite-backend\auth-service\src\database\schema.sql`

## Step 5 - Set GitHub Secrets

Go to: https://github.com/lokeshmudiraj96-ux/lokeshmudiraj96-ux.github.io/settings/secrets/actions

Add these secrets:

```
AZURE_CREDENTIALS = <contents of infra/outputs/azure-credentials.json>
AZURE_RESOURCE_GROUP = quickbite-rg
AZURE_REGION = westus
AZURE_ACR_NAME = quickbiteacr8732
AZURE_WEBAPP_NAME = quickbite-auth-app
JWT_SECRET = <generate with: openssl rand -hex 32>
DATABASE_URL = postgres://quickbiteadmin:QuickBite2025!Secure@quickbite-pg-server.postgres.database.azure.com:5432/quickbite?sslmode=require
REDIS_URL = <leave empty for now; OTP flows won't work but login/register will>
FRONTEND_URL = http://localhost:3000
```

## Step 6 - Deploy Auth Service

1. Go to Actions tab: https://github.com/lokeshmudiraj96-ux/lokeshmudiraj96-ux.github.io/actions
2. Select "Deploy Auth Service to Azure Web App (Container)"
3. Click "Run workflow" → "Run workflow"
4. Wait ~3-5 minutes for build + deploy

## Step 7 - Verify

Check health endpoint:
```
https://quickbite-auth-app.azurewebsites.net/health
```

## Step 8 - Update Frontend

Edit `quickbite-backend/frontend/.env`:
```
REACT_APP_API_URL=https://quickbite-auth-app.azurewebsites.net
REACT_APP_DEMO_MODE=false
```

Restart frontend:
```powershell
cd quickbite-backend\frontend
npm start
```

Test login/register at http://localhost:3000

## Quick Commands Reference

Set Azure CLI in PATH (run in each new PowerShell):
```powershell
$env:Path = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;" + $env:Path
```

Generate JWT secret:
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```
