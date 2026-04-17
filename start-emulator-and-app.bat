@echo off
REM Complete setup script - starts emulator and app
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
set PATH=%ANDROID_HOME%\emulator;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools;%PATH%

echo ========================================
echo Internly Mobile - Development Setup
echo ========================================
echo.

echo Step 1: Checking for available emulators...
emulator -list-avds > avd_list.txt 2>&1

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Cannot find emulator command.
    echo Please make sure Android Studio is installed.
    echo.
    echo Android SDK should be at: %ANDROID_HOME%
    pause
    exit /b 1
)

echo.
echo Available emulators:
type avd_list.txt
echo.

REM Get first emulator name
for /f "tokens=*" %%a in (avd_list.txt) do (
    set EMULATOR_NAME=%%a
    goto :found
)

:found
if "%EMULATOR_NAME%"=="" (
    echo No emulators found!
    echo Please create one in Android Studio first.
    echo Tools -^> Device Manager -^> Create Device
    pause
    exit /b 1
)

echo Step 2: Starting emulator: %EMULATOR_NAME%
echo This may take a minute...
start "Android Emulator" emulator -avd %EMULATOR_NAME%

echo.
echo Step 3: Waiting for emulator to boot...
echo (This can take 30-60 seconds)
timeout /t 10 /nobreak > nul

:wait_for_device
adb devices | find "device" | find /v "List" > nul
if %ERRORLEVEL% NEQ 0 (
    echo Still waiting...
    timeout /t 5 /nobreak > nul
    goto :wait_for_device
)

echo.
echo ✓ Emulator is ready!
echo.
echo Step 4: Starting Expo development server...
echo.

npm start

del avd_list.txt 2>nul
