# Database migration script for Supabase
# Usage: .\scripts\migrate-db.ps1

param(
    [Parameter(Mandatory=$true)]
    [string]$Action,
    
    [Parameter(Mandatory=$true)]
    [string]$ConnectionString,
    
    [Parameter(Mandatory=$false)]
    [string]$OutputFile = "backup.sql"
)

# Check for pg_dump/psql
$pgDumpPath = Get-Command pg_dump -ErrorAction SilentlyContinue
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue

if (-not $pgDumpPath -and $Action -eq "export") {
    Write-Host "ERROR: pg_dump not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install PostgreSQL:" -ForegroundColor Yellow
    Write-Host "1. Download from https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    Write-Host "2. Or use WSL (Windows Subsystem for Linux)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "After installation, add PostgreSQL to PATH or specify full path to pg_dump.exe" -ForegroundColor Yellow
    exit 1
}

if (-not $psqlPath -and $Action -eq "import") {
    Write-Host "ERROR: psql not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install PostgreSQL:" -ForegroundColor Yellow
    Write-Host "1. Download from https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    Write-Host "2. Or use WSL (Windows Subsystem for Linux)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "After installation, add PostgreSQL to PATH or specify full path to psql.exe" -ForegroundColor Yellow
    exit 1
}

if ($Action -eq "export") {
    Write-Host "Exporting database..." -ForegroundColor Cyan
    $connPreview = if ($ConnectionString.Length -gt 50) { $ConnectionString.Substring(0, 50) + "..." } else { $ConnectionString }
    Write-Host "Connection string: $connPreview" -ForegroundColor Gray
    Write-Host "Output file: $OutputFile" -ForegroundColor Gray
    Write-Host ""
    
    try {
        if ($pgDumpPath) {
            & pg_dump "$ConnectionString" --no-owner --no-acl -f "$OutputFile"
        } else {
            $possiblePaths = @(
                "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
                "C:\Program Files\PostgreSQL\14\bin\pg_dump.exe",
                "C:\Program Files\PostgreSQL\13\bin\pg_dump.exe"
            )
            
            $found = $false
            foreach ($path in $possiblePaths) {
                if (Test-Path $path) {
                    & $path "$ConnectionString" --no-owner --no-acl -f "$OutputFile"
                    $found = $true
                    break
                }
            }
            
            if (-not $found) {
                Write-Host "Could not find pg_dump.exe" -ForegroundColor Red
                exit 1
            }
        }
        
        if (Test-Path $OutputFile) {
            $fileSize = (Get-Item $OutputFile).Length / 1MB
            Write-Host "Export completed successfully!" -ForegroundColor Green
            Write-Host "   File size: $([Math]::Round($fileSize, 2)) MB" -ForegroundColor Gray
            Write-Host "   File: $OutputFile" -ForegroundColor Gray
        } else {
            Write-Host "File was not created. Check errors above." -ForegroundColor Red
            exit 1
        }
    }
    catch {
        Write-Host "Error during export: $_" -ForegroundColor Red
        exit 1
    }
}
elseif ($Action -eq "import") {
    if (-not (Test-Path $OutputFile)) {
        Write-Host "ERROR: File $OutputFile not found!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Importing database..." -ForegroundColor Cyan
    $connPreview = if ($ConnectionString.Length -gt 50) { $ConnectionString.Substring(0, 50) + "..." } else { $ConnectionString }
    Write-Host "Connection string: $connPreview" -ForegroundColor Gray
    Write-Host "Input file: $OutputFile" -ForegroundColor Gray
    Write-Host ""
    Write-Host "WARNING: This will overwrite data in the target database!" -ForegroundColor Yellow
    Write-Host ""
    
    $confirm = Read-Host "Continue? (yes/no)"
    if ($confirm -ne "yes") {
        Write-Host "Cancelled by user." -ForegroundColor Yellow
        exit 0
    }
    
    try {
        if ($psqlPath) {
            & psql "$ConnectionString" -f "$OutputFile"
        } else {
            $possiblePaths = @(
                "C:\Program Files\PostgreSQL\15\bin\psql.exe",
                "C:\Program Files\PostgreSQL\14\bin\psql.exe",
                "C:\Program Files\PostgreSQL\13\bin\psql.exe"
            )
            
            $found = $false
            foreach ($path in $possiblePaths) {
                if (Test-Path $path) {
                    & $path "$ConnectionString" -f "$OutputFile"
                    $found = $true
                    break
                }
            }
            
            if (-not $found) {
                Write-Host "Could not find psql.exe" -ForegroundColor Red
                exit 1
            }
        }
        
        Write-Host "Import completed successfully!" -ForegroundColor Green
    }
    catch {
        Write-Host "Error during import: $_" -ForegroundColor Red
        exit 1
    }
}
else {
    Write-Host "Unknown action: $Action" -ForegroundColor Red
    Write-Host "Use 'export' or 'import'" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
