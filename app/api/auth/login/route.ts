export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/auth/login
 * Custom login endpoint that bypasses RLS issues
 * Uses admin client to fetch profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAuditEvent } from '@/lib/audit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

// Fire-and-forget login attempt logging
function logLoginAttempt(params: {
  email: string;
  success: boolean;
  failureReason?: string;
  userId?: string;
  request: NextRequest;
}) {
  const ipAddress = params.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || params.request.headers.get('x-real-ip')
    || null;
  const userAgent = params.request.headers.get('user-agent') || null;

  Promise.resolve(
    supabaseAdmin
      .from('login_attempts')
      .insert({
        email: params.email,
        success: params.success,
        failure_reason: params.failureReason || null,
        user_id: params.userId || null,
        ip_address: ipAddress,
        user_agent: userAgent,
      })
  )
    .then(({ error }) => {
      if (error) console.error('[login-audit] Failed to log attempt:', error.message);
    })
    .catch(() => { /* silent */ });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Create a regular supabase client for auth
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Step 1: Authenticate user
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      console.error('Auth error for', email, ':', authError?.message || 'No user returned');
      logLoginAttempt({ email, success: false, failureReason: 'invalid_credentials', request });
      return NextResponse.json(
        { error: authError?.message === 'Invalid login credentials'
            ? 'Invalid email or password. Please check your credentials and try again.'
            : (authError?.message || 'Authentication failed') },
        { status: 401 }
      );
    }

    // Step 2: Get profile using ADMIN client (bypasses RLS)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, active, tenant_id')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      console.error('Profile fetch error:', profileError);
      logLoginAttempt({ email, success: false, failureReason: 'profile_not_found', userId: authData.user.id, request });
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    if (!profile.active) {
      logLoginAttempt({ email, success: false, failureReason: 'inactive_account', userId: authData.user.id, request });
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: 'Account is inactive' },
        { status: 403 }
      );
    }

    // Step 3: Get tenant details for branding (if user has a tenant)
    let tenant = null;
    if (profile.tenant_id) {
      const { data: tenantData } = await supabaseAdmin
        .from('tenants')
        .select('id, name, slug, company_code')
        .eq('id', profile.tenant_id)
        .single();
      tenant = tenantData;
    }

    // Log successful login
    logLoginAttempt({ email, success: true, userId: profile.id, request });
    logAuditEvent({
      userId: profile.id,
      userEmail: email,
      userRole: profile.role,
      action: 'login',
      resourceType: 'auth',
      request,
    });

    // Return success with session, profile, and tenant
    return NextResponse.json(
      {
        success: true,
        user: {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role: profile.role,
          tenant_id: profile.tenant_id,
        },
        tenant,
        session: authData.session,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
