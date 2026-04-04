export const dynamic = 'force-dynamic';

/**
 * POST /api/setup-account/complete
 * Public endpoint — finalizes account setup from an invitation token.
 * Creates (or updates) the Supabase auth user and updates the profile.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      token: string;
      password: string;
      waiverSigned: boolean;
      emailConsent: boolean;
      smsConsent: boolean;
      hasAvatar: boolean;
    };

    if (!body.token || !body.password) {
      return NextResponse.json({ error: 'token and password are required' }, { status: 400 });
    }

    if (body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    if (!body.waiverSigned) {
      return NextResponse.json({ error: 'You must agree to the platform terms to continue' }, { status: 400 });
    }

    // Validate token
    const { data: inv, error: invError } = await supabaseAdmin
      .from('user_invitations')
      .select('*')
      .eq('token', body.token)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (invError || !inv) {
      return NextResponse.json(
        { error: 'Invalid or expired invitation. Please request a new invitation from your administrator.' },
        { status: 404 }
      );
    }

    // Check if a user with this email already exists in Supabase auth
    const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const existingAuthUser = usersPage?.users?.find(
      u => u.email?.toLowerCase() === inv.email.toLowerCase()
    );

    let userId: string;

    if (existingAuthUser) {
      // User already in auth — update their password and metadata
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthUser.id,
        {
          password: body.password,
          user_metadata: {
            ...existingAuthUser.user_metadata,
            tenant_id: inv.tenant_id,
            role: inv.role,
            setup_completed: true,
          },
        }
      );
      if (updateError) {
        console.error('[setup-account/complete] Error updating auth user:', updateError);
        return NextResponse.json({ error: 'Failed to update account. Please try again.' }, { status: 500 });
      }
      userId = existingAuthUser.id;
    } else {
      // Create a brand-new auth user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: inv.email,
        password: body.password,
        email_confirm: true,
        user_metadata: {
          tenant_id: inv.tenant_id,
          role: inv.role,
          setup_completed: true,
        },
      });

      if (createError || !newUser?.user) {
        console.error('[setup-account/complete] Error creating auth user:', createError);
        return NextResponse.json(
          { error: createError?.message || 'Failed to create account' },
          { status: 500 }
        );
      }
      userId = newUser.user.id;
    }

    // Capture IP for waiver audit trail
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') || null;

    const now = new Date().toISOString();

    // Update/upsert the profile with setup state
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        setup_completed: true,
        waiver_signed_at: body.waiverSigned ? now : null,
        waiver_ip: body.waiverSigned ? ip : null,
        notification_consent: body.emailConsent || body.smsConsent,
        updated_at: now,
      })
      .eq('id', userId);

    if (profileError) {
      console.error('[setup-account/complete] Error updating profile:', profileError);
      // Non-fatal — auth user was created, log and continue
    }

    // Apply initial feature flags if any were set by the inviter
    if (inv.initial_flags && Object.keys(inv.initial_flags).length > 0) {
      const flagData = {
        user_id: userId,
        tenant_id: inv.tenant_id,
        admin_type: inv.admin_type || 'admin',
        updated_at: now,
        ...inv.initial_flags,
      };

      const { error: flagError } = await supabaseAdmin
        .from('user_feature_flags')
        .upsert(flagData, { onConflict: 'user_id,tenant_id' });

      if (flagError) {
        console.error('[setup-account/complete] Error upserting feature flags:', flagError);
        // Non-fatal
      }
    }

    // Mark invitation as accepted
    await supabaseAdmin
      .from('user_invitations')
      .update({ accepted_at: now })
      .eq('token', body.token);

    return NextResponse.json({ success: true, data: { userId } });
  } catch (err: any) {
    console.error('[setup-account/complete] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
