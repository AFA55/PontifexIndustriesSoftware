import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';

// GET current clock status
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get today's clock record (if any)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: clockRecord, error } = await supabaseAdmin
      .from('time_clock')
      .select('*')
      .eq('user_id', user.id)
      .gte('clock_in_time', today.toISOString())
      .order('clock_in_time', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      // If table doesn't exist yet, treat as not clocked in
      if (isTableNotFoundError(error)) {
        return NextResponse.json({
          isClockedIn: false,
          clockRecord: null
        });
      }
      console.error('Error fetching clock status:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      isClockedIn: clockRecord && !clockRecord.clock_out_time,
      clockRecord: clockRecord || null
    });
  } catch (error: any) {
    console.error('Error in GET /api/time-clock:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST clock in/out
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, location, notes } = body;

    if (action === 'clock-in') {
      // Check if already clocked in today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: existingClock, error: checkError } = await supabaseAdmin
        .from('time_clock')
        .select('*')
        .eq('user_id', user.id)
        .gte('clock_in_time', today.toISOString())
        .is('clock_out_time', null)
        .single();

      // If table doesn't exist, return service unavailable
      if (checkError && isTableNotFoundError(checkError)) {
        return NextResponse.json(
          { error: 'Time clock system is not available yet. Please contact your administrator.' },
          { status: 503 }
        );
      }

      if (existingClock) {
        return NextResponse.json(
          { error: 'Already clocked in today' },
          { status: 400 }
        );
      }

      // Create new clock-in record
      const { data: newClock, error } = await supabaseAdmin
        .from('time_clock')
        .insert({
          user_id: user.id,
          clock_in_time: new Date().toISOString(),
          clock_in_location: location || null,
          notes: notes || null
        })
        .select()
        .single();

      if (error) {
        if (isTableNotFoundError(error)) {
          return NextResponse.json(
            { error: 'Time clock system is not available yet.' },
            { status: 503 }
          );
        }
        console.error('Error clocking in:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Clocked in successfully',
        clockRecord: newClock
      });

    } else if (action === 'clock-out') {
      // Find today's active clock record
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: activeClock, error: fetchError } = await supabaseAdmin
        .from('time_clock')
        .select('*')
        .eq('user_id', user.id)
        .gte('clock_in_time', today.toISOString())
        .is('clock_out_time', null)
        .single();

      if (fetchError && isTableNotFoundError(fetchError)) {
        return NextResponse.json(
          { error: 'Time clock system is not available yet.' },
          { status: 503 }
        );
      }

      if (!activeClock) {
        return NextResponse.json(
          { error: 'No active clock-in found' },
          { status: 400 }
        );
      }

      // Update with clock-out time
      const { data: updatedClock, error } = await supabaseAdmin
        .from('time_clock')
        .update({
          clock_out_time: new Date().toISOString(),
          clock_out_location: location || null
        })
        .eq('id', activeClock.id)
        .select()
        .single();

      if (error) {
        if (isTableNotFoundError(error)) {
          return NextResponse.json(
            { error: 'Time clock system is not available yet.' },
            { status: 503 }
          );
        }
        console.error('Error clocking out:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Clocked out successfully',
        clockRecord: updatedClock
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "clock-in" or "clock-out"' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in POST /api/time-clock:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
