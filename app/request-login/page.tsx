'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Mail, 
  Loader2, 
  Hash, 
  Monitor, 
  MapPin,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function RequestLoginPage() {
  const [peakClientId, setPeakClientId] = useState('')
  const [email, setEmail] = useState('')
  const [deviceDescription, setDeviceDescription] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({})
  const router = useRouter()

  useEffect(() => {
    // Validate passwords match
    if (confirmPassword && password !== confirmPassword) {
      setValidationErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }))
    } else {
      setValidationErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors.confirmPassword
        return newErrors
      })
    }
  }, [password, confirmPassword])

  const validateForm = () => {
    const errors: {[key: string]: string} = {}
    
    if (!peakClientId) errors.peakClientId = 'Peak Client ID is required'
    if (!email) errors.email = 'User ID (Email) is required'
    if (!deviceDescription) errors.deviceDescription = 'Device Description is required'
    if (!password) errors.password = 'Password is required'
    if (!confirmPassword) errors.confirmPassword = 'Please confirm your password'
    if (password && confirmPassword && password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }
    if (password && password.length < 8) {
      errors.password = 'Password must be at least 8 characters'
    }
    
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      setError('Please fill in all required fields correctly')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // Simulate processing delay for animation
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error
      
      setIsSuccess(true)
      await new Promise(resolve => setTimeout(resolve, 1000))
      router.push('/dashboard')
    } catch (error: any) {
      setError(error.message)
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden animate-gradient-shift">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950" />
      
      {/* Subtle floating orbs for depth */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-64 h-64 bg-gradient-to-br from-cyan-500/10 to-blue-600/10 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-tr from-indigo-600/10 to-purple-600/10 rounded-full blur-3xl animate-float-slow" style={{ animationDelay: '3s' }} />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
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
            <h2 className="text-2xl font-semibold text-white mb-6 text-center">Request System Access</h2>

            {/* Location Permission Notice */}
            <div className="mb-6 p-4 backdrop-blur-xl bg-cyan-500/10 rounded-2xl border border-cyan-500/30 transform transition-all duration-300 hover:bg-cyan-500/15">
              <div className="flex items-start space-x-3">
                <MapPin className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-cyan-100 text-sm font-medium">Location Services Required</p>
                  <p className="text-cyan-200/70 text-xs mt-1">This application requires location access for job site tracking and crew management.</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/50 rounded-xl p-3 text-red-300 text-sm flex items-center space-x-2 animate-shake">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Peak Client ID */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium">Peak Client ID</label>
                <div className="relative group">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 w-5 h-5 transition-colors group-focus-within:text-cyan-400" />
                  <input
                    type="text"
                    value={peakClientId}
                    onChange={(e) => setPeakClientId(e.target.value)}
                    className={`w-full bg-white/5 border ${validationErrors.peakClientId ? 'border-red-500/50' : 'border-white/10'} rounded-xl px-11 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all duration-300`}
                    placeholder="Enter your Peak Client ID"
                  />
                  {validationErrors.peakClientId && (
                    <p className="text-red-400 text-xs mt-1">{validationErrors.peakClientId}</p>
                  )}
                </div>
              </div>

              {/* User ID (Email) */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium">User ID (Email)</label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 w-5 h-5 transition-colors group-focus-within:text-cyan-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full bg-white/5 border ${validationErrors.email ? 'border-red-500/50' : 'border-white/10'} rounded-xl px-11 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all duration-300`}
                    placeholder="your@email.com"
                  />
                  {validationErrors.email && (
                    <p className="text-red-400 text-xs mt-1">{validationErrors.email}</p>
                  )}
                </div>
              </div>

              {/* Device Description */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium">Device Description</label>
                <div className="relative group">
                  <Monitor className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 w-5 h-5 transition-colors group-focus-within:text-cyan-400" />
                  <input
                    type="text"
                    value={deviceDescription}
                    onChange={(e) => setDeviceDescription(e.target.value)}
                    className={`w-full bg-white/5 border ${validationErrors.deviceDescription ? 'border-red-500/50' : 'border-white/10'} rounded-xl px-11 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all duration-300`}
                    placeholder="e.g., Office Desktop, Field Tablet"
                  />
                  {validationErrors.deviceDescription && (
                    <p className="text-red-400 text-xs mt-1">{validationErrors.deviceDescription}</p>
                  )}
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
                    className={`w-full bg-white/5 border ${validationErrors.password ? 'border-red-500/50' : 'border-white/10'} rounded-xl px-11 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all duration-300`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-cyan-400 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                  {validationErrors.password && (
                    <p className="text-red-400 text-xs mt-1">{validationErrors.password}</p>
                  )}
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium">Confirm Password</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 w-5 h-5 transition-colors group-focus-within:text-cyan-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`w-full bg-white/5 border ${validationErrors.confirmPassword ? 'border-red-500/50' : 'border-white/10'} rounded-xl px-11 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all duration-300`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-cyan-400 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                  {validationErrors.confirmPassword && (
                    <p className="text-red-400 text-xs mt-1">{validationErrors.confirmPassword}</p>
                  )}
                </div>
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
                      Processing Request...
                    </>
                  )}
                  {isSuccess && (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2 animate-bounce" />
                      Access Granted!
                    </>
                  )}
                  {!isLoading && !isSuccess && 'Request Login'}
                </span>
              </button>

              {/* Links */}
              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <a href="#" className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors">
                  Forgot password?
                </a>
                <a href="/login" className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors">
                  Already have an account? Regular Login
                </a>
              </div>
            </form>
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