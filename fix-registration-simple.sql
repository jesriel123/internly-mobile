-- ============================================================
-- SIMPLE FIX: Registration RLS Policy
-- ============================================================
-- This is the simplest fix - just update the policy and grants
-- Run this in Supabase SQL Editor

-- Step 1: Drop existing insert policy
DROP POLICY IF EXISTS users_insert_own ON users;
DROP POLICY IF EXISTS users_insert_authenticated ON users;

-- Step 2: Create a simple, permissive insert policy
-- Allow any authenticated user to insert where id = auth.uid()
CREATE POLICY users_insert_own ON users 
  FOR INSERT 
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Step 3: Ensure RLS is enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Step 4: Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Grant table permissions
GRANT INSERT ON TABLE public.users TO authenticated;
GRANT SELECT ON TABLE public.users TO authenticated;
GRANT UPDATE ON TABLE public.users TO authenticated;

-- Grant permissions on other tables that might be needed
GRANT SELECT ON TABLE public.companies TO authenticated;
GRANT SELECT ON TABLE public.companies TO anon;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Step 5: Verify the policy was created
-- Run this to check (uncomment to use):
-- SELECT schemaname, tablename, policyname, cmd, roles, with_check 
-- FROM pg_policies 
-- WHERE tablename = 'users' AND policyname = 'users_insert_own';

-- Expected result:
-- schemaname | tablename | policyname        | cmd    | roles           | with_check
-- public     | users     | users_insert_own  | INSERT | {authenticated} | (id = auth.uid())
