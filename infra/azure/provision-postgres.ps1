#requires -version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

param(
  [Parameter(Mandatory=$true)] [string] $ResourceGroup,
  [Parameter(Mandatory=$true)] [string] $Region,
  [Parameter(Mandatory=$true)] [string] $ServerName,
  [Parameter(Mandatory=$true)] [string] $AdminUser,
  [Parameter(Mandatory=$true)] [string] $AdminPassword,
  [string] $DbName = "quickbite"
)

Write-Host "Ensuring resource group..." -ForegroundColor Cyan
az group create -n $ResourceGroup -l $Region | Out-Null

Write-Host "Creating Azure Database for PostgreSQL Flexible Server..." -ForegroundColor Cyan
az postgres flexible-server create `
  -g $ResourceGroup `
  -n $ServerName `
  -l $Region `
  --admin-user $AdminUser `
  --admin-password $AdminPassword `
  --tier Burstable `
  --sku-name Standard_B1ms `
  --storage-size 32 | Out-Null

Write-Host "Creating database '$DbName'..." -ForegroundColor Cyan
az postgres flexible-server db create -g $ResourceGroup -s $ServerName -d $DbName | Out-Null

Write-Host "Allowing Azure services..." -ForegroundColor Cyan
az postgres flexible-server firewall-rule create -g $ResourceGroup -s $ServerName -n AllowAllAzureIPs --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 | Out-Null

$hostName = "$ServerName.postgres.database.azure.com"

# Format: postgres://user:password@host:5432/db?sslmode=require
$databaseUrl = "postgres://${AdminUser}:${AdminPassword}@${hostName}:5432/${DbName}?sslmode=require"

$outDir = "infra/outputs"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
$outFile = Join-Path $outDir "azure-postgres.json"
@{
  resourceGroup = $ResourceGroup
  region = $Region
  serverName = $ServerName
  host = $hostName
  adminUser = $AdminUser
  dbName = $DbName
  databaseUrl = $databaseUrl
} | ConvertTo-Json | Set-Content -Encoding UTF8 $outFile

Write-Host "\n=== Azure PostgreSQL ready ===" -ForegroundColor Green
Write-Host "Host: $hostName" -ForegroundColor Cyan
Write-Host "DATABASE_URL (save as GitHub secret):" -ForegroundColor Yellow
Write-Host $databaseUrl
Write-Host "Outputs saved to $outFile" -ForegroundColor Cyan
