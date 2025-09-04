'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { 
  ArrowLeft,
  MapPin,
  Phone,
  Clock,
  Users,
  Wrench,
  ChevronDown,
  ChevronUp,
  Copy,
  Camera,
  List,
  PenTool,
  AlertTriangle,
  Timer,
  CheckCircle2,
  Truck,
  HardHat,
  Download,
  Upload,
  Filter,
  User
} from 'lucide-react'
import { checkAuth } from '@/lib/auth'

interface JobDetail {
  id: string
  jobNumber: string
  orderNumber: string
  customerName: string
  address: string
  startTime: string
  endTime: string
  jobType: string
  status: 'pending' | 'in-progress' | 'completed' | 'urgent' | 'in-route'
  phone: string
  foreman: string
  foremanPhone: string
  officePhone: string
  assignedTechs: { name: string; truck: string }[]
  equipment: { item: string; checked: boolean; required: boolean }[]
  safetyRequirements: string[]
  specialEquipment: string[]
  description: string
  documents: { name: string; url: string; uploaded: boolean }[]
}

// Mock job detail data
const mockJobDetail: JobDetail = {
  id: '1',
  jobNumber: 'JOB-2025-001',
  orderNumber: '233327',
  customerName: 'METRO GREEN CONSTRUCTION',
  address: '1234 Metro Plaza Dr, Seattle, WA 98101',
  startTime: '7:00 AM',
  endTime: '3:00 PM',
  jobType: 'WALL SAWING',
  status: 'in-progress',
  phone: '(206) 555-0123',
  foreman: 'Mike Johnson',
  foremanPhone: '(555) 123-4567',
  officePhone: '(555) 987-6543',
  assignedTechs: [
    { name: 'John Smith', truck: 'T-205' },
    { name: 'Dave Wilson', truck: 'T-312' },
    { name: 'Sarah Chen', truck: 'T-108' }
  ],
  equipment: [
    { item: 'Wall Saw Unit', checked: true, required: true },
    { item: 'Diamond Blade (14")', checked: true, required: true },
    { item: 'Water Supply Kit', checked: false, required: true },
    { item: 'Extension Cords', checked: true, required: true },
    { item: 'Safety Barriers', checked: false, required: true }
  ],
  safetyRequirements: [
    'DOUBLE HEARING PROTECTION REQUIRED',
    'Safety glasses mandatory',
    'Hard hat required in work zone',
    'High-visibility vest required'
  ],
  specialEquipment: [
    'Dust collection system',
    'Extra water tanks (site has limited supply)',
    'Plastic sheeting for containment'
  ],
  description: 'Create 4 openings in concrete wall for HVAC ductwork. Each opening 24" x 18". Wall thickness approximately 8 inches. Reinforcement present - exercise caution. Customer requires clean cuts with minimal dust. Work must be completed by 2:00 PM for next contractor arrival.',
  documents: [
    { name: 'Site Safety Plan.pdf', url: '#', uploaded: true },
    { name: 'Work Permit.pdf', url: '#', uploaded: true },
    { name: 'Pre-work Photos', url: '#', uploaded: false },
    { name: 'Completion Certificate', url: '#', uploaded: false }
  ]
}

