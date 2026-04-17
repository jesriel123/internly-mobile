@echo off
echo ========================================
echo Opening Android Studio Device Manager
echo ========================================
echo.

REM Try to find and open Android Studio
set "STUDIO_PATH=%ProgramFiles%\Android\Android Studio\bin\studio64.exe"
set "STUDIO_PATH2=%LOCALAPPDATA%\Programs\Android Studio\bin\studio64.exe"

if exist "%STUDIO_PATH%" (
    echo Found Android Studio at: %STUDIO_PATH%
    start "" "%STUDIO_PATH%"
    goto :found
)

if exist "%STUDIO_PATH2%" (
    echo Found Android Studio at: %STUDIO_PATH2%
    start "" "%STUDIO_PATH2%"
    goto :found
)

echo Android Studio not found in default locations.
echo Please open it manually and go to:
echo   Tools -^> Device Manager -^> Create Device
echo.
pause
exit /b 1

:found
echo.
echo ✓ Android Studio is opening...
echo.
echo Once it opens:
echo 1. Go to Tools -^> Device Manager
echo 2. Click "Create Device"
echo 3. Choose Pixel 5 -^> Next
echo 4. Select Android 15 -^> Next -^> Finish
echo 5. Click Play button to start emulator
echo.
echo Then come back here and press any key...
pause

echo.
echo Checking if emulator is running...
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
set PATH=%ANDROID_HOME%\platform-tools;%PATH%

adb devices

echo.
echo If you see "emulator-XXXX device" above, you're ready!
echo Now press 'a' in the Expo terminal to connect.
echo.
pause
