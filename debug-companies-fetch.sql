-- ============================================================
-- DEBUG: Check Companies Access for Mobile App
-- ============================================================
-- Run each section one by one to diagnose the issue
-- ============================================================

-- SECTION 1: Check if companies exist in database
-- ============================================================
SELECT 'Step 1: Companies in database' as step;
SELECT id, name, address, required_hours, created_at 
FROM companies 
ORDER BY name;


-- SECTION 2: Check RLS is enabled
-- ============================================================
SELECT 'Step 2: RLS Status' as step;
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'companies';


-- SECTION 3: Check RLS policies
-- ============================================================
SELECT 'Step 3: RLS Policies' as step;
SELECT 
  policyname, 
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'companies'
ORDER BY policyname;


-- SECTION 4: Check GRANT permissions
-- ============================================================
SELECT 'Step 4: GRANT Permissions' as step;
SELECT 
  grantee, 
  privilege_type
FROM information_schema.role_table_grants 
WHERE table_name = 'companies' 
  AND grantee IN ('anon', 'authenticated', 'postgres')
ORDER BY grantee, privilege_type;


-- SECTION 5: Test as anon user (simulate mobile app)
-- ============================================================
SELECT 'Step 5: Test SELECT as anon' as step;
SET ROLE anon;
SELECT name, address FROM companies ORDER BY name;
RESET ROLE;


-- ============================================================
-- EXPECTED RESULTS:
-- ============================================================
-- Step 1: Should show FORBES and TITAN
-- Step 2: rls_enabled should be 't' (true)
-- Step 3: Should show companies_select_all policy
-- Step 4: Should show anon with SELECT privilege
-- Step 5: Should return FORBES and TITAN (if permissions are correct)
--         If this fails, permissions are not set correctly
-- ============================================================
