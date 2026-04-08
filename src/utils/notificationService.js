import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '../../supabaseConfig';
import Constants from 'expo-constants';

const PUSH_TOKEN_TABLE = 'device_tokens';

const isRemotePushEnabled = () => {
  const rawValue =
    Constants.expoConfig?.extra?.enableRemotePush ??
    process.env.EXPO_PUBLIC_ENABLE_REMOTE_PUSH;

  return rawValue === true || String(rawValue).toLowerCase() === 'true';
};

const getProjectId = () => {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    null
  );
};

const configureAndroidNotificationChannel = async () => {
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#7C3AED',
  });
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const ensureNotificationPermission = async () => {
  if (!Device.isDevice) {
    console.warn('[Notifications] Physical device required for notifications.');
    return false;
  }

  const deviceType = Device.osName?.toLowerCase() === 'ios' ? 'ios' : 'android';
  if (deviceType === 'android') {
    await configureAndroidNotificationChannel();
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notifications] Permission not granted');
    return false;
  }

  return true;
};

export const registerForPushNotifications = async (userId) => {
  try {
    const hasPermission = await ensureNotificationPermission();
    if (!hasPermission) {
      return null;
    }

    const deviceType = Device.osName?.toLowerCase() === 'ios' ? 'ios' : 'android';

    if (!isRemotePushEnabled()) {
      console.log('[Notifications] Remote push is disabled. Using local/realtime notifications only.');
      return null;
    }

    const isExpoGo =
      Constants.appOwnership === 'expo' ||
      Constants.executionEnvironment === 'storeClient';

    if (isExpoGo) {
      console.warn('[Notifications] Skipping remote push token registration in Expo Go. Use a development build for push notifications.');
      return null;
    }

    const projectId = getProjectId();
    if (!projectId) {
      console.warn('[Notifications] No Expo project ID configured');
      return null;
    }

    const androidGoogleServicesConfigured = Boolean(
      Constants.expoConfig?.android?.googleServicesFile
    );

    if (deviceType === 'android' && !androidGoogleServicesConfigured) {
      console.warn(
        '[Notifications] Android push requires Firebase FCM client setup even when using Supabase. Add google-services.json, set expo.android.googleServicesFile in app config, rebuild your development client, then try again.'
      );
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    if (!token?.data) {
      console.warn('[Notifications] No Expo push token received');
      return null;
    }

    console.log('[Notifications] Got token:', token.data);

    // Store token in Supabase
    const { error } = await supabase.from(PUSH_TOKEN_TABLE).upsert(
      {
        user_id: userId,
        token: token.data,
        device_type: deviceType,
        platform: Constants.systemVersion,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );

    if (error) {
      console.error('[Notifications] Failed to store token:', error);
      return null;
    }

    return token.data;
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes('Default FirebaseApp is not initialized')) {
      console.error(
        '[Notifications] Firebase FCM is not initialized. Using Supabase does not replace Android FCM setup for Expo push. Add google-services.json to the app config and rebuild the development client.'
      );
      return null;
    }

    console.error('[Notifications] Error registering for push:', error);
    return null;
  }
};

export const deactivateDeviceToken = async (userId) => {
  try {
    const { error } = await supabase
      .from(PUSH_TOKEN_TABLE)
      .update({ is_active: false })
      .eq('user_id', userId);

    if (error) {
      console.error('[Notifications] Failed to deactivate token:', error);
    }
  } catch (error) {
    console.error('[Notifications] Error deactivating token:', error);
  }
};

export const setupNotificationListeners = (onNotificationTap) => {
  // Fires when user taps a notification.
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('[Notifications] Response received:', response.notification.request.content);
      if (typeof onNotificationTap === 'function') {
        onNotificationTap(response);
      }
    }
  );

  // Fires when notification arrives while app is in foreground.
  const foregroundSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('[Notifications] Notification received:', notification);
    }
  );

  return {
    unsubscribeForeground: () => foregroundSubscription.remove(),
    unsubscribeBackground: () => responseSubscription.remove(),
  };
};

export const sendPushToUser = async ({ userId, title, body, data = {} }) => {
  if (!userId || !title || !body) {
    throw new Error('userId, title, and body are required');
  }

  const { data: result, error } = await supabase.functions.invoke('send-notification', {
    body: {
      user_id: userId,
      title,
      body,
      data,
    },
  });

  if (error) {
    throw error;
  }

  return result;
};
