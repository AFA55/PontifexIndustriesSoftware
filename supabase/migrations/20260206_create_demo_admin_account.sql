-- Create demo admin account for demonstrations
-- This account has limited access to specific features only

DO $$
DECLARE
  demo_admin_id UUID;
BEGIN
  -- Check if demo admin already exists
  SELECT id INTO demo_admin_id
  FROM auth.users
  WHERE email = 'admin@demo.com';

  -- If doesn't exist, create it
  IF demo_admin_id IS NULL THEN
    -- Create auth user
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'admin@demo.com',
      crypt('DemoAdmin123!', gen_salt('bf')), -- Password: DemoAdmin123!
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Demo Admin"}',
      false,
      '',
      '',
      '',
      ''
    )
    RETURNING id INTO demo_admin_id;

    -- Create profile
    INSERT INTO profiles (
      id,
      email,
      full_name,
      role,
      active,
      created_at,
      updated_at
    ) VALUES (
      demo_admin_id,
      'admin@demo.com',
      'Demo Admin',
      'admin',
      true,
      NOW(),
      NOW()
    );

    RAISE NOTICE 'Demo admin account created successfully';
  ELSE
    RAISE NOTICE 'Demo admin account already exists';
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN profiles.email IS 'User email address. Demo accounts use *@demo.com pattern';
