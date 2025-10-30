@echo off
echo ========================================
echo  QuickBite Platform - Local Demo Setup
echo ========================================
echo.

cd /d "%~dp0"

echo 📦 Installing demo dependencies...
copy demo-package.json package-demo.json >nul
npm install --silent express cors

echo.
echo 🚀 Starting QuickBite Demo Server...
echo.
echo 💡 Access the platform at: http://localhost:3001
echo 💡 Or try: http://127.0.0.1:3001
echo.

node demo-setup.js

pause