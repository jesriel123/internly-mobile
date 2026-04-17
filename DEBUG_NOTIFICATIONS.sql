-- ============================================
-- DEBUG NOTIFICATIONS SYSTEM
-- ============================================

-- 1. CHECK ADMIN USERS
SELECT 
  '=== ADMIN USERS ===' as section,
  id,
  email,
  name,
  role,
  company,
  created_at
FROM users
WHERE role IN ('admin', 'super_admin')
ORDER BY created_at DESC;

-- 2. CHECK REGULAR USERS (STUDENTS)
SELECT 
  '=== STUDENT USERS ===' as section,
  id,
  email,
  name,
  role,
  company,
  created_at
FROM users
WHERE role = 'user' OR role IS NULL
ORDER BY created_at DESC
LIMIT 5;

-- 3. CHECK RECENT NOTIFICATIONS (LAST 24 HOURS)
SELECT 
  '=== RECENT NOTIFICATIONS ===' as section,
  id,
  title,
  message,
  notification_type,
  sender_id,
  target_company,
  target_role,
  is_global,
  created_at
FROM notifications
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- 4. CHECK NOTIFICATION LOGS (WHO RECEIVED WHAT)
SELECT 
  '=== NOTIFICATION LOGS ===' as section,
  nl.id,
  nl.notification_id,
  nl.recipient_id,
  u.email as recipient_email,
  u.role as recipient_role,
  nl.status,
  nl.attempted_at,
  n.title,
  n.notification_type
FROM notification_logs nl
JOIN users u ON nl.recipient_id = u.id
JOIN notifications n ON nl.notification_id = n.id
WHERE nl.attempted_at > NOW() - INTERVAL '24 hours'
ORDER BY nl.attempted_at DESC;

-- 5. CHECK IF RPC FUNCTION EXISTS
SELECT 
  '=== RPC FUNCTION CHECK ===' as section,
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines
WHERE routine_name = 'create_notification_logs'
  AND routine_schema = 'public';

-- 6. CHECK REALTIME PUBLICATION
SELECT 
  '=== REALTIME PUBLICATION ===' as section,
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables
WHERE tablename IN ('notifications', 'notification_logs');

-- 7. CHECK RLS POLICIES ON NOTIFICATION_LOGS
SELECT 
  '=== RLS POLICIES ===' as section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('notifications', 'notification_logs')
ORDER BY tablename, policyname;
