export const dynamic = 'force-dynamic';

/**
 * POST /api/profile/avatar
 * Authenticated endpoint — allows any logged-in user to update their own avatar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const BUCKET = 'avatars';
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const formData = await request.formData();
    const file = formData.get('avatar') as File | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 413 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `avatars/${auth.userId}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Try upload — create bucket if it doesn't exist yet
    let uploadError = (await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: true })).error;

    if (uploadError && (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found'))) {
      await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
      uploadError = (await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: true })).error;
    }

    if (uploadError) {
      console.error('[profile/avatar] Storage error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

    await supabaseAdmin
      .from('profiles')
      .update({ profile_picture_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', auth.userId);

    return NextResponse.json({ success: true, data: { url: publicUrl } });
  } catch (err: any) {
    console.error('[profile/avatar] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
