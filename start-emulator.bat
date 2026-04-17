@echo off
REM Set Android SDK paths
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
set PATH=%ANDROID_HOME%\emulator;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools;%ANDROID_HOME%\tools\bin;%PATH%

echo Checking for available emulators...
emulator -list-avds

echo.
echo To start an emulator, run:
echo   emulator -avd [EMULATOR_NAME]
echo.
echo Or just run this script and follow the prompts.
