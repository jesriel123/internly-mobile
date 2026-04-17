# Automatic Emulator Creation Script
$ErrorActionPreference = "Continue"
$ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Auto-Creating Android Emulator" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Set environment
$env:ANDROID_HOME = $ANDROID_HOME
$env:PATH = "$ANDROID_HOME\emulator;$ANDROID_HOME\platform-tools;$ANDROID_HOME\tools\bin;$env:PATH"

# Check for existing AVDs
Write-Host "Checking for existing emulators..." -ForegroundColor Yellow
$avdPath = "$env:USERPROFILE\.android\avd"
if (Test-Path $avdPath) {
    $existingAvds = Get-ChildItem $avdPath -Filter "*.avd" -Directory -ErrorAction SilentlyContinue
    if ($existingAvds -and $existingAvds.Count -gt 0) {
        Write-Host "Found existing emulators:" -ForegroundColor Green
        foreach ($avd in $existingAvds) {
            $name = $avd.Name -replace '\.avd$', ''
            Write-Host "  - $name" -ForegroundColor White
        }
        Write-Host ""
        Write-Host "You can start one with: start-emulator-simple.bat" -ForegroundColor Yellow
        Write-Host ""
        pause
        exit
    }
}

Write-Host "No existing emulators found. Creating new one..." -ForegroundColor Yellow
Write-Host ""

# Check system image
$systemImage = "system-images;android-36;google_apis_playstore;x86_64"
$imagePath = "$ANDROID_HOME\system-images\android-36\google_apis_playstore\x86_64"

if (Test-Path $imagePath) {
    Write-Host "✓ System image found: Android 36" -ForegroundColor Green
} else {
    Write-Host "✗ System image not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install it from Android Studio:" -ForegroundColor Yellow
    Write-Host "1. Open Android Studio" -ForegroundColor White
    Write-Host "2. Tools → SDK Manager" -ForegroundColor White
    Write-Host "3. SDK Platforms → Check Android 15.0 (API 36)" -ForegroundColor White
    Write-Host "4. Click Apply" -ForegroundColor White
    Write-Host ""
    pause
    exit
}

# Create AVD config manually
Write-Host ""
Write-Host "Creating emulator configuration..." -ForegroundColor Yellow

$avdName = "Pixel_5_Internly"
$avdDir = "$env:USERPROFILE\.android\avd\$avdName.avd"
$avdIni = "$env:USERPROFILE\.android\avd\$avdName.ini"

# Create AVD directory
New-Item -ItemType Directory -Force -Path $avdDir | Out-Null

# Create config.ini
$configContent = @"
AvdId = $avdName
PlayStore.enabled = true
abi.type = x86_64
avd.ini.displayname = Pixel 5 Internly
avd.ini.encoding = UTF-8
disk.dataPartition.size = 6442450944
fastboot.chosenSnapshotFile = 
fastboot.forceChosenSnapshotBoot = no
fastboot.forceColdBoot = no
fastboot.forceFastBoot = yes
hw.accelerometer = yes
hw.arc = false
hw.audioInput = yes
hw.battery = yes
hw.camera.back = virtualscene
hw.camera.front = emulated
hw.cpu.ncore = 4
hw.dPad = no
hw.device.manufacturer = Google
hw.device.name = pixel_5
hw.gps = yes
hw.gpu.enabled = yes
hw.gpu.mode = auto
hw.initialOrientation = Portrait
hw.keyboard = yes
hw.lcd.density = 440
hw.lcd.height = 2340
hw.lcd.width = 1080
hw.mainKeys = no
hw.ramSize = 2048
hw.sdCard = yes
hw.sensors.orientation = yes
hw.sensors.proximity = yes
hw.trackBall = no
image.sysdir.1 = system-images\android-36\google_apis_playstore\x86_64\
runtime.network.latency = none
runtime.network.speed = full
sdcard.size = 512M
showDeviceFrame = yes
skin.dynamic = yes
skin.name = pixel_5
skin.path = _no_skin
tag.display = Google Play
tag.id = google_apis_playstore
vm.heapSize = 256
"@

Set-Content -Path "$avdDir\config.ini" -Value $configContent

# Create AVD ini file
$iniContent = @"
avd.ini.encoding=UTF-8
path=$avdDir
path.rel=avd\$avdName.avd
target=android-36
"@

Set-Content -Path $avdIni -Value $iniContent

Write-Host "✓ Emulator created: $avdName" -ForegroundColor Green
Write-Host ""
Write-Host "Starting emulator..." -ForegroundColor Yellow
Write-Host ""

# Start emulator
Start-Process -FilePath "$ANDROID_HOME\emulator\emulator.exe" -ArgumentList "-avd", $avdName -WindowStyle Normal

Write-Host "✓ Emulator is starting in a new window!" -ForegroundColor Green
Write-Host ""
Write-Host "Wait for it to fully boot (30-60 seconds)" -ForegroundColor Yellow
Write-Host "Then press 'a' in the Expo terminal" -ForegroundColor Yellow
Write-Host ""
pause
