// Authentication helper functions for demo/localStorage auth
// This will be replaced with Supabase auth in production

interface User {
  email: string
  name: string
  id: string
}

const STORAGE_KEY = 'pontifex_auth_user'
const DEMO_CREDENTIALS = {
  email: 'demo@pontifex.com',
  password: 'Demo1234!',
  name: 'Demo User'
}

// Check if user is authenticated
export function checkAuth(): User | null {
  if (typeof window === 'undefined') return null
  
  try {
    const storedUser = localStorage.getItem(STORAGE_KEY)
    if (storedUser) {
      return JSON.parse(storedUser)
    }
  } catch (error) {
    console.error('Error checking auth:', error)
  }
  
  return null
}

// Login function
export async function login(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  // Simulate network delay for realistic feel
  await new Promise(resolve => setTimeout(resolve, 800))
  
  // Check demo credentials
  if (email.toLowerCase() === DEMO_CREDENTIALS.email.toLowerCase() && password === DEMO_CREDENTIALS.password) {
    const user: User = {
      email: DEMO_CREDENTIALS.email,
      name: DEMO_CREDENTIALS.name,
      id: 'demo-user-001'
    }
    
    // Store in localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    
    return { success: true, user }
  }
  
  // For any other credentials, return error
  return { 
    success: false, 
    error: 'Invalid email or password. Try the demo account.' 
  }
}

// Logout function
export function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY)
  }
}

// Get demo credentials
export function getDemoCredentials() {
  return {
    email: DEMO_CREDENTIALS.email,
    password: DEMO_CREDENTIALS.password
  }
}

// Check if user is using demo account
export function isDemoUser(): boolean {
  const user = checkAuth()
  return user?.email === DEMO_CREDENTIALS.email
}

// Get user display name
export function getUserDisplayName(): string {
  const user = checkAuth()
  if (!user) return 'User'
  
  // Extract first name from full name or email
  if (user.name) {
    return user.name.split(' ')[0]
  }
  
  // Fallback to email username
  return user.email.split('@')[0].charAt(0).toUpperCase() + user.email.split('@')[0].slice(1)
}