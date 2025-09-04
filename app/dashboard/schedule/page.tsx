'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ArrowLeft,
  Calendar,
  MapPin,
  Phone,
  Navigation,
  Eye,
  Plus,
  Clock,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  Search,
  ChevronRight as ArrowRight
} from 'lucide-react'
import { checkAuth } from '@/lib/auth'

interface Job {
  id: string
  jobNumber: string
  customerName: string
  address: string
  startTime: string
  endTime: string
  jobType: string
  status: 'pending' | 'in-progress' | 'completed' | 'urgent'
  phone: string
}

// Mock data for demonstration
const mockJobs: { [key: string]: Job[] } = {
  '2025-09-03': [
    {
      id: '1',
      jobNumber: 'JOB-2025-001',
      customerName: 'Metro Green Construction',
      address: '1234 Metro Plaza Dr, Seattle, WA',
      startTime: '9:00 AM',
      endTime: '11:00 AM',
      jobType: 'Concrete Cutting',
      status: 'pending',
      phone: '(206) 555-0123'
    },
    {
      id: '2',
      jobNumber: 'JOB-2025-002',
      customerName: 'ABC Concrete LLC',
      address: '5678 Industrial Way, Bellevue, WA',
      startTime: '11:30 AM',
      endTime: '2:00 PM',
      jobType: 'Core Drilling',
      status: 'in-progress',
      phone: '(425) 555-0456'
    },
    {
      id: '3',
      jobNumber: 'JOB-2025-003',
      customerName: 'Downtown Development',
      address: '910 Pike Street, Seattle, WA',
      startTime: '2:00 PM',
      endTime: '4:00 PM',
      jobType: 'Wall Sawing',
      status: 'pending',
      phone: '(206) 555-0789'
    },
    {
      id: '4',
      jobNumber: 'JOB-2025-004',
      customerName: 'City Infrastructure',
      address: '321 Municipal Building, Seattle, WA',
      startTime: '4:30 PM',
      endTime: '6:30 PM',
      jobType: 'Slab Sawing',
      status: 'completed',
      phone: '(206) 555-0234'
    }
  ],
  '2025-09-04': [
    {
      id: '4',
      jobNumber: 'JOB-2025-004',
      customerName: 'Rainier Development',
      address: '321 Mountain View Ave, Bellevue, WA',
      startTime: '8:00 AM',
      endTime: '11:00 AM',
      jobType: 'Slab Sawing',
      status: 'pending',
      phone: '(425) 555-0234'
    },
    {
      id: '5',
      jobNumber: 'JOB-2025-005',
      customerName: 'Sound Construction Co',
      address: '789 Waterfront Way, Seattle, WA',
      startTime: '2:00 PM',
      endTime: '5:00 PM',
      jobType: 'Concrete Cutting',
      status: 'urgent',
      phone: '(206) 555-0567'
    }
  ],
  '2025-09-02': [
    {
      id: '6',
      jobNumber: 'JOB-2025-006',
      customerName: 'Northwest Builders',
      address: '456 Cedar Lane, Everett, WA',
      startTime: '10:00 AM',
      endTime: '2:00 PM',
      jobType: 'Core Drilling',
      status: 'completed',
      phone: '(425) 555-0890'
    }
  ]
}

