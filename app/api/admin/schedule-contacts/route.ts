export const dynamic = 'force-dynamic';

/**
 * API Route: GET/POST /api/admin/schedule-contacts
 * Manages the schedule_contacts table for customer/contact autocomplete
 *
 * GET ?q=search      → returns matching customer names (distinct)
 * GET ?customer=Name  → returns contacts for that customer
 * POST               → upsert a contact record
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const auth = await requireSalesStaff(request);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const customer = searchParams.get('customer');

  try {
    if (customer) {
      // Get contacts for a specific customer
      const { data, error } = await supabaseAdmin
        .from('schedule_contacts')
        .select('contact_name, contact_phone')
        .ilike('customer_name', customer)
        .not('contact_name', 'is', null)
        .order('usage_count', { ascending: false })
        .limit(20);

      if (error) throw error;
      return NextResponse.json({ contacts: data || [] });
    }

    if (q) {
      // Search customer names
      const { data, error } = await supabaseAdmin
        .from('schedule_contacts')
        .select('customer_name')
        .ilike('customer_name', `%${q}%`)
        .order('usage_count', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Return distinct customer names
      const unique = [...new Set((data || []).map(d => d.customer_name))];
      return NextResponse.json({ customers: unique });
    }

    // No params — return all distinct customer names (most used first)
    const { data, error } = await supabaseAdmin
      .from('schedule_contacts')
      .select('customer_name, usage_count')
      .order('usage_count', { ascending: false })
      .limit(100);

    if (error) throw error;

    const unique = [...new Set((data || []).map(d => d.customer_name))];
    return NextResponse.json({ customers: unique });
  } catch (error: any) {
    console.error('Schedule contacts GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSalesStaff(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { customer_name, contact_name, contact_phone } = body;

    if (!customer_name?.trim()) {
      return NextResponse.json({ error: 'customer_name is required' }, { status: 400 });
    }

    // Try insert first, then update on conflict
    const { error: insertError } = await supabaseAdmin
      .from('schedule_contacts')
      .insert({
        customer_name: customer_name.trim(),
        contact_name: contact_name?.trim() || null,
        contact_phone: contact_phone?.trim() || null,
        usage_count: 1,
      });

    if (insertError) {
      // Conflict — update existing record (increment usage_count, update phone)
      await supabaseAdmin
        .from('schedule_contacts')
        .update({
          contact_phone: contact_phone?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .ilike('customer_name', customer_name.trim())
        .eq('contact_name', contact_name?.trim() || '');
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Schedule contacts POST error:', error);
    return NextResponse.json({ error: 'Failed to save contact' }, { status: 500 });
  }
}
