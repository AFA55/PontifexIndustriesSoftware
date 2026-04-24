export const dynamic = 'force-dynamic';

/**
 * API Route: GET/POST /api/admin/suggestions
 * Manage autocomplete suggestions for job titles, company names, and general contractors
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';

// GET: Fetch suggestions
export async function GET(request: NextRequest) {
  try {
    // Get user from Supabase session (server-side)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Get user's role from profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to verify user role' },
        { status: 403 }
      );
    }

    // Check if user is admin (any elevated role)
    if (!['admin', 'super_admin', 'operations_manager', 'salesman'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Only administrators can view suggestions' },
        { status: 403 }
      );
    }

    // Resolve tenant scope
    const tenantId = await getTenantId(user.id);
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    // Get type from query params (job_titles, company_names, general_contractors, or locations)
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (!type) {
      return NextResponse.json(
        { error: 'Type parameter is required (job_titles, company_names, general_contractors, or locations)' },
        { status: 400 }
      );
    }

    // Special handling for locations - fetch from job_orders
    if (type === 'locations') {
      let locQuery = supabaseAdmin
        .from('job_orders')
        .select('location')
        .not('location', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);
      locQuery = locQuery.eq('tenant_id', tenantId);
      const { data: locations, error: fetchError } = await locQuery;

      if (fetchError) {
        console.error('Error fetching location suggestions:', fetchError);
        return NextResponse.json(
          { error: 'Failed to fetch suggestions' },
          { status: 500 }
        );
      }

      // Get unique locations and sort by frequency
      const locationCounts = (locations || []).reduce((acc: Record<string, number>, item) => {
        if (item.location) {
          acc[item.location] = (acc[item.location] || 0) + 1;
        }
        return acc;
      }, {});

      const uniqueLocations = Object.entries(locationCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([location]) => ({ location }));

      return NextResponse.json(
        {
          success: true,
          data: uniqueLocations,
        },
        { status: 200 }
      );
    }

    // Map type to table name
    const tableMap: Record<string, string> = {
      'job_titles': 'customer_job_titles',
      'company_names': 'company_names',
      'general_contractors': 'general_contractors',
    };

    const table = tableMap[type];
    if (!table) {
      return NextResponse.json(
        { error: 'Invalid type. Must be job_titles, company_names, general_contractors, or locations' },
        { status: 400 }
      );
    }

    // Determine the field name based on table
    const fieldMap: Record<string, string> = {
      'customer_job_titles': 'title',
      'company_names': 'name',
      'general_contractors': 'name',
    };

    const field = fieldMap[table];

    // Fetch suggestions (scoped to tenant)
    let suggestionsQuery = supabaseAdmin
      .from(table)
      .select(field)
      .order('usage_count', { ascending: false })
      .limit(20);
    suggestionsQuery = suggestionsQuery.eq('tenant_id', tenantId);
    const { data: suggestions, error: fetchError } = await suggestionsQuery;

    if (fetchError) {
      console.error(`Error fetching ${type} suggestions:`, fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch suggestions' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: suggestions || [],
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in suggestions route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Save/update suggestion
export async function POST(request: NextRequest) {
  try {
    // Get user from Supabase session (server-side)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Get user's role from profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to verify user role' },
        { status: 403 }
      );
    }

    // Check if user is admin
    if (profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only administrators can save suggestions' },
        { status: 403 }
      );
    }

    // Resolve tenant scope
    const tenantId = await getTenantId(user.id);
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    // Parse request body
    const body = await request.json();
    const { type, value } = body;

    if (!type || !value) {
      return NextResponse.json(
        { error: 'Type and value are required' },
        { status: 400 }
      );
    }

    if (!value.trim()) {
      return NextResponse.json(
        { error: 'Value cannot be empty' },
        { status: 400 }
      );
    }

    // Map type to table name
    const tableMap: Record<string, string> = {
      'job_titles': 'customer_job_titles',
      'company_names': 'company_names',
      'general_contractors': 'general_contractors',
    };

    const table = tableMap[type];
    if (!table) {
      return NextResponse.json(
        { error: 'Invalid type. Must be job_titles, company_names, or general_contractors' },
        { status: 400 }
      );
    }

    // Determine the field name based on table
    const fieldMap: Record<string, string> = {
      'customer_job_titles': 'title',
      'company_names': 'name',
      'general_contractors': 'name',
    };

    const field = fieldMap[table];

    // Check if it already exists (scoped to tenant)
    let existingQuery = supabaseAdmin
      .from(table)
      .select('id, usage_count')
      .ilike(field, value);
    existingQuery = existingQuery.eq('tenant_id', tenantId);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      // Update usage count and last used date
      const { error: updateError } = await supabaseAdmin
        .from(table)
        .update({
          usage_count: existing.usage_count + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error(`Error updating ${type}:`, updateError);
        return NextResponse.json(
          { error: 'Failed to update suggestion' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          success: true,
          message: 'Suggestion usage count updated',
          data: { id: existing.id },
        },
        { status: 200 }
      );
    } else {
      // Insert new entry (with tenant_id)
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from(table)
        .insert({ [field]: value, tenant_id: tenantId || null })
        .select()
        .single();

      if (insertError) {
        console.error(`Error inserting ${type}:`, insertError);
        return NextResponse.json(
          { error: 'Failed to insert suggestion' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          success: true,
          message: 'New suggestion created',
          data: inserted,
        },
        { status: 201 }
      );
    }
  } catch (error: any) {
    console.error('Unexpected error in save suggestion route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
