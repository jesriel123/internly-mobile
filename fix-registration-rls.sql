-- ============================================================
-- Fix Registration RLS Policy Issue
-- ============================================================
-- This fixes the "new row violates row-level security policy" error
-- during user registration by allowing authenticated users to insert
-- their own profile during signup.

-- Drop the existing restrictive insert policy
DROP POLICY IF EXISTS users_insert_own ON users;

-- Create a new policy that allows inserts during registration
-- This allows any authenticated user to insert a row where the id matches their auth.uid()
CREATE POLICY users_insert_own ON users 
  FOR INSERT 
  WITH CHECK (
    -- Allow insert if the id matches the authenticated user's id
    id = auth.uid()
  );

-- Alternative: If the above doesn't work due to timing issues,
-- you can use this more permissive policy that allows any authenticated user
-- to insert their profile (uncomment if needed):

-- DROP POLICY IF EXISTS users_insert_own ON users;
-- CREATE POLICY users_insert_authenticated ON users 
--   FOR INSERT 
--   WITH CHECK (
--     auth.role() = 'authenticated' AND id = auth.uid()
--   );
