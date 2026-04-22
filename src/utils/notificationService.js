import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from '../../supabaseConfig';
import Constants from 'expo-constants';

const PUSH_TOKEN_TABLE = 'device_tokens';
const DEVICE_TOKEN_STORAGE_KEY = 'internly_current_push_token';
const DEVICE_LOCAL_ID_STORAGE_KEY = 'internly_local_device_id';
const DEVICE_CACHE_KEY_PREFIX = 'internly_active_devices_cache_v1';
const DEVICE_QUERY_TIMEOUT_MS = 10000;

const parseJsonArray = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getDeviceCacheKey = (userId) => `${DEVICE_CACHE_KEY_PREFIX}:${userId}`;

export const getCachedActiveDeviceTokens = async (userId) => {
  if (!userId) return [];
  const raw = await AsyncStorage.getItem(getDeviceCacheKey(userId));
  return parseJsonArray(raw);
};

export const cacheActiveDeviceTokens = async (userId, devices) => {
  if (!userId) return;
  const safeDevices = Array.isArray(devices) ? devices : [];
  await AsyncStorage.setItem(getDeviceCacheKey(userId), JSON.stringify(safeDevices));
};

const cacheCurrentDeviceEntry = async ({ userId, token, deviceType, platform }) => {
  if (!userId || !token) return;

  const now = new Date().toISOString();
  const cached = await getCachedActiveDeviceTokens(userId);
  const existing = cached.find((item) => item?.token === token);

  const nextEntry = {
    id: existing?.id || `local-cache-${token}`,
    token,
    device_type: deviceType || existing?.device_type || 'android',
    platform: platform || existing?.platform || 'This device',
    is_active: true,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  const withoutCurrent = cached.filter((item) => item?.token !== token);
  await cacheActiveDeviceTokens(userId, [nextEntry, ...withoutCurrent]);
};

export const ensureCurrentDeviceInCache = async (userId) => {
  if (!userId) return [];

  const token = await getStoredDeviceToken();
  if (!token) {
    return getCachedActiveDeviceTokens(userId);
  }

  const deviceType = Device.osName?.toLowerCase() === 'ios' ? 'ios' : 'android';
  const platformLabel = `${Device.brand || 'Unknown'} ${Device.modelName || ''} • ${Constants.systemVersion || ''}`.trim();

  await cacheCurrentDeviceEntry({
    userId,
    token,
    deviceType,
    platform: platformLabel,
  });

  return getCachedActiveDeviceTokens(userId);
};

const isRemotePushEnabled = () => {
  const envValue = process.env.EXPO_PUBLIC_ENABLE_REMOTE_PUSH;
  const configValue = Constants.expoConfig?.extra?.enableRemotePush;

  // Allow env var to override app config so remote push can be toggled per build profile.
  const rawValue =
    envValue !== undefined && envValue !== null && String(envValue).trim() !== ''
      ? envValue
      : configValue;

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
    let storedToken = null;

    const deviceType = Device.osName?.toLowerCase() === 'ios' ? 'ios' : 'android';
    const platformLabel = `${Device.brand || 'Unknown'} ${Device.modelName || ''} • ${Constants.systemVersion || ''}`.trim();

    const ensureLocalDeviceToken = async () => {
      const existing = await AsyncStorage.getItem(DEVICE_LOCAL_ID_STORAGE_KEY);
      if (existing) {
        return `local-device:${existing}`;
      }

      const generatedId = typeof Crypto.randomUUID === 'function'
        ? Crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      await AsyncStorage.setItem(DEVICE_LOCAL_ID_STORAGE_KEY, generatedId);
      return `local-device:${generatedId}`;
    };

    // Always register a fallback local token so device management works even
    // when remote push is disabled or unsupported.
    storedToken = await ensureLocalDeviceToken();

    if (hasPermission && isRemotePushEnabled()) {
      const isExpoGo =
        Constants.appOwnership === 'expo' ||
        Constants.executionEnvironment === 'storeClient';

      if (!isExpoGo) {
        const projectId = getProjectId();
        const androidGoogleServicesConfigured = Boolean(
          Constants.expoConfig?.android?.googleServicesFile
        );

        if (projectId && (deviceType !== 'android' || androidGoogleServicesConfigured)) {
          const token = await Notifications.getExpoPushTokenAsync({ projectId });
          if (token?.data) {
            storedToken = token.data;
            console.log('[Notifications] Got remote push token:', token.data);
          }
        }
      }
    }

    await AsyncStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, storedToken);
    await cacheCurrentDeviceEntry({
      userId,
      token: storedToken,
      deviceType,
      platform: platformLabel,
    });

    // Store token in Supabase
    const { error } = await supabase.from(PUSH_TOKEN_TABLE).upsert(
      {
        user_id: userId,
        token: storedToken,
        device_type: deviceType,
        platform: platformLabel,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );

    if (error) {
      console.error('[Notifications] Failed to store token:', error);
      return null;
    }

    try {
      const refreshedDevices = await getActiveDeviceTokens(userId);
      await cacheActiveDeviceTokens(userId, refreshedDevices);
    } catch (cacheError) {
      console.warn('[Notifications] Failed to refresh device cache after register:', cacheError?.message || cacheError);
    }

    return storedToken;
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

export const getStoredDeviceToken = async () => {
  try {
    return await AsyncStorage.getItem(DEVICE_TOKEN_STORAGE_KEY);
  } catch (error) {
    console.error('[Notifications] Error reading stored token:', error);
    return null;
  }
};

export const getActiveDeviceTokens = async (userId) => {
  const queryPromise = supabase
    .from(PUSH_TOKEN_TABLE)
    .select('id, token, device_type, platform, is_active, created_at, updated_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Device query timed out. Check your internet and try again.')), DEVICE_QUERY_TIMEOUT_MS);
  });

  const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

  if (error) throw error;
  return data || [];
};

