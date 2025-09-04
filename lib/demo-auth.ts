// Demo authentication for development and testing
// This allows login without a real Supabase account

const DEMO_CREDENTIALS = {
  email: 'demo@pontifex.com',
  password: 'Demo1234!'
}

export async function handleDemoLogin(email: string, password: string): Promise<boolean> {
  // Check if the provided credentials match our demo account
  if (email.toLowerCase() === DEMO_CREDENTIALS.email.toLowerCase() && 
      password === DEMO_CREDENTIALS.password) {
    
    // Simulate authentication delay
    await new Promise(resolve => setTimeout(resolve, 800))
    
    // Set a flag in localStorage to indicate demo mode
    if (typeof window !== 'undefined') {
      localStorage.setItem('isDemoUser', 'true')
      localStorage.setItem('demoUserEmail', DEMO_CREDENTIALS.email)
    }
    
    return true
  }
  
  return false
}

export function isDemoUser(): boolean {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('isDemoUser') === 'true'
  }
  return false
}

export function getDemoUserEmail(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('demoUserEmail')
  }
  return null
}

export function clearDemoAuth(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('isDemoUser')
    localStorage.removeItem('demoUserEmail')
  }
}