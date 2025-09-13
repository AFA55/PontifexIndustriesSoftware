'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar,
  Clock,
  CheckCircle,
  LogOut,
  Loader2,
  Wrench,
  User,
  Activity
} from 'lucide-react'
import { checkAuth, logout, getUserDisplayName } from '@/lib/auth'

interface MenuCard {
  title: string
  icon: React.ComponentType<{ className?: string }>
  iconGradient: string
  action: () => void
  description: string
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('User')
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isClocked, setIsClocked] = useState(false)
  const [todaysJobs] = useState(5)
  const [hoursLogged] = useState(6.5)
  const router = useRouter()

  useEffect(() => {
    // Check authentication
    const user = checkAuth()
    if (!user) {
      router.push('/login')
      return
    }
    
    // Set user name
    setUserName(getUserDisplayName())
    setLoading(false)
    
    // Update time every minute
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)
    
    return () => clearInterval(interval)
  }, [router])

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const menuCards: MenuCard[] = [
    {
      title: 'Schedule & Jobs',
      icon: Calendar,
      iconGradient: 'from-blue-400 to-cyan-500',
      action: () => router.push('/dashboard/schedule'),
      description: 'View and manage today\'s schedule'
    },
    {
      title: 'Time Tracking',
      icon: Clock,
      iconGradient: 'from-purple-400 to-pink-500',
      action: () => {
        console.log('Time Tracking clicked')
        setIsClocked(!isClocked)
      },
      description: 'Clock in/out and view timecard'
    },
    {
      title: 'Complete Day',
      icon: CheckCircle,
      iconGradient: 'from-green-400 to-emerald-500',
      action: () => console.log('Complete Day clicked'),
      description: 'Mark daily tasks as finished'
    },
    {
      title: 'Manage Tools',
      icon: Wrench,
      iconGradient: 'from-orange-400 to-yellow-500',
      action: () => router.push('/equipment-dashboard'),
      description: 'Asset and equipment management'
    },
    {
      title: 'Sign Out',
      icon: LogOut,
      iconGradient: 'from-red-400 to-rose-500',
      action: handleLogout,
      description: 'End your session'
    }
  ]

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-blue-200">Loading your workspace...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 relative overflow-hidden animate-gradient-shift">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-gradient-to-br from-cyan-500/10 to-indigo-600/10 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-gradient-to-tr from-indigo-600/10 to-purple-600/10 rounded-full blur-3xl animate-float-slow" style={{ animationDelay: '5s' }} />
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex flex-col p-6 md:p-8">
        {/* Top Bar with Logo, Date/Time, and Stats */}
        <div className="w-full max-w-7xl mx-auto mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            {/* Logo and Date/Time */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 bg-gradient-to-tr from-cyan-400 to-blue-600 rounded-xl rotate-45 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                  <span className="text-white text-2xl font-bold -rotate-45">P</span>
                </div>
              </div>
              <div>
                <p className="text-white/60 text-sm">{formatDate(currentTime)}</p>
                <p className="text-white text-lg font-semibold">{formatTime(currentTime)}</p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex gap-6 backdrop-blur-xl bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <div>
                  <p className="text-white/60 text-xs">Today's Jobs</p>
                  <p className="text-white font-semibold">{todaysJobs} active</p>
                </div>
              </div>
              <div className="flex items-center gap-2 border-l border-white/10 pl-6">
                <Clock className="w-4 h-4 text-purple-400" />
                <div>
                  <p className="text-white/60 text-xs">Hours Logged</p>
                  <p className="text-white font-semibold">{hoursLogged} today</p>
                </div>
              </div>
              <div className="flex items-center gap-2 border-l border-white/10 pl-6">
                <User className="w-4 h-4 text-green-400" />
                <div>
                  <p className="text-white/60 text-xs">Current Status</p>
                  <p className={`font-semibold ${isClocked ? 'text-green-400' : 'text-yellow-400'}`}>
                    {isClocked ? 'Clocked In' : 'Clocked Out'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-6xl">
            {/* Welcome Section */}
            <div className="text-center mb-10 animate-fade-in">
              <h1 className="text-5xl font-bold text-white mb-3">
                Welcome, <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">{userName}</span>
              </h1>
              <p className="text-blue-200/70 text-xl">Select an action to get started</p>
            </div>

            {/* Action Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {menuCards.slice(0, 3).map((card, index) => {
                const Icon = card.icon
                const isHovered = hoveredCard === index
                
                return (
                  <button
                    key={index}
                    onClick={card.action}
                    onMouseEnter={() => setHoveredCard(index)}
                    onMouseLeave={() => setHoveredCard(null)}
                    className={`
                      relative group transform transition-all duration-300 
                      ${isHovered ? 'scale-105 -translate-y-1' : 'scale-100'}
                    `}
                    style={{
                      animation: `fadeInUp 0.5s ease-out ${index * 0.1}s both`
                    }}
                  >
                    <div className="backdrop-blur-xl bg-white/5 rounded-2xl p-8 border border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 h-full cursor-pointer">
                      <div className="flex flex-col items-center text-center">
                        <div className={`p-5 rounded-2xl bg-gradient-to-br ${card.iconGradient} mb-4 transform group-hover:scale-110 transition-transform duration-300`}>
                          <Icon className="w-12 h-12 text-white" />
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-2">{card.title}</h3>
                        <p className="text-blue-200/60 text-sm">{card.description}</p>
                      </div>
                      <div className={`absolute -inset-0.5 rounded-2xl bg-gradient-to-br ${card.iconGradient} opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300`} />
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Bottom Row Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {menuCards.slice(3).map((card, index) => {
                const Icon = card.icon
                const realIndex = index + 3
                const isHovered = hoveredCard === realIndex
                
                return (
                  <button
                    key={realIndex}
                    onClick={card.action}
                    onMouseEnter={() => setHoveredCard(realIndex)}
                    onMouseLeave={() => setHoveredCard(null)}
                    className={`
                      relative group transform transition-all duration-300 
                      ${isHovered ? 'scale-105 -translate-y-1' : 'scale-100'}
                    `}
                    style={{
                      animation: `fadeInUp 0.5s ease-out ${realIndex * 0.1}s both`
                    }}
                  >
                    <div className="backdrop-blur-xl bg-white/5 rounded-2xl p-6 border border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className={`p-4 rounded-xl bg-gradient-to-br ${card.iconGradient} transform group-hover:scale-110 transition-transform duration-300`}>
                          <Icon className="w-8 h-8 text-white" />
                        </div>
                        <div className="text-left">
                          <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                          <p className="text-blue-200/60 text-sm">{card.description}</p>
                        </div>
                      </div>
                      <div className={`absolute -inset-0.5 rounded-2xl bg-gradient-to-br ${card.iconGradient} opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300`} />
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Footer */}
            <div className="text-center mt-10">
              <p className="text-blue-300/40 text-sm">
                Pontifex Industries • Enterprise Construction Management
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Animations */}
      <style jsx>{`
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        
        .animate-gradient-shift {
          background-size: 200% 200%;
          animation: gradient-shift 20s ease infinite;
        }
        
        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        
        .animate-float-slow {
          animation: float-slow 25s ease-in-out infinite;
        }
        
        @keyframes fadeInUp {
          0% {
            opacity: 0;
            transform: translateY(30px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        
        .animate-fade-in {
          animation: fade-in 0.8s ease-out;
        }
      `}</style>
    </div>
  )
}