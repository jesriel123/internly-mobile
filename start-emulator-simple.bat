@echo off
REM Simple script to start the emulator
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
set PATH=%ANDROID_HOME%\emulator;%ANDROID_HOME%\platform-tools;%PATH%

echo ========================================
echo Starting Android Emulator
echo ========================================
echo.

echo Checking for available emulators...
emulator -list-avds > avd_list.txt 2>&1

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Cannot find emulator command.
    echo Please run create-emulator.bat first.
    pause
    exit /b 1
)

echo.
echo Available emulators:
type avd_list.txt
echo.

REM Get first emulator name
set EMULATOR_NAME=
for /f "tokens=*" %%a in (avd_list.txt) do (
    if not defined EMULATOR_NAME set EMULATOR_NAME=%%a
)

if "%EMULATOR_NAME%"=="" (
    echo No emulators found!
    echo.
    echo Please run create-emulator.bat to create one.
    echo Or create one manually in Android Studio:
    echo   Tools -^> Device Manager -^> Create Device
    pause
    del avd_list.txt 2>nul
    exit /b 1
)

echo Starting emulator: %EMULATOR_NAME%
echo This will open in a new window...
echo.

start "Android Emulator" emulator -avd %EMULATOR_NAME%

echo.
echo ✓ Emulator is starting...
echo.
echo Wait for it to fully boot (30-60 seconds)
echo Then press 'a' in the Expo terminal to connect
echo.

del avd_list.txt 2>nul
pause
