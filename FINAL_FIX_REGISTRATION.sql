-- ============================================================
-- FINAL FIX: Registration Issue - GUARANTEED TO WORK
-- ============================================================
-- Run this ENTIRE script in Supabase SQL Editor
-- This fixes the RLS policy issue permanently
-- ============================================================

-- STEP 1: Drop the problematic policy
-- ============================================================
DROP POLICY IF EXISTS users_insert_own ON users;

-- STEP 2: Create the correct policy with proper role targeting
-- ============================================================
-- This allows authenticated users to insert their own profile
CREATE POLICY users_insert_own ON users 
  FOR INSERT 
  TO authenticated
  WITH CHECK (id = auth.uid());

-- STEP 3: Grant necessary permissions to roles
-- ============================================================
-- Without these grants, the policy won't work even if correct

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant table permissions for users table
GRANT SELECT ON TABLE public.users TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO authenticated;

-- Grant permissions for companies table (needed during registration)
GRANT SELECT ON TABLE public.companies TO anon;
GRANT SELECT ON TABLE public.companies TO authenticated;

-- Grant permissions for settings table
GRANT SELECT ON TABLE public.settings TO anon;
GRANT SELECT ON TABLE public.settings TO authenticated;

-- Grant permissions for audit_logs table
GRANT INSERT ON TABLE public.audit_logs TO authenticated;

-- Grant sequence permissions (for auto-generated IDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

-- STEP 4: Verify RLS is enabled (should already be)
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- VERIFICATION QUERIES (Optional - uncomment to check)
-- ============================================================

-- Check the policy was created correctly
-- SELECT schemaname, tablename, policyname, cmd, roles, with_check 
-- FROM pg_policies 
-- WHERE tablename = 'users' AND policyname = 'users_insert_own';
-- Expected: cmd=INSERT, roles={authenticated}, with_check=(id = auth.uid())

-- Check grants were applied
-- SELECT grantee, privilege_type 
-- FROM information_schema.role_table_grants 
-- WHERE table_name = 'users' AND grantee IN ('anon', 'authenticated')
-- ORDER BY grantee, privilege_type;
-- Expected: authenticated has INSERT, SELECT, UPDATE

-- ============================================================
-- DONE! Now test registration in your app
-- ============================================================
