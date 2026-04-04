export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/team-messages
 * Internal team chat feed — read, post, delete messages.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel');

    let query = supabaseAdmin
      .from('team_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (channel) {
      query = query.eq('channel', channel);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching team messages:', error);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error('Error in team-messages GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { content, channel } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    // Get author name from profiles
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email, role')
      .eq('id', auth.userId)
      .single();

    const authorName = profile?.full_name || profile?.email || auth.userEmail || 'Unknown';
    const authorRole = profile?.role || auth.role;

    const { data, error } = await supabaseAdmin
      .from('team_messages')
      .insert({
        author_id: auth.userId,
        author_name: authorName,
        author_role: authorRole,
        content: content.trim(),
        channel: channel || 'general',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating team message:', error);
      return NextResponse.json({ error: 'Failed to create message' }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'team_message_sent',
        entity_type: 'team_message',
        entity_id: data.id,
        details: { channel: channel || 'general' },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in team-messages POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Message id is required' }, { status: 400 });
    }

    // Super admin can delete any message; others can only delete their own
    let query = supabaseAdmin
      .from('team_messages')
      .delete()
      .eq('id', id);

    if (auth.role !== 'super_admin') {
      query = query.eq('author_id', auth.userId);
    }

    const { error } = await query;

    if (error) {
      console.error('Error deleting team message:', error);
      return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'team_message_deleted',
        entity_type: 'team_message',
        entity_id: id,
        details: {},
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data: { deleted: id } });
  } catch (error: any) {
    console.error('Error in team-messages DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
