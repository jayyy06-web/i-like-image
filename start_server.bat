@echo off
echo.
echo  ================================
echo    i like image - Python Backend
echo  ================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Python not found!
    echo  Download from https://python.org
    pause
    exit /b 1
)

REM Install dependencies if needed
echo  Installing dependencies...
pip install flask pillow flask-cors --quiet

echo.
echo  Starting server on http://localhost:5000
echo  Keep this window open while using the website!
echo  Press Ctrl+C to stop.
echo.

REM Start the server
python server.py

pause
