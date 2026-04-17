-- ============================================================
-- QUICK FIX: Notifications Issue
-- ============================================================
-- Run this in Supabase SQL Editor (same place as registration fix)
-- This will check and fix notification issues

-- ============================================================
-- STEP 1: Check if may admin users
-- ============================================================
SELECT 
  id, 
  email, 
  name, 
  role, 
  company 
FROM users 
WHERE role IN ('admin', 'super_admin');

-- Kung WALANG result (empty), ibig sabihin walang admin users
-- Yan ang reason bakit walang notifications!

-- ============================================================
-- STEP 2: Promote existing user to admin (if needed)
-- ============================================================
-- Uncomment and edit the email below to promote a user to super_admin:

-- UPDATE users 
-- SET role = 'super_admin' 
-- WHERE email = 'jesriel@example.com';  -- CHANGE THIS to your email

-- Or create new admin user (if you have auth user already):
-- First, create user sa Supabase Dashboard → Authentication → Users
-- Then run this (replace the values):

-- INSERT INTO users (
--   id,
--   email,
--   name,
--   role,
--   company
-- ) VALUES (
--   'auth-user-id-from-authentication-page',  -- Get from Authentication → Users
--   'admin@example.com',
--   'Admin User',
--   'super_admin',
--   'YourCompany'
-- );

-- ============================================================
-- STEP 3: Delete test notifications (the "123" notification)
-- ============================================================
-- Uncomment to delete:

-- DELETE FROM notification_logs 
-- WHERE notification_id IN (
--   SELECT id FROM notifications WHERE title = '123' OR message = '123'
-- );

-- DELETE FROM notifications 
-- WHERE title = '123' OR message = '123';

-- ============================================================
-- STEP 4: Verify RPC function exists
-- ============================================================
SELECT 
  routine_name
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'create_notification_logs';

-- Should return: create_notification_logs
-- If empty, you need to run: supabase-notifications-migration.sql

-- ============================================================
-- STEP 5: Check recent notifications
-- ============================================================
SELECT 
  n.title,
  n.message,
  n.notification_type,
  n.created_at,
  u.name as sender_name
FROM notifications n
LEFT JOIN users u ON n.sender_id = u.id
ORDER BY n.created_at DESC
LIMIT 5;

-- This shows the last 5 notifications created

-- ============================================================
-- INSTRUCTIONS:
-- ============================================================
-- 1. Run STEP 1 first - check if may admin users
-- 2. If WALANG result:
--    - Uncomment STEP 2
--    - Change the email to your email
--    - Run to promote yourself to super_admin
-- 3. Run STEP 3 to delete test notifications
-- 4. Run STEP 4 to verify RPC function
-- 5. Run STEP 5 to check notifications
-- 6. Test clock in again - should create proper notification now!

-- ============================================================
-- EXPECTED RESULTS:
-- ============================================================
-- After fix:
-- ✅ At least 1 admin/super_admin user exists
-- ✅ RPC function exists
-- ✅ Test notifications deleted
-- ✅ New clock in creates proper notification
-- ✅ Admin sees notification in web app
