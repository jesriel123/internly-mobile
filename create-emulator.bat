@echo off
REM Script to create an Android Virtual Device
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
set PATH=%ANDROID_HOME%\emulator;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools;%ANDROID_HOME%\tools\bin;%ANDROID_HOME%\cmdline-tools\latest\bin;%PATH%

echo ========================================
echo Create Android Virtual Device
echo ========================================
echo.

echo Checking installed system images...
echo.
avdmanager list target

echo.
echo ========================================
echo Creating Pixel 5 emulator...
echo ========================================
echo.

REM Create AVD with default settings
echo no | avdmanager create avd -n Pixel_5_API_34 -k "system-images;android-34;google_apis;x86_64" -d pixel_5

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✓ Emulator created successfully!
    echo.
    echo To start it, run: start-emulator-simple.bat
) else (
    echo.
    echo ✗ Failed to create emulator.
    echo.
    echo Please install system image first:
    echo 1. Open Android Studio
    echo 2. Tools -^> SDK Manager
    echo 3. SDK Platforms tab -^> Check Android 14.0 (API 34)
    echo 4. SDK Tools tab -^> Check Android Emulator
    echo 5. Click Apply
    echo.
    echo Then run this script again.
)

echo.
pause
