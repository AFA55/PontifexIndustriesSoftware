/**
 * API Route: /api/admin/backups/contacts
 * POST: Generate a CSV export of all customer/contact data and log the backup
 * GET:  Return list of recent contact backup records (last 20)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Wrap in quotes if the value contains a comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(fields: unknown[]): string {
  return fields.map(escapeCsvField).join(',');
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { data, error } = await supabaseAdmin
      .from('contact_backups')
      .select('*')
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      if (isTableNotFoundError(error)) {
        return NextResponse.json({ success: true, data: [] });
      }
      console.error('[backups/contacts GET] error:', error);
      return NextResponse.json({ error: 'Failed to fetch backup history' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error('[backups/contacts GET] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const rows: string[] = [];
    let recordCount = 0;

    // ── 1. Customers ──────────────────────────────────────────────────────────
    const { data: customers, error: custError } = await supabaseAdmin
      .from('customers')
      .select('id, name, display_name, primary_contact_name, primary_contact_email, primary_contact_phone, billing_contact_name, billing_contact_email, address, city, state, zip, customer_type, payment_terms, website, notes, is_active, created_at')
      .eq('tenant_id', auth.tenantId)
      .order('name', { ascending: true });

    if (custError) {
      console.error('[backups/contacts POST] customers error:', custError);
    }

    // Header row
    rows.push(buildCsvRow([
      'type',
      'id',
      'name',
      'display_name',
      'contact_name',
      'email',
      'phone',
      'billing_contact_name',
      'billing_contact_email',
      'address',
      'city',
      'state',
      'zip',
      'customer_type',
      'payment_terms',
      'website',
      'notes',
      'is_active',
      'created_at',
    ]));

    for (const c of customers || []) {
      rows.push(buildCsvRow([
        'customer',
        c.id,
        c.name,
        c.display_name,
        c.primary_contact_name,
        c.primary_contact_email,
        c.primary_contact_phone,
        c.billing_contact_name,
        c.billing_contact_email,
        c.address,
        c.city,
        c.state,
        c.zip,
        c.customer_type,
        c.payment_terms,
        c.website,
        c.notes,
        c.is_active,
        c.created_at,
      ]));
      recordCount++;
    }

    // ── 2. Contacts (schedule_contacts) ───────────────────────────────────────
    // This table may or may not exist — use isTableNotFoundError guard
    const { data: contacts, error: contError } = await supabaseAdmin
      .from('schedule_contacts')
      .select('id, customer_id, name, email, phone, title, is_primary, created_at')
      .eq('tenant_id', auth.tenantId)
      .order('name', { ascending: true });

    if (contError && !isTableNotFoundError(contError)) {
      console.error('[backups/contacts POST] schedule_contacts error:', contError);
    }

    if (!contError && contacts && contacts.length > 0) {
      // Blank separator row + sub-header for contacts section
      rows.push('');
      rows.push(buildCsvRow([
        'type', 'id', 'customer_id', 'name', '', 'email', 'phone', '', '',
        '', '', '', '', '', '', '', '', '', 'title', 'is_primary', 'created_at',
      ]));
      for (const ct of contacts) {
        rows.push(buildCsvRow([
          'contact',
          ct.id,
          ct.customer_id,
          ct.name,
          '',
          ct.email,
          ct.phone,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          ct.title,
          ct.is_primary,
          ct.created_at,
        ]));
        recordCount++;
      }
    }

    // ── 3. Build CSV string ───────────────────────────────────────────────────
    const csv = rows.join('\r\n');
    const fileSizeBytes = new TextEncoder().encode(csv).length;

    // ── 4. Filename ───────────────────────────────────────────────────────────
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `contacts_backup_${dateStr}.csv`;

    // ── 5. Log to contact_backups ─────────────────────────────────────────────
    Promise.resolve(
      supabaseAdmin.from('contact_backups').insert({
        tenant_id: auth.tenantId,
        created_by: auth.userId,
        backup_type: 'manual',
        record_count: recordCount,
        file_size_bytes: fileSizeBytes,
        status: 'completed',
        notes: `Manual export by ${auth.userEmail}`,
      })
    ).catch(() => {});

    // ── 6. Audit log ──────────────────────────────────────────────────────────
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        user_email: auth.userEmail,
        action: 'contact_backup_export',
        resource_type: 'contact_backup',
        details: { record_count: recordCount, file_size_bytes: fileSizeBytes },
      })
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        csv,
        filename,
        recordCount,
        fileSizeBytes,
      },
    });
  } catch (err: any) {
    console.error('[backups/contacts POST] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
