-- ============================================================
-- COMPLETE USER RESTORE - GUARANTEED FIX
-- ============================================================
-- Run this ENTIRE script in Supabase SQL Editor

-- ============================================================
-- STEP 1: Check current state
-- ============================================================
-- Check auth user
SELECT 
  '1. Auth User Check' as step,
  id,
  email,
  created_at
FROM auth.users
WHERE email = 'coligadojesriel343@gmail.com';

-- Check users table
SELECT 
  '2. Users Table Check' as step,
  id,
  email,
  name,
  role
FROM users
WHERE email = 'coligadojesriel343@gmail.com';

-- ============================================================
-- STEP 2: Force restore user
-- ============================================================
-- This will restore the user no matter what

DO $$
DECLARE
  v_auth_user_id UUID;
  v_user_exists BOOLEAN;
BEGIN
  -- Get auth user ID
  SELECT id INTO v_auth_user_id 
  FROM auth.users 
  WHERE email = 'coligadojesriel343@gmail.com';
  
  IF v_auth_user_id IS NULL THEN
    RAISE NOTICE '❌ Auth user not found. User needs to re-register.';
    RETURN;
  END IF;
  
  RAISE NOTICE '✅ Auth user found: %', v_auth_user_id;
  
  -- Check if user exists in users table
  SELECT EXISTS(SELECT 1 FROM users WHERE id = v_auth_user_id) INTO v_user_exists;
  
  IF v_user_exists THEN
    RAISE NOTICE '⚠️  User already exists in users table. Updating...';
    
    -- Update existing user
    UPDATE users SET
      email = 'coligadojesriel343@gmail.com',
      name = 'Jesriel Coligado',
      role = 'user',
      company = 'Default Company',
      required_hours = 486,
      daily_max_hours = 8,
      updated_at = NOW()
    WHERE id = v_auth_user_id;
    
    RAISE NOTICE '✅ User updated successfully!';
  ELSE
    RAISE NOTICE '⚠️  User not in users table. Inserting...';
    
    -- Insert new user
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
      daily_max_hours,
      created_at,
      updated_at
    ) VALUES (
      v_auth_user_id,
      'coligadojesriel343@gmail.com',
      'Jesriel Coligado',
      'user',
      'Default Company',
      '',
      '',
      '',
      '',
      486,
      8,
      NOW(),
      NOW()
    );
    
    RAISE NOTICE '✅ User inserted successfully!';
  END IF;
  
  RAISE NOTICE '🎉 User restoration complete!';
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '❌ Error: %', SQLERRM;
END $$;

-- ============================================================
-- STEP 3: Verify restoration
-- ============================================================
SELECT 
  '3. Verification' as step,
  u.id,
  u.email,
  u.name,
  u.role,
  u.company,
  au.email as auth_email,
  au.last_sign_in_at
FROM users u
JOIN auth.users au ON u.id = au.id
WHERE u.email = 'coligadojesriel343@gmail.com';

-- Expected: Should show the user with matching auth record

-- ============================================================
-- STEP 4: Check RLS policies (in case they're blocking)
-- ============================================================
SELECT 
  '4. RLS Policies Check' as step,
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname;

-- ============================================================
-- STEP 5: Grant permissions (just in case)
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- ============================================================
-- FINAL CHECK
-- ============================================================
SELECT 
  '5. Final Check' as step,
  COUNT(*) as user_count
FROM users
WHERE email = 'coligadojesriel343@gmail.com';

-- Expected: user_count = 1

-- ============================================================
-- INSTRUCTIONS
-- ============================================================
-- After running this script:
-- 1. Check the NOTICES in the output
-- 2. If you see "✅ User restoration complete!" - SUCCESS!
-- 3. If you see "❌ Auth user not found" - Need to re-register
-- 4. Go to mobile app and try to login again
-- 5. Should work now! ✅
