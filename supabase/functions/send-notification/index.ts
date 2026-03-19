import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  to: string;
  sound: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

Deno.serve(async (req) => {
  try {
    // Only accept POST
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const { notification_id } = await req.json();

    if (!notification_id) {
      return new Response(
        JSON.stringify({ error: 'notification_id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase config' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get notification details
    const { data: notification, error: notifError } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', notification_id)
      .single();

    if (notifError || !notification) {
      console.error('[send-notification] Notification not found:', notifError);
      return new Response(
        JSON.stringify({ error: 'Notification not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get notification logs for this notification
    const { data: logs, error: logsError } = await supabase
      .from('notification_logs')
      .select('recipient_id')
      .eq('notification_id', notification_id);

    if (logsError) {
      console.error('[send-notification] Failed to fetch logs:', logsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch logs' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const recipientIds = logs?.map(log => log.recipient_id) || [];
    console.log(`[send-notification] Found ${recipientIds.length} recipients`);

    if (recipientIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, failed: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get device tokens for recipients
    const { data: tokens, error: tokensError } = await supabase
      .from('device_tokens')
      .select('token, user_id')
      .in('user_id', recipientIds)
      .eq('is_active', true);

    if (tokensError) {
      console.error('[send-notification] Failed to fetch tokens:', tokensError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch tokens' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const deviceTokens = tokens || [];
    console.log(`[send-notification] Found ${deviceTokens.length} active devices`);

    // Send push notifications via Expo
    const messages: PushMessage[] = deviceTokens.map(({ token }) => ({
      to: token,
      sound: 'default',
      title: notification.title,
      body: notification.message,
      data: {
        notificationId: notification_id,
        type: 'notification',
      },
    }));

    let sentCount = 0;
    let failedCount = 0;
    const errors: Record<string, string> = {};

    // Send in batches
    const batchSize = 100;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);

      try {
        const pushResponse = await fetch(EXPO_PUSH_API, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch),
        });

        const pushData = await pushResponse.json();

        if (Array.isArray(pushData)) {
          pushData.forEach((result: any, idx: number) => {
            if (result.status === 'ok') {
              sentCount++;
            } else {
              failedCount++;
              const token = batch[idx]?.to;
              errors[token] = result.message || 'Unknown error';
            }
          });
        }
      } catch (err) {
        console.error('[send-notification] Batch send failed:', err);
        failedCount += batch.length;
      }
    }

    console.log(
      `[send-notification] Sent: ${sentCount}, Failed: ${failedCount}`
    );

    // Update notification logs with delivery status
    const failedTokens = Object.keys(errors);
    if (failedTokens.length > 0) {
      const failedUserIds = deviceTokens
        .filter(dt => failedTokens.includes(dt.token))
        .map(dt => dt.user_id);

      if (failedUserIds.length > 0) {
        await supabase
          .from('notification_logs')
          .update({
            status: 'failed',
            error_message: 'Device token invalid or expired',
          })
          .in('recipient_id', failedUserIds)
          .eq('notification_id', notification_id);
      }
    }

    // Mark successful deliveries
    const successUserIds = deviceTokens
      .filter(dt => !failedTokens.includes(dt.token))
      .map(dt => dt.user_id);

    if (successUserIds.length > 0) {
      await supabase
        .from('notification_logs')
        .update({ status: 'delivered' })
        .in('recipient_id', successUserIds)
        .eq('notification_id', notification_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        failed: failedCount,
        errors: failedCount > 0 ? errors : undefined,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[send-notification] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
