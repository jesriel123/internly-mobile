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
npm start
```

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
