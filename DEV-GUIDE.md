# 🚀 Internly Mobile - Development Guide

## Fastest Way to Start (Recommended)

### Option 1: Web Browser (No Setup Required!)

```bash
npm run dev
```

- Opens in browser automatically
- Hot reload enabled - changes reflect instantly
- Perfect for UI/UX development
- No Android Studio needed!

### Option 2: Android Emulator (Full Native Experience)

**First time setup:**
1. Make sure Android Studio is installed
2. Create a virtual device (Tools → Device Manager → Create Device)
3. Set environment variables (see below)

**Then run:**
```bash
# Automatic (recommended)
start-emulator-and-app.bat

# Or manual
npm run dev:android
```

---

## 🎯 Development Workflow

### Quick Edit & Preview Cycle

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Edit your code** in Kiro IDE

3. **See changes instantly** in browser/emulator

4. **Hot reload** happens automatically!

### Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start in web browser (fastest) |
| `npm run dev:android` | Start on Android emulator |
| `npm start` | Start Expo dev server (choose platform) |
| `npm run web` | Web only |
| `npm run android` | Android only |
| `npm test` | Run tests |

---

## 🔧 Environment Setup (One-time)

### For Android Emulator Support

**1. Set Windows Environment Variables:**

Press `Win + X` → System → Advanced → Environment Variables

**Add these:**
- **ANDROID_HOME** = `%LOCALAPPDATA%\Android\Sdk`

**Add to PATH:**
- `%LOCALAPPDATA%\Android\Sdk\emulator`
- `%LOCALAPPDATA%\Android\Sdk\platform-tools`

**2. Restart Kiro IDE**

**3. Verify setup:**
```bash
adb devices
emulator -list-avds
```

---

## 📂 Helper Scripts

| Script | What it does |
|--------|--------------|
| `dev-web.bat` | Quick start in browser |
| `start-emulator-and-app.bat` | Auto-start emulator + app |
| `run-dev.bat` | Start dev server with options |

Just double-click any `.bat` file to run!

---

## 🐛 Troubleshooting

### "No devices found"
- Start emulator first from Android Studio
- Or use web mode: `npm run dev`

### "emulator command not found"
- Environment variables not set
- Restart Kiro after setting env vars

### Changes not reflecting
- Check if dev server is running
- Try pressing `r` in terminal to reload
- For web: refresh browser

### Port already in use
- Kill the process using port 8081
- Or use different port: `expo start --port 8082`

---

## 💡 Tips

- **Use web mode** for quick UI iterations
- **Use Android emulator** for testing native features (camera, notifications, etc.)
- **Hot reload** works in both web and mobile
- **Keep dev server running** while editing
- **Press `r`** in terminal to manually reload

---

## 🎨 Recommended Workflow in Kiro

1. Open Kiro IDE
2. Run `npm run dev` in terminal
3. Browser opens with your app
4. Edit files in Kiro
5. See changes instantly in browser
6. No need to restart!

**For mobile-specific features:**
1. Start emulator from Android Studio
2. Run `npm run dev:android`
3. Edit in Kiro, see changes on emulator

---

## 📱 Testing on Real Device

1. Install **Expo Go** app on your phone
2. Run `npm start`
3. Scan QR code with Expo Go
4. Edit code, changes sync to phone!

---

## 🔥 Hot Reload Features

- ✅ Component changes
- ✅ Style updates
- ✅ Logic modifications
- ✅ New file additions
- ⚠️ Native module changes require restart

---

Need help? Check `setup-android.md` for detailed Android setup!
