-- ============================================================
-- FINAL FIX: Registration RLS Policy Issue
-- ============================================================
-- Run this in your Supabase SQL Editor to fix the registration error
-- "new row violates row-level security policy for table 'users'"

-- Step 1: Drop the existing restrictive insert policy
DROP POLICY IF EXISTS users_insert_own ON users;

-- Step 2: Create a new policy that explicitly allows authenticated users
-- to insert their own profile during registration
-- Using 'authenticated' role and checking id = auth.uid()
CREATE POLICY users_insert_own ON users 
  FOR INSERT 
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Step 3: Verify RLS is enabled (should already be enabled)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Step 4: Grant necessary permissions to authenticated users
-- These grants ensure the authenticated role can perform operations
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT INSERT ON TABLE public.users TO authenticated;
GRANT SELECT ON TABLE public.users TO authenticated;
GRANT UPDATE ON TABLE public.users TO authenticated;

-- Step 5: Ensure the get_user_role function is accessible
-- This function is used by other policies
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

-- Verification queries (optional - run these to check):
-- SELECT * FROM pg_policies WHERE tablename = 'users';
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = 'users';
