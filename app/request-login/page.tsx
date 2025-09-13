'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Send,
  User,
  Mail,
  Phone,
  Building,
  FileText,
  CheckCircle,
  Loader2
} from 'lucide-react'

export default function RequestLoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    role: '',
    reason: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 2000))

    setIsSuccess(true)
    setIsLoading(false)

    // Redirect after success
    setTimeout(() => {
      router.push('/login')
    }, 3000)
  }

  return (
    <div className="min-h-screen relative overflow-hidden animate-gradient-shift">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950" />

      {/* Subtle floating orbs */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-gradient-to-br from-cyan-500/10 to-blue-600/10 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-gradient-to-tr from-indigo-600/10 to-purple-600/10 rounded-full blur-3xl animate-float-slow" style={{ animationDelay: '5s' }} />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Login
              </Link>
            </div>
            <h1 className="text-4xl font-bold text-white mb-3">Request Access</h1>
            <p className="text-blue-200 text-lg">
              Submit your request for access to Pontifex Industries system
            </p>
          </div>

          {/* Main Form Card */}
          {isSuccess ? (
            <div className="backdrop-blur-2xl bg-white/[0.07] rounded-3xl shadow-2xl border border-white/20 p-12 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/20 rounded-full mb-6">
                <CheckCircle className="w-12 h-12 text-green-400" />
              </div>
              <h2 className="text-2xl font-semibold text-white mb-3">Request Submitted!</h2>
              <p className="text-blue-200 mb-6">
                Your access request has been received. An administrator will review your request
                and contact you within 24-48 hours.
              </p>
              <p className="text-blue-300/60 text-sm">
                Redirecting to login page...
              </p>
            </div>
          ) : (
            <div className="backdrop-blur-2xl bg-white/[0.07] rounded-3xl shadow-2xl border border-white/20 p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Full Name */}
                  <div className="space-y-2">
                    <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                      <User className="w-4 h-4 text-cyan-400" />
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                      placeholder="John Doe"
                      required
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                      <Mail className="w-4 h-4 text-cyan-400" />
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                      placeholder="john@company.com"
                      required
                    />
                  </div>

                  {/* Phone */}
                  <div className="space-y-2">
                    <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                      <Phone className="w-4 h-4 text-cyan-400" />
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                      placeholder="(555) 123-4567"
                    />
                  </div>

                  {/* Company */}
                  <div className="space-y-2">
                    <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                      <Building className="w-4 h-4 text-cyan-400" />
                      Company
                    </label>
                    <input
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                      placeholder="Company Name"
                    />
                  </div>
                </div>

                {/* Role */}
                <div className="space-y-2">
                  <label className="text-blue-100 text-sm font-medium">
                    Role / Position
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                  >
                    <option value="" className="bg-slate-900">Select Role</option>
                    <option value="operator" className="bg-slate-900">Equipment Operator</option>
                    <option value="manager" className="bg-slate-900">Project Manager</option>
                    <option value="supervisor" className="bg-slate-900">Site Supervisor</option>
                    <option value="admin" className="bg-slate-900">Administrator</option>
                    <option value="client" className="bg-slate-900">Client</option>
                    <option value="other" className="bg-slate-900">Other</option>
                  </select>
                </div>

                {/* Reason */}
                <div className="space-y-2">
                  <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4 text-cyan-400" />
                    Reason for Access
                  </label>
                  <textarea
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all min-h-[120px]"
                    placeholder="Please describe why you need access to the system..."
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold py-3.5 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg hover:shadow-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Submitting Request...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" />
                      Submit Request
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Footer Note */}
          <div className="mt-6 text-center">
            <p className="text-blue-300/60 text-sm">
              For immediate assistance, please contact support at{' '}
              <a href="mailto:support@pontifex.com" className="text-cyan-400 hover:text-cyan-300">
                support@pontifex.com
              </a>
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
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