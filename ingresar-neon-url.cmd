@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ingresar-neon-url.ps1"
echo.
pause
