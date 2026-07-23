export const dynamic = 'force-dynamic';

/**
 * Contracts + change orders (founder ask Jul 11).
 *   GET  /api/admin/contracts?jobId=&status=   — list (tenant-scoped)
 *   POST /api/admin/contracts                  — create draft (or draft change order)
 * Sending/signing live in ./[id]/send and /api/public/contract/[token].
 * Access: office roles (same population as the schedule board).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const auth = await requireScheduleBoardAccess(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });

  let q = supabaseAdmin
    .from('contracts')
    .select(
      'id, job_id, parent_contract_id, doc_type, title, work_description, terms, amount, customer_name, customer_email, status, sent_at, viewed_at, signed_at, signer_name, pdf_url, created_at'
    )
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })
    .limit(200);

  const jobId = request.nextUrl.searchParams.get('jobId');
  const status = request.nextUrl.searchParams.get('status');
  if (jobId) q = q.eq('job_id', jobId);
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) {
    console.error('contracts list error:', error);
    return NextResponse.json({ error: 'Failed to load contracts' }, { status: 500 });
  }
  // contracts bucket is private (security F1) — sign pdf_url for the admin
  // viewer/download links. signStoredUrl only touches private-bucket URLs.
  const { signStoredUrl } = await import('@/lib/storage-url-server');
  const contracts = await Promise.all(
    (data ?? []).map(async (c: any) => ({ ...c, pdf_url: await signStoredUrl(c.pdf_url) }))
  );
  return NextResponse.json({ success: true, data: { contracts } });
}

export async function POST(request: NextRequest) {
  const auth = await requireScheduleBoardAccess(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });

  const body = await request.json();
  const {
    title,
    workDescription,
    terms,
    amount,
    customerName,
    customerEmail,
    jobId,
    parentContractId,
    docType,
  } = body ?? {};

  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (!customerName?.trim()) return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
  const email = String(customerEmail ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid customer email is required' }, { status: 400 });
  }
  const type = docType === 'change_order' ? 'change_order' : 'contract';

  // Cross-tenant guards: any referenced job / parent contract must belong to
  // the caller's tenant (supabaseAdmin bypasses RLS — these checks ARE the boundary).
  if (jobId) {
    const { data: job } = await supabaseAdmin
      .from('job_orders')
      .select('id')
      .eq('id', jobId)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle();
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  if (parentContractId) {
    const { data: parent } = await supabaseAdmin
      .from('contracts')
      .select('id')
      .eq('id', parentContractId)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle();
    if (!parent) return NextResponse.json({ error: 'Parent contract not found' }, { status: 404 });
  }

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .insert({
      tenant_id: auth.tenantId,
      job_id: jobId || null,
      parent_contract_id: parentContractId || null,
      doc_type: type,
      title: title.trim(),
      work_description: workDescription?.trim() || null,
      terms: terms?.trim() || null,
      amount: amount != null && amount !== '' ? Number(amount) : null,
      customer_name: customerName.trim(),
      customer_email: email,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) {
    console.error('contract create error:', error);
    return NextResponse.json({ error: 'Failed to create contract' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { contract } }, { status: 201 });
}
