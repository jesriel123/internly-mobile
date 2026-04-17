@echo off
echo ========================================
echo   INTERNLY MOBILE APP - QUICK START
echo ========================================
echo.

cd /d "%~dp0"

echo Checking if node_modules exists...
if not exist "node_modules\" (
    echo node_modules not found. Installing dependencies...
    call npm install
    echo.
)

echo Starting Expo development server...
echo.
echo Options:
echo 1. Start with Expo Go (Recommended)
echo 2. Start with Android Emulator
echo 3. Start with Hot Reload
echo 4. Start with Tunnel Mode
echo.

set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" (
    echo.
    echo Starting with Expo Go...
    echo Scan the QR code with Expo Go app on your phone!
    echo.
    call npm start
) else if "%choice%"=="2" (
    echo.
    echo Starting Android Emulator...
    echo Make sure Android Studio emulator is running!
    echo.
    call npm run android
) else if "%choice%"=="3" (
    echo.
    echo Starting with Hot Reload...
    echo Scan the QR code with Expo Go app on your phone!
    echo.
    call npm run start:hot
) else if "%choice%"=="4" (
    echo.
    echo Starting with Tunnel Mode...
    echo This works from anywhere but is slower.
    echo.
    call npm run start:hot:tunnel
) else (
    echo Invalid choice. Starting with default (Expo Go)...
    call npm start
)

pause
