export const dynamic = 'force-dynamic';

/**
 * POST /api/upload/avatar
 * Used during account setup (invitation flow). Requires a valid invitation token
 * OR a valid Bearer session token to prevent unauthorized profile overwrites.
 * Uploads to Supabase Storage 'avatars' bucket and updates the profile.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const BUCKET = 'avatars';
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('avatar') as File | null;
    const userId = formData.get('userId') as string | null;
    // invitationToken is used during setup-account flow (no session yet)
    const invitationToken = formData.get('invitationToken') as string | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    // SECURITY: Require either a valid Bearer token or a valid invitation token
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.replace('Bearer ', '');

    let isAuthorized = false;

    if (bearerToken) {
      // Session-based auth: user must be uploading their own avatar
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(bearerToken);
      if (!authError && user && user.id === userId) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized && invitationToken) {
      // Invitation-based auth: validate token matches userId
      const { data: inv, error: invError } = await supabaseAdmin
        .from('user_invitations')
        .select('email')
        .eq('token', invitationToken)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (!invError && inv) {
        // Verify the userId matches the invitee's profile
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .eq('email', inv.email)
          .single();
        if (profile) isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 413 });
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, GIF, or WebP images are allowed' }, { status: 400 });
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
