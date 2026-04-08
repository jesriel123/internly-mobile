import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';
const TOKEN_TABLE = 'device_tokens';

interface PushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: Record<string, unknown>;
}

interface DispatchResult {
  sentCount: number;
  failedCount: number;
  errors: Record<string, string>;
}

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const normalizeExpoTickets = (responsePayload: unknown): Array<{ status: string; message?: string }> => {
  if (Array.isArray(responsePayload)) {
    return responsePayload as Array<{ status: string; message?: string }>;
  }

  if (
    responsePayload &&
    typeof responsePayload === 'object' &&
    Array.isArray((responsePayload as { data?: unknown }).data)
  ) {
    return (responsePayload as { data: Array<{ status: string; message?: string }> }).data;
  }

  return [];
};

const dispatchMessages = async (messages: PushMessage[]): Promise<DispatchResult> => {
  let sentCount = 0;
  let failedCount = 0;
  const errors: Record<string, string> = {};

  const batchSize = 100;
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);

    try {
      const pushResponse = await fetch(EXPO_PUSH_API, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      const pushData = await pushResponse.json();
      const tickets = normalizeExpoTickets(pushData);

      if (tickets.length === 0) {
        failedCount += batch.length;
        batch.forEach((message) => {
          errors[message.to] = 'Invalid response from Expo Push API';
        });
        continue;
      }

      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'ok') {
          sentCount += 1;
          return;
        }

        failedCount += 1;
        const token = batch[idx]?.to;
        if (token) {
          errors[token] = ticket.message || 'Unknown Expo error';
        }
      });
    } catch (error) {
      console.error('[send-notification] Failed to dispatch message batch:', error);
      failedCount += batch.length;
      batch.forEach((message) => {
        errors[message.to] = 'Network or server error while contacting Expo';
      });
    }
  }

  return { sentCount, failedCount, errors };
};

const mapTokensToMessages = (
  tokens: Array<{ token: string }>,
  title: string,
  body: string,
  data: Record<string, unknown>
): PushMessage[] =>
  tokens
    .map((row) => row.token)
    .filter(Boolean)
    .map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    }));

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json({ error: 'Request body must be valid JSON.' }, 400);
    }

    const notificationId =
      typeof (body as { notification_id?: unknown }).notification_id === 'string'
        ? (body as { notification_id: string }).notification_id
        : null;

    const userId =
      typeof (body as { user_id?: unknown }).user_id === 'string'
        ? (body as { user_id: string }).user_id
        : null;

    const directTitle =
      typeof (body as { title?: unknown }).title === 'string'
        ? (body as { title: string }).title.trim()
        : '';

    const directBody =
      typeof (body as { body?: unknown }).body === 'string'
        ? (body as { body: string }).body.trim()
        : '';

    const directData =
      (body as { data?: unknown }).data && typeof (body as { data?: unknown }).data === 'object'
        ? (body as { data: Record<string, unknown> }).data
        : {};

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Missing Supabase environment variables.' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (notificationId) {
      const { data: notification, error: notificationError } = await supabase
        .from('notifications')
        .select('id, title, message')
        .eq('id', notificationId)
        .single();

      if (notificationError || !notification) {
        console.error('[send-notification] Notification not found:', notificationError);
        return json({ error: 'Notification not found.' }, 404);
      }

      const { data: logs, error: logsError } = await supabase
        .from('notification_logs')
        .select('recipient_id')
        .eq('notification_id', notificationId);

      if (logsError) {
        console.error('[send-notification] Failed to fetch recipients:', logsError);
        return json({ error: 'Failed to fetch recipients.' }, 500);
      }

      const recipientIds = (logs || []).map((row) => row.recipient_id).filter(Boolean);
      if (recipientIds.length === 0) {
        return json({ success: true, mode: 'notification_id', sent: 0, failed: 0 }, 200);
      }

      const { data: tokenRows, error: tokensError } = await supabase
        .from(TOKEN_TABLE)
        .select('token, user_id')
        .in('user_id', recipientIds)
        .eq('is_active', true);

      if (tokensError) {
        console.error('[send-notification] Failed to fetch device tokens:', tokensError);
        return json({ error: 'Failed to fetch device tokens.' }, 500);
      }

      const tokens = tokenRows || [];
      const messages = mapTokensToMessages(tokens, notification.title, notification.message, {
        notificationId,
        type: 'notification',
      });

      if (messages.length === 0) {
        return json({ success: true, mode: 'notification_id', sent: 0, failed: 0 }, 200);
      }

      const { sentCount, failedCount, errors } = await dispatchMessages(messages);

      const failedTokens = Object.keys(errors);
      const failedUserIds = tokens
        .filter((row) => failedTokens.includes(row.token))
        .map((row) => row.user_id);

      const successUserIds = tokens
        .filter((row) => !failedTokens.includes(row.token))
        .map((row) => row.user_id);

      if (failedUserIds.length > 0) {
        await supabase
          .from('notification_logs')
          .update({
            status: 'failed',
            error_message: 'Device token invalid or expired',
          })
          .in('recipient_id', failedUserIds)
          .eq('notification_id', notificationId);
      }

      if (successUserIds.length > 0) {
        await supabase
          .from('notification_logs')
          .update({ status: 'delivered' })
          .in('recipient_id', successUserIds)
          .eq('notification_id', notificationId);
      }

      return json(
        {
          success: true,
          mode: 'notification_id',
          sent: sentCount,
          failed: failedCount,
          errors: failedCount > 0 ? errors : undefined,
        },
        200
      );
    }

    if (userId && directTitle && directBody) {
      const { data: tokenRows, error: tokensError } = await supabase
        .from(TOKEN_TABLE)
        .select('token, user_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (tokensError) {
        console.error('[send-notification] Failed to fetch direct target tokens:', tokensError);
        return json({ error: 'Failed to fetch device tokens.' }, 500);
      }

      const tokens = tokenRows || [];
      const messages = mapTokensToMessages(tokens, directTitle, directBody, {
        ...directData,
        userId,
        type: 'direct',
      });

      if (messages.length === 0) {
        return json({ success: true, mode: 'direct', sent: 0, failed: 0 }, 200);
      }

      const { sentCount, failedCount, errors } = await dispatchMessages(messages);

      return json(
        {
          success: true,
          mode: 'direct',
          sent: sentCount,
          failed: failedCount,
          errors: failedCount > 0 ? errors : undefined,
        },
        200
      );
    }

    return json(
      {
        error:
          'Invalid payload. Send either { notification_id } or { user_id, title, body, data? }.',
      },
      400
    );
  } catch (error) {
    console.error('[send-notification] Unexpected error:', error);
    return json({ error: 'Internal server error.' }, 500);
  }
});