export default function JobDetailPage() {
  const router = useRouter()
  const params = useParams()
  const [job, setJob] = useState<JobDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [clockedIn, setClockedIn] = useState(false)
  const [notificationSent, setNotificationSent] = useState(false)
  const [showToast, setShowToast] = useState(false)

  useEffect(() => {
    // Check authentication
    const user = checkAuth()
    if (!user) {
      router.push('/login')
      return
    }

    // Load job detail (using mock data for now)
    setJob(mockJobDetail)
    setLoading(false)
  }, [params.jobId, router])

  const handleStatusChange = (newStatus: JobDetail['status']) => {
    if (job) {
      setJob({ ...job, status: newStatus })
      
      // Special handling for IN ROUTE status
      if (newStatus === 'in-route' && !notificationSent) {
        // Show toast notification
        setShowToast(true)
        setNotificationSent(true)
        
        // Hide toast after 3 seconds
        setTimeout(() => {
          setShowToast(false)
        }, 3000)
        
        // Reset button text after 3 seconds
        setTimeout(() => {
          setNotificationSent(false)
        }, 3000)
      }
    }
  }

  const handleEquipmentToggle = (index: number) => {
    if (job) {
      const updatedEquipment = [...job.equipment]
      updatedEquipment[index].checked = !updatedEquipment[index].checked
      setJob({ ...job, equipment: updatedEquipment })
    }
  }

  const copyJobDetails = () => {
    if (job) {
      navigator.clipboard.writeText(`Job ${job.orderNumber}: ${job.description}`)
    }
  }

  const getStatusColor = (status: JobDetail['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-500/10 text-green-400 border-green-500/30'
      case 'in-progress': return 'bg-blue-500/10 text-blue-400 border-blue-500/30'
      case 'in-route': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
      case 'pending': return 'bg-purple-500/10 text-purple-400 border-purple-500/30'
      case 'urgent': return 'bg-red-500/10 text-red-400 border-red-500/30'
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30'
    }
  }

  const getStatusGradient = (status: JobDetail['status']) => {
    switch (status) {
      case 'in-route': return 'from-yellow-500 to-orange-500'
      case 'in-progress': return 'from-blue-500 to-cyan-500'
      case 'completed': return 'from-green-500 to-emerald-500'
      default: return 'from-purple-500 to-pink-500'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 flex items-center justify-center">
        <div className="text-white">Loading job details...</div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 flex items-center justify-center">
        <div className="text-white">Job not found</div>
      </div>
    )
  }

  const completedEquipment = job.equipment.filter(item => item.checked).length
  const totalEquipment = job.equipment.filter(item => item.required).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 animate-gradient-shift">
      {/* Floating Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-gradient-to-br from-cyan-500/10 to-indigo-600/10 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-gradient-to-tr from-indigo-600/10 to-purple-600/10 rounded-full blur-3xl animate-float-slow" style={{ animationDelay: '5s' }} />
      </div>

      <div className="relative z-10">
        {/* Toast Notification */}
        {showToast && (
          <div className="fixed top-4 right-4 z-50 animate-slide-in">
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6" />
              <div>
                <p className="font-semibold">Notification sent to foreman</p>
                <p className="text-sm opacity-90">{job.foreman} has been notified you're on the way</p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="backdrop-blur-xl bg-white/5 border-b border-white/10 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push('/dashboard/schedule')}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-white">Job Order #{job.orderNumber}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(job.status)}`}>
                      {job.status.replace('-', ' ').toUpperCase()}
                    </span>
                    <span className="text-blue-200/70 text-sm">{job.jobNumber}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Status Change Pills */}
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {['in-route', 'in-progress', 'completed'].map((status) => (
                <div key={status} className="relative">
                  <button
                    onClick={() => handleStatusChange(status as JobDetail['status'])}
                    className={`
                      px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 whitespace-nowrap
                      ${job.status === status 
                        ? `bg-gradient-to-r ${getStatusGradient(status as JobDetail['status'])} text-white shadow-lg` 
                        : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/20'
                      }
                      ${status === 'in-route' && notificationSent ? 'animate-pulse' : ''}
                    `}
                  >
                    {status === 'in-route' && notificationSent 
                      ? 'NOTIFIED ✓' 
                      : status.replace('-', ' ').toUpperCase()
                    }
                  </button>
                  {status === 'in-route' && (
                    <p className="text-xs text-blue-200/60 mt-1 absolute whitespace-nowrap">
                      Notify foreman you're on the way
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 pb-24 space-y-6">
          {/* Hero Card - Key Job Info */}
          <div className="backdrop-blur-xl bg-white/[0.07] rounded-2xl border border-white/20 p-6">
            <div className="text-center mb-6">
              <button className="text-2xl font-bold text-white mb-2 hover:text-cyan-400 transition-colors">
                {job.customerName}
              </button>
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="px-4 py-2 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded-full text-sm font-bold">
                  {job.jobType}
                </span>
              </div>
              
              <div className="space-y-3">
                <button className="flex items-center justify-center gap-2 text-blue-200 hover:text-cyan-400 transition-colors">
                  <MapPin className="w-5 h-5" />
                  <span>{job.address}</span>
                </button>
                
                <div className="text-xl font-bold text-white">
                  {job.startTime} - {job.endTime}
                  <span className="text-sm text-blue-200 ml-2">(8 hrs)</span>
                </div>
                
                <div className="flex items-center justify-center gap-2 pt-2">
                  <span className="text-blue-200">
                    Foreman: {job.foreman} • {job.foremanPhone}
                  </span>
                  <button 
                    onClick={() => window.open(`tel:${job.foremanPhone}`, '_self')}
                    className="p-2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full hover:scale-110 transition-transform"
                    title={`Call ${job.foreman} at ${job.foremanPhone}`}
                  >
                    <Phone className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Team & Equipment Card */}
          <div className="backdrop-blur-xl bg-white/[0.07] rounded-2xl border border-white/20 p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              Team & Equipment
            </h2>
            
            {/* Assigned Techs */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-white">Assigned Techs</h3>
                <button className="text-cyan-400 text-sm hover:text-cyan-300">Reassign Team</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {job.assignedTechs.map((tech, index) => (
                  <div key={index} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                    <User className="w-4 h-4 text-blue-400" />
                    <span className="text-white text-sm">{tech.name}</span>
                    <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs font-mono">
                      {tech.truck}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Equipment Checklist */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-white">Required Equipment</h3>
                <span className="text-sm text-blue-200">{completedEquipment}/{totalEquipment} Ready</span>
              </div>
              <div className="space-y-2">
                {job.equipment.map((item, index) => (
                  <label key={index} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => handleEquipmentToggle(index)}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500"
                    />
                    <span className={`flex-1 ${item.checked ? 'text-white' : 'text-white/70'}`}>
                      {item.item}
                    </span>
                    {item.required && (
                      <span className="text-red-400 text-xs">Required</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Safety Requirements */}
            <div className="mb-6">
              <h3 className="font-medium text-white mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Safety Requirements
              </h3>
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                {job.safetyRequirements.map((req, index) => (
                  <div key={index} className="flex items-center gap-2 text-red-300 mb-2 last:mb-0">
                    <HardHat className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm">{req}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Special Equipment */}
            {job.specialEquipment.length > 0 && (
              <div>
                <h3 className="font-medium text-white mb-3">Special Equipment</h3>
                <div className="space-y-2">
                  {job.specialEquipment.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2">
                      <Wrench className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Job Details Expandable Card */}
          <div className="backdrop-blur-xl bg-white/[0.07] rounded-2xl border border-white/20 p-6">
            <button
              onClick={() => setDetailsExpanded(!detailsExpanded)}
              className="w-full flex items-center justify-between text-left mb-4"
            >
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <List className="w-5 h-5 text-cyan-400" />
                Job Details
              </h2>
              {detailsExpanded ? (
                <ChevronUp className="w-5 h-5 text-white" />
              ) : (
                <ChevronDown className="w-5 h-5 text-white" />
              )}
            </button>
            
            {detailsExpanded && (
              <div className="space-y-4">
                <p className="text-blue-200 leading-relaxed">{job.description}</p>
                <button
                  onClick={copyJobDetails}
                  className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy Instructions
                </button>
              </div>
            )}
          </div>

          {/* Quick Actions Grid */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setClockedIn(!clockedIn)}
              className={`
                backdrop-blur-xl bg-white/[0.07] rounded-2xl border border-white/20 p-6 text-center
                hover:bg-white/[0.1] transition-all duration-300 group
              `}
            >
              <div className={`p-4 rounded-full bg-gradient-to-r ${clockedIn ? 'from-red-500 to-pink-500' : 'from-green-500 to-emerald-500'} mx-auto w-fit mb-3 group-hover:scale-110 transition-transform`}>
                <Timer className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-white mb-1">{clockedIn ? 'Clock Out' : 'Clock In'}</h3>
              <p className="text-blue-200/70 text-sm">Track work time</p>
            </button>

            <button className="backdrop-blur-xl bg-white/[0.07] rounded-2xl border border-white/20 p-6 text-center hover:bg-white/[0.1] transition-all duration-300 group">
              <div className="p-4 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 mx-auto w-fit mb-3 group-hover:scale-110 transition-transform">
                <Camera className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-white mb-1">Add Photos</h3>
              <p className="text-blue-200/70 text-sm">Document progress</p>
            </button>

            <button className="backdrop-blur-xl bg-white/[0.07] rounded-2xl border border-white/20 p-6 text-center hover:bg-white/[0.1] transition-all duration-300 group">
              <div className="p-4 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 mx-auto w-fit mb-3 group-hover:scale-110 transition-transform">
                <List className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-white mb-1">Work Items</h3>
              <p className="text-blue-200/70 text-sm">Track completion</p>
            </button>

            <button className="backdrop-blur-xl bg-white/[0.07] rounded-2xl border border-white/20 p-6 text-center hover:bg-white/[0.1] transition-all duration-300 group">
              <div className="p-4 rounded-full bg-gradient-to-r from-orange-500 to-red-500 mx-auto w-fit mb-3 group-hover:scale-110 transition-transform">
                <PenTool className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-white mb-1">Sign-off</h3>
              <p className="text-blue-200/70 text-sm">Customer approval</p>
            </button>
          </div>

          {/* Documents Section */}
          <div className="backdrop-blur-xl bg-white/[0.07] rounded-2xl border border-white/20 p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Download className="w-5 h-5 text-cyan-400" />
              Documents
            </h2>
            
            <div className="grid gap-3">
              {job.documents.map((doc, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded ${doc.uploaded ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
                      {doc.uploaded ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <Upload className="w-4 h-4 text-yellow-400" />
                      )}
                    </div>
                    <span className="text-white">{doc.name}</span>
                  </div>
                  <button className="p-2 hover:bg-white/10 rounded transition-colors">
                    {doc.uploaded ? (
                      <Download className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Upload className="w-4 h-4 text-yellow-400" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
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
        
        @keyframes slide-in {
          0% {
            transform: translateX(100%);
            opacity: 0;
          }
          100% {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
        
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.8;
          }
        }
        
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  )
}