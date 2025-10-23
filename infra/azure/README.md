# Azure path for Auth Service

This repo now includes an Azure deployment option using:
- Azure Container Registry (ACR)
- Azure App Service for Containers (Linux)
- GitHub Actions CI/CD

The Node/Express Auth Service container listens on `PORT` (we set 3001) and exposes `/health`.

## Choose your database on Azure

The current codebase uses PostgreSQL (`pg` library). You have two options:

1) Recommended (no code changes): Use Azure Database for PostgreSQL (Flexible Server)
   - Create a Flexible Server in your region
   - Create a database (e.g., quickbite)
   - Allow public access or set up private access
   - Import `quickbite-backend/auth-service/src/database/schema.sql` via `psql` or Azure Data Studio
   - Connection string format (set as GitHub secret `DATABASE_URL`):
     `postgres://<user>:<password>@<host>:5432/<db>?sslmode=require`

2) Alternative (larger change): Use Azure SQL (MSSQL)
   - Requires switching to the `mssql` driver and updating queries/schema to T-SQL
   - Not recommended for a quick deploy; can be planned if Azure SQL is a hard requirement

## Required GitHub Secrets

- AZURE_CREDENTIALS: JSON for a Service Principal with access to the resource group
- AZURE_RESOURCE_GROUP: Resource group name
- AZURE_REGION: Azure region (e.g., eastus)
- AZURE_ACR_NAME: ACR name (without domain, e.g., quickbiteacr)
- AZURE_WEBAPP_NAME: Web App name (e.g., quickbite-auth-web)
- JWT_SECRET, DATABASE_URL, REDIS_URL, FRONTEND_URL

## One-time Azure setup (CLI)

- Create ACR:
  `az acr create -g <rg> -n <acrName> --sku Basic`
- Create resource group (if needed):
  `az group create -n <rg> -l <region>`
- Provision Azure PostgreSQL (Flexible Server) quickly with the helper script:
  `infra/azure/provision-postgres.ps1 -ResourceGroup <rg> -Region <region> -ServerName <pgServer> -AdminUser <user> -AdminPassword <pass> -DbName quickbite`
  - The script prints a ready-to-use `DATABASE_URL` and saves it to `infra/outputs/azure-postgres.json`.
- Load Auth schema:
  `infra/azure/load-auth-schema.ps1 -DatabaseUrl "postgres://...sslmode=require"`
- Create Web App (the workflow will also create it if missing):
  The workflow handles creation of a Linux plan and Web App when not found.

## Deploy via GitHub Actions

- Run the workflow: "Deploy Auth Service to Azure Web App (Container)"
- It builds the container, pushes to ACR, configures the Web App with env vars, and restarts it
- Check health at: `https://<webapp>.azurewebsites.net/health`

## Frontend updates

- Set `REACT_APP_API_URL` to `https://<webapp>.azurewebsites.net`
- Set `REACT_APP_DEMO_MODE=false`

## Troubleshooting

- Ensure `WEBSITES_PORT=3001` is set; App Service needs it to route to the container port
- For PostgreSQL SSL, use `?sslmode=require` in `DATABASE_URL`
- If Redis is not yet provisioned, OTP/refresh flows may fail; keep demo mode true until Redis is ready (Azure Cache for Redis)
