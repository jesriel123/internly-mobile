-- ============================================================
-- COMPLETE FIX: Companies Not Showing in Mobile App
-- ============================================================
-- This is the COMPLETE solution - run ALL of this
-- ============================================================

-- Step 1: Ensure RLS is enabled (should already be)
-- ============================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;


-- Step 2: Drop and recreate the SELECT policy to ensure it's correct
-- ============================================================
DROP POLICY IF EXISTS companies_select_all ON companies;

CREATE POLICY companies_select_all 
ON companies 
FOR SELECT 
USING (true);


-- Step 3: Grant necessary permissions to anon and authenticated roles
-- ============================================================
-- This is the CRITICAL part that's missing!

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant SELECT on companies table
GRANT SELECT ON TABLE public.companies TO anon;
GRANT SELECT ON TABLE public.companies TO authenticated;


-- Step 4: Verify everything is set up correctly
-- ============================================================
SELECT '=== VERIFICATION ===' as status;

-- Check companies exist
SELECT 'Companies in database:' as check_type, COUNT(*) as count 
FROM companies;

-- Check RLS policies
SELECT 'RLS Policies:' as check_type, policyname, cmd 
FROM pg_policies 
WHERE tablename = 'companies';

-- Check grants
SELECT 'GRANT Permissions:' as check_type, grantee, privilege_type
FROM information_schema.role_table_grants 
WHERE table_name = 'companies' 
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;


-- Step 5: Test as anon user (this simulates the mobile app)
-- ============================================================
SELECT '=== TEST AS ANON USER ===' as status;
SET ROLE anon;
SELECT name, address, required_hours FROM companies ORDER BY name;
RESET ROLE;

-- ============================================================
-- If Step 5 returns FORBES and TITAN, the fix is successful!
-- Now refresh your mobile app and the companies should appear.
-- ============================================================
