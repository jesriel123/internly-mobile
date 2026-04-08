# Internly OJT Tracker

Mobile app para sa pag-track ng OJT hours, tasks, at progress.

## Features

- **Dashboard** - Overview ng total hours, weekly progress, at recent activity
- **Time Log** - Record ng daily work hours at activities
- **Tasks** - Task management with checkbox completion
- **Profile** - User info, company details, at settings

## Tech Stack

- React Native + Expo
- React Navigation (Bottom Tabs + Stack)
- React Native Paper (UI Components)
- Firebase Firestore (Database)
- AsyncStorage (Local storage)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Update Firebase config sa `firebaseConfig.js`

3. Run the app:
```bash
npm run start:hot
```

## Flutter-style Hot Reload (React Native)

React Native uses Fast Refresh. Every time you save a file, the app updates automatically (similar to Flutter hot reload).

- Use `npm run start:hot` for stable file watching on Windows/OneDrive.
- If your phone is not on the same network, use `npm run start:hot:tunnel`.
- If you are using a custom dev client, use `npm run start:hot:dev`.
- Press `r` in the Metro terminal for manual reload.
- Make sure `Fast Refresh` is enabled in the dev menu (shake device or press `Ctrl + M` on Android emulator).

## View App Inside VS Code (Laptop Screen)

If you want to see your app directly inside VS Code while editing:

1. Run:
```bash
npm run web:vscode
```

2. Open VS Code integrated browser to:
```text
http://localhost:8082
```

3. Keep the terminal running, then edit and save files. The preview updates with Fast Refresh.

## Structure

```
src/
├── context/
│   └── AuthContext.js      - Authentication state management
├── screens/
│   ├── DashboardScreen.js  - Main dashboard
│   ├── TimeLogScreen.js    - Time tracking
│   ├── TasksScreen.js      - Task management
│   ├── ProfileScreen.js    - User profile
│   └── LoginScreen.js      - Login page
└── components/             - Reusable components (future)
```

## Default Login

Email: any@email.com
Password: any password

(Mock authentication - replace with real Firebase Auth for production)
