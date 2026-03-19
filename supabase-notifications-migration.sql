-- ============================================================
-- Internly - Push Notifications Migration
-- Run this in Supabase SQL Editor after supabase-schema-v2.sql
-- ============================================================

-- Device tokens for push notifications
CREATE TABLE device_tokens (
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
CREATE TABLE notifications (
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
CREATE TABLE notification_logs (
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
CREATE INDEX idx_device_tokens_user_id ON device_tokens(user_id);
CREATE INDEX idx_device_tokens_active ON device_tokens(is_active);
CREATE INDEX idx_notifications_sender_id ON notifications(sender_id);
CREATE INDEX idx_notifications_company ON notifications(target_company);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notification_logs_notification_id ON notification_logs(notification_id);
CREATE INDEX idx_notification_logs_recipient_id ON notification_logs(recipient_id);
CREATE INDEX idx_notification_logs_status ON notification_logs(status);

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Device Tokens RLS Policies
-- ============================================================
-- Users can see only their own tokens
CREATE POLICY device_tokens_select_own ON device_tokens FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own tokens
CREATE POLICY device_tokens_insert_own ON device_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own tokens
CREATE POLICY device_tokens_update_own ON device_tokens FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own tokens
CREATE POLICY device_tokens_delete_own ON device_tokens FOR DELETE
  USING (user_id = auth.uid());

-- Admins can read tokens for their company users (for debugging)
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
CREATE POLICY notifications_select_own ON notifications FOR SELECT
  USING (sender_id = auth.uid());

-- Super admin can see all notifications
CREATE POLICY notifications_select_super_admin ON notifications FOR SELECT
  USING (get_user_role() = 'super_admin');

-- Admins can insert (send) notifications
CREATE POLICY notifications_insert_admin ON notifications FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    (get_user_role() IN ('admin', 'super_admin'))
  );

-- ============================================================
-- Notification Logs RLS Policies
-- ============================================================
-- Users can see their own notification logs
CREATE POLICY notification_logs_select_own ON notification_logs FOR SELECT
  USING (recipient_id = auth.uid());

-- Admins can see logs for their notifications
CREATE POLICY notification_logs_select_admin_sent ON notification_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM notifications
      WHERE notifications.id = notification_logs.notification_id
      AND notifications.sender_id = auth.uid()
    )
  );

-- Super admin can see all logs
CREATE POLICY notification_logs_select_super_admin ON notification_logs FOR SELECT
  USING (get_user_role() = 'super_admin');

-- Admins can insert logs for their notifications
CREATE POLICY notification_logs_insert_admin ON notification_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notifications
      WHERE notifications.id = notification_logs.notification_id
      AND notifications.sender_id = auth.uid()
    )
  );

-- Users can update read status on their own logs
CREATE POLICY notification_logs_update_read ON notification_logs FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());
