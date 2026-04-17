@echo off
REM Set Android SDK paths for this session
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
set PATH=%ANDROID_HOME%\emulator;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools;%PATH%

echo Starting Expo development server with hot reload...
echo.
echo Once the server starts:
echo - Press 'a' to open on Android emulator
echo - Press 'w' to open in web browser
echo - Press 'r' to reload
echo.

npm start
