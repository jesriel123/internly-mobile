-- ============================================================
-- Internly - Firebase-Free Notifications Patch (Safe Re-run)
-- Run this in Supabase SQL Editor if base notification tables already exist.
-- ============================================================

-- 1) Build helper functions to avoid recursive RLS checks.
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

-- 2) Rebuild recursive policies using helper functions.
DROP POLICY IF EXISTS notifications_select_recipient ON notifications;
CREATE POLICY notifications_select_recipient ON notifications FOR SELECT
  USING (public.is_notification_recipient(notifications.id));

DROP POLICY IF EXISTS notification_logs_select_admin_sent ON notification_logs;
CREATE POLICY notification_logs_select_admin_sent ON notification_logs FOR SELECT
  USING (
    get_user_role() IN ('admin', 'super_admin')
    AND public.is_notification_sender(notification_logs.notification_id)
  );

DROP POLICY IF EXISTS notification_logs_insert_admin ON notification_logs;
CREATE POLICY notification_logs_insert_admin ON notification_logs FOR INSERT
  WITH CHECK (
    get_user_role() IN ('admin', 'super_admin')
  );

-- 3) Realtime needs publication entries for postgres_changes listeners.
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

-- 4) Optional performance index for recipient lookup.
CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient_notification
  ON notification_logs(recipient_id, notification_id);
