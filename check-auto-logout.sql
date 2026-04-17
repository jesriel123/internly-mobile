-- ============================================================
-- Diagnose Auto Logout Issue
-- ============================================================
-- Run this in Supabase SQL Editor to find out why auto logout happened

-- ============================================================
-- STEP 1: Check if user exists in users table
-- ============================================================
SELECT 
  'Users Table Check' as check_type,
  id, 
  email, 
  name, 
  role,
  company,
  created_at,
  updated_at
FROM users 
WHERE email LIKE '%jesriel%' OR name LIKE '%jesriel%'
ORDER BY created_at DESC;

-- Expected: Should return your user record
-- If empty: User was deleted from database!

-- ============================================================
-- STEP 2: Check if auth user exists
-- ============================================================
SELECT 
  'Auth Users Check' as check_type,
  id,
  email,
  created_at,
  last_sign_in_at,
  confirmed_at
FROM auth.users
WHERE email LIKE '%jesriel%'
ORDER BY created_at DESC;

-- Expected: Should return auth record
-- If empty: Auth user was deleted - need to re-register

-- ============================================================
-- STEP 3: Check all users (to see who's in database)
-- ============================================================
SELECT 
  'All Users' as check_type,
  id,
  email,
  name,
  role,
  company
FROM users
ORDER BY created_at DESC
LIMIT 10;

-- This shows all users in database

-- ============================================================
-- STEP 4: Check recent audit logs for deletions
-- ============================================================
SELECT 
  'Recent Audit Logs' as check_type,
  user_name,
  action,
  details,
  created_at
FROM audit_logs
WHERE action LIKE '%DELETE%' OR details LIKE '%delete%'
ORDER BY created_at DESC
LIMIT 10;

-- This shows if someone deleted users recently

-- ============================================================
-- STEP 5: Check auth sessions
-- ============================================================
SELECT 
  'Auth Sessions' as check_type,
  user_id,
  created_at,
  updated_at,
  expires_at
FROM auth.sessions
WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%jesriel%')
ORDER BY created_at DESC
LIMIT 5;

-- This shows active sessions

-- ============================================================
-- DIAGNOSIS RESULTS
-- ============================================================
-- Based on results above:
--
-- If STEP 1 is EMPTY but STEP 2 has data:
--   → User deleted from users table but auth still exists
--   → Solution: Restore user to users table
--
-- If STEP 1 and STEP 2 are BOTH EMPTY:
--   → User completely deleted
--   → Solution: Re-register
--
-- If STEP 1 and STEP 2 have data:
--   → User exists, might be session expiration
--   → Solution: Check session settings
--
-- If STEP 4 shows DELETE actions:
--   → Someone deleted the user
--   → Solution: Restore and investigate who deleted

-- ============================================================
-- RESTORE USER (if needed)
-- ============================================================
-- If user exists in auth.users but not in users table:

-- First, get the auth user ID from STEP 2 results
-- Then uncomment and run this (replace values):

-- INSERT INTO users (
--   id,
--   email,
--   name,
--   role,
--   company,
--   student_id,
--   program,
--   year_level
-- ) VALUES (
--   'auth-user-id-from-step-2',  -- Replace with actual ID
--   'jesriel@example.com',       -- Replace with actual email
--   'Jesriel',                   -- Replace with actual name
--   'user',                      -- or 'super_admin'
--   'YourCompany',               -- Replace with company
--   '',                          -- Student ID if applicable
--   '',                          -- Program if applicable
--   ''                           -- Year level if applicable
-- );

-- ============================================================
-- VERIFY RESTORATION
-- ============================================================
-- After restoring, run this to verify:

-- SELECT 
--   u.id,
--   u.email,
--   u.name,
--   u.role,
--   au.last_sign_in_at
-- FROM users u
-- JOIN auth.users au ON u.id = au.id
-- WHERE u.email LIKE '%jesriel%';

-- Expected: Should show user with matching auth record
