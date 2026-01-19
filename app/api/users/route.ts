import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key'

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role')

    let query = supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('active', true)
      .order('full_name', { ascending: true })

    // Filter by role if specified
    if (role) {
      query = query.eq('role', role)
    }

    const { data: users, error } = await query

    if (error) {
      console.error('Error fetching users:', error)
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      )
    }

    // Map full_name to name for compatibility with frontend
    const formattedUsers = (users || []).map(user => ({
      id: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role
    }))

    return NextResponse.json(formattedUsers)

  } catch (error: any) {
    console.error('Error in users route:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
