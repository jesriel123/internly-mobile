-- ============================================================
-- ULTIMATE FIX: Registration AND Login Issues
-- ============================================================
-- This fixes BOTH registration RLS policy AND login issues
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================================

-- PART 1: FIX REGISTRATION RLS POLICY
-- ============================================================

-- Drop old policy
DROP POLICY IF EXISTS users_insert_own ON users;

-- Create correct policy for registration
CREATE POLICY users_insert_own ON users 
  FOR INSERT 
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Grant all necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON TABLE public.users TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.users TO authenticated;
GRANT SELECT ON TABLE public.companies TO anon, authenticated;
GRANT INSERT ON TABLE public.audit_logs TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- PART 2: CHECK AND RESTORE MISSING USERS
-- ============================================================

-- Find users in auth.users but NOT in public.users
SELECT 
  '=== USERS IN AUTH BUT NOT IN DATABASE ===' as section,
  au.id,
  au.email,
  au.created_at
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
WHERE pu.id IS NULL
ORDER BY au.created_at DESC;

-- PART 3: RESTORE SPECIFIC USER (jejsmfkeos@gmail.com)
-- ============================================================

-- First, get the auth user ID
DO $$
DECLARE
  v_auth_user_id uuid;
  v_email text := 'jejsmfkeos@gmail.com';
BEGIN
  -- Get the auth user ID
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE email = v_email;
  
  IF v_auth_user_id IS NOT NULL THEN
    -- Insert or update the user profile
    INSERT INTO public.users (
      id,
      email,
      name,
      role,
      company,
      required_hours,
      daily_max_hours,
      created_at,
      updated_at
    )
    VALUES (
      v_auth_user_id,
      v_email,
      'Jesriel Coligado',  -- Change this if needed
      'user',
      'TITAN',  -- Change this to match your company
      486,
      8,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      company = EXCLUDED.company,
      updated_at = NOW();
    
    RAISE NOTICE 'User % restored successfully', v_email;
  ELSE
    RAISE NOTICE 'User % not found in auth.users', v_email;
  END IF;
END $$;

-- PART 4: VERIFY THE FIX
-- ============================================================

-- Check RLS policy
SELECT 
  '=== RLS POLICY CHECK ===' as section,
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  with_check
FROM pg_policies
WHERE tablename = 'users' AND policyname = 'users_insert_own';

-- Check grants
SELECT 
  '=== GRANTS CHECK ===' as section,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'users' AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- Check restored user
SELECT 
  '=== RESTORED USER CHECK ===' as section,
  id,
  email,
  name,
  role,
  company,
  created_at
FROM public.users
WHERE email = 'jejsmfkeos@gmail.com';

-- ============================================================
-- DONE! Now try:
-- 1. Login with jejsmfkeos@gmail.com (should work now)
-- 2. Or register a new account (should work now)
-- ============================================================
