#requires -version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

param(
  [Parameter(Mandatory=$true)] [string] $DatabaseUrl
)

function Test-Command($cmd) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  $null = Get-Command $cmd
  $ok = $?
  $ErrorActionPreference = $old
  return $ok
}

if (-not (Test-Command "psql")) {
  Write-Error "psql not found. Install PostgreSQL client or use Azure Data Studio to run schema.sql manually."
  exit 1
}

$schemaPath = "quickbite-backend/auth-service/src/database/schema.sql"
if (-not (Test-Path $schemaPath)) {
  Write-Error "Schema file not found at $schemaPath"
  exit 1
}

Write-Host "Applying schema to: $DatabaseUrl" -ForegroundColor Cyan
$env:PGPASSWORD = ($DatabaseUrl -split ':' )[2] -replace '@.*','' # best-effort; recommend passing via env or use full URL directly

# psql supports connection URI directly via -d
psql -d $DatabaseUrl -f $schemaPath

if ($LASTEXITCODE -eq 0) {
  Write-Host "Schema applied successfully." -ForegroundColor Green
} else {
  Write-Error "Failed to apply schema. Exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}
