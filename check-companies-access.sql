-- ============================================================
-- CHECK COMPANIES ACCESS FOR MOBILE APP
-- ============================================================
-- Run this in Supabase SQL Editor to verify companies access
-- ============================================================

-- 1. Check if companies table has data
SELECT 'Companies in database:' as check_type, COUNT(*) as count FROM companies;
SELECT * FROM companies ORDER BY name;

-- 2. Check RLS policies on companies table
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  cmd, 
  roles, 
  qual,
  with_check 
FROM pg_policies 
WHERE tablename = 'companies'
ORDER BY policyname;

-- 3. Check grants for anon and authenticated roles
SELECT 
  grantee, 
  privilege_type,
  table_name
FROM information_schema.role_table_grants 
WHERE table_name = 'companies' 
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- 4. Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'companies';

-- ============================================================
-- EXPECTED RESULTS:
-- ============================================================
-- 1. Should show FORBES and TITAN companies
-- 2. Should show policy: companies_select_all with USING (true)
-- 3. Should show:
--    - anon: SELECT
--    - authenticated: SELECT
-- 4. Should show rls_enabled = true
-- ============================================================
