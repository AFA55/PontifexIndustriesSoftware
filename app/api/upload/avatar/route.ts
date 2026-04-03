export const dynamic = 'force-dynamic';

/**
 * POST /api/upload/avatar
 * Public-ish endpoint used during account setup (before the user has a session).
 * Requires userId param to be passed explicitly (set by the complete flow).
 * Uploads to Supabase Storage 'avatars' bucket and updates the profile.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const BUCKET = 'avatars';
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('avatar') as File | null;
    const userId = formData.get('userId') as string | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 413 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `avatars/${userId}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Try upload — if bucket doesn't exist yet, create it then retry
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
      console.error('[upload/avatar] Storage error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

    // Persist URL to profile
    await supabaseAdmin
      .from('profiles')
      .update({ profile_picture_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', userId);

    return NextResponse.json({ success: true, data: { url: publicUrl } });
  } catch (err: any) {
    console.error('[upload/avatar] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
