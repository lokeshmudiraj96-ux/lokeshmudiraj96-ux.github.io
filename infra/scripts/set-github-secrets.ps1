#requires -version 5.1
# GitHub Secrets Setter via REST API
# Requires: Personal Access Token with 'repo' scope

param(
    [Parameter(Mandatory=$true)]
    [string]$GitHubToken,
    
    [string]$Owner = "lokeshmudiraj96-ux",
    [string]$Repo = "lokeshmudiraj96-ux.github.io"
)

# Read credentials JSON
$azureCredentials = Get-Content "infra/outputs/azure-credentials.json" -Raw

# Define secrets
$secrets = @{
    "AZURE_CREDENTIALS" = $azureCredentials
    "AZURE_RESOURCE_GROUP" = "quickbite-rg"
    "AZURE_REGION" = "westus"
    "AZURE_ACR_NAME" = "quickbiteacr8732"
    "AZURE_WEBAPP_NAME" = "quickbite-auth-app"
    "JWT_SECRET" = "35TECRWrzjgYphqP7FGDcHBK6evw49am"
    "DATABASE_URL" = "postgres://quickbiteadmin:QuickBite2025!Secure@quickbite-pg-server.postgres.database.azure.com:5432/quickbite?sslmode=require"
    "REDIS_URL" = ""
    "FRONTEND_URL" = "http://localhost:3000"
}

Write-Host "Installing GitHub secrets..." -ForegroundColor Cyan

# Get repository public key for encryption
$headers = @{
    "Authorization" = "token $GitHubToken"
    "Accept" = "application/vnd.github.v3+json"
}

try {
    $pubKeyResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/actions/secrets/public-key" -Headers $headers
    $publicKey = $pubKeyResponse.key
    $keyId = $pubKeyResponse.key_id
    
    Write-Host "✓ Retrieved repository public key" -ForegroundColor Green
} catch {
    Write-Error "Failed to get public key. Check your token permissions."
    exit 1
}

# Function to encrypt secret using libsodium (requires .NET or external tool)
# For simplicity, we'll output instructions instead
Write-Host "`nSecrets to add manually:" -ForegroundColor Yellow
Write-Host "Go to: https://github.com/$Owner/$Repo/settings/secrets/actions`n" -ForegroundColor Cyan

foreach ($secret in $secrets.GetEnumerator()) {
    Write-Host "Secret Name: $($secret.Key)" -ForegroundColor Green
    if ($secret.Value.Length -gt 100) {
        Write-Host "Value: [JSON - see infra/outputs/azure-credentials.json]" -ForegroundColor Gray
    } else {
        Write-Host "Value: $($secret.Value)" -ForegroundColor Gray
    }
    Write-Host "---"
}

Write-Host "`nAlternatively, use GitHub CLI:" -ForegroundColor Yellow
Write-Host "winget install GitHub.cli" -ForegroundColor Cyan
Write-Host "gh auth login" -ForegroundColor Cyan
foreach ($secret in $secrets.GetEnumerator()) {
    if ($secret.Key -eq "AZURE_CREDENTIALS") {
        Write-Host "gh secret set $($secret.Key) < infra/outputs/azure-credentials.json" -ForegroundColor Cyan
    } else {
        Write-Host "gh secret set $($secret.Key) --body `"$($secret.Value)`"" -ForegroundColor Cyan
    }
}
