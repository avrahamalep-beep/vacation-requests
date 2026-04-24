# Enlaza Neon: pega la connection string y crea/actualiza .env
# Uso: clic derecho → "Run with PowerShell", o en PowerShell:
#   cd ruta\al\proyecto\Restapp
#   .\setup-neon.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== Neon → archivo .env ===" -ForegroundColor Cyan
Write-Host "En Neon: Dashboard → tu proyecto → Connection details → copia la connection string (recomendado: pooled)." -ForegroundColor Gray
Write-Host ""

$url = Read-Host "Pega aqui la URL completa (postgresql://...)"

$url = $url.Trim().Trim('"').Trim("'")
if ($url -notmatch '^postgresql://') {
    Write-Host "Error: debe empezar con postgresql://" -ForegroundColor Red
    exit 1
}

$port = Read-Host "Puerto del API [3847]"
if ([string]::IsNullOrWhiteSpace($port)) { $port = '3847' }

# Concatenacion (evita que caracteres raros en la URL rompan el script)
$lines = @(
    '# Generado por setup-neon.ps1 — no subas este archivo a git',
    ('DATABASE_URL=' + $url),
    ('PORT=' + $port),
    ''
)
$envPath = Join-Path $PSScriptRoot '.env'
[System.IO.File]::WriteAllText($envPath, ($lines -join "`n"), [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Listo: se guardo .env en la carpeta del proyecto." -ForegroundColor Green
Write-Host "Siguiente paso: en Neon → SQL Editor, ejecuta el archivo server\schema.sql (y server\schema-roster-columns.sql si la base ya existia)." -ForegroundColor Yellow
Write-Host "Luego ejecuta: npm run dev" -ForegroundColor Yellow
Write-Host ""
