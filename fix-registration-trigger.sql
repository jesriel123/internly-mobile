-- ============================================================
-- Fix Registration with Database Trigger Approach
-- ============================================================
-- This creates a trigger that automatically creates a user profile
-- when a new auth user is created, avoiding RLS issues entirely.

-- First, let's update the RLS policy to be more explicit
DROP POLICY IF EXISTS users_insert_own ON users;

-- Allow inserts for authenticated users where id matches auth.uid()
CREATE POLICY users_insert_own ON users 
  FOR INSERT 
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Create a function to handle new user creation via trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Pull profile data from auth metadata and create the public.users row.
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    CASE 
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', '') IN ('admin', 'super_admin') THEN 'super_admin'
      ELSE 'user'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;
