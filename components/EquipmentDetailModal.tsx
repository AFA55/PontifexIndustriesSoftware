'use client'

import { useState, useRef, useEffect } from 'react'
import {
  X,
  Camera,
  Plus,
  User,
  Wrench,
  Clock,
  FileText,
  Package,
  MapPin,
  Calendar,
  Gauge,
  Zap,
  AlertTriangle,
  CheckCircle,
  Activity,
  Settings,
  Image,
  Trash2,
  Edit3,
  Save,
  Download,
  Upload,
  Eye,
  TrendingUp,
  BarChart3
} from 'lucide-react'
import MaintenanceTab from './MaintenanceTab'

interface Equipment {
  id: string
  name: string
  type: string
  serial_number: string
  status: 'Available' | 'In Use' | 'Maintenance' | 'Reserved' | 'Out of Service'
  assigned_to: string
  location?: string
  last_service?: string
  next_service?: string
  hours_used?: number
  efficiency?: number
  notes?: string
  notesCount?: number
  maintenanceHistory?: MaintenanceRecord[]
  equipmentNotes?: EquipmentNote[]
}

interface MaintenanceRecord {
  id: string
  date: string
  type: 'Service' | 'Repair' | 'Inspection' | 'Calibration'
  description: string
  technician: string
  cost?: number
  status: 'Completed' | 'Pending' | 'In Progress'
  nextService?: string
}

interface EquipmentNote {
  id: string
  date: string
  author: string
  title: string
  content: string
  type: 'General' | 'Issue' | 'Maintenance' | 'Usage'
  images?: string[]
  priority: 'Low' | 'Medium' | 'High' | 'Critical'
}

interface EquipmentDetailModalProps {
  equipment: Equipment
  isOpen: boolean
  onClose: () => void
  onUpdate: (id: string, updates: Partial<Equipment>) => void
}

