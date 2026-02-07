/**
 * WORLD OF CONCRETE DEMO DATA
 * Creates testadmin and testoperator accounts with impressive demo data
 *
 * Run this in your Supabase SQL Editor
 *
 * Features:
 * - Test admin and operator accounts
 * - 7 active jobs in various states
 * - 10 completed jobs with signatures and feedback
 * - Realistic timecard data
 * - Equipment assignments
 * - Analytics-ready data
 */

-- ============================================================================
-- STEP 1: CREATE TEST USER ACCOUNTS
-- ============================================================================

-- Create testadmin@pontifex.com
DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  -- Insert into auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'testadmin@pontifex.com',
    crypt('TestAdmin123!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Test Admin"}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
  ON CONFLICT (email) DO UPDATE
  SET encrypted_password = crypt('TestAdmin123!', gen_salt('bf'))
  RETURNING id INTO admin_user_id;

  -- Insert into user_profiles
  INSERT INTO user_profiles (
    user_id,
    full_name,
    email,
    role,
    phone,
    date_of_birth,
    created_at,
    updated_at
  ) VALUES (
    admin_user_id,
    'Test Admin',
    'testadmin@pontifex.com',
    'admin',
    '555-0100',
    '1985-01-01',
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET role = 'admin', full_name = 'Test Admin';

  RAISE NOTICE 'Created testadmin@pontifex.com with ID: %', admin_user_id;
END $$;

-- Create testoperator@pontifex.com
DO $$
DECLARE
  operator_user_id UUID;
BEGIN
  -- Insert into auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'testoperator@pontifex.com',
    crypt('TestOperator123!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Test Operator"}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
  ON CONFLICT (email) DO UPDATE
  SET encrypted_password = crypt('TestOperator123!', gen_salt('bf'))
  RETURNING id INTO operator_user_id;

  -- Insert into user_profiles
  INSERT INTO user_profiles (
    user_id,
    full_name,
    email,
    role,
    phone,
    date_of_birth,
    created_at,
    updated_at
  ) VALUES (
    operator_user_id,
    'Test Operator',
    'testoperator@pontifex.com',
    'operator',
    '555-0101',
    '1990-06-15',
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET role = 'operator', full_name = 'Test Operator';

  RAISE NOTICE 'Created testoperator@pontifex.com with ID: %', operator_user_id;
END $$;

-- Create additional mock operators for schedule board
DO $$
DECLARE
  operator_id_2 UUID;
  operator_id_3 UUID;
BEGIN
  -- Operator 2: Mike Johnson
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'mike.johnson@pontifex.com', crypt('Demo1234!', gen_salt('bf')), NOW(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Mike Johnson"}',
    NOW(), NOW(), '', '', '', ''
  )
  ON CONFLICT (email) DO UPDATE SET encrypted_password = crypt('Demo1234!', gen_salt('bf'))
  RETURNING id INTO operator_id_2;

  INSERT INTO user_profiles (user_id, full_name, email, role, phone, date_of_birth, created_at, updated_at)
  VALUES (operator_id_2, 'Mike Johnson', 'mike.johnson@pontifex.com', 'operator', '555-0102', '1988-03-20', NOW(), NOW())
  ON CONFLICT (user_id) DO UPDATE SET role = 'operator';

  -- Operator 3: Sarah Martinez
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'sarah.martinez@pontifex.com', crypt('Demo1234!', gen_salt('bf')), NOW(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Sarah Martinez"}',
    NOW(), NOW(), '', '', '', ''
  )
  ON CONFLICT (email) DO UPDATE SET encrypted_password = crypt('Demo1234!', gen_salt('bf'))
  RETURNING id INTO operator_id_3;

  INSERT INTO user_profiles (user_id, full_name, email, role, phone, date_of_birth, created_at, updated_at)
  VALUES (operator_id_3, 'Sarah Martinez', 'sarah.martinez@pontifex.com', 'operator', '555-0103', '1992-11-08', NOW(), NOW())
  ON CONFLICT (user_id) DO UPDATE SET role = 'operator';

  RAISE NOTICE 'Created additional operators: Mike Johnson and Sarah Martinez';
END $$;

-- ============================================================================
-- STEP 2: CREATE ACTIVE JOBS (7 jobs in various states)
-- ============================================================================

-- Get testoperator ID for assignments
DO $$
DECLARE
  test_operator_id UUID;
  job_id_1 UUID;
  job_id_2 UUID;
  job_id_3 UUID;
  job_id_4 UUID;
  job_id_5 UUID;
  job_id_6 UUID;
  job_id_7 UUID;
BEGIN
  SELECT id INTO test_operator_id FROM auth.users WHERE email = 'testoperator@pontifex.com';

  -- Job 1: Pending (scheduled for tomorrow)
  INSERT INTO job_orders (
    job_number, title, customer_name, customer_contact, customer_email,
    job_type, location, address, description,
    assigned_to, foreman_name, foreman_phone, salesman_name, salesman_email,
    status, priority, scheduled_date, arrival_time, estimated_hours, estimated_drive_time_hours,
    job_quote, equipment_needed, special_instructions, created_at, updated_at
  ) VALUES (
    'JOB-' || to_char(NOW(), 'YYYYMMDD') || '-001',
    'Core Drilling - Downtown Plaza',
    'ABC Construction',
    'John Smith',
    'john.smith@abcconstruction.com',
    'Core Drilling',
    'Downtown Plaza Building',
    '123 Main St, Atlanta, GA 30303',
    'Core drilling on columns that have been scanned. 6 holes per column. Take 1" and 1-1/4" diameter bits. Drilling 20" deep.',
    test_operator_id,
    'James Williams',
    '678-555-0001',
    'Cameron Amos',
    'cameron.amos@pontifex.com',
    'scheduled',
    'high',
    CURRENT_DATE + INTERVAL '1 day',
    '07:00 AM',
    8.00,
    1.5,
    4500.00,
    ARRAY['Core Drill', 'Diamond Bits (1", 1-1/4")', 'Water Hose 250ft', 'Pump'],
    'Park in rear lot. Power available on site. Customer requires safety vests.',
    NOW(),
    NOW()
  ) RETURNING id INTO job_id_1;

  -- Job 2: In Route (started today)
  INSERT INTO job_orders (
    job_number, title, customer_name, customer_contact, customer_email,
    job_type, location, address, description,
    assigned_to, foreman_name, foreman_phone, salesman_name, salesman_email,
    status, priority, scheduled_date, arrival_time, estimated_hours,
    job_quote, route_started_at, created_at, updated_at
  ) VALUES (
    'JOB-' || to_char(NOW(), 'YYYYMMDD') || '-002',
    'Concrete Sawing - Parking Garage',
    'Metro Properties',
    'Lisa Chen',
    'lisa.chen@metroproperties.com',
    'Concrete Sawing',
    'Metro Parking Garage Level 3',
    '456 Peachtree St, Atlanta, GA 30308',
    'Saw cutting for expansion joints. 200 linear feet total.',
    test_operator_id,
    'Robert Davis',
    '678-555-0002',
    'Sarah Johnson',
    'sarah.johnson@pontifex.com',
    'in_route',
    'medium',
    CURRENT_DATE,
    '08:00 AM',
    6.00,
    3200.00,
    NOW() - INTERVAL '15 minutes',
    NOW(),
    NOW()
  ) RETURNING id INTO job_id_2;

  -- Job 3: In Progress (working now)
  INSERT INTO job_orders (
    job_number, title, customer_name, customer_contact, customer_email,
    job_type, location, address, description,
    assigned_to, foreman_name, foreman_phone, salesman_name, salesman_email,
    status, priority, scheduled_date, arrival_time, estimated_hours,
    job_quote, route_started_at, work_started_at, created_at, updated_at
  ) VALUES (
    'JOB-' || to_char(NOW(), 'YYYYMMDD') || '-003',
    'Wall Sawing - Office Building',
    'BuildRight Contractors',
    'Tom Anderson',
    'tom.anderson@buildright.com',
    'Wall Sawing',
    'Office Building Renovation',
    '789 West Ave, Atlanta, GA 30309',
    'Wall sawing for new doorways. Three openings, 4ft x 8ft each.',
    test_operator_id,
    'Michael Brown',
    '678-555-0003',
    'David Miller',
    'david.miller@pontifex.com',
    'in_progress',
    'high',
    CURRENT_DATE,
    '07:30 AM',
    10.00,
    5800.00,
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '1 hour 30 minutes',
    NOW(),
    NOW()
  ) RETURNING id INTO job_id_3;

  -- Job 4-7: Additional scheduled jobs
  INSERT INTO job_orders (job_number, title, customer_name, job_type, location, address, assigned_to, status, priority, scheduled_date, arrival_time, estimated_hours, job_quote, created_at, updated_at)
  VALUES
    ('JOB-' || to_char(NOW(), 'YYYYMMDD') || '-004', 'Slab Sawing - Warehouse Floor', 'Industrial Solutions', 'Concrete Sawing', 'Warehouse District', '321 Industrial Blvd, Atlanta, GA', test_operator_id, 'scheduled', 'medium', CURRENT_DATE + INTERVAL '2 days', '07:00 AM', 7.00, 3900.00, NOW(), NOW()),
    ('JOB-' || to_char(NOW(), 'YYYYMMDD') || '-005', 'Core Drilling - Hospital Addition', 'Healthcare Construction', 'Core Drilling', 'Atlanta Medical Center', '555 Hospital Dr, Atlanta, GA', test_operator_id, 'scheduled', 'urgent', CURRENT_DATE + INTERVAL '3 days', '06:00 AM', 12.00, 7200.00, NOW(), NOW()),
    ('JOB-' || to_char(NOW(), 'YYYYMMDD') || '-006', 'Concrete Scanning - Bridge Project', 'State DOT', 'Concrete Scanning', 'I-85 Bridge Overpass', 'Mile Marker 42, I-85 North', test_operator_id, 'scheduled', 'high', CURRENT_DATE + INTERVAL '4 days', '05:30 AM', 6.00, 4100.00, NOW(), NOW()),
    ('JOB-' || to_char(NOW(), 'YYYYMMDD') || '-007', 'Demolition Sawing - Retail Store', 'Retail Renovations Inc', 'Concrete Sawing', 'Shopping Mall Unit 204', '888 Mall Pkwy, Atlanta, GA', test_operator_id, 'scheduled', 'low', CURRENT_DATE + INTERVAL '5 days', '08:00 AM', 5.00, 2800.00, NOW(), NOW());

  RAISE NOTICE 'Created 7 active jobs in various states';
END $$;

-- ============================================================================
-- STEP 3: CREATE COMPLETED JOBS (10 jobs with signatures & feedback)
-- ============================================================================

DO $$
DECLARE
  test_operator_id UUID;
  completed_date DATE;
  i INT;
BEGIN
  SELECT id INTO test_operator_id FROM auth.users WHERE email = 'testoperator@pontifex.com';

  -- Create 10 completed jobs over the past 30 days
  FOR i IN 1..10 LOOP
    completed_date := CURRENT_DATE - INTERVAL '1 day' * (i * 3);

    INSERT INTO job_orders (
      job_number, title, customer_name, customer_contact, customer_email,
      job_type, location, address, description,
      assigned_to, foreman_name, foreman_phone, salesman_name, salesman_email,
      status, priority, scheduled_date, arrival_time, estimated_hours,
      job_quote,
      route_started_at, work_started_at, work_completed_at,
      drive_time, production_time, total_time,
      work_performed, materials_used, operator_notes,
      customer_signature, customer_signed_at,
      customer_feedback_overall, customer_feedback_cleanliness, customer_feedback_communication,
      customer_feedback_comments, customer_feedback_signer_name,
      created_at, updated_at
    ) VALUES (
      'JOB-COMPLETED-' || i,
      CASE i
        WHEN 1 THEN 'Core Drilling - Retail Complex'
        WHEN 2 THEN 'Concrete Sawing - Office Tower'
        WHEN 3 THEN 'Wall Sawing - Hospital Wing'
        WHEN 4 THEN 'Slab Sawing - Warehouse'
        WHEN 5 THEN 'Core Drilling - Bridge Project'
        WHEN 6 THEN 'Concrete Scanning - Parking Deck'
        WHEN 7 THEN 'Demolition - Old Building'
        WHEN 8 THEN 'Core Drilling - Stadium'
        WHEN 9 THEN 'Concrete Sawing - Airport Runway'
        WHEN 10 THEN 'Wall Sawing - School Addition'
      END,
      CASE i % 3
        WHEN 0 THEN 'ABC Construction'
        WHEN 1 THEN 'BuildRight Contractors'
        ELSE 'Metro Properties'
      END,
      'Site Manager',
      'contact' || i || '@customer.com',
      CASE i % 3
        WHEN 0 THEN 'Core Drilling'
        WHEN 1 THEN 'Concrete Sawing'
        ELSE 'Wall Sawing'
      END,
      'Job Site Location ' || i,
      i || '00 Demo Street, Atlanta, GA',
      'Completed job with all documentation and customer satisfaction.',
      test_operator_id,
      'Foreman ' || i,
      '678-555-' || LPAD(i::TEXT, 4, '0'),
      'Salesman ' || i,
      'salesman' || i || '@pontifex.com',
      'completed',
      CASE i % 3 WHEN 0 THEN 'high' WHEN 1 THEN 'medium' ELSE 'low' END,
      completed_date,
      '07:00 AM',
      6.00 + (i % 4),
      3000.00 + (i * 500),
      completed_date + INTERVAL '7 hours',
      completed_date + INTERVAL '7 hours 30 minutes',
      completed_date + INTERVAL '14 hours',
      30,  -- drive_time in minutes
      360 + (i * 20),  -- production_time in minutes
      420 + (i * 20),  -- total_time in minutes
      'Completed ' || CASE i % 3 WHEN 0 THEN 'core drilling' WHEN 1 THEN 'concrete sawing' ELSE 'wall sawing' END || ' as specified. All holes/cuts meet specifications.',
      'Diamond bits, water, cleanup supplies',
      'Job completed successfully. Customer satisfied with results.',
      'Customer Signature - Job #' || i,
      completed_date + INTERVAL '14 hours',
      8 + (i % 3),  -- Overall rating 8-10
      8 + (i % 3),  -- Cleanliness rating 8-10
      9 + (i % 2),  -- Communication rating 9-10
      CASE i % 3
        WHEN 0 THEN 'Excellent work! Very professional team.'
        WHEN 1 THEN 'Great job, finished on time and cleaned up well.'
        ELSE 'Outstanding service, will use again.'
      END,
      'Site Supervisor',
      NOW() - INTERVAL '1 day' * (i * 3),
      NOW() - INTERVAL '1 day' * (i * 3)
    );
  END LOOP;

  RAISE NOTICE 'Created 10 completed jobs with customer signatures and feedback';
END $$;

-- ============================================================================
-- STEP 4: CREATE TIMECARD DATA
-- ============================================================================

DO $$
DECLARE
  test_operator_id UUID;
  current_week_start DATE;
  i INT;
BEGIN
  SELECT id INTO test_operator_id FROM auth.users WHERE email = 'testoperator@pontifex.com';
  current_week_start := DATE_TRUNC('week', CURRENT_DATE);

  -- Current week timecards (Monday-Friday, today not clocked out yet)
  FOR i IN 0..4 LOOP
    IF current_week_start + i <= CURRENT_DATE THEN
      IF current_week_start + i = CURRENT_DATE THEN
        -- Today: Clocked in but not out yet
        INSERT INTO timecards (
          user_id, date, clock_in_time, clock_in_latitude, clock_in_longitude,
          clock_in_location_accuracy, status, created_at, updated_at
        ) VALUES (
          test_operator_id,
          CURRENT_DATE,
          CURRENT_DATE + INTERVAL '7 hours',
          33.7490,
          -84.3880,
          10.5,
          'clocked_in',
          NOW(),
          NOW()
        );
      ELSE
        -- Previous days this week: Full 8-hour days
        INSERT INTO timecards (
          user_id, date, clock_in_time, clock_out_time,
          clock_in_latitude, clock_in_longitude, clock_out_latitude, clock_out_longitude,
          clock_in_location_accuracy, clock_out_location_accuracy,
          total_hours, regular_hours, overtime_hours, status,
          created_at, updated_at
        ) VALUES (
          test_operator_id,
          current_week_start + i,
          current_week_start + i + INTERVAL '7 hours',
          current_week_start + i + INTERVAL '16 hours',
          33.7490, -84.3880, 33.7490, -84.3880,
          10.5, 10.5,
          9.0, 8.0, 1.0,
          'completed',
          NOW(),
          NOW()
        );
      END IF;
    END IF;
  END LOOP;

  -- Previous 2 weeks (full weeks with some overtime)
  FOR i IN 1..10 LOOP
    INSERT INTO timecards (
      user_id, date, clock_in_time, clock_out_time,
      clock_in_latitude, clock_in_longitude, clock_out_latitude, clock_out_longitude,
      clock_in_location_accuracy, clock_out_location_accuracy,
      total_hours, regular_hours, overtime_hours, status,
      created_at, updated_at
    ) VALUES (
      test_operator_id,
      current_week_start - INTERVAL '1 day' * i,
      current_week_start - INTERVAL '1 day' * i + INTERVAL '7 hours',
      current_week_start - INTERVAL '1 day' * i + INTERVAL '16 hours' + INTERVAL '30 minutes' * (i % 3),
      33.7490, -84.3880, 33.7490, -84.3880,
      10.5, 10.5,
      9.0 + (0.5 * (i % 3)),
      8.0,
      1.0 + (0.5 * (i % 3)),
      'completed',
      NOW(),
      NOW()
    );
  END LOOP;

  RAISE NOTICE 'Created timecard data for current and previous weeks';
END $$;

-- ============================================================================
-- STEP 5: CREATE EQUIPMENT ASSIGNMENTS
-- ============================================================================

DO $$
DECLARE
  test_operator_id UUID;
  equip_id_1 UUID;
  equip_id_2 UUID;
  equip_id_3 UUID;
  equip_id_4 UUID;
  equip_id_5 UUID;
BEGIN
  SELECT id INTO test_operator_id FROM auth.users WHERE email = 'testoperator@pontifex.com';

  -- Create 5 pieces of equipment assigned to testoperator
  INSERT INTO equipment (id, name, brand, model, serial_number, qr_code, status, assigned_to, assigned_at, location, notes, created_at, updated_at)
  VALUES
    (gen_random_uuid(), 'Husqvarna FS 400 LV', 'Husqvarna', 'FS 400 LV', 'SN-2024-001', 'QR-FS400-001', 'assigned', test_operator_id, NOW(), 'Operator Truck', 'Primary floor saw', NOW(), NOW()),
    (gen_random_uuid(), 'Hilti DD 160-E', 'Hilti', 'DD 160-E', 'SN-2024-002', 'QR-DD160-002', 'assigned', test_operator_id, NOW(), 'Operator Truck', 'Core drill system', NOW(), NOW()),
    (gen_random_uuid(), 'Husqvarna WS 482 HF', 'Husqvarna', 'WS 482 HF', 'SN-2024-003', 'QR-WS482-003', 'assigned', test_operator_id, NOW(), 'Operator Truck', 'Wall saw system', NOW(), NOW()),
    (gen_random_uuid(), 'Water Pump 3HP', 'Honda', 'GX200', 'SN-2024-004', 'QR-PUMP-004', 'assigned', test_operator_id, NOW(), 'Operator Truck', '3HP water pump', NOW(), NOW()),
    (gen_random_uuid(), 'Vacuum System HEPA', 'Milwaukee', 'DE162', 'SN-2024-005', 'QR-VAC-005', 'assigned', test_operator_id, NOW(), 'Operator Truck', 'HEPA dust vacuum', NOW(), NOW());

  RAISE NOTICE 'Created 5 equipment items assigned to testoperator';
END $$;

-- ============================================================================
-- STEP 6: VERIFY DEMO DATA
-- ============================================================================

DO $$
DECLARE
  admin_count INT;
  operator_count INT;
  job_count INT;
  completed_job_count INT;
  timecard_count INT;
  equipment_count INT;
BEGIN
  SELECT COUNT(*) INTO admin_count FROM auth.users WHERE email = 'testadmin@pontifex.com';
  SELECT COUNT(*) INTO operator_count FROM auth.users WHERE email = 'testoperator@pontifex.com';
  SELECT COUNT(*) INTO job_count FROM job_orders WHERE status IN ('scheduled', 'in_route', 'in_progress');
  SELECT COUNT(*) INTO completed_job_count FROM job_orders WHERE status = 'completed';
  SELECT COUNT(*) INTO timecard_count FROM timecards WHERE user_id = (SELECT id FROM auth.users WHERE email = 'testoperator@pontifex.com');
  SELECT COUNT(*) INTO equipment_count FROM equipment WHERE assigned_to = (SELECT id FROM auth.users WHERE email = 'testoperator@pontifex.com');

  RAISE NOTICE '======================================';
  RAISE NOTICE 'DEMO DATA CREATION COMPLETE!';
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Test Admin Accounts: %', admin_count;
  RAISE NOTICE 'Test Operator Accounts: %', operator_count;
  RAISE NOTICE 'Active Jobs: %', job_count;
  RAISE NOTICE 'Completed Jobs: %', completed_job_count;
  RAISE NOTICE 'Timecard Entries: %', timecard_count;
  RAISE NOTICE 'Equipment Assigned: %', equipment_count;
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Login Credentials:';
  RAISE NOTICE 'Admin: testadmin@pontifex.com / TestAdmin123!';
  RAISE NOTICE 'Operator: testoperator@pontifex.com / TestOperator123!';
  RAISE NOTICE '======================================';
END $$;

-- ============================================================================
-- DONE! Your demo data is ready for World of Concrete!
-- ============================================================================
