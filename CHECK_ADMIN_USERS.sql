-- Check if there are admin users in the database
SELECT 
  id,
  email,
  name,
  role,
  company,
  created_at
FROM users
WHERE role IN ('admin', 'super_admin')
ORDER BY created_at DESC;

-- Check recent notifications
SELECT 
  id,
  title,
  message,
  notification_type,
  sender_id,
  target_company,
  target_role,
  created_at
FROM notifications
ORDER BY created_at DESC
LIMIT 10;

-- Check notification logs (who received what)
SELECT 
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
ORDER BY nl.attempted_at DESC
LIMIT 20;
