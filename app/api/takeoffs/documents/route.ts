export const dynamic = 'force-dynamic';

/**
 * GET  /api/takeoffs/documents — list the tenant's plan documents
 * POST /api/takeoffs/documents — register a new document + return a signed
 *      upload URL (client PUTs the PDF straight to storage — Vercel routes
 *      cap request bodies, so the file never passes through the API).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireTakeoffsAccess } from '@/lib/takeoffs/api-guard';

export async function GET(request: NextRequest) {
  const guard = await requireTakeoffsAccess(request);
  if (!guard.ok) return guard.response;

  const { data, error } = await supabaseAdmin
    .from('takeoff_documents')
    .select('id, name, customer_name, page_count, status, file_size_bytes, ai_analyzed_at, created_at')
    .eq('tenant_id', guard.tenantId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('takeoffs documents GET error:', error);
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const guard = await requireTakeoffsAccess(request);
  if (!guard.ok) return guard.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = (body.name ?? '').toString().trim().slice(0, 200);
  const customerName = (body.customer_name ?? '').toString().trim().slice(0, 200) || null;
  const fileSize = Number(body.file_size_bytes) || null;
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (fileSize && fileSize > 104857600) {
    return NextResponse.json({ error: 'PDF is larger than the 100 MB limit' }, { status: 400 });
  }

  const { data: doc, error } = await supabaseAdmin
    .from('takeoff_documents')
    .insert({
      tenant_id: guard.tenantId,
      name,
      customer_name: customerName,
      file_size_bytes: fileSize,
      storage_path: 'pending',
      status: 'processing',
      created_by: guard.userId,
    })
    .select('id')
    .single();

  if (error || !doc) {
    console.error('takeoffs document create error:', error);
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 });
  }

  const storagePath = `${guard.tenantId}/${doc.id}.pdf`;
  await supabaseAdmin.from('takeoff_documents').update({ storage_path: storagePath }).eq('id', doc.id);

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from('takeoff-documents')
    .createSignedUploadUrl(storagePath);

  if (signErr || !signed) {
    console.error('takeoffs signed upload URL error:', signErr);
    await supabaseAdmin.from('takeoff_documents').delete().eq('id', doc.id);
    return NextResponse.json({ error: 'Failed to prepare upload' }, { status: 500 });
  }

  return NextResponse.json(
    {
      success: true,
      data: { documentId: doc.id, storagePath, uploadUrl: signed.signedUrl, uploadToken: signed.token },
    },
    { status: 201 }
  );
}
