export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * POST /api/admin/branding/logo
 * Super admin only — upload logo or favicon to Supabase Storage.
 * FormData fields:
 *   file: File
 *   type: 'logo' | 'favicon'
 *
 * On success: updates tenant_branding.logo_url or favicon_url and returns { url }.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = (formData.get('type') as string) || 'logo';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type "${file.type}". Allowed: PNG, JPG, SVG, ICO` },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 2MB.' }, { status: 400 });
    }

    const extMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/svg+xml': 'svg',
      'image/x-icon': 'ico',
    };
    const ext = extMap[file.type] || 'png';
    const logoType = type === 'favicon' ? 'favicon' : 'logo';
    const tenantSegment = auth.tenantId || 'default';
    const path = `branding/${tenantSegment}/${logoType}_${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Attempt upload; create bucket if missing
    const { error: uploadError } = await supabaseAdmin.storage
      .from('branding')
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      if (
        uploadError.message?.toLowerCase().includes('not found') ||
        uploadError.message?.toLowerCase().includes('bucket')
      ) {
        await supabaseAdmin.storage.createBucket('branding', {
          public: true,
          fileSizeLimit: MAX_SIZE,
          allowedMimeTypes: ALLOWED_TYPES,
        });
        const { error: retryError } = await supabaseAdmin.storage
          .from('branding')
          .upload(path, buffer, { contentType: file.type, upsert: false });
        if (retryError) {
          console.error('Logo upload retry error:', retryError);
          return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
        }
      } else {
        console.error('Logo upload error:', uploadError);
        return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
      }
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from('branding').getPublicUrl(path);
    const publicUrl = publicUrlData?.publicUrl || '';

    // Update the branding record
    const updateField = logoType === 'favicon' ? 'favicon_url' : 'logo_url';

    // Find active branding row for this tenant
    let findQuery = supabaseAdmin
      .from('tenant_branding')
      .select('id')
      .eq('is_active', true);

    if (auth.tenantId) {
      findQuery = findQuery.eq('tenant_id', auth.tenantId);
    }

    const { data: existing } = await findQuery.limit(1).single();

    if (existing) {
      await supabaseAdmin
        .from('tenant_branding')
        .update({
          [updateField]: publicUrl,
          updated_at: new Date().toISOString(),
          updated_by: auth.userId,
        })
        .eq('id', existing.id);
    }

    return NextResponse.json({
      success: true,
      data: { url: publicUrl, path, type: logoType },
    });
  } catch (err) {
    console.error('Logo upload error:', err);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
