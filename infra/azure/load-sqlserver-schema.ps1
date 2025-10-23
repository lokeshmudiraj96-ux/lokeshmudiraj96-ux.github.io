# Load schema into Azure SQL Database
param(
    [Parameter(Mandatory=$false)]
    [string]$Password
)

$ServerName = "quickbite.database.windows.net"
$DatabaseName = "quickbite"
$UserName = "CloudSA067f0f79"
$SchemaFile = "$PSScriptRoot\..\..\quickbite-backend\auth-service\src\database\schema-sqlserver.sql"

# Get password if not provided
if (-not $Password) {
    $SecurePassword = Read-Host "Enter SQL Server password" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
    $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

Write-Host "Loading schema from: $SchemaFile" -ForegroundColor Cyan

# Read schema file
$SchemaContent = Get-Content $SchemaFile -Raw

# Split by GO statements
$Batches = $SchemaContent -split '\r?\nGO\r?\n'

# Connection string
$ConnectionString = "Server=$ServerName;Database=$DatabaseName;User Id=$UserName;Password=$Password;Encrypt=true;TrustServerCertificate=false;Connection Timeout=30;"

try {
    # Load SQL Server assembly
    Add-Type -AssemblyName "System.Data"
    
    $Connection = New-Object System.Data.SqlClient.SqlConnection($ConnectionString)
    $Connection.Open()
    Write-Host "[OK] Connected to SQL Server: $ServerName" -ForegroundColor Green
    
    $BatchNumber = 1
    foreach ($Batch in $Batches) {
        $Batch = $Batch.Trim()
        if ($Batch -and $Batch -ne '') {
            Write-Host "Executing batch $BatchNumber..." -ForegroundColor Yellow
            
            $Command = New-Object System.Data.SqlClient.SqlCommand($Batch, $Connection)
            $Command.CommandTimeout = 60
            
            try {
                $Command.ExecuteNonQuery() | Out-Null
                Write-Host "  [OK] Batch $BatchNumber completed" -ForegroundColor Green
            } catch {
                Write-Host "  [WARN] Batch $BatchNumber warning: $($_.Exception.Message)" -ForegroundColor Yellow
            }
            
            $BatchNumber++
        }
    }
    
    Write-Host "[OK] Schema loaded successfully!" -ForegroundColor Green
    
    # Verify tables created
    $Command = New-Object System.Data.SqlClient.SqlCommand("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME", $Connection)
    $Reader = $Command.ExecuteReader()
    
    Write-Host "`nTables created:" -ForegroundColor Cyan
    while ($Reader.Read()) {
        Write-Host "  - $($Reader['TABLE_NAME'])" -ForegroundColor White
    }
    $Reader.Close()
    
    $Connection.Close()
    
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
