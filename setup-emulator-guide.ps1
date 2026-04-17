# Android Emulator Setup Script
$ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Android Emulator Setup for Internly" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Android SDK exists
if (Test-Path $ANDROID_HOME) {
    Write-Host "✓ Android SDK found at: $ANDROID_HOME" -ForegroundColor Green
} else {
    Write-Host "✗ Android SDK not found!" -ForegroundColor Red
    Write-Host "Please install Android Studio first." -ForegroundColor Yellow
    pause
    exit
}

# Check for system images
$systemImagesPath = "$ANDROID_HOME\system-images"
if (Test-Path $systemImagesPath) {
    Write-Host "✓ System images found" -ForegroundColor Green
    $images = Get-ChildItem $systemImagesPath -Recurse -Depth 2 | Where-Object {$_.PSIsContainer}
    Write-Host ""
    Write-Host "Available system images:" -ForegroundColor Yellow
    $images | ForEach-Object { Write-Host "  - $($_.FullName)" }
} else {
    Write-Host "✗ No system images found" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Open Android Studio" -ForegroundColor White
Write-Host "2. Click 'More Actions' or go to Tools menu" -ForegroundColor White
Write-Host "3. Select 'Device Manager'" -ForegroundColor White
Write-Host "4. Click 'Create Device' button" -ForegroundColor White
Write-Host "5. Choose 'Pixel 5' and click Next" -ForegroundColor White
Write-Host "6. Select 'Android 15.0' (or latest) and click Next" -ForegroundColor White
Write-Host "7. Name it 'Pixel_5_Internly' and click Finish" -ForegroundColor White
Write-Host "8. Click the Play button to start the emulator" -ForegroundColor White
Write-Host ""
Write-Host "After the emulator starts, run:" -ForegroundColor Yellow
Write-Host "  npm run dev:android" -ForegroundColor Green
Write-Host ""
Write-Host "Or press 'a' in the Expo terminal" -ForegroundColor Yellow
Write-Host ""

# Check if emulator is already running
$env:PATH = "$ANDROID_HOME\platform-tools;$env:PATH"
$devices = & adb devices 2>$null
if ($devices -match "emulator") {
    Write-Host "✓ Emulator is already running!" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now press 'a' in the Expo terminal" -ForegroundColor Yellow
} else {
    Write-Host "No emulator running yet." -ForegroundColor Yellow
    Write-Host "Please start one from Android Studio Device Manager" -ForegroundColor Yellow
}

Write-Host ""
pause
