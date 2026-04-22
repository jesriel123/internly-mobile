-- ============================================================
-- FIX: Companies Not Showing in Mobile App
-- ============================================================
-- This grants SELECT permission to anon users for companies table
-- Required for mobile app registration where users are not yet authenticated
-- ============================================================

-- Grant SELECT permission on companies table to anon role
GRANT SELECT ON TABLE public.companies TO anon;

-- Grant SELECT permission on companies table to authenticated role (just in case)
GRANT SELECT ON TABLE public.companies TO authenticated;

-- Verify the grants were applied
SELECT 
  grantee, 
  privilege_type,
  table_name
FROM information_schema.role_table_grants 
WHERE table_name = 'companies' 
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- ============================================================
-- EXPLANATION:
-- ============================================================
-- The mobile app fetches companies during registration BEFORE the user
-- is authenticated. Even though the RLS policy says USING (true), 
-- PostgreSQL still requires explicit GRANT permissions for the anon role.
--
-- RLS Policy: companies_select_all USING (true) 
--   -> Allows anyone to SELECT if they have permission
--
-- GRANT: GRANT SELECT ON companies TO anon
--   -> Gives anon role the permission to execute SELECT
--
-- Both are needed for unauthenticated users to read companies!
-- ============================================================

-- Test query (should return FORBES and TITAN)
SELECT name, address, required_hours FROM companies ORDER BY name;
