import React, { useCallback, useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { ActivityIndicator, View } from 'react-native';
import * as Linking from 'expo-linking';

import DashboardScreen from './src/screens/DashboardScreen';
import TimeLogScreen from './src/screens/TimeLogScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import LoginScreen from './src/screens/LoginScreen';
import AdminScreen from './src/screens/AdminScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import {
  ensureNotificationPermission,
  registerForPushNotifications,
  setupNotificationListeners,
} from './src/utils/notificationService';
import { startRealtimeNotificationBridge } from './src/utils/realtimeNotificationBridge';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef();
const linking = {
  prefixes: [Linking.createURL('/'), 'internly://'],
  config: {
    screens: {
      Login: 'login',
      Main: {
        screens: {
          Dashboard: 'dashboard',
          TimeLog: 'timelog',
          History: 'history',
          Profile: 'profile',
          Admin: 'admin',
        },
      },
    },
  },
};

function LoadingScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color="#6200ee" />
    </View>
  );
}

function MainTabs() {
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = 'ellipse-outline';
          if (route.name === 'Dashboard') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'TimeLog') {
            iconName = focused ? 'time' : 'time-outline';
          } else if (route.name === 'History') {
            iconName = focused ? 'clipboard' : 'clipboard-outline';
          } else if (route.name === 'Notifications') {
            iconName = focused ? 'notifications' : 'notifications-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'Admin') {
            iconName = focused ? 'settings' : 'settings-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#7C3AED',
        tabBarInactiveTintColor: isDark ? '#6B7280' : '#999',
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.tabBorder,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="TimeLog" component={TimeLogScreen} options={{ title: 'Time Log' }} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      {(user?.role === 'admin' || user?.role === 'super_admin') && (
        <Tab.Screen name="Admin" component={AdminScreen} />
      )}
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, loading } = useAuth();

  const handleNotificationTap = useCallback(
    (response) => {
      if (!user || !navigationRef.isReady()) {
        return;
      }

      const payload = response?.notification?.request?.content?.data || {};
      const targetScreen = String(payload.screen || payload.routeName || '').trim();
      const params = payload.params && typeof payload.params === 'object' ? payload.params : undefined;

      if (!targetScreen) {
        navigationRef.navigate('History');
        return;
      }

      if (targetScreen === 'Admin' && !['admin', 'super_admin'].includes(user.role)) {
        return;
      }

      const allowedScreens = ['Dashboard', 'TimeLog', 'History', 'Profile', 'Admin'];
      if (allowedScreens.includes(targetScreen)) {
        navigationRef.navigate(targetScreen, params);
      }
    },
    [user]
  );

  useEffect(() => {
    return undefined;
  }, []);

  useEffect(() => {
    const { unsubscribeForeground, unsubscribeBackground } = setupNotificationListeners(handleNotificationTap);
    
    return () => {
      unsubscribeForeground();
      unsubscribeBackground();
    };
  }, [handleNotificationTap]);

  useEffect(() => {
    if (!user?.uid) {
      return undefined;
    }

    let unsubscribeRealtime = () => {};
    let disposed = false;

    const initRealtimeBridge = async () => {
      const hasPermission = await ensureNotificationPermission();
      if (!hasPermission || disposed) {
        return;
      }

      // Register push token on session restore as well, not only on explicit login.
      await registerForPushNotifications(user.uid);
      if (disposed) {
        return;
      }

      unsubscribeRealtime = startRealtimeNotificationBridge(user.uid);
    };

    initRealtimeBridge();

    return () => {
      disposed = true;
      unsubscribeRealtime();
    };
  }, [user?.uid]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  if (!fontsLoaded) {
    return <LoadingScreen />;
  }

  return (
    <ThemeProvider>
      <PaperProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </PaperProvider>
    </ThemeProvider>
  );
}
