-- ============================================
-- RESTORE jejsmfkeos@gmail.com ACCOUNT
-- ============================================

-- Step 1: Check if user exists in auth.users
SELECT 
  id,
  email,
  created_at,
  email_confirmed_at
FROM auth.users
WHERE email = 'jejsmfkeos@gmail.com';

-- Step 2: Check if user exists in public.users
SELECT 
  id,
  email,
  name,
  role,
  company
FROM users
WHERE email = 'jejsmfkeos@gmail.com';

-- Step 3: If user exists in auth.users but NOT in public.users, restore it
-- IMPORTANT: Replace 'YOUR_AUTH_USER_ID' with the actual ID from Step 1
-- IMPORTANT: Replace 'YOUR_COMPANY_NAME' with your company name (e.g., 'TITAN', 'Default Company', etc.)

INSERT INTO users (
  id,
  email,
  name,
  role,
  company,
  company_address,
  supervisor,
  program,
  year_level,
  section,
  student_id,
  start_date,
  end_date,
  required_hours,
  daily_max_hours,
  created_at,
  updated_at
)
VALUES (
  'YOUR_AUTH_USER_ID',  -- PALITAN MO TO NG ID FROM STEP 1
  'jejsmfkeos@gmail.com',
  'Jesriel Coligado',  -- PALITAN MO TO NG PANGALAN MO
  'user',
  'YOUR_COMPANY_NAME',  -- PALITAN MO TO NG COMPANY NAME MO
  '',
  '',
  '',
  '',
  '',
  '',
  NULL,
  NULL,
  486,
  8,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  company = EXCLUDED.company,
  updated_at = NOW();

-- Step 4: Verify the user was restored
SELECT 
  id,
  email,
  name,
  role,
  company,
  created_at
FROM users
WHERE email = 'jejsmfkeos@gmail.com';
