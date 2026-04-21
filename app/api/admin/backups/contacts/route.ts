export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

function escapeCSV(val: unknown): string {
  const str = val === null || val === undefined ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// POST /api/admin/backups/contacts — generate and return contact CSV
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { userId, tenantId } = auth;

  try {
    const { data: customers, error } = await supabaseAdmin
      .from('customers')
      .select('id, name, email, phone, address, city, state, zip, notes, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('name');

    if (error) throw error;

    const rows = customers || [];

    const headers = ['ID', 'Name', 'Email', 'Phone', 'Address', 'City', 'State', 'ZIP', 'Notes', 'Created At', 'Updated At'];
    const csvLines = [
      headers.join(','),
      ...rows.map(r =>
        [r.id, r.name, r.email, r.phone, r.address, r.city, r.state, r.zip, r.notes, r.created_at, r.updated_at]
          .map(escapeCSV)
          .join(',')
      ),
    ];
    const csv = csvLines.join('\n');
    const filename = `contacts_backup_${new Date().toISOString().slice(0, 10)}.csv`;
    const fileSizeBytes = Buffer.byteLength(csv, 'utf8');

    // Fire-and-forget log
    Promise.resolve(
      supabaseAdmin.from('contact_backups').insert({
        tenant_id: tenantId,
        created_by: userId,
        backup_type: 'manual',
        record_count: rows.length,
        file_size_bytes: fileSizeBytes,
        status: 'completed',
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({
      success: true,
      data: { csv, filename, recordCount: rows.length, fileSizeBytes },
    });
  } catch (err) {
    console.error('Backup error:', err);
    return NextResponse.json({ error: 'Failed to generate backup' }, { status: 500 });
  }
}

// GET /api/admin/backups/contacts — list recent backups
export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { tenantId } = auth;

  try {
    const { data, error } = await supabaseAdmin
      .from('contact_backups')
      .select('*, profiles(full_name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ success: true, data: [] });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch {
    return NextResponse.json({ success: true, data: [] });
  }
}
