-- ============================================================
-- FIX: Notifications NOT NULL Error (23502)
-- ============================================================
-- This fixes the "NOT NULL violation" error when creating notifications

-- ============================================================
-- STEP 1: Make sender_id and sender_role nullable
-- ============================================================
-- This allows system-generated notifications without a specific sender

ALTER TABLE notifications 
ALTER COLUMN sender_id DROP NOT NULL;

ALTER TABLE notifications 
ALTER COLUMN sender_role DROP NOT NULL;

-- ============================================================
-- STEP 2: Update RLS policies to handle NULL sender
-- ============================================================
-- Drop and recreate the insert policy to allow NULL sender for system notifications

DROP POLICY IF EXISTS notifications_insert_admin ON notifications;

CREATE POLICY notifications_insert_admin ON notifications 
  FOR INSERT
  WITH CHECK (
    -- Allow if user is admin/super_admin and sender_id matches
    (sender_id = auth.uid() AND get_user_role() IN ('admin', 'super_admin'))
    OR
    -- Allow system notifications (NULL sender) from authenticated users
    (sender_id IS NULL AND auth.role() = 'authenticated')
  );

-- ============================================================
-- STEP 3: Update create_notification_logs function
-- ============================================================
-- Remove the admin-only restriction for system notifications

DROP FUNCTION IF EXISTS public.create_notification_logs(UUID, UUID[], TEXT);

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
  
  -- Allow admins and authenticated users (for system notifications)
  IF _role NOT IN ('admin', 'super_admin', 'user') THEN
    RAISE EXCEPTION 'Not authorized to create notification logs';
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

GRANT EXECUTE ON FUNCTION public.create_notification_logs(UUID, UUID[], TEXT) TO authenticated;

-- ============================================================
-- STEP 4: Grant INSERT permission to authenticated users
-- ============================================================
GRANT INSERT ON TABLE public.notifications TO authenticated;

-- ============================================================
-- STEP 5: Verification
-- ============================================================
-- Check if columns are now nullable
SELECT 
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_name = 'notifications'
AND column_name IN ('sender_id', 'sender_role');

-- Expected: is_nullable = 'YES' for both

-- ============================================================
-- DONE!
-- ============================================================
-- After running this:
-- 1. Refresh the web app
-- 2. Try creating test notifications again
-- 3. Should work now! ✅