export default function EquipmentDetailModal({
  equipment,
  isOpen,
  onClose,
  onUpdate
}: EquipmentDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'maintenance' | 'history'>('overview')
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [newNote, setNewNote] = useState({
    title: '',
    content: '',
    type: 'General' as EquipmentNote['type'],
    priority: 'Medium' as EquipmentNote['priority'],
    images: [] as string[]
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Mock data for demonstration
  const mockNotes: EquipmentNote[] = [
    {
      id: '1',
      date: new Date().toISOString(),
      author: 'Rex Z',
      title: 'Daily inspection completed',
      content: 'Equipment running smoothly. Oil levels good, no unusual vibrations detected.',
      type: 'General',
      priority: 'Low',
      images: []
    },
    {
      id: '2',
      date: new Date(Date.now() - 86400000).toISOString(),
      author: 'Shop',
      title: 'Blade replacement required',
      content: 'Diamond blade showing signs of wear. Recommend replacement before next major job.',
      type: 'Issue',
      priority: 'High',
      images: []
    }
  ]

  const mockMaintenanceHistory: MaintenanceRecord[] = [
    {
      id: '1',
      date: '2024-01-15',
      type: 'Service',
      description: 'Routine maintenance - oil change, filter replacement, blade inspection',
      technician: 'Shop Team',
      cost: 150,
      status: 'Completed',
      nextService: '2024-04-15'
    },
    {
      id: '2',
      date: '2024-01-01',
      type: 'Repair',
      description: 'Replaced hydraulic hose - leak detected during operation',
      technician: 'Brandon R',
      cost: 85,
      status: 'Completed'
    }
  ]

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const handleAddNote = () => {
    const note: EquipmentNote = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      author: 'Current User', // Replace with actual user
      title: newNote.title,
      content: newNote.content,
      type: newNote.type,
      priority: newNote.priority,
      images: newNote.images
    }

    // In real implementation, save to database
    console.log('Adding note:', note)

    setNewNote({
      title: '',
      content: '',
      type: 'General',
      priority: 'Medium',
      images: []
    })
    setIsAddingNote(false)
  }

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files) {
      // In real implementation, upload to storage and get URLs
      const imageUrls = Array.from(files).map(file => URL.createObjectURL(file))
      setNewNote({ ...newNote, images: [...newNote.images, ...imageUrls] })
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Available': return 'from-green-400 to-emerald-600'
      case 'In Use': return 'from-blue-400 to-cyan-600'
      case 'Maintenance': return 'from-orange-400 to-amber-600'
      case 'Reserved': return 'from-purple-400 to-indigo-600'
      case 'Out of Service': return 'from-red-400 to-rose-600'
      default: return 'from-gray-400 to-slate-600'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Critical': return 'bg-red-500/20 text-red-300 border-red-500/50'
      case 'High': return 'bg-orange-500/20 text-orange-300 border-orange-500/50'
      case 'Medium': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50'
      case 'Low': return 'bg-green-500/20 text-green-300 border-green-500/50'
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/50'
    }
  }

  if (!isOpen) {
    console.log('Modal not open, isOpen:', isOpen)
    return null
  }

  console.log('Modal rendering with equipment:', equipment)

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-6xl h-[90vh] bg-gray-900/95 backdrop-blur-xl rounded-2xl border border-cyan-500/30 overflow-hidden shadow-2xl shadow-cyan-500/20">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900/90 backdrop-blur-lg border-b border-gray-800 p-6">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-white">{equipment.name}</h2>
              <div className="flex items-center gap-4 mt-2">
                <p className="text-gray-400">{equipment.type}</p>
                <span className="text-cyan-400 font-mono text-sm">#{equipment.serial_number}</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className={`px-4 py-2 rounded-xl bg-gradient-to-r ${getStatusColor(equipment.status)} shadow-lg`}>
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  <span className="text-white font-semibold">{equipment.status}</span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-3 hover:bg-gray-800 rounded-xl transition-all border border-white/10 hover:border-red-500/50 min-w-[48px] min-h-[48px] flex items-center justify-center"
              >
                <X className="w-6 h-6 text-gray-400 hover:text-red-400" />
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 mt-6 overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview', icon: Package },
              { id: 'notes', label: 'Notes', icon: FileText, badge: mockNotes.length },
              { id: 'maintenance', label: 'Maintenance', icon: Wrench, badge: mockMaintenanceHistory.length },
              { id: 'history', label: 'History', icon: Clock }
            ].map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all min-w-[120px] justify-center ${
                    activeTab === tab.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                      : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-white border border-transparent'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="ml-2 bg-cyan-500/30 px-2 py-0.5 rounded-full text-xs">
                      {tab.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto h-[calc(100%-200px)]">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-xl p-4 border border-cyan-500/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-cyan-500/20 rounded-lg">
                      <Gauge className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-sm text-cyan-300">Hours Used</p>
                      <p className="text-2xl font-bold text-white">{equipment.hours_used || 0}h</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-xl p-4 border border-green-500/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-lg">
                      <Zap className="w-6 h-6 text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm text-green-300">Efficiency</p>
                      <p className="text-2xl font-bold text-white">{equipment.efficiency || 85}%</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-purple-500/10 to-indigo-500/10 rounded-xl p-4 border border-purple-500/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <User className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm text-purple-300">Assigned To</p>
                      <p className="text-lg font-bold text-white">{equipment.assigned_to}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 rounded-xl p-4 border border-orange-500/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-500/20 rounded-lg">
                      <Calendar className="w-6 h-6 text-orange-400" />
                    </div>
                    <div>
                      <p className="text-sm text-orange-300">Next Service</p>
                      <p className="text-lg font-bold text-white">
                        {equipment.next_service ? new Date(equipment.next_service).toLocaleDateString() : 'TBD'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Location & Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                  <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-cyan-400" />
                    Location & Status
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-400">Current Location</p>
                      <p className="text-white font-medium">{equipment.location || 'Shop'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Last Service</p>
                      <p className="text-white font-medium">
                        {equipment.last_service ? new Date(equipment.last_service).toLocaleDateString() : 'No record'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                  <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                    Performance
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-400">Utilization Rate</span>
                        <span className="text-white">78%</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div className="bg-gradient-to-r from-green-400 to-emerald-500 h-2 rounded-full" style={{ width: '78%' }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-400">Maintenance Score</span>
                        <span className="text-white">92%</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div className="bg-gradient-to-r from-cyan-400 to-blue-500 h-2 rounded-full" style={{ width: '92%' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  Recent Activity
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-4 p-3 bg-gray-900/50 rounded-lg">
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                    <div className="flex-1">
                      <p className="text-white">Equipment deployed to Site #142</p>
                      <p className="text-sm text-gray-400">2 hours ago • Rex Z</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-3 bg-gray-900/50 rounded-lg">
                    <div className="w-2 h-2 bg-blue-400 rounded-full" />
                    <div className="flex-1">
                      <p className="text-white">Routine maintenance completed</p>
                      <p className="text-sm text-gray-400">1 day ago • Shop Team</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              {/* Add Note Button */}
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-white">Equipment Notes</h3>
                <button
                  onClick={() => setIsAddingNote(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg"
                >
                  <Plus className="w-5 h-5" />
                  Add Note
                </button>
              </div>

              {/* Add Note Form */}
              {isAddingNote && (
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Title</label>
                        <input
                          type="text"
                          value={newNote.title}
                          onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                          className="w-full bg-gray-900/50 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-cyan-400 focus:outline-none"
                          placeholder="Note title..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Priority</label>
                        <select
                          value={newNote.priority}
                          onChange={(e) => setNewNote({ ...newNote, priority: e.target.value as any })}
                          className="w-full bg-gray-900/50 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-cyan-400 focus:outline-none"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Critical">Critical</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
                      <select
                        value={newNote.type}
                        onChange={(e) => setNewNote({ ...newNote, type: e.target.value as any })}
                        className="w-full bg-gray-900/50 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-cyan-400 focus:outline-none"
                      >
                        <option value="General">General</option>
                        <option value="Issue">Issue</option>
                        <option value="Maintenance">Maintenance</option>
                        <option value="Usage">Usage</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Content</label>
                      <textarea
                        value={newNote.content}
                        onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                        rows={4}
                        className="w-full bg-gray-900/50 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-cyan-400 focus:outline-none"
                        placeholder="Describe the issue, observation, or note..."
                      />
                    </div>

                    {/* Photo Upload */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Photos</label>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 transition-all"
                        >
                          <Camera className="w-5 h-5 text-gray-300" />
                          <span className="text-gray-300">Add Photos</span>
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        {newNote.images.length > 0 && (
                          <span className="text-sm text-gray-400">{newNote.images.length} photos selected</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={handleAddNote}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-400 hover:to-emerald-500 transition-all"
                      >
                        <Save className="w-5 h-5" />
                        Save Note
                      </button>
                      <button
                        onClick={() => setIsAddingNote(false)}
                        className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes List */}
              <div className="space-y-4">
                {mockNotes.map((note) => (
                  <div key={note.id} className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-lg font-semibold text-white">{note.title}</h4>
                          <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${getPriorityColor(note.priority)}`}>
                            {note.priority}
                          </span>
                          <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded-lg text-xs font-medium">
                            {note.type}
                          </span>
                        </div>
                        <p className="text-gray-300 mb-3">{note.content}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <span>{note.author}</span>
                          <span>{new Date(note.date).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Maintenance Tab */}
          {activeTab === 'maintenance' && (
            <MaintenanceTab
              equipment={equipment}
              onUpdate={(updates) => onUpdate(equipment.id, updates)}
            />
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-white">Equipment History</h3>

              {/* Timeline View */}
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-400 to-blue-600" />

                <div className="space-y-6">
                  {[
                    { date: '2024-01-20', event: 'Equipment deployed to Site #142', user: 'Rex Z', type: 'deployment' },
                    { date: '2024-01-15', event: 'Routine maintenance completed', user: 'Shop Team', type: 'maintenance' },
                    { date: '2024-01-10', event: 'Returned from Site #138', user: 'Skinny H', type: 'return' },
                    { date: '2024-01-05', event: 'Deployed to Site #138', user: 'Skinny H', type: 'deployment' },
                    { date: '2024-01-01', event: 'Equipment added to inventory', user: 'System', type: 'creation' }
                  ].map((item, index) => (
                    <div key={index} className="flex items-start gap-4 relative">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                        item.type === 'deployment' ? 'bg-blue-500' :
                        item.type === 'maintenance' ? 'bg-orange-500' :
                        item.type === 'return' ? 'bg-green-500' :
                        'bg-gray-500'
                      }`}>
                        {item.type === 'deployment' ? <Package className="w-4 h-4 text-white" /> :
                         item.type === 'maintenance' ? <Wrench className="w-4 h-4 text-white" /> :
                         item.type === 'return' ? <CheckCircle className="w-4 h-4 text-white" /> :
                         <Plus className="w-4 h-4 text-white" />}
                      </div>

                      <div className="flex-1 bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-white font-medium">{item.event}</h4>
                          <span className="text-sm text-gray-400">{new Date(item.date).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-gray-400">by {item.user}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}