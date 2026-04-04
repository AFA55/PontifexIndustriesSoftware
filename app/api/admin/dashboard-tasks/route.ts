export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/dashboard-tasks
 * CRUD for personal dashboard todo items.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { data, error } = await supabaseAdmin
      .from('dashboard_tasks')
      .select('*')
      .eq('user_id', auth.userId)
      .order('completed', { ascending: true })
      .order('position', { ascending: true });

    if (error) {
      console.error('Error fetching dashboard tasks:', error);
      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error('Error in dashboard-tasks GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { title, priority, due_date } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Task title is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('dashboard_tasks')
      .insert({
        user_id: auth.userId,
        title: title.trim(),
        priority: priority || 'normal',
        due_date: due_date || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating dashboard task:', error);
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'dashboard_task_created',
        entity_type: 'dashboard_task',
        entity_id: data.id,
        details: { title: title.trim() },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in dashboard-tasks POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { id, title, completed, priority, due_date, position } = body;

    if (!id) {
      return NextResponse.json({ error: 'Task id is required' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (title !== undefined) updates.title = title;
    if (completed !== undefined) {
      updates.completed = completed;
      updates.completed_at = completed ? new Date().toISOString() : null;
    }
    if (priority !== undefined) updates.priority = priority;
    if (due_date !== undefined) updates.due_date = due_date;
    if (position !== undefined) updates.position = position;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('dashboard_tasks')
      .update(updates)
      .eq('id', id)
      .eq('user_id', auth.userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating dashboard task:', error);
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Task not found or not owned by you' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in dashboard-tasks PUT:', error);
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
      return NextResponse.json({ error: 'Task id is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('dashboard_tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.userId);

    if (error) {
      console.error('Error deleting dashboard task:', error);
      return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { deleted: id } });
  } catch (error: any) {
    console.error('Error in dashboard-tasks DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
