# Internly OJT Tracker - Setup Guide

## Paano I-run ang App

### 1. Install Dependencies

```bash
cd Internly
npm install
```

### 2. Start Development Server

```bash
npm start
```

### 3. Run sa Device/Emulator

- **Android**: Press `a` sa terminal o `npm run android`
- **iOS**: Press `i` sa terminal o `npm run ios`
- **Web**: Press `w` sa terminal o `npm run web`

### 4. Scan QR Code (Physical Device)

- Install **Expo Go** app sa phone mo
- Scan yung QR code na lalabas sa terminal
- App will load automatically

## Default Login Credentials

Kahit anong email/password pwede (mock auth lang):
- Email: `student@email.com`
- Password: `password123`

## Features na Available

✅ Dashboard - Overview ng hours at progress
✅ Time Log - Record daily work hours
✅ Tasks - Task management with checkboxes
✅ Profile - User info at logout

## Next Steps (Optional)

1. **Firebase Setup** - Update `firebaseConfig.js` with your Firebase credentials
2. **Real Auth** - Replace mock auth with Firebase Authentication
3. **Database** - Connect to Firestore for data persistence
4. **Add Features**:
   - Weekly/Monthly reports
   - Export timesheet to PDF
   - Photo uploads for proof of work
   - Supervisor approval system
   - Push notifications

## Troubleshooting

**Error: Cannot find module**
```bash
npm install
```

**Metro bundler issues**
```bash
npm start -- --clear
```

**Expo Go not connecting**
- Make sure phone and computer are on same WiFi
- Check firewall settings
