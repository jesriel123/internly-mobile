# 🚀 START HERE - Android Emulator Setup

## Current Status
- ✅ Expo dev server is RUNNING
- ✅ Android SDK installed
- ❌ No emulator created yet (this is what we need to do!)

---

## 📱 Create Your First Emulator (5 minutes)

### Step 1: Open Android Studio

Find and open Android Studio on your computer

### Step 2: Open Device Manager

Click: **Tools** → **Device Manager**

(Or click the phone icon 📱 in the toolbar)

### Step 3: Create New Device

1. Click **"Create Device"** button
2. Select **Pixel 5** from the list
3. Click **Next**

### Step 4: Choose System Image

1. Select **Android 15.0** (API 36) - it should already be downloaded
2. If not downloaded, click **Download** next to it
3. Click **Next**

### Step 5: Finish Setup

1. AVD Name: Leave as default or name it `Pixel_5_Internly`
2. Click **Finish**

### Step 6: Start the Emulator

1. In Device Manager, find your new device
2. Click the **▶️ Play** button
3. Wait 30-60 seconds for it to boot

---

## 🎯 Connect to Your App

Once the emulator shows the Android home screen:

### Option 1: From Expo Terminal
Go to the terminal where Expo is running and press:
```
a
```

### Option 2: Run Command
```bash
npm run dev:android
```

---

## ✅ Verification

Check if connected:
```bash
adb devices
```

Should show:
```
List of devices attached
emulator-5554   device
```

---

## 🎨 You're Done!

Now you have:
- ✅ Emulator running
- ✅ App connected
- ✅ Live hot reload enabled

### Edit and See Changes:
1. Open any file in `src/` folder
2. Make changes
3. Save
4. See changes INSTANTLY in emulator!

No restart needed! 🎉

---

## 🔧 Helper Scripts

After creating the emulator once, you can use:

| Script | Purpose |
|--------|---------|
| `quick-start-emulator.bat` | Auto-start your emulator |
| `open-android-studio.bat` | Open Android Studio |

---

## 💡 Tips

- Keep emulator running while developing
- Press `r` in Expo terminal to reload
- Press `Ctrl+M` in emulator for dev menu
- Changes save automatically!

---

## ❓ Need Help?

If you get stuck, just ask! I'm here to help.

**Next step:** Open Android Studio and follow Step 2 above! 🚀
