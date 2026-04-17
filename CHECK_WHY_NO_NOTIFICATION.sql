-- ============================================================
-- CHECK WHY NO NOTIFICATION AFTER CLOCK IN
-- ============================================================

-- 1. Check if there are admin users
SELECT 
  '=== ADMIN USERS ===' as section,
  id,
  email,
  name,
  role,
  company
FROM users
WHERE role IN ('admin', 'super_admin')
ORDER BY created_at DESC;

-- 2. Check the user who clocked in (Jesriel Coligado)
SELECT 
  '=== CLOCKED IN USER ===' as section,
  id,
  email,
  name,
  role,
  company
FROM users
WHERE email = 'jejsmfkeos@gmail.com' OR name LIKE '%Jesriel%';

-- 3. Check recent time logs (last 1 hour)
SELECT 
  '=== RECENT TIME LOGS ===' as section,
  id,
  user_id,
  date,
  time_in,
  time_out,
  status,
  created_at
FROM time_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- 4. Check recent notifications (last 1 hour)
SELECT 
  '=== RECENT NOTIFICATIONS ===' as section,
  id,
  title,
  message,
  notification_type,
  sender_id,
  target_company,
  target_role,
  created_at
FROM notifications
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- 5. Check notification logs (last 1 hour)
SELECT 
  '=== RECENT NOTIFICATION LOGS ===' as section,
  nl.id,
  nl.notification_id,
  nl.recipient_id,
  u.email as recipient_email,
  u.role as recipient_role,
  u.company as recipient_company,
  nl.status,
  nl.attempted_at,
  n.title,
  n.notification_type
FROM notification_logs nl
LEFT JOIN users u ON nl.recipient_id = u.id
LEFT JOIN notifications n ON nl.notification_id = n.id
WHERE nl.attempted_at > NOW() - INTERVAL '1 hour'
ORDER BY nl.attempted_at DESC;

-- 6. Check audit logs for clock in (last 1 hour)
SELECT 
  '=== RECENT AUDIT LOGS ===' as section,
  id,
  user_id,
  user_name,
  action,
  details,
  created_at
FROM audit_logs
WHERE action IN ('CLOCK_IN', 'CLOCK_OUT')
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- ============================================================
-- ANALYSIS:
-- If ADMIN USERS = 0: No one to receive notifications
-- If RECENT NOTIFICATIONS = 0: Notification creation failed
-- If RECENT NOTIFICATION LOGS = 0: No recipients were assigned
-- If companies don't match: Admin won't receive notification
-- ============================================================