export default function SchedulePage() {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [jobs, setJobs] = useState<Job[]>([])
  const [filter, setFilter] = useState<'all' | 'pending' | 'in-progress' | 'completed'>('all')
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    // Check authentication
    const user = checkAuth()
    if (!user) {
      router.push('/login')
      return
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    // Load jobs for selected date
    const dateKey = selectedDate.toISOString().split('T')[0]
    const dayJobs = mockJobs[dateKey] || []
    
    // Apply filter
    let filteredJobs = filter === 'all' 
      ? dayJobs 
      : dayJobs.filter(job => job.status === filter)
    
    // Apply search filter
    if (searchQuery) {
      filteredJobs = filteredJobs.filter(job =>
        job.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.jobType.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    setJobs(filteredJobs)
  }, [selectedDate, filter, searchQuery])

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getDateDays = () => {
    const days = []
    for (let i = -3; i <= 3; i++) {
      const date = new Date(selectedDate)
      date.setDate(date.getDate() + i)
      const dateKey = date.toISOString().split('T')[0]
      const jobCount = mockJobs[dateKey]?.length || 0
      days.push({ date, jobCount, isToday: i === 0 })
    }
    return days
  }

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
    setSelectedDate(newDate)
  }

  const getStatusColor = (status: Job['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-500'
      case 'in-progress': return 'bg-yellow-500'
      case 'pending': return 'bg-blue-500'
      case 'urgent': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusBgColor = (status: Job['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-500/10 text-green-400 border-green-500/30'
      case 'in-progress': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
      case 'pending': return 'bg-blue-500/10 text-blue-400 border-blue-500/30'
      case 'urgent': return 'bg-red-500/10 text-red-400 border-red-500/30'
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30'
    }
  }

  const getJobTypeColor = (type: string) => {
    const colors: { [key: string]: string } = {
      'Concrete Cutting': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
      'Core Drilling': 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      'Wall Sawing': 'bg-orange-500/10 text-orange-400 border-orange-500/30',
      'Slab Sawing': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
    }
    return colors[type] || 'bg-gray-500/10 text-gray-400 border-gray-500/30'
  }

  const totalJobs = mockJobs[selectedDate.toISOString().split('T')[0]]?.length || 0
  const completedJobs = mockJobs[selectedDate.toISOString().split('T')[0]]?.filter(j => j.status === 'completed').length || 0
  const pendingJobs = mockJobs[selectedDate.toISOString().split('T')[0]]?.filter(j => j.status === 'pending' || j.status === 'urgent').length || 0

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 animate-gradient-shift">
      {/* Floating Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-gradient-to-br from-cyan-500/10 to-indigo-600/10 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-gradient-to-tr from-indigo-600/10 to-purple-600/10 rounded-full blur-3xl animate-float-slow" style={{ animationDelay: '5s' }} />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="backdrop-blur-xl bg-white/5 border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Calendar className="w-6 h-6 text-cyan-400" />
                    Schedule & Jobs
                  </h1>
                  <p className="text-blue-200/70 text-sm">{formatDate(selectedDate)}</p>
                </div>
              </div>
              
              {/* Quick Stats */}
              <div className="hidden md:flex items-center gap-2 backdrop-blur-xl bg-white/5 rounded-xl px-4 py-2 border border-white/10">
                <span className="text-white font-semibold">{totalJobs} jobs today</span>
                <span className="text-white/40">•</span>
                <span className="text-green-400">{completedJobs} completed</span>
                <span className="text-white/40">•</span>
                <span className="text-yellow-400">{pendingJobs} pending</span>
              </div>
            </div>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="backdrop-blur-xl bg-white/5 border-b border-white/10 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateDate('prev')}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
              
              <div className="flex-1 overflow-x-auto">
                <div className="flex gap-2 min-w-max">
                  {getDateDays().map((day, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedDate(day.date)}
                      className={`
                        px-4 py-3 rounded-xl transition-all duration-200 min-w-[100px]
                        ${day.isToday 
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25' 
                          : day.date.toDateString() === selectedDate.toDateString()
                          ? 'bg-white/10 text-white border border-white/20'
                          : 'bg-white/5 text-white/70 hover:bg-white/10'
                        }
                      `}
                    >
                      <div className="text-xs opacity-70">
                        {day.date.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div className="text-lg font-semibold">
                        {day.date.getDate()}
                      </div>
                      {day.jobCount > 0 && (
                        <div className="mt-1">
                          <span className="inline-block px-2 py-0.5 bg-white/20 rounded-full text-xs">
                            {day.jobCount}
                          </span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              
              <button
                onClick={() => navigateDate('next')}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by customer, address, or job type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all duration-300"
              />
            </div>
          </div>
          
          {/* Filter Buttons */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {['all', 'pending', 'in-progress', 'completed'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f as typeof filter)}
                  className={`
                    px-4 py-2 rounded-lg capitalize transition-all duration-200 whitespace-nowrap
                    ${filter === f 
                      ? 'bg-white/10 text-white border border-white/20' 
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }
                  `}
                >
                  {f === 'in-progress' ? 'In Progress' : f}
                </button>
              ))}
            </div>
            
            <button className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group">
              <RefreshCw className="w-5 h-5 text-white/60 group-hover:text-white" />
            </button>
          </div>
        </div>

        {/* Jobs List */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          {jobs.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-block p-4 bg-white/5 rounded-full mb-4">
                <Calendar className="w-12 h-12 text-white/40" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">No jobs scheduled</h3>
              <p className="text-white/60">There are no jobs scheduled for this date</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {jobs.map((job, index) => (
                <div
                  key={job.id}
                  onClick={() => router.push(`/dashboard/schedule/${job.id}`)}
                  onMouseEnter={() => setHoveredCard(job.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className={`
                    backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-6 cursor-pointer
                    transform transition-all duration-300 group relative overflow-hidden
                    hover:scale-[1.02] hover:bg-white/[0.08] hover:border-cyan-400/30 hover:shadow-lg hover:shadow-cyan-500/10
                    active:scale-[0.98] active:opacity-90
                    ${hoveredCard === job.id ? 'border-cyan-400/20' : ''}
                  `}
                  style={{
                    animation: `slideInUp 0.5s ease-out ${index * 0.1}s both`
                  }}
                >
                  {/* Hover Glow Effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                    <div className="flex-1">
                      {/* Job Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${getStatusColor(job.status)} animate-pulse`} />
                          <span className="text-white/60 text-sm">{job.jobNumber}</span>
                          <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${getStatusBgColor(job.status)}`}>
                            {job.status === 'in-progress' ? 'In Progress' : job.status}
                          </span>
                        </div>
                      </div>
                      
                      {/* Customer Name - Now with search functionality */}
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xl font-bold text-white group-hover:text-cyan-400 transition-colors">
                          {job.customerName}
                        </h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSearchQuery(job.customerName)
                          }}
                          className="text-cyan-400 hover:text-cyan-300 text-sm px-2 py-1 rounded transition-colors"
                          title="Filter by customer"
                        >
                          Filter
                        </button>
                      </div>
                      
                      {/* Job Details */}
                      <div className="space-y-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            // Open maps application
                            window.open(`https://maps.google.com/?q=${encodeURIComponent(job.address)}`, '_blank')
                          }}
                          className="flex items-center gap-2 text-blue-200/70 hover:text-cyan-400 transition-colors"
                        >
                          <MapPin className="w-4 h-4" />
                          <span className="text-sm">{job.address}</span>
                        </button>
                        
                        <div className="flex items-center gap-2 text-blue-200/70">
                          <Clock className="w-4 h-4" />
                          <span className="text-sm font-semibold">{job.startTime} - {job.endTime}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-lg text-xs font-medium border ${getJobTypeColor(job.jobType)}`}>
                            {job.jobType}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Quick Actions and Arrow */}
                    <div className="flex items-center gap-3">
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            window.open(`tel:${job.phone}`, '_self')
                          }}
                          className="p-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-400 hover:to-emerald-400 transition-all duration-200 transform hover:scale-110"
                          title="Call customer"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            window.open(`https://maps.google.com/?q=${encodeURIComponent(job.address)}`, '_blank')
                          }}
                          className="p-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all duration-200 transform hover:scale-110"
                          title="Navigate to location"
                        >
                          <Navigation className="w-4 h-4" />
                        </button>
                      </div>
                      
                      {/* Arrow Indicator */}
                      <div className="text-white/40 group-hover:text-cyan-400 transition-colors">
                        <ArrowRight className="w-5 h-5" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Floating Action Button */}
        <button className="fixed bottom-6 right-6 p-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full shadow-lg shadow-cyan-500/25 hover:scale-110 transition-transform duration-200 z-30">
          <Plus className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Animations */}
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
        
        @keyframes slideInUp {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}