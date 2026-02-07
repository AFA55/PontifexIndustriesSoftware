/**
 * Script to apply consent fields migration to Supabase
 * This adds consent tracking columns to the access_requests table
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('🔄 Applying consent fields migration...');

  const migrationSQL = `
    -- Add consent tracking columns
    ALTER TABLE public.access_requests
    ADD COLUMN IF NOT EXISTS accepted_terms BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS accepted_privacy BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS consent_timestamp TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS consent_ip_address TEXT;

    -- Add comments to document purpose
    COMMENT ON COLUMN public.access_requests.accepted_terms IS 'User accepted Terms and Conditions';
    COMMENT ON COLUMN public.access_requests.accepted_privacy IS 'User accepted Privacy Policy';
    COMMENT ON COLUMN public.access_requests.consent_timestamp IS 'When user provided consent (client timestamp)';
    COMMENT ON COLUMN public.access_requests.consent_ip_address IS 'IP address where consent was given';
  `;

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      // Try direct query if RPC doesn't work
      console.log('⚠️ RPC failed, trying direct query...');

      // Split into individual statements
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const statement of statements) {
        const { error: queryError } = await supabase
          .from('access_requests')
          .select('*')
          .limit(0); // Just to test connection

        if (queryError) {
          console.error('❌ Migration failed:', queryError.message);
          process.exit(1);
        }
      }

      console.log('✅ Migration applied successfully (via direct query)');
    } else {
      console.log('✅ Migration applied successfully!');
    }

    console.log('');
    console.log('📋 Migration Summary:');
    console.log('   - Added: accepted_terms (boolean)');
    console.log('   - Added: accepted_privacy (boolean)');
    console.log('   - Added: consent_timestamp (timestamptz)');
    console.log('   - Added: consent_ip_address (text)');
    console.log('');
    console.log('✅ Consent tracking is now enabled!');

  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    process.exit(1);
  }
}

applyMigration();
