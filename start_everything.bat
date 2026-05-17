@echo off
title i like image - Local Suite
echo ==================================================
echo         i like image — Full Local Suite
echo ==================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo  [!] ERROR: Python is not found!
    echo  Please install Python from https://python.org and check "Add to PATH".
    pause
    exit /b 1
)

REM Install dependencies
echo  [*] Checking and installing required Python libraries...
pip install flask pillow flask-cors --quiet

REM Start Frontend HTTP server on port 8000 in background
echo  [*] Starting Frontend server on http://localhost:8000...
start /b python -m http.server 8000 >nul 2>&1

REM Automatically open browser to the local HTTP server
echo  [*] Opening web browser to the app...
start http://localhost:8000

echo.
echo  ==================================================
echo   [SUCCESS] App is up and running!
echo   Frontend: http://localhost:8000
echo   Backend:  http://localhost:5000
echo.
echo   Keep this black window OPEN while using the site!
echo   To close everything, just close this window.
echo  ==================================================
echo.

REM Start Flask Backend
python server.py

pause
