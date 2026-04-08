import * as Notifications from 'expo-notifications';
import { supabase } from '../../supabaseConfig';

const toNotificationContent = (row) => {
  const payload = row?.data && typeof row.data === 'object' ? row.data : {};
  const targetScreen =
    typeof payload.screen === 'string'
      ? payload.screen
      : typeof payload.routeName === 'string'
      ? payload.routeName
      : 'History';

  return {
    title: row?.title || 'Internly',
    body: row?.message || 'You have a new notification.',
    data: {
      ...payload,
      notificationId: row?.id,
      screen: targetScreen,
    },
  };
};

export const startRealtimeNotificationBridge = (userId) => {
  if (!userId) {
    return () => {};
  }

  const channel = supabase
    .channel(`notification-logs:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notification_logs',
        filter: `recipient_id=eq.${userId}`,
      },
      async (payload) => {
        const notificationId = payload?.new?.notification_id;
        if (!notificationId) {
          return;
        }

        const { data: notification, error } = await supabase
          .from('notifications')
          .select('id, title, message, data')
          .eq('id', notificationId)
          .single();

        if (error || !notification) {
          console.warn('[RealtimeNotifications] Failed to fetch notification payload:', error);
          return;
        }

        try {
          await Notifications.scheduleNotificationAsync({
            content: toNotificationContent(notification),
            trigger: null,
          });
        } catch (scheduleError) {
          console.error('[RealtimeNotifications] Failed to present local notification:', scheduleError);
        }
      }
    )
    .subscribe((status) => {
      console.log('[RealtimeNotifications] Status:', status);
    });

  return () => {
    supabase.removeChannel(channel);
  };
};