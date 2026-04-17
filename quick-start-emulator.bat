@echo off
setlocal enabledelayedexpansion

set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
set PATH=%ANDROID_HOME%\emulator;%ANDROID_HOME%\platform-tools;%PATH%

cls
echo ========================================
echo Android Emulator Quick Start
echo ========================================
echo.

echo Step 1: Checking for existing emulators...
echo.

cd /d "%USERPROFILE%\.android\avd" 2>nul
if errorlevel 1 (
    echo No emulators found yet.
    goto :create_manual
)

set count=0
for /d %%i in (*.avd) do (
    set /a count+=1
    set "avd_name=%%i"
    set "avd_name=!avd_name:.avd=!"
    echo Found: !avd_name!
)

if %count%==0 (
    echo No emulators found.
    goto :create_manual
)

echo.
echo Step 2: Starting emulator...
echo.

for /d %%i in (*.avd) do (
    set "avd_name=%%i"
    set "avd_name=!avd_name:.avd=!"
    echo Starting: !avd_name!
    start "Android Emulator" "%ANDROID_HOME%\emulator\emulator.exe" -avd "!avd_name!"
    goto :wait_for_boot
)

:create_manual
echo.
echo ========================================
echo No emulator found - Manual Setup Needed
echo ========================================
echo.
echo Please create an emulator first:
echo.
echo 1. Open Android Studio
echo 2. Tools -^> Device Manager
echo 3. Click "Create Device"
echo 4. Choose Pixel 5 -^> Next
echo 5. Select Android 15 -^> Next -^> Finish
echo 6. Run this script again
echo.
pause
exit /b 1

:wait_for_boot
echo.
echo Emulator is starting...
echo This may take 30-60 seconds.
echo.
echo Waiting for device to boot...
timeout /t 10 /nobreak >nul

:check_boot
"%ANDROID_HOME%\platform-tools\adb.exe" devices 2>nul | find "device" | find /v "List" >nul
if errorlevel 1 (
    echo Still booting...
    timeout /t 5 /nobreak >nul
    goto :check_boot
)

echo.
echo ========================================
echo SUCCESS! Emulator is ready!
echo ========================================
echo.
"%ANDROID_HOME%\platform-tools\adb.exe" devices
echo.
echo Now go to your Expo terminal and press: a
echo.
echo Or run: npm run dev:android
echo.
pause
