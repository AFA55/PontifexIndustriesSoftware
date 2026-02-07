import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // Verify authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      operatorId,
      cleanlinessRating,
      communicationRating,
      overallRating
    } = body;

    if (!operatorId) {
      return NextResponse.json({ error: 'Operator ID is required' }, { status: 400 });
    }

    // Validate ratings are between 1-10
    const ratings = [cleanlinessRating, communicationRating, overallRating].filter(r => r !== null && r !== undefined);
    if (ratings.some(r => r < 1 || r > 10)) {
      return NextResponse.json({ error: 'Ratings must be between 1 and 10' }, { status: 400 });
    }

    // Get current operator ratings
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('cleanliness_rating_avg, cleanliness_rating_count, communication_rating_avg, communication_rating_count, overall_rating_avg, overall_rating_count, total_ratings_received')
      .eq('id', operatorId)
      .single();

    if (fetchError) {
      console.error('Error fetching operator profile:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch operator profile' }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
    }

    // Calculate new averages using incremental average formula:
    // new_avg = ((old_avg * old_count) + new_value) / (old_count + 1)

    const updates: any = {
      total_ratings_received: profile.total_ratings_received + 1,
      last_rating_received_at: new Date().toISOString()
    };

    if (cleanlinessRating !== null && cleanlinessRating !== undefined) {
      const oldAvg = profile.cleanliness_rating_avg || 0;
      const oldCount = profile.cleanliness_rating_count || 0;
      const newCount = oldCount + 1;
      const newAvg = ((oldAvg * oldCount) + cleanlinessRating) / newCount;

      updates.cleanliness_rating_avg = parseFloat(newAvg.toFixed(2));
      updates.cleanliness_rating_count = newCount;
    }

    if (communicationRating !== null && communicationRating !== undefined) {
      const oldAvg = profile.communication_rating_avg || 0;
      const oldCount = profile.communication_rating_count || 0;
      const newCount = oldCount + 1;
      const newAvg = ((oldAvg * oldCount) + communicationRating) / newCount;

      updates.communication_rating_avg = parseFloat(newAvg.toFixed(2));
      updates.communication_rating_count = newCount;
    }

    if (overallRating !== null && overallRating !== undefined) {
      const oldAvg = profile.overall_rating_avg || 0;
      const oldCount = profile.overall_rating_count || 0;
      const newCount = oldCount + 1;
      const newAvg = ((oldAvg * oldCount) + overallRating) / newCount;

      updates.overall_rating_avg = parseFloat(newAvg.toFixed(2));
      updates.overall_rating_count = newCount;
    }

    // Update operator profile with new ratings
    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', operatorId);

    if (updateError) {
      console.error('Error updating operator ratings:', updateError);
      return NextResponse.json({ error: 'Failed to update operator ratings' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Operator ratings updated successfully',
      updates
    });

  } catch (error: any) {
    console.error('Error in operator ratings update:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
