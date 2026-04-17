-- ============================================================
-- COMPLETE FIX: Registration RLS Policy Issue
-- ============================================================
-- This is a comprehensive fix that addresses all possible causes
-- Run this ENTIRE script in your Supabase SQL Editor

-- ============================================================
-- STEP 1: Clean up existing policies
-- ============================================================
DROP POLICY IF EXISTS users_insert_own ON users;
DROP POLICY IF EXISTS users_insert_authenticated ON users;

-- ============================================================
-- STEP 2: Create a permissive insert policy
-- ============================================================
-- This allows any authenticated user to insert a row where id matches their auth.uid()
CREATE POLICY users_insert_own ON users 
  FOR INSERT 
  TO authenticated
  WITH CHECK (id = auth.uid());

-- ============================================================
-- STEP 3: Grant all necessary permissions
-- ============================================================
-- Grant schema access
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Grant table permissions
GRANT ALL ON TABLE public.users TO authenticated;
GRANT SELECT ON TABLE public.users TO anon;

-- Grant sequence permissions (for any auto-generated IDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant function execution
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon;

-- ============================================================
-- STEP 4: Ensure RLS is enabled
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 5: Create a helper function for registration (ALTERNATIVE APPROACH)
-- ============================================================
-- This function bypasses RLS and can be called during registration
CREATE OR REPLACE FUNCTION public.create_user_profile(
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  user_role TEXT DEFAULT 'user',
  student_id TEXT DEFAULT '',
  program TEXT DEFAULT '',
  year_level TEXT DEFAULT '',
  section TEXT DEFAULT '',
  company TEXT DEFAULT '',
  company_address TEXT DEFAULT '',
  supervisor TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  required_hours NUMERIC DEFAULT 486,
  daily_max_hours NUMERIC DEFAULT 8
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert the user profile, bypassing RLS
  INSERT INTO public.users (
    id, email, name, role, student_id, program, year_level, section,
    company, company_address, supervisor, start_date, 
    required_hours, daily_max_hours
  ) VALUES (
    user_id, user_email, user_name, user_role, student_id, program, 
    year_level, section, company, company_address, supervisor, start_date,
    required_hours, daily_max_hours
  );
END;
$$;

-- Grant execute permission on the helper function
GRANT EXECUTE ON FUNCTION public.create_user_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_profile TO anon;

-- ============================================================
-- STEP 6: Verification queries
-- ============================================================
-- Run these to verify the fix (uncomment to use):

-- Check policies
-- SELECT schemaname, tablename, policyname, cmd, roles, with_check 
-- FROM pg_policies 
-- WHERE tablename = 'users';

-- Check grants
-- SELECT grantee, privilege_type 
-- FROM information_schema.role_table_grants 
-- WHERE table_name = 'users';

-- Check functions
-- SELECT routine_name, routine_type 
-- FROM information_schema.routines 
-- WHERE routine_schema = 'public' 
-- AND routine_name IN ('create_user_profile', 'get_user_role');
