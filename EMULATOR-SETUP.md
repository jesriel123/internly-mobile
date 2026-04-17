# 🚀 Android Emulator Live Preview Setup

## Quick Start (3 Steps)

### Step 1: Create Emulator (One-time only)

**Option A - Use helper script:**
```
Double-click: open-android-studio.bat
```

**Option B - Manual:**
1. Open Android Studio
2. Tools → Device Manager
3. Click "Create Device"
4. Choose **Pixel 5** → Next
5. Select **Android 15.0** (or latest) → Next
6. Name: `Pixel_5_Internly` → Finish

### Step 2: Start Emulator

**From Android Studio:**
- Device Manager → Click ▶️ Play button
- Wait 30-60 seconds for boot

**Or use script:**
```
Double-click: start-emulator-simple.bat
```

### Step 3: Connect to Expo

The Expo dev server is already running! Just press:
```
a
```
in the Expo terminal (or run `npm run dev:android`)

---

## ✅ Verification

Check if emulator is ready:
```bash
adb devices
```

Should show:
```
List of devices attached
emulator-5554   device
```

---

## 🎨 Live Preview Workflow

Once setup is complete:

1. **Emulator running** ✓
2. **Expo dev server running** ✓ (already started)
3. **Press `a`** in terminal to connect
4. **Edit code** in Kiro IDE
5. **See changes instantly** in emulator!

### Hot Reload Features:
- ✅ Component changes
- ✅ Style updates  
- ✅ Logic modifications
- ✅ Instant refresh (no restart needed!)

---

## 📱 Current Status

- ✅ Android SDK installed
- ✅ System images available (Android 36)
- ✅ Expo dev server running
- ⏳ Emulator needs to be created/started

---

## 🔧 Troubleshooting

### "No devices found"
- Make sure emulator is fully booted (see Android home screen)
- Run: `adb devices` to verify
- Try: `adb kill-server` then `adb start-server`

### Emulator is slow
- Enable Hardware Acceleration in BIOS (VT-x/AMD-V)
- Increase RAM in AVD settings (4GB recommended)

### Can't find Android Studio
- Check if installed at: `C:\Program Files\Android\Android Studio`
- Or: `%LOCALAPPDATA%\Programs\Android Studio`

### Port already in use
- Expo is already running on port 8081
- Just press `a` to connect to Android

---

## 🎯 Quick Commands

| Action | Command |
|--------|---------|
| Start emulator | `start-emulator-simple.bat` |
| Open Android Studio | `open-android-studio.bat` |
| Check devices | `adb devices` |
| Connect to Android | Press `a` in Expo terminal |
| Reload app | Press `r` in Expo terminal |
| Open dev menu | Shake emulator or `Ctrl+M` |

---

## 💡 Pro Tips

- Keep emulator running while developing
- Use `r` to manually reload if needed
- Use `Ctrl+M` in emulator for dev menu
- Changes save automatically with hot reload
- No need to restart for most changes!

---

Ready to start? Run `open-android-studio.bat` to begin! 🚀
