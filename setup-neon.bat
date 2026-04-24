@echo off
cd /d "%~dp0"
echo Abriendo PowerShell para pegar la URL de Neon...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-neon.ps1"
pause
