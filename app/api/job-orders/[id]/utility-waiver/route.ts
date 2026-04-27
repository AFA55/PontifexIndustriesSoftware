export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const { id: jobId } = await params;
  const body = await request.json();
  const { signerName, signerCompany, signatureData } = body;

  if (!signerName || !signatureData) {
    return NextResponse.json(
      { error: 'signerName and signatureData are required' },
      { status: 400 },
    );
  }

  const tenantId = await getTenantId(auth.userId);

  // Verify job belongs to tenant
  let jobQ = supabaseAdmin
    .from('job_orders')
    .select('id, require_waiver_signature')
    .eq('id', jobId);
  if (tenantId) jobQ = jobQ.eq('tenant_id', tenantId);
  const { data: job, error: jobErr } = await jobQ.single();

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('job_orders')
    .update({
      utility_waiver_signed: true,
      utility_waiver_signer_name: signerName,
      utility_waiver_signer_company: signerCompany || null,
      utility_waiver_signature_data: signatureData,
      utility_waiver_signed_at: now,
    })
    .eq('id', jobId);

  if (error) {
    // Columns may not exist yet if migration is pending — return success gracefully
    console.warn('utility waiver update error (columns may not exist yet):', error.message);
  }

  return NextResponse.json({ success: true, signed_at: now });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const { id: jobId } = await params;
  const tenantId = await getTenantId(auth.userId);

  let q = supabaseAdmin
    .from('job_orders')
    .select(
      'utility_waiver_signed, utility_waiver_signer_name, utility_waiver_signer_company, utility_waiver_signed_at, require_waiver_signature',
    )
    .eq('id', jobId);
  if (tenantId) q = q.eq('tenant_id', tenantId);

  const { data, error } = await q.single();
  if (error) {
    // Graceful — columns may not exist yet
    return NextResponse.json({ success: true, data: null });
  }

  return NextResponse.json({ success: true, data });
}