export const deactivateDeviceTokenById = async (userId, tokenId) => {
  const { error } = await supabase
    .from(PUSH_TOKEN_TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', tokenId)
    .eq('user_id', userId);

  if (error) throw error;

  try {
    const refreshedDevices = await getActiveDeviceTokens(userId);
    await cacheActiveDeviceTokens(userId, refreshedDevices);
  } catch (cacheError) {
    console.warn('[Notifications] Failed to refresh device cache after single-device logout:', cacheError?.message || cacheError);
  }
};

export const deactivateCurrentDeviceToken = async (userId) => {
  try {
    const currentToken = await getStoredDeviceToken();
    if (!currentToken) {
      return;
    }

    const { error } = await supabase
      .from(PUSH_TOKEN_TABLE)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('token', currentToken);

    if (error) {
      console.error('[Notifications] Failed to deactivate current token:', error);
      return;
    }

    try {
      const refreshedDevices = await getActiveDeviceTokens(userId);
      await cacheActiveDeviceTokens(userId, refreshedDevices);
    } catch (cacheError) {
      console.warn('[Notifications] Failed to refresh device cache after current logout:', cacheError?.message || cacheError);
    }
  } catch (error) {
    console.error('[Notifications] Error deactivating current token:', error);
  }
};

export const deactivateOtherDeviceTokens = async (userId) => {
  const currentToken = await getStoredDeviceToken();
  if (!currentToken) {
    return;
  }

  const { error } = await supabase
    .from(PUSH_TOKEN_TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_active', true)
    .neq('token', currentToken);

  if (error) throw error;

  try {
    const refreshedDevices = await getActiveDeviceTokens(userId);
    await cacheActiveDeviceTokens(userId, refreshedDevices);
  } catch (cacheError) {
    console.warn('[Notifications] Failed to refresh device cache after logout others:', cacheError?.message || cacheError);
  }
};

export const isCurrentDeviceTokenActive = async (userId) => {
  const currentToken = await getStoredDeviceToken();
  if (!currentToken) {
    return true;
  }

  const queryPromise = supabase
    .from(PUSH_TOKEN_TABLE)
    .select('id, is_active')
    .eq('user_id', userId)
    .eq('token', currentToken)
    .maybeSingle();

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Device status check timed out.')), DEVICE_QUERY_TIMEOUT_MS);
  });

  const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  // If the token row does not exist yet (fresh login/reinstall),
  // allow login and let registration create the row.
  if (!data) {
    return true;
  }

  return Boolean(data.is_active);
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
