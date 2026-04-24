# Llamado desde ingresar-neon-url.cmd — pega la connection string de Neon
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "Pegue la URL completa (postgresql://...) y pulse Enter:" -ForegroundColor Cyan
$url = Read-Host

$url = $url.Trim().Trim('"').Trim("'")
if ([string]::IsNullOrWhiteSpace($url)) {
    Write-Host "Error: vacio." -ForegroundColor Red
    exit 1
}
if (-not $url.StartsWith('postgresql://')) {
    Write-Host "Error: debe empezar con postgresql://" -ForegroundColor Red
    exit 1
}

$port = '3847'
$envPath = Join-Path $PSScriptRoot '.env'
$lines = @('DATABASE_URL=' + $url, 'PORT=' + $port, '')
[System.IO.File]::WriteAllText($envPath, ($lines -join "`n"), [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Listo: .env guardado en: $envPath" -ForegroundColor Green
Write-Host ""
