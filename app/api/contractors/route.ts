/**
 * API Route: /api/contractors
 * Manage contractor profiles
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireAdmin } from '@/lib/api-auth';

// GET - List all contractors
export async function GET(request: NextRequest) {
  try {
    // Security: require authenticated user
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status') || 'active';
    const preferred = searchParams.get('preferred');

    let query = supabaseAdmin
      .from('contractors')
      .select('*')
      .order('contractor_name', { ascending: true });

    // Filter by status
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // Filter by preferred
    if (preferred === 'true') {
      query = query.eq('preferred_contractor', true);
    }

    // Search by name or contact person
    if (search) {
      query = query.or(`contractor_name.ilike.%${search}%,contact_person.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching contractors:', error);
      return NextResponse.json(
        { error: 'Failed to fetch contractors' },
        { status: 500 }
      );
    }

    return NextResponse.json({ contractors: data });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new contractor
export async function POST(request: NextRequest) {
  try {
    // Security: only admins can create contractors
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();

    const {
      contractor_name,
      contact_person,
      contact_phone,
      contact_email,
      full_address,
      company_type,
      tax_id,
      internal_notes,
    } = body;

    // Validation
    if (!contractor_name || !contact_person || !contact_phone) {
      return NextResponse.json(
        { error: 'Missing required fields: contractor_name, contact_person, contact_phone' },
        { status: 400 }
      );
    }

    // Check if contractor already exists
    const { data: existing } = await supabaseAdmin
      .from('contractors')
      .select('id')
      .eq('contractor_name', contractor_name)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'A contractor with this name already exists' },
        { status: 409 }
      );
    }

    // Create contractor
    const { data, error } = await supabaseAdmin
      .from('contractors')
      .insert([
        {
          contractor_name,
          contact_person,
          contact_phone,
          contact_email,
          full_address,
          company_type: company_type || 'General Contractor',
          tax_id,
          internal_notes,
          status: 'active',
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating contractor:', error);
      return NextResponse.json(
        { error: 'Failed to create contractor' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, contractor: data },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
