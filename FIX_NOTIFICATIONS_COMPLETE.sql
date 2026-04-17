-- ============================================================
-- COMPLETE FIX: Notifications System
-- ============================================================
-- Run this ENTIRE script in Supabase SQL Editor
-- This fixes all notification issues

-- ============================================================
-- STEP 1: Check current state
-- ============================================================
-- Check admin users
SELECT 
  'Admin Users Check' as check_type,
  COUNT(*) as count
FROM users 
WHERE role IN ('admin', 'super_admin');

-- Check RPC function
SELECT 
  'RPC Function Check' as check_type,
  COUNT(*) as count
FROM information_schema.routines 
WHERE routine_name = 'create_notification_logs';

-- ============================================================
-- STEP 2: Create or recreate RPC function
-- ============================================================
-- Drop if exists
DROP FUNCTION IF EXISTS public.create_notification_logs(uuid, uuid[], text);

-- Create the function
CREATE OR REPLACE FUNCTION public.create_notification_logs(
  _notification_id UUID,
  _recipient_ids UUID[],
  _default_status TEXT DEFAULT 'sent'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert notification logs for each recipient
  INSERT INTO notification_logs (notification_id, recipient_id, status)
  SELECT 
    _notification_id,
    unnest(_recipient_ids),
    _default_status;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_notification_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification_logs TO anon;

-- ============================================================
-- STEP 3: Ensure tables exist with proper structure
-- ============================================================
-- Check if notifications table exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
    CREATE TABLE notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
      sender_role TEXT,
      target_company TEXT,
      target_role TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_global BOOLEAN DEFAULT false,
      notification_type TEXT DEFAULT 'manual',
      related_log_id UUID,
      related_log_date TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
END $$;

-- Check if notification_logs table exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_logs') THEN
    CREATE TABLE notification_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
      recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'sent',
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
END $$;

-- ============================================================
-- STEP 4: Set up RLS policies
-- ============================================================
-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS notifications_select_all ON notifications;
DROP POLICY IF EXISTS notifications_insert_authenticated ON notifications;
DROP POLICY IF EXISTS notification_logs_select_own ON notification_logs;
DROP POLICY IF EXISTS notification_logs_insert_authenticated ON notification_logs;
DROP POLICY IF EXISTS notification_logs_update_own ON notification_logs;

-- Create policies for notifications
CREATE POLICY notifications_select_all ON notifications
  FOR SELECT USING (true);

CREATE POLICY notifications_insert_authenticated ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Create policies for notification_logs
CREATE POLICY notification_logs_select_own ON notification_logs
  FOR SELECT USING (recipient_id = auth.uid() OR auth.uid() IN (
    SELECT id FROM users WHERE role IN ('admin', 'super_admin')
  ));

CREATE POLICY notification_logs_insert_authenticated ON notification_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY notification_logs_update_own ON notification_logs
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- ============================================================
-- STEP 5: Grant permissions
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT ON TABLE public.notifications TO anon;
GRANT SELECT, INSERT ON TABLE public.notifications TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_logs TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_logs TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================
-- STEP 6: Promote user to admin (CHANGE EMAIL!)
-- ============================================================
-- Uncomment and change email to promote yourself to super_admin:

-- UPDATE users 
-- SET role = 'super_admin' 
-- WHERE email = 'your-email@example.com';

-- Or if you want to promote jesriel:
-- UPDATE users 
-- SET role = 'super_admin' 
-- WHERE email LIKE '%jesriel%';

-- ============================================================
-- STEP 7: Clean up test notifications
-- ============================================================
-- Delete test notifications
DELETE FROM notification_logs 
WHERE notification_id IN (
  SELECT id FROM notifications WHERE title = '123' OR message = '123'
);

DELETE FROM notifications 
WHERE title = '123' OR message = '123';

-- ============================================================
-- STEP 8: Verification
-- ============================================================
-- Check admin users
SELECT 
  'Final Admin Check' as check_type,
  email,
  name,
  role,
  company
FROM users 
WHERE role IN ('admin', 'super_admin');

-- Check RPC function
SELECT 
  'Final RPC Check' as check_type,
  routine_name,
  routine_type
FROM information_schema.routines 
WHERE routine_name = 'create_notification_logs';

-- Check recent notifications
SELECT 
  'Recent Notifications' as check_type,
  title,
  message,
  notification_type,
  created_at
FROM notifications 
ORDER BY created_at DESC 
LIMIT 5;

-- ============================================================
-- DONE!
-- ============================================================
-- After running this script:
-- 1. Uncomment STEP 6 and change email to promote yourself
-- 2. Run the script again
-- 3. Refresh the web app
-- 4. Try sending a notification
-- 5. Try clock in from mobile
-- 6. Check notifications - should work! ✅
