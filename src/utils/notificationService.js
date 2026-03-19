import * as Notifications from 'expo-notifications';
import { supabase } from '../../supabaseConfig';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const registerForPushNotifications = async (userId) => {
  try {
    const isExpoGo =
      Constants.appOwnership === 'expo' ||
      Constants.executionEnvironment === 'storeClient';

    if (isExpoGo) {
      console.warn('[Notifications] Skipping remote push token registration in Expo Go. Use a development build for push notifications.');
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn('[Notifications] No Expo project ID configured');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[Notifications] Permission not granted');
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    console.log('[Notifications] Got token:', token.data);

    // Store token in Supabase
    const deviceType = Constants.platform?.ios ? 'ios' : 'android';
    const { error } = await supabase.from('device_tokens').upsert(
      {
        user_id: userId,
        token: token.data,
        device_type: deviceType,
        platform: Constants.systemVersion,
        is_active: true,
      },
      { onConflict: 'token' }
    );

    if (error) {
      console.error('[Notifications] Failed to store token:', error);
      return null;
    }

    return token.data;
  } catch (error) {
    console.error('[Notifications] Error registering for push:', error);
    return null;
  }
};

export const deactivateDeviceToken = async (userId) => {
  try {
    const { error } = await supabase
      .from('device_tokens')
      .update({ is_active: false })
      .eq('user_id', userId);

    if (error) {
      console.error('[Notifications] Failed to deactivate token:', error);
    }
  } catch (error) {
    console.error('[Notifications] Error deactivating token:', error);
  }
};

export const setupNotificationListeners = () => {
  // Listen for notifications when app is in foreground
  const foregroundSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('[Notifications] Response received:', response.notification.request.content);
    }
  );

  // Listen for notifications background
  const backgroundSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('[Notifications] Notification received:', notification);
    }
  );

  return {
    unsubscribeForeground: () => foregroundSubscription.remove(),
    unsubscribeBackground: () => backgroundSubscription.remove(),
  };
};
