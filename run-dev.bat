@echo off
cd /d "%~dp0"
echo Installing dependencies (first run may take a few minutes)...
call npm install --no-audit --no-fund
if errorlevel 1 exit /b 1
echo.
echo Starting API + web app...
echo Open http://127.0.0.1:5173 on this PC. On your phone (same Wi-Fi): http://YOUR_PC_IP:5173  (see ipconfig for IPv4). Press Ctrl+C to stop.
call npm run dev
