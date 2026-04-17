# Internly Mobile - Development Setup for Kiro IDE

## 🚀 Quick Start (Easiest - No Android Studio needed!)

**Option 1: Web Browser Preview (Instant)**
```bash
npm run dev
```
This opens the app in your browser with hot reload. Perfect for quick UI testing!

**Option 2: Use the helper scripts**
- Double-click `dev-web.bat` - Opens in browser
- Double-click `start-emulator-and-app.bat` - Starts emulator + app automatically

---

## 📱 Full Android Emulator Setup

### 1. Set Environment Variables (One-time setup)

Add these to your Windows Environment Variables:

**System Variables:**
- Variable: `ANDROID_HOME`
- Value: `%LOCALAPPDATA%\Android\Sdk`

**Path Variable (add these):**
- `%LOCALAPPDATA%\Android\Sdk\emulator`
- `%LOCALAPPDATA%\Android\Sdk\platform-tools`
- `%LOCALAPPDATA%\Android\Sdk\tools`

**How to set:**
1. Press `Win + X` → System
2. Click "Advanced system settings"
3. Click "Environment Variables"
4. Add the variables above
5. **Restart Kiro IDE** after setting

### 2. Create Virtual Device (if not yet created)

1. Open Android Studio
2. Tools → Device Manager
3. Create Device → Choose Pixel 5 → Select API 34 → Finish

### 3. Start Emulator

**Option A - From Android Studio:**
- Open Device Manager → Click Play button

**Option B - From Command Line (after env vars are set):**
```bash
emulator -list-avds
emulator -avd [YOUR_DEVICE_NAME]
```

### 4. Run Your App

Once emulator is running:
```bash
npm run android
```

Or use Expo Go:
```bash
npm start
# Then press 'a' for Android
```

## Troubleshooting

**"emulator command not found"**
- Environment variables not set or Kiro not restarted

**"No devices found"**
- Emulator not started yet - start from Android Studio first

**App won't install**
- Try: `adb devices` to verify connection
- Try: `adb kill-server` then `adb start-server`
