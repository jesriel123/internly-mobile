-- ============================================================
-- Internly - Push Notifications Migration
-- Run this in Supabase SQL Editor after supabase-schema-v2.sql
-- Safe to re-run (idempotent)
-- ============================================================

-- Device tokens for push notifications
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  device_type TEXT CHECK (device_type IN ('ios', 'android', 'web')),
  platform TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications (sent by admins)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  target_company TEXT,
  target_role TEXT CHECK (target_role IN ('user', 'admin', 'super_admin', NULL)),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  is_global BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification logs (delivery tracking)
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'read')),
  error_message TEXT,
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_active ON device_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_notifications_sender_id ON notifications(sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_company ON notifications(target_company);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_notification_id ON notification_logs(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient_id ON notification_logs(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper functions (avoid policy recursion)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_notification_recipient(_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.notification_logs nl
    WHERE nl.notification_id = _notification_id
      AND nl.recipient_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_notification_sender(_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.id = _notification_id
      AND n.sender_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_notification_recipient(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_notification_sender(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_notification_recipient(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_notification_sender(UUID) TO authenticated;

-- Helper RPC for bulk log inserts from web/admin clients.
CREATE OR REPLACE FUNCTION public.create_notification_logs(
  _notification_id UUID,
  _recipient_ids UUID[],
  _default_status TEXT DEFAULT 'sent'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role TEXT;
  _inserted_count INTEGER := 0;
BEGIN
  _role := get_user_role();
  IF _role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Only admins can create notification logs';
  END IF;

  IF _notification_id IS NULL THEN
    RAISE EXCEPTION 'notification_id is required';
  END IF;

  IF COALESCE(array_length(_recipient_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.notification_logs (notification_id, recipient_id, status)
  SELECT
    _notification_id,
    recipient_id,
    COALESCE(NULLIF(_default_status, ''), 'sent')
  FROM (
    SELECT DISTINCT UNNEST(_recipient_ids) AS recipient_id
  ) dedup
  INNER JOIN public.users u ON u.id = dedup.recipient_id;

  GET DIAGNOSTICS _inserted_count = ROW_COUNT;
  RETURN _inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_notification_logs(UUID, UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_notification_logs(UUID, UUID[], TEXT) TO authenticated;

-- ============================================================
-- Device Tokens RLS Policies
-- ============================================================
-- Users can see only their own tokens
DROP POLICY IF EXISTS device_tokens_select_own ON device_tokens;
CREATE POLICY device_tokens_select_own ON device_tokens FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own tokens
DROP POLICY IF EXISTS device_tokens_insert_own ON device_tokens;
CREATE POLICY device_tokens_insert_own ON device_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own tokens
DROP POLICY IF EXISTS device_tokens_update_own ON device_tokens;
CREATE POLICY device_tokens_update_own ON device_tokens FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own tokens
DROP POLICY IF EXISTS device_tokens_delete_own ON device_tokens;
CREATE POLICY device_tokens_delete_own ON device_tokens FOR DELETE
  USING (user_id = auth.uid());

-- Admins can read tokens for their company users (for debugging)
DROP POLICY IF EXISTS device_tokens_select_admin_company ON device_tokens;
CREATE POLICY device_tokens_select_admin_company ON device_tokens FOR SELECT
  USING (
    get_user_role() IN ('admin', 'super_admin') AND
    EXISTS (
      SELECT 1 FROM users sender
      WHERE sender.id = auth.uid()
      AND sender.company = (SELECT company FROM users WHERE id = device_tokens.user_id)
    )
  );

-- ============================================================
-- Notifications RLS Policies
-- ============================================================
-- Admins can see notifications they sent
DROP POLICY IF EXISTS notifications_select_own ON notifications;
CREATE POLICY notifications_select_own ON notifications FOR SELECT
  USING (sender_id = auth.uid());

-- Super admin can see all notifications
DROP POLICY IF EXISTS notifications_select_super_admin ON notifications;
CREATE POLICY notifications_select_super_admin ON notifications FOR SELECT
  USING (get_user_role() = 'super_admin');

-- Recipients can read notifications addressed to them (for mobile in-app alerts)
DROP POLICY IF EXISTS notifications_select_recipient ON notifications;
CREATE POLICY notifications_select_recipient ON notifications FOR SELECT
  USING (public.is_notification_recipient(notifications.id));

-- Admins can insert (send) notifications
DROP POLICY IF EXISTS notifications_insert_admin ON notifications;
CREATE POLICY notifications_insert_admin ON notifications FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    (get_user_role() IN ('admin', 'super_admin'))
  );

-- ============================================================
-- Notification Logs RLS Policies
-- ============================================================
-- Users can see their own notification logs
DROP POLICY IF EXISTS notification_logs_select_own ON notification_logs;
CREATE POLICY notification_logs_select_own ON notification_logs FOR SELECT
  USING (recipient_id = auth.uid());

-- Admins can see logs for their notifications
DROP POLICY IF EXISTS notification_logs_select_admin_sent ON notification_logs;
CREATE POLICY notification_logs_select_admin_sent ON notification_logs FOR SELECT
  USING (
    get_user_role() IN ('admin', 'super_admin')
    AND public.is_notification_sender(notification_logs.notification_id)
  );

-- Super admin can see all logs
DROP POLICY IF EXISTS notification_logs_select_super_admin ON notification_logs;
CREATE POLICY notification_logs_select_super_admin ON notification_logs FOR SELECT
  USING (get_user_role() = 'super_admin');

-- Admins can insert logs for their notifications
DROP POLICY IF EXISTS notification_logs_insert_admin ON notification_logs;
CREATE POLICY notification_logs_insert_admin ON notification_logs FOR INSERT
  WITH CHECK (
    get_user_role() IN ('admin', 'super_admin')
  );

-- Users can update read status on their own logs
DROP POLICY IF EXISTS notification_logs_update_read ON notification_logs;
CREATE POLICY notification_logs_update_read ON notification_logs FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- ============================================================
-- Realtime publication for in-app notifications
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'notification_logs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_logs;
    END IF;
  END IF;
END $$;
