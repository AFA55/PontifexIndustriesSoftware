import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  // For now, we're handling auth on the client side with localStorage
  // This middleware is commented out but ready for Supabase integration
  
  /*
  // Original Supabase auth code - uncomment when ready to use
  const res = NextResponse.next()
  
  // Get Supabase environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If environment variables are not set, skip middleware
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase environment variables not found. Auth middleware disabled.')
    return res
  }

  // Create Supabase client for middleware
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false
    }
  })

  // Get the token from cookies
  const token = req.cookies.get('sb-access-token')?.value

  let user = null
  if (token) {
    try {
      const { data } = await supabase.auth.getUser(token)
      user = data.user
    } catch (error) {
      console.error('Error getting user:', error)
    }
  }

  // If user is not signed in and the current path is protected
  if (!user && req.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // If user is signed in and the current path is /login
  if (user && req.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
  */
  
  // For demo/localStorage auth, just pass through all requests
  // Auth checking happens on the client side in each component
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
}