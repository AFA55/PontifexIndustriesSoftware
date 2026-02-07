/**
 * API Route: POST /api/migrations/apply-consent-fields
 * Apply migration to add consent tracking fields to access_requests table
 * This is a one-time migration that can be run manually
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST() {
  try {
    console.log('🔄 Applying consent fields migration...');

    // Check if columns already exist by trying to select them
    const { data: testData, error: testError } = await supabaseAdmin
      .from('access_requests')
      .select('accepted_terms, accepted_privacy, consent_timestamp, consent_ip_address')
      .limit(1);

    if (!testError) {
      return NextResponse.json(
        {
          success: true,
          message: 'Migration already applied - consent fields already exist',
        },
        { status: 200 }
      );
    }

    // Fields don't exist yet, need to apply migration
    // Note: We can't run DDL directly through Supabase client, so we'll return instructions
    return NextResponse.json(
      {
        success: false,
        needsManualMigration: true,
        message: 'Migration needs to be applied manually via Supabase SQL Editor',
        sql: `
-- Add consent tracking columns to access_requests table
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
        `.trim(),
        instructions: [
          '1. Go to https://supabase.com/dashboard/project/klatddoyncxidgqtcjnu/sql',
          '2. Copy the SQL above',
          '3. Paste it into the SQL Editor',
          '4. Click "Run" to execute the migration',
          '5. Refresh this page to verify',
        ],
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('❌ Migration check failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check migration status',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Check if migration has been applied
    const { data, error } = await supabaseAdmin
      .from('access_requests')
      .select('accepted_terms, accepted_privacy, consent_timestamp, consent_ip_address')
      .limit(1);

    if (error) {
      return NextResponse.json(
        {
          applied: false,
          error: error.message,
          message: 'Consent fields do not exist yet. Run POST to this endpoint for migration instructions.',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        applied: true,
        message: 'Migration has been applied successfully. Consent tracking is enabled.',
        fields: ['accepted_terms', 'accepted_privacy', 'consent_timestamp', 'consent_ip_address'],
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to check migration status',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
