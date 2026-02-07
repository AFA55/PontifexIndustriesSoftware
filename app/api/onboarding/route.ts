import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const type = searchParams.get('type'); // 'admin' or 'operator'

    if (!userId || !type) {
      return NextResponse.json(
        { error: 'Missing userId or type parameter' },
        { status: 400 }
      );
    }

    // Check onboarding status
    const { data, error } = await supabase
      .from('user_onboarding')
      .select('*')
      .eq('user_id', userId)
      .eq('onboarding_type', type)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "not found" which is okay
      console.error('Error fetching onboarding status:', error);
      return NextResponse.json(
        { error: 'Failed to fetch onboarding status' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      hasCompleted: data?.completed || false,
      hasSkipped: data?.skipped || false,
      completedAt: data?.completed_at || null,
    });
  } catch (error) {
    console.error('Error in onboarding GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, type, completed, skipped } = body;

    if (!userId || !type) {
      return NextResponse.json(
        { error: 'Missing userId or type' },
        { status: 400 }
      );
    }

    // Upsert onboarding record
    const { data, error } = await supabase
      .from('user_onboarding')
      .upsert({
        user_id: userId,
        onboarding_type: type,
        completed: completed || false,
        skipped: skipped || false,
        completed_at: completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,onboarding_type'
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving onboarding status:', error);
      return NextResponse.json(
        { error: 'Failed to save onboarding status' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error in onboarding POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
