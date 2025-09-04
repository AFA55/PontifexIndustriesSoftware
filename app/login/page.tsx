'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Mail, 
  Loader2,
  CheckCircle,
  AlertCircle,
  UserCheck
} from 'lucide-react'
import { login, getDemoCredentials, checkAuth } from '@/lib/auth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    // Check if already logged in
    const user = checkAuth()
    if (user) {
      router.push('/dashboard')
    }
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email || !password) {
      setError('Please enter your email and password')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const result = await login(email, password)
      
      if (result.success) {
        setIsSuccess(true)
        await new Promise(resolve => setTimeout(resolve, 500))
        router.push('/dashboard')
      } else {
        setError(result.error || 'Invalid email or password')
        setIsLoading(false)
      }
    } catch (error: any) {
      setError('An unexpected error occurred. Please try again.')
      setIsLoading(false)
    }
  }

  const useDemoAccount = () => {
    const demo = getDemoCredentials()
    setEmail(demo.email)
    setPassword(demo.password)
    setError('')
  }

  return (
    <div className="min-h-screen relative overflow-hidden animate-gradient-shift">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950" />
      
      {/* Subtle floating orbs for depth */}
      <div className="absolute inset-0">
        <div className="absolute top-1/3 -left-20 w-80 h-80 bg-gradient-to-br from-cyan-500/10 to-blue-600/10 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute bottom-1/3 -right-20 w-96 h-96 bg-gradient-to-tr from-indigo-600/10 to-purple-600/10 rounded-full blur-3xl animate-float-slow" style={{ animationDelay: '5s' }} />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Company Branding */}
          <div className="text-center mb-8 transform transition-all duration-500 hover:scale-105">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="w-24 h-24 bg-gradient-to-tr from-cyan-400 to-blue-600 rounded-3xl rotate-45 flex items-center justify-center shadow-2xl shadow-cyan-500/50">
                  <span className="text-white text-5xl font-bold -rotate-45">P</span>
                </div>
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-blue-600 rounded-3xl rotate-45 blur opacity-50 animate-pulse" />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Pontifex Industries
            </h1>
            <p className="text-blue-200">Concrete Cutting Management System</p>
          </div>

          {/* Main Glass Card */}
          <div className="backdrop-blur-2xl bg-white/[0.07] rounded-3xl shadow-2xl border border-white/20 p-8 transform transition-all duration-300 hover:shadow-cyan-500/20">
            <h2 className="text-2xl font-semibold text-white mb-6 text-center">Welcome Back</h2>

            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/50 rounded-xl p-3 text-red-300 text-sm flex items-center space-x-2 animate-shake">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* User ID (Email) */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium">User ID (Email)</label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 w-5 h-5 transition-colors group-focus-within:text-cyan-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-11 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all duration-300"
                    placeholder="your@email.com"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 w-5 h-5 transition-colors group-focus-within:text-cyan-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-11 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all duration-300"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-cyan-400 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-500" />
                  <span className="text-blue-200 text-sm">Remember me</span>
                </label>
                <a href="#" className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors">
                  Forgot password?
                </a>
              </div>

              <button
                type="submit"
                disabled={isLoading || isSuccess}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold py-3.5 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg hover:shadow-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative flex items-center">
                  {isLoading && !isSuccess && (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Signing in...
                    </>
                  )}
                  {isSuccess && (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2 animate-bounce" />
                      Welcome back!
                    </>
                  )}
                  {!isLoading && !isSuccess && 'Sign In'}
                </span>
              </button>

              {/* Demo Account Button */}
              <div className="pt-4">
                <button
                  type="button"
                  onClick={useDemoAccount}
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium py-3 rounded-xl hover:from-indigo-400 hover:to-purple-500 transition-all duration-300 transform hover:scale-[1.01] flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-5 h-5" />
                  Use Demo Account
                </button>
              </div>

              {/* Request Access Link */}
              <div className="text-center pt-4 border-t border-white/10">
                <p className="text-blue-200 text-sm">
                  Need access to the system?{' '}
                  <a href="/request-login" className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium">
                    Request Login
                  </a>
                </p>
              </div>
            </form>
          </div>

          {/* Demo Credentials Notice */}
          <div className="mt-6 p-4 backdrop-blur-xl bg-cyan-500/5 rounded-2xl border border-cyan-500/20">
            <p className="text-cyan-200 text-xs text-center">
              Demo credentials will be auto-filled when you click "Use Demo Account"
            </p>
          </div>

          <p className="text-center text-blue-300/60 mt-6 text-xs">
            © 2024 Pontifex Industries. Enterprise Construction Management.
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
          20%, 40%, 60%, 80% { transform: translateX(2px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient-shift {
          background-size: 200% 200%;
          animation: gradient-shift 15s ease infinite;
        }
        
        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        .animate-float-slow {
          animation: float-slow 20s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}