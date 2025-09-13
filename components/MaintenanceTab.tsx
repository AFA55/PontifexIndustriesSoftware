'use client'

import { useState, useRef } from 'react'
import {
  Plus,
  Camera,
  Wrench,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  FileText,
  Image,
  X,
  Save,
  Trash2,
  Settings,
  Zap,
  Shield,
  Eye
} from 'lucide-react'

interface MaintenanceRecord {
  id: string
  date: string
  type: 'Routine Maintenance' | 'Blade Replacement' | 'Motor Service' | 'Hydraulic System Check' | 'Emergency Repair' | 'Inspection' | 'Calibration' | 'Other'
  description: string
  technician: string
  cost?: number
  status: 'Completed' | 'Pending' | 'In Progress'
  nextService?: string
  photos?: {
    before?: string[]
    after?: string[]
  }
  partsUsed?: string[]
  downtime?: number // in hours
  priority: 'Low' | 'Medium' | 'High' | 'Critical'
}

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
  maintenanceHistory?: MaintenanceRecord[]
}

interface MaintenanceTabProps {
  equipment: Equipment
  onUpdate: (updates: Partial<Equipment>) => void
}

export default function MaintenanceTab({ equipment, onUpdate }: MaintenanceTabProps) {
  const [maintenanceMode, setMaintenanceMode] = useState(equipment.status === 'Maintenance')
  const [showAddService, setShowAddService] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null)

  // Form state
  const [serviceForm, setServiceForm] = useState({
    type: 'Routine Maintenance' as MaintenanceRecord['type'],
    description: '',
    technician: '',
    cost: '',
    priority: 'Medium' as MaintenanceRecord['priority'],
    partsUsed: '',
    estimatedDowntime: '',
    beforePhotos: [] as string[],
    afterPhotos: [] as string[]
  })

  const beforePhotoInputRef = useRef<HTMLInputElement>(null)
  const afterPhotoInputRef = useRef<HTMLInputElement>(null)

  // Mock maintenance history
  const mockMaintenanceHistory: MaintenanceRecord[] = [
    {
      id: '1',
      date: '2024-01-15',
      type: 'Routine Maintenance',
      description: 'Complete service including oil change, filter replacement, and blade inspection. All systems operating within normal parameters.',
      technician: 'Shop Team',
      cost: 150,
      status: 'Completed',
      nextService: '2024-04-15',
      downtime: 4,
      priority: 'Medium',
      partsUsed: ['Oil Filter', 'Air Filter', 'Engine Oil (5qt)']
    },
    {
      id: '2',
      date: '2024-01-01',
      type: 'Emergency Repair',
      description: 'Replaced hydraulic hose due to leak detected during operation. System tested and pressure verified.',
      technician: 'Brandon R',
      cost: 85,
      status: 'Completed',
      downtime: 2,
      priority: 'High',
      partsUsed: ['Hydraulic Hose 3/4"', 'Hydraulic Fluid']
    },
    {
      id: '3',
      date: '2023-12-20',
      type: 'Blade Replacement',
      description: 'Diamond blade showing excessive wear. Replaced with new 14" premium blade.',
      technician: 'Matt M',
      cost: 120,
      status: 'Completed',
      downtime: 1,
      priority: 'Medium',
      partsUsed: ['14" Diamond Blade - Premium']
    }
  ]

  const toggleMaintenanceMode = async (enabled: boolean) => {
    setMaintenanceMode(enabled)
    const newStatus = enabled ? 'Maintenance' : 'Available'
    const updates = {
      status: newStatus as Equipment['status'],
      assigned_to: enabled ? 'Shop' : equipment.assigned_to
    }
    onUpdate(updates)
  }

  const handlePhotoUpload = (type: 'before' | 'after', event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files) {
      const imageUrls = Array.from(files).map(file => URL.createObjectURL(file))
      if (type === 'before') {
        setServiceForm({ ...serviceForm, beforePhotos: [...serviceForm.beforePhotos, ...imageUrls] })
      } else {
        setServiceForm({ ...serviceForm, afterPhotos: [...serviceForm.afterPhotos, ...imageUrls] })
      }
    }
  }

  const removePhoto = (type: 'before' | 'after', index: number) => {
    if (type === 'before') {
      const newPhotos = serviceForm.beforePhotos.filter((_, i) => i !== index)
      setServiceForm({ ...serviceForm, beforePhotos: newPhotos })
    } else {
      const newPhotos = serviceForm.afterPhotos.filter((_, i) => i !== index)
      setServiceForm({ ...serviceForm, afterPhotos: newPhotos })
    }
  }

  const handleSubmitService = async () => {
    if (!serviceForm.description.trim() || !serviceForm.technician.trim()) {
      return
    }

    setIsSubmitting(true)

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500))

    const newRecord: MaintenanceRecord = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      type: serviceForm.type,
      description: serviceForm.description,
      technician: serviceForm.technician,
      cost: serviceForm.cost ? parseFloat(serviceForm.cost) : undefined,
      status: 'Completed',
      downtime: serviceForm.estimatedDowntime ? parseFloat(serviceForm.estimatedDowntime) : undefined,
      priority: serviceForm.priority,
      partsUsed: serviceForm.partsUsed ? serviceForm.partsUsed.split(',').map(part => part.trim()) : undefined,
      photos: {
        before: serviceForm.beforePhotos,
        after: serviceForm.afterPhotos
      }
    }

    // In real implementation, update equipment with new maintenance record
    console.log('New maintenance record:', newRecord)

    // Reset form
    setServiceForm({
      type: 'Routine Maintenance',
      description: '',
      technician: '',
      cost: '',
      priority: 'Medium',
      partsUsed: '',
      estimatedDowntime: '',
      beforePhotos: [],
      afterPhotos: []
    })

    setShowAddService(false)
    setIsSubmitting(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed': return 'bg-green-500/20 text-green-300 border-green-500/50'
      case 'In Progress': return 'bg-blue-500/20 text-blue-300 border-blue-500/50'
      case 'Pending': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50'
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/50'
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Routine Maintenance': return <Settings className="w-5 h-5" />
      case 'Blade Replacement': return <Settings className="w-5 h-5" />
      case 'Motor Service': return <Zap className="w-5 h-5" />
      case 'Emergency Repair': return <AlertTriangle className="w-5 h-5" />
      case 'Inspection': return <Eye className="w-5 h-5" />
      default: return <Wrench className="w-5 h-5" />
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const totalMaintenanceCost = mockMaintenanceHistory
    .filter(record => record.cost)
    .reduce((total, record) => total + (record.cost || 0), 0)

  const totalDowntime = mockMaintenanceHistory
    .filter(record => record.downtime)
    .reduce((total, record) => total + (record.downtime || 0), 0)

  return (
    <div className="space-y-6">
      {/* Maintenance Mode Toggle */}
      <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
        <div className="flex justify-between items-center">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-orange-400" />
              Maintenance Mode
            </h3>
            <p className="text-gray-400 text-sm mt-1">
              {maintenanceMode
                ? 'Equipment is currently under maintenance and unavailable for assignment'
                : 'Equipment is operational and available for deployment'}
            </p>
          </div>

          <button
            onClick={() => toggleMaintenanceMode(!maintenanceMode)}
            className={`relative w-20 h-10 rounded-full transition-all duration-300 ${
              maintenanceMode
                ? 'bg-gradient-to-r from-orange-500 to-red-500 shadow-lg shadow-orange-500/25'
                : 'bg-gray-600 hover:bg-gray-500'
            }`}
          >
            <span className={`absolute top-1 left-1 w-8 h-8 bg-white rounded-full transition-transform duration-300 shadow-lg ${
              maintenanceMode ? 'translate-x-10' : ''
            }`} />
          </button>
        </div>

        {maintenanceMode && (
          <div className="mt-4 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              <p className="text-orange-300 font-medium">Maintenance Mode Active</p>
            </div>
            <p className="text-orange-200 text-sm mt-1">
              This equipment is marked as under maintenance and cannot be assigned to operators.
              Complete maintenance work and toggle off to restore availability.
            </p>
          </div>
        )}
      </div>

      {/* Maintenance Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Clock className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Downtime</p>
              <p className="text-2xl font-bold text-white">{totalDowntime}h</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Cost</p>
              <p className="text-2xl font-bold text-white">${totalMaintenanceCost}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Wrench className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Service Records</p>
              <p className="text-2xl font-bold text-white">{mockMaintenanceHistory.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Service Record */}
      <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Service Records</h3>
          <button
            onClick={() => setShowAddService(!showAddService)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-xl text-white font-medium transition-all shadow-lg"
          >
            <Plus className="w-5 h-5" />
            Add Service Record
          </button>
        </div>

        {showAddService && (
          <div className="space-y-4 border-t border-gray-700 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Service Type */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Service Type</label>
                <select
                  value={serviceForm.type}
                  onChange={(e) => setServiceForm({ ...serviceForm, type: e.target.value as MaintenanceRecord['type'] })}
                  className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-cyan-400 focus:outline-none"
                >
                  <option value="Routine Maintenance">Routine Maintenance</option>
                  <option value="Blade Replacement">Blade Replacement</option>
                  <option value="Motor Service">Motor Service</option>
                  <option value="Hydraulic System Check">Hydraulic System Check</option>
                  <option value="Emergency Repair">Emergency Repair</option>
                  <option value="Inspection">Inspection</option>
                  <option value="Calibration">Calibration</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Technician */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Technician</label>
                <input
                  type="text"
                  value={serviceForm.technician}
                  onChange={(e) => setServiceForm({ ...serviceForm, technician: e.target.value })}
                  placeholder="Enter technician name"
                  className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Priority</label>
                <select
                  value={serviceForm.priority}
                  onChange={(e) => setServiceForm({ ...serviceForm, priority: e.target.value as MaintenanceRecord['priority'] })}
                  className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-cyan-400 focus:outline-none"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              {/* Cost */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Cost ($)</label>
                <input
                  type="number"
                  value={serviceForm.cost}
                  onChange={(e) => setServiceForm({ ...serviceForm, cost: e.target.value })}
                  placeholder="0.00"
                  step="0.01"
                  className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Service Description</label>
              <textarea
                value={serviceForm.description}
                onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                placeholder="Describe the service performed, issues found, and resolution..."
                rows={4}
                className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-cyan-400 focus:outline-none resize-none"
              />
            </div>

            {/* Parts Used */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Parts Used</label>
              <input
                type="text"
                value={serviceForm.partsUsed}
                onChange={(e) => setServiceForm({ ...serviceForm, partsUsed: e.target.value })}
                placeholder="List parts used (comma separated)"
                className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            {/* Photo Upload Section */}
            <div className="space-y-4">
              <h4 className="text-white font-medium">Service Documentation</h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Before Photos */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <label className="text-sm font-medium text-gray-300">Before Photos</label>
                    <button
                      onClick={() => beforePhotoInputRef.current?.click()}
                      className="flex items-center gap-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-all"
                    >
                      <Camera className="w-4 h-4 text-gray-300" />
                      Add
                    </button>
                    <input
                      ref={beforePhotoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handlePhotoUpload('before', e)}
                      className="hidden"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {serviceForm.beforePhotos.map((photo, index) => (
                      <div key={index} className="relative">
                        <img src={photo} alt="Before" className="w-full h-20 object-cover rounded-lg" />
                        <button
                          onClick={() => removePhoto('before', index)}
                          className="absolute -top-1 -right-1 p-1 bg-red-500 rounded-full"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* After Photos */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <label className="text-sm font-medium text-gray-300">After Photos</label>
                    <button
                      onClick={() => afterPhotoInputRef.current?.click()}
                      className="flex items-center gap-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-all"
                    >
                      <Camera className="w-4 h-4 text-gray-300" />
                      Add
                    </button>
                    <input
                      ref={afterPhotoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handlePhotoUpload('after', e)}
                      className="hidden"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {serviceForm.afterPhotos.map((photo, index) => (
                      <div key={index} className="relative">
                        <img src={photo} alt="After" className="w-full h-20 object-cover rounded-lg" />
                        <button
                          onClick={() => removePhoto('after', index)}
                          className="absolute -top-1 -right-1 p-1 bg-red-500 rounded-full"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleSubmitService}
                disabled={!serviceForm.description.trim() || !serviceForm.technician.trim() || isSubmitting}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-semibold text-white transition-all shadow-lg"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Save Service Record
                  </>
                )}
              </button>
              <button
                onClick={() => setShowAddService(false)}
                disabled={isSubmitting}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl font-medium text-white transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Maintenance History */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Service History</h3>

        <div className="space-y-3">
          {mockMaintenanceHistory.map((record) => (
            <div
              key={record.id}
              className="bg-gray-800/30 rounded-xl p-6 border border-gray-700 hover:bg-gray-800/50 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-orange-500/20 rounded-lg">
                      {getTypeIcon(record.type)}
                    </div>
                    <div>
                      <h4 className="text-white font-semibold">{record.type}</h4>
                      <p className="text-sm text-gray-400">by {record.technician}</p>
                    </div>
                  </div>

                  <p className="text-gray-300 mb-3">{record.description}</p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${getStatusColor(record.status)}`}>
                      {record.status}
                    </span>
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${getPriorityColor(record.priority)}`}>
                      {record.priority} Priority
                    </span>
                    {record.downtime && (
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded-lg text-xs font-medium">
                        {record.downtime}h downtime
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right ml-6">
                  {record.cost && (
                    <p className="text-green-400 font-bold text-lg">${record.cost}</p>
                  )}
                  <p className="text-gray-400 text-sm">{formatDate(record.date)}</p>
                </div>
              </div>

              {/* Parts Used */}
              {record.partsUsed && record.partsUsed.length > 0 && (
                <div className="mb-3">
                  <p className="text-sm text-gray-400 mb-2">Parts Used:</p>
                  <div className="flex flex-wrap gap-1">
                    {record.partsUsed.map((part, index) => (
                      <span key={index} className="px-2 py-1 bg-cyan-500/20 text-cyan-300 rounded text-xs">
                        {part}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Photos */}
              {record.photos && (record.photos.before?.length || record.photos.after?.length) && (
                <div className="border-t border-gray-700 pt-3">
                  <p className="text-sm text-gray-400 mb-2">Documentation:</p>
                  <div className="grid grid-cols-2 gap-4">
                    {record.photos.before && record.photos.before.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Before:</p>
                        <div className="flex gap-2">
                          {record.photos.before.map((photo, index) => (
                            <img
                              key={index}
                              src={photo}
                              alt="Before"
                              className="w-16 h-16 object-cover rounded-lg cursor-pointer hover:scale-105 transition-transform"
                              onClick={() => setSelectedRecord(record.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {record.photos.after && record.photos.after.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">After:</p>
                        <div className="flex gap-2">
                          {record.photos.after.map((photo, index) => (
                            <img
                              key={index}
                              src={photo}
                              alt="After"
                              className="w-16 h-16 object-cover rounded-lg cursor-pointer hover:scale-105 transition-transform"
                              onClick={() => setSelectedRecord(record.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {mockMaintenanceHistory.length === 0 && (
          <div className="bg-gray-800/30 rounded-xl p-12 text-center border border-gray-700">
            <Wrench className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">No maintenance records found</p>
            <p className="text-gray-500 text-sm">Add the first service record to start tracking maintenance history</p>
          </div>
        )}
      </div>
    </div>
  )
}