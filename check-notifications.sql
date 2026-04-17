-- ============================================================
-- Check and Fix Notifications Issue
-- ============================================================
-- Run this in Supabase SQL Editor to diagnose notification problems

-- ============================================================
-- STEP 1: Check if admin users exist
-- ============================================================
SELECT 
  id, 
  email, 
  name, 
  role, 
  company 
FROM users 
WHERE role IN ('admin', 'super_admin')
ORDER BY role, name;

-- Expected: At least 1 admin or super_admin
-- If empty: You need to create admin users first!

-- ============================================================
-- STEP 2: Check RPC function exists
-- ============================================================
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'create_notification_logs';

-- Expected: create_notification_logs | FUNCTION
-- If empty: Run supabase-notifications-migration.sql

-- ============================================================
-- STEP 3: Check recent notifications
-- ============================================================
SELECT 
  n.id,
  n.title,
  n.message,
  n.notification_type,
  n.target_company,
  n.target_role,
  n.created_at,
  u.name as sender_name,
  u.company as sender_company
FROM notifications n
LEFT JOIN users u ON n.sender_id = u.id
ORDER BY n.created_at DESC
LIMIT 10;

-- Look for:
-- - "123" notifications (test data to delete)
-- - Proper clock_in notifications with title and message

-- ============================================================
-- STEP 4: Check notification logs (who received notifications)
-- ============================================================
SELECT 
  nl.id,
  nl.notification_id,
  nl.recipient_id,
  nl.status,
  nl.created_at,
  u.name as recipient_name,
  u.role as recipient_role,
  n.title as notification_title
FROM notification_logs nl
LEFT JOIN users u ON nl.recipient_id = u.id
LEFT JOIN notifications n ON nl.notification_id = n.id
ORDER BY nl.created_at DESC
LIMIT 10;

-- Check if notifications are being delivered to admins

-- ============================================================
-- STEP 5: Check user who clocked in
-- ============================================================
SELECT 
  id,
  email,
  name,
  role,
  company
FROM users
WHERE email LIKE '%jesriel%' OR name LIKE '%jesriel%';

-- Verify the user's company

-- ============================================================
-- STEP 6: Clean up test notifications
-- ============================================================
-- Uncomment to delete test notifications:

-- DELETE FROM notification_logs 
-- WHERE notification_id IN (
--   SELECT id FROM notifications WHERE title = '123' OR message = '123'
-- );

-- DELETE FROM notifications 
-- WHERE title = '123' OR message = '123';

-- ============================================================
-- STEP 7: Check RLS policies
-- ============================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename IN ('notifications', 'notification_logs')
ORDER BY tablename, policyname;

-- Verify INSERT policies exist for authenticated users

-- ============================================================
-- STEP 8: Check grants
-- ============================================================
SELECT 
  grantee,
  table_name,
  privilege_type
FROM information_schema.role_table_grants 
WHERE table_name IN ('notifications', 'notification_logs')
AND grantee IN ('authenticated', 'anon')
ORDER BY table_name, grantee, privilege_type;

-- Verify authenticated has INSERT, SELECT permissions

-- ============================================================
-- DIAGNOSTIC SUMMARY
-- ============================================================
-- Run all queries above and check:
-- 
-- ✅ Admin users exist
-- ✅ RPC function exists
-- ✅ Recent notifications have proper title/message
-- ✅ Notification logs show delivery to admins
-- ✅ User's company matches admin's company
-- ✅ RLS policies allow INSERT
-- ✅ Grants allow authenticated to INSERT
--
-- If any ❌, follow the fix steps in FIX_NOTIFICATIONS.md
