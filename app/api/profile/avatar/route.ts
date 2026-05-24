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

    const ext = (file.name.split('.').pop()?.toLowerCase() || 'jpg').replace(/[^a-z0-9]/g, '') || 'jpg';
    // Path is prefixed by the user's id so storage RLS (`<uid>/...`) is satisfied.
    // A timestamp makes the object URL change on each upload, busting any CDN cache.
    const path = `${auth.userId}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: true });

    if (uploadError) {
      console.error('[profile/avatar] Storage error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

    // Keep both column names in sync: profile_picture_url is what the app reads
    // today; avatar_url is the spec'd canonical name.
    await supabaseAdmin
      .from('profiles')
      .update({ profile_picture_url: publicUrl, avatar_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', auth.userId);

    return NextResponse.json({ success: true, data: { url: publicUrl } });
  } catch (err: any) {
    console.error('[profile/avatar] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/profile/avatar
 * Clears the caller's avatar columns and best-effort removes the stored objects.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Best-effort: remove every object under the user's folder. Failures here
    // are non-fatal — the source of truth for "has an avatar" is the DB column.
    try {
      const { data: objects } = await supabaseAdmin.storage.from(BUCKET).list(auth.userId);
      if (objects && objects.length > 0) {
        await supabaseAdmin.storage
          .from(BUCKET)
          .remove(objects.map((o) => `${auth.userId}/${o.name}`));
      }
    } catch (storageErr) {
      console.error('[profile/avatar] DELETE storage cleanup failed (non-fatal):', storageErr);
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ profile_picture_url: null, avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', auth.userId);

    if (error) {
      console.error('[profile/avatar] DELETE db error:', error);
      return NextResponse.json({ error: 'Failed to clear avatar' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { url: null } });
  } catch (err: any) {
    console.error('[profile/avatar] DELETE unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
