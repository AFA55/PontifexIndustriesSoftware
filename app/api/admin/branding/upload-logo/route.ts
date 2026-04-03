export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const VALID_LOGO_TYPES = ['main', 'dark', 'favicon', 'icon'];

/**
 * POST /api/admin/branding/upload-logo?type=main|dark|favicon|icon
 * Super admin only — upload a logo file to Supabase Storage.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(request.url);
    const logoType = url.searchParams.get('type') || 'main';

    if (!VALID_LOGO_TYPES.includes(logoType)) {
      return NextResponse.json(
        { error: `Invalid logo type. Must be one of: ${VALID_LOGO_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('logo') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided. Use field name "logo".' },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type "${file.type}". Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 2MB.' },
        { status: 400 }
      );
    }

    // Determine file extension
    const extMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/svg+xml': 'svg',
      'image/x-icon': 'ico',
    };
    const ext = extMap[file.type] || 'png';
    const timestamp = Date.now();
    const filePath = `logos/${logoType}_${timestamp}.${ext}`;

    // Upload to Supabase Storage bucket "branding"
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from('branding')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      // If bucket doesn't exist, try to create it
      if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket')) {
        await supabaseAdmin.storage.createBucket('branding', {
          public: true,
          fileSizeLimit: MAX_SIZE,
          allowedMimeTypes: ALLOWED_TYPES,
        });

        // Retry upload
        const { error: retryError } = await supabaseAdmin.storage
          .from('branding')
          .upload(filePath, buffer, {
            contentType: file.type,
            upsert: false,
          });

        if (retryError) {
          console.error('Logo upload retry error:', retryError);
          return NextResponse.json(
            { error: 'Failed to upload logo after creating bucket' },
            { status: 500 }
          );
        }
      } else {
        console.error('Logo upload error:', uploadError);
        return NextResponse.json(
          { error: 'Failed to upload logo' },
          { status: 500 }
        );
      }
    }

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('branding')
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData?.publicUrl || '';

    return NextResponse.json({
      success: true,
      data: {
        url: publicUrl,
        path: filePath,
        type: logoType,
      },
    });
  } catch (err) {
    console.error('Logo upload error:', err);
    return NextResponse.json(
      { error: 'Failed to upload logo' },
      { status: 500 }
    );
  }
}
