export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/customers/[id]/site-contacts
 * Returns all unique site contacts used in previous jobs for a customer,
 * merged with contacts from the customer_contacts table.
 * Used by the smart schedule form for site contact suggestions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface SiteContact {
  name: string;
  phone: string | null;
  email: string | null;
  title: string | null;
  last_used: string;
  job_count: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: customerId } = await params;

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    // contact name → aggregated data map (keyed by lowercased name for deduplication)
    const contactMap = new Map<string, SiteContact>();

    // --- Source 1: customer_contacts table ---
    const { data: savedContacts } = await supabaseAdmin
      .from('customer_contacts')
      .select('name, phone, email, role, created_at')
      .eq('customer_id', customerId)
      .eq('tenant_id', auth.tenantId)
      .not('name', 'is', null)
      .neq('name', '')
      .order('created_at', { ascending: false });

    if (savedContacts) {
      for (const contact of savedContacts) {
        const name = (contact.name as string).trim();
        const key = name.toLowerCase();
        if (!contactMap.has(key)) {
          contactMap.set(key, {
            name,
            phone: (contact.phone as string | null) || null,
            email: (contact.email as string | null) || null,
            title: (contact.role as string | null) || null,
            last_used: (contact.created_at as string) || '',
            job_count: 0,
          });
        }
      }
    }

    // --- Source 2: job_orders — customer_contact (name) + site_contact_phone ---
    const { data: jobs } = await supabaseAdmin
      .from('job_orders')
      .select('customer_contact, site_contact_phone, scheduled_date')
      .eq('customer_id', customerId)
      .eq('tenant_id', auth.tenantId)
      .not('customer_contact', 'is', null)
      .neq('customer_contact', '')
      .order('scheduled_date', { ascending: false });

    if (jobs) {
      for (const job of jobs) {
        const name = ((job.customer_contact as string) || '').trim();
        if (!name) continue;

        const key = name.toLowerCase();
        const date = (job.scheduled_date as string) || '';
        const phone = (job.site_contact_phone as string | null) || null;

        if (!contactMap.has(key)) {
          contactMap.set(key, {
            name,
            phone,
            email: null,
            title: null,
            last_used: date,
            job_count: 1,
          });
        } else {
          const existing = contactMap.get(key)!;
          existing.job_count += 1;
          // Fill in phone if we now have one and didn't before
          if (!existing.phone && phone) {
            existing.phone = phone;
          }
          // Keep track of most recent use
          if (date && date > existing.last_used) {
            existing.last_used = date;
          }
        }
      }
    }

    // Convert map to array, sort by last_used DESC (most recently used first), limit 20
    const data = Array.from(contactMap.values())
      .sort((a, b) => b.last_used.localeCompare(a.last_used))
      .slice(0, 20);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in site-contacts GET:', error);
    return NextResponse.json({ success: true, data: [] });
  }
}
