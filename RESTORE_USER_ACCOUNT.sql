-- ============================================================
-- RESTORE USER ACCOUNT
-- ============================================================
-- This restores the deleted user account

-- ============================================================
-- STEP 1: Check if auth user exists
-- ============================================================
SELECT 
  'Auth User Check' as check_type,
  id,
  email,
  created_at,
  last_sign_in_at
FROM auth.users
WHERE email = 'coligadojesriel343@gmail.com';

-- If this returns a result, the auth user exists
-- Copy the ID for next step

-- ============================================================
-- STEP 2: Check if user exists in users table
-- ============================================================
SELECT 
  'Users Table Check' as check_type,
  id,
  email,
  name,
  role
FROM users
WHERE email = 'coligadojesriel343@gmail.com';

-- If this is EMPTY, user was deleted from users table

-- ============================================================
-- STEP 3: Restore user to users table
-- ============================================================
-- Replace 'AUTH_USER_ID_HERE' with the ID from STEP 1

INSERT INTO users (
  id,
  email,
  name,
  role,
  company,
  student_id,
  program,
  year_level,
  section,
  required_hours,
  daily_max_hours
) VALUES (
  'AUTH_USER_ID_HERE',  -- REPLACE with ID from STEP 1
  'coligadojesriel343@gmail.com',
  'Jesriel Coligado',
  'user',  -- or 'super_admin' if you want admin access
  'Your Company',
  '',
  '',
  '',
  '',
  486,
  8
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  updated_at = NOW();

-- ============================================================
-- STEP 4: Verify restoration
-- ============================================================
SELECT 
  'Verification' as check_type,
  u.id,
  u.email,
  u.name,
  u.role,
  au.last_sign_in_at
FROM users u
JOIN auth.users au ON u.id = au.id
WHERE u.email = 'coligadojesriel343@gmail.com';

-- Should show the restored user

-- ============================================================
-- ALTERNATIVE: If auth user was also deleted
-- ============================================================
-- If STEP 1 returns empty, both auth and users were deleted
-- You need to re-register:
-- 1. Open mobile app
-- 2. Tap "Create one"
-- 3. Fill in registration form
-- 4. Submit

-- ============================================================
-- QUICK FIX: Restore with auto-generated values
-- ============================================================
-- If you just want to quickly restore without checking:

-- First, get the auth user ID:
DO $$
DECLARE
  auth_user_id UUID;
BEGIN
  SELECT id INTO auth_user_id 
  FROM auth.users 
  WHERE email = 'coligadojesriel343@gmail.com';
  
  IF auth_user_id IS NOT NULL THEN
    INSERT INTO users (
      id,
      email,
      name,
      role,
      company,
      required_hours,
      daily_max_hours
    ) VALUES (
      auth_user_id,
      'coligadojesriel343@gmail.com',
      'Jesriel Coligado',
      'user',
      'Default Company',
      486,
      8
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      updated_at = NOW();
    
    RAISE NOTICE 'User restored successfully!';
  ELSE
    RAISE NOTICE 'Auth user not found. Please re-register.';
  END IF;
END $$;
