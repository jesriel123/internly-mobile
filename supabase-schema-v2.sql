-- ============================================================
-- Internly - Clean Supabase Schema (with Supabase Auth)
-- Run this in Supabase SQL Editor to set up fresh database
-- ============================================================

-- Drop existing tables if starting fresh
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS time_logs CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role();

-- Users table (linked to Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
  student_id TEXT,
  program TEXT,
  year_level TEXT,
  section TEXT,
  company TEXT,
  company_address TEXT,
  supervisor TEXT,
  start_date TEXT,
  end_date TEXT,
  photo_url TEXT,
  required_hours NUMERIC DEFAULT 486,
  daily_max_hours NUMERIC DEFAULT 8,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time logs
CREATE TABLE time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time_in TIMESTAMPTZ,
  time_out TIMESTAMPTZ,
  hours NUMERIC,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  log_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Companies
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  required_hours NUMERIC DEFAULT 486,
  daily_max_hours NUMERIC DEFAULT 8,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings
CREATE TABLE settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  default_required_hours NUMERIC DEFAULT 486,
  default_daily_max_hours NUMERIC DEFAULT 8,
  holidays JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT,
  user_role TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default settings
INSERT INTO settings (id, default_required_hours, default_daily_max_hours, holidays)
VALUES ('global', 486, 8, '[]')
ON CONFLICT (id) DO NOTHING;

-- Indexes
CREATE INDEX idx_time_logs_user_id ON time_logs(user_id);
CREATE INDEX idx_time_logs_date ON time_logs(date);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================
-- Helper function: get current user's role (bypasses RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USERS policies
-- ============================================================
CREATE POLICY users_select_own ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY users_select_admins ON users FOR SELECT USING (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY users_insert_own ON users FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY users_update_own ON users FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY users_update_admins ON users FOR UPDATE USING (get_user_role() IN ('admin', 'super_admin')) WITH CHECK (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY users_delete_admins ON users FOR DELETE USING (get_user_role() = 'super_admin');

-- ============================================================
-- TIME_LOGS policies
-- ============================================================
CREATE POLICY logs_select_own ON time_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY logs_select_admins ON time_logs FOR SELECT USING (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY logs_insert_own ON time_logs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY logs_update_own ON time_logs FOR UPDATE USING (user_id = auth.uid() AND status = 'pending') WITH CHECK (user_id = auth.uid());
CREATE POLICY logs_update_admins ON time_logs FOR UPDATE USING (get_user_role() IN ('admin', 'super_admin')) WITH CHECK (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY logs_delete_admins ON time_logs FOR DELETE USING (get_user_role() IN ('admin', 'super_admin'));

-- ============================================================
-- COMPANIES policies
-- ============================================================
CREATE POLICY companies_select_all ON companies FOR SELECT USING (true);
CREATE POLICY companies_insert_admins ON companies FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY companies_update_admins ON companies FOR UPDATE USING (get_user_role() IN ('admin', 'super_admin')) WITH CHECK (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY companies_delete_admins ON companies FOR DELETE USING (get_user_role() IN ('admin', 'super_admin'));

-- ============================================================
-- SETTINGS policies
-- ============================================================
CREATE POLICY settings_select_all ON settings FOR SELECT USING (true);
CREATE POLICY settings_update_admins ON settings FOR UPDATE USING (get_user_role() IN ('admin', 'super_admin')) WITH CHECK (get_user_role() IN ('admin', 'super_admin'));

-- ============================================================
-- AUDIT_LOGS policies
-- ============================================================
CREATE POLICY audit_select_admins ON audit_logs FOR SELECT USING (get_user_role() IN ('admin', 'super_admin'));
CREATE POLICY audit_insert_all ON audit_logs FOR INSERT WITH CHECK (true);
