-- ============================================================
-- ROLLBACK: Undo All Notification Changes
-- ============================================================
-- This script will restore your database to the state
-- before running any notification fix scripts
-- ============================================================

-- ============================================================
-- STEP 1: Remove Database Trigger
-- ============================================================

DROP TRIGGER IF EXISTS trigger_notify_admins_on_clock ON time_logs;
DROP FUNCTION IF EXISTS public.notify_admins_on_clock();

RAISE NOTICE '✅ Removed database trigger';

-- ============================================================
-- STEP 2: Restore Original RLS Policy
-- ============================================================

-- Drop the new policy
DROP POLICY IF EXISTS notifications_insert_all ON notifications;

-- Restore original policy (admin only)
CREATE POLICY notifications_insert_admin ON notifications 
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND get_user_role() IN ('admin', 'super_admin')
  );

RAISE NOTICE '✅ Restored original RLS policy (admin only)';

-- ============================================================
-- STEP 3: Restore Original RPC Function
-- ============================================================

DROP FUNCTION IF EXISTS public.create_notification_logs(UUID, UUID[], TEXT);

-- Restore original version (admin only)
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
  
  -- Only allow admins and super_admins
  IF _role NOT IN ('admin', 'super_admin') THEN
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

RAISE NOTICE '✅ Restored original RPC function (admin only)';

-- ============================================================
-- STEP 4: Restore NOT NULL Constraints (Optional)
-- ============================================================

-- Uncomment these if you want to restore NOT NULL constraints
-- WARNING: This will fail if there are existing NULL values

-- ALTER TABLE notifications ALTER COLUMN sender_id SET NOT NULL;
-- ALTER TABLE notifications ALTER COLUMN sender_role SET NOT NULL;

-- RAISE NOTICE '✅ Restored NOT NULL constraints';

-- ============================================================
-- STEP 5: Revoke User Permissions (Optional)
-- ============================================================

-- Uncomment to remove INSERT permissions from regular users
-- This is optional - keeping SELECT is usually fine

-- REVOKE INSERT ON TABLE public.notifications FROM authenticated;
-- REVOKE INSERT ON TABLE public.notification_logs FROM authenticated;

-- RAISE NOTICE '✅ Revoked INSERT permissions from users';

-- ============================================================
-- STEP 6: Clean Up Test Notifications (Optional)
-- ============================================================

-- Uncomment to delete notifications created during testing
-- WARNING: This will delete ALL notifications from the last 24 hours

-- DELETE FROM notification_logs 
-- WHERE notification_id IN (
--   SELECT id FROM notifications 
--   WHERE created_at > NOW() - INTERVAL '24 hours'
--   AND notification_type IN ('clock_in', 'clock_out')
-- );

-- DELETE FROM notifications 
-- WHERE created_at > NOW() - INTERVAL '24 hours'
-- AND notification_type IN ('clock_in', 'clock_out');

-- RAISE NOTICE '✅ Deleted test notifications';

-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
DECLARE
  policy_count INTEGER;
  rpc_count INTEGER;
  trigger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count 
  FROM pg_policies 
  WHERE tablename = 'notifications' 
  AND policyname = 'notifications_insert_admin';
  
  SELECT COUNT(*) INTO rpc_count 
  FROM information_schema.routines 
  WHERE routine_name = 'create_notification_logs';
  
  SELECT COUNT(*) INTO trigger_count 
  FROM information_schema.triggers 
  WHERE trigger_name = 'trigger_notify_admins_on_clock';
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ROLLBACK VERIFICATION:';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Original RLS policy: %', CASE WHEN policy_count > 0 THEN '✅ RESTORED' ELSE '❌ MISSING' END;
  RAISE NOTICE 'Original RPC function: %', CASE WHEN rpc_count > 0 THEN '✅ RESTORED' ELSE '❌ MISSING' END;
  RAISE NOTICE 'Database trigger: %', CASE WHEN trigger_count = 0 THEN '✅ REMOVED' ELSE '⚠️  STILL EXISTS' END;
  RAISE NOTICE '========================================';
  
  IF policy_count > 0 AND rpc_count > 0 AND trigger_count = 0 THEN
    RAISE NOTICE '✅ ROLLBACK SUCCESSFUL!';
    RAISE NOTICE '';
    RAISE NOTICE 'Your database has been restored to the original state.';
    RAISE NOTICE 'Notifications will now only be created by admins.';
  ELSE
    RAISE NOTICE '⚠️  ROLLBACK INCOMPLETE - Check the results above';
  END IF;
  
  RAISE NOTICE '========================================';
END $$;

-- ============================================================
-- WHAT WAS RESTORED:
-- ============================================================
-- ✅ Removed database trigger (automatic notifications)
-- ✅ Restored original RLS policy (admin only)
-- ✅ Restored original RPC function (admin only)
-- ⚠️  sender_id and sender_role remain nullable (safe to keep)
-- ⚠️  Permissions remain granted (safe to keep)
-- ⚠️  Test notifications remain in database (safe to keep)
--
-- To fully restore, uncomment STEP 4, 5, and 6 above
-- ============================================================

-- ============================================================
-- DONE! Your database has been rolled back
-- ============================================================
