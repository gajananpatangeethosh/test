@echo off
cd /d "%~dp0"
where npm >nul 2>nul || (echo Node.js not found. Install it first. & pause & exit /b 1)
if not exist node_modules (echo Installing dependencies... & call npm install)
echo Starting Echo...
call npm run dev
pause
