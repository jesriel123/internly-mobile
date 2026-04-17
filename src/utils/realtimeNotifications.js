import { supabase } from '../../supabaseConfig';
import * as Notifications from 'expo-notifications';

/**
 * Subscribe to real-time notifications for a user
 * @param {string} userId - User ID to subscribe for
 * @param {function} onNotification - Callback when new notification arrives
 * @returns {object} Subscription object with unsubscribe method
 */
export function subscribeToNotifications(userId, onNotification) {
  console.log('[realtimeNotifications] Subscribing to notifications for user:', userId);

  // Create channel for this user's notifications
  const channel = supabase
    .channel(`user-notifications-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notification_logs',
        filter: `recipient_id=eq.${userId}`,
      },
      async (payload) => {
        console.log('[realtimeNotifications] New notification received:', payload);

        try {
          // Fetch the full notification details
          const { data: notificationLog, error: logError } = await supabase
            .from('notification_logs')
            .select(`
              *,
              notification:notification_id (
                id,
                title,
                message,
                notification_type,
                created_at
              )
            `)
            .eq('id', payload.new.id)
            .single();

          if (logError) {
            console.error('[realtimeNotifications] Error fetching notification:', logError);
            return;
          }

          if (!notificationLog?.notification) {
            console.warn('[realtimeNotifications] Notification not found');
            return;
          }

          const notification = notificationLog.notification;

          console.log('[realtimeNotifications] Notification details:', notification);

          // Show local push notification
          await Notifications.scheduleNotificationAsync({
            content: {
              title: notification.title,
              body: notification.message,
              data: {
                notificationId: notification.id,
                type: notification.notification_type,
              },
            },
            trigger: null, // Show immediately
          });

          // Call the callback
          if (onNotification) {
            onNotification(notification);
          }
        } catch (error) {
          console.error('[realtimeNotifications] Error processing notification:', error);
        }
      }
    )
    .subscribe((status) => {
      console.log('[realtimeNotifications] Subscription status:', status);
    });

  // Return unsubscribe function
  return {
    unsubscribe: () => {
      console.log('[realtimeNotifications] Unsubscribing from notifications');
      supabase.removeChannel(channel);
    },
  };
}

/**
 * Mark notification as read
 * @param {string} notificationLogId - Notification log ID
 */
export async function markNotificationAsRead(notificationLogId) {
  try {
    const { error } = await supabase
      .from('notification_logs')
      .update({ 
        status: 'read',
        read_at: new Date().toISOString()
      })
      .eq('id', notificationLogId);

    if (error) throw error;

    console.log('[realtimeNotifications] Marked notification as read:', notificationLogId);
  } catch (error) {
    console.error('[realtimeNotifications] Error marking as read:', error);
  }
}

/**
 * Fetch unread notifications count
 * @param {string} userId - User ID
 * @returns {number} Count of unread notifications
 */
export async function getUnreadCount(userId) {
  try {
    const { count, error } = await supabase
      .from('notification_logs')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('status', 'sent');

    if (error) throw error;

    return count || 0;
  } catch (error) {
    console.error('[realtimeNotifications] Error getting unread count:', error);
    return 0;
  }
}

/**
 * Fetch all notifications for a user
 * @param {string} userId - User ID
 * @param {number} limit - Number of notifications to fetch
 * @returns {array} Array of notifications
 */
export async function fetchNotifications(userId, limit = 50) {
  try {
    const { data, error } = await supabase
      .from('notification_logs')
      .select(`
        *,
        notification:notification_id (
          id,
          title,
          message,
          notification_type,
          created_at
        )
      `)
      .eq('recipient_id', userId)
      .order('attempted_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('[realtimeNotifications] Error fetching notifications:', error);
    return [];
  }
}
