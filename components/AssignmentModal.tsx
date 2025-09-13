'use client'

import { useState, useEffect } from 'react'
import {
  X,
  User,
  MapPin,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  FileText,
  Camera,
  Send,
  Users,
  Truck,
  Building,
  Phone
} from 'lucide-react'

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
}

interface Operator {
  id: string
  name: string
  role: string
  phone?: string
  currentLocation?: string
  activeJobs: number
  availability: 'Available' | 'Busy' | 'On Break' | 'Off Shift'
  expertise: string[]
}

interface AssignmentModalProps {
  equipment: Equipment
  isOpen: boolean
  onClose: () => void
  onAssign: (operatorName: string, note?: string, location?: string) => void
}

export default function AssignmentModal({
  equipment,
  isOpen,
  onClose,
  onAssign
}: AssignmentModalProps) {
  const [selectedOperator, setSelectedOperator] = useState(equipment.assigned_to)
  const [assignmentNote, setAssignmentNote] = useState('')
  const [deploymentLocation, setDeploymentLocation] = useState('')
  const [assignmentType, setAssignmentType] = useState<'field' | 'shop' | 'return'>('field')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Mock operator data with enhanced details
  const operators: Operator[] = [
    {
      id: '1',
      name: 'Rex Z',
      role: 'Senior Operator',
      phone: '(555) 123-4567',
      currentLocation: 'Site #142',
      activeJobs: 2,
      availability: 'Available',
      expertise: ['Floor Saws', 'Wall Saws', 'Core Drilling']
    },
    {
      id: '2',
      name: 'Skinny H',
      role: 'Lead Technician',
      phone: '(555) 234-5678',
      currentLocation: 'Shop',
      activeJobs: 1,
      availability: 'Available',
      expertise: ['Heavy Equipment', 'Maintenance', 'Training']
    },
    {
      id: '3',
      name: 'Brandon R',
      role: 'Field Operator',
      phone: '(555) 345-6789',
      currentLocation: 'Site #138',
      activeJobs: 3,
      availability: 'Busy',
      expertise: ['Concrete Cutting', 'Site Setup']
    },
    {
      id: '4',
      name: 'Matt M',
      role: 'Equipment Specialist',
      phone: '(555) 456-7890',
      currentLocation: 'Shop',
      activeJobs: 0,
      availability: 'Available',
      expertise: ['Repairs', 'Diagnostics', 'Quality Control']
    },
    {
      id: 'shop',
      name: 'Shop',
      role: 'Service Center',
      currentLocation: 'Main Shop',
      activeJobs: 5,
      availability: 'Available',
      expertise: ['Maintenance', 'Repairs', 'Storage']
    }
  ]

  const getOperatorAvatar = (name: string) => {
    const colors = {
      'Shop': 'from-cyan-400 to-blue-500',
      'Rex Z': 'from-violet-400 to-purple-500',
      'Skinny H': 'from-green-400 to-emerald-500',
      'Brandon R': 'from-orange-400 to-red-500',
      'Matt M': 'from-blue-400 to-indigo-500'
    }
    const initials = name === 'Shop' ? 'SH' : name.split(' ').map(n => n[0]).join('').toUpperCase()
    return {
      initials: initials.slice(0, 2),
      gradient: colors[name as keyof typeof colors] || 'from-gray-400 to-slate-500'
    }
  }

  const getAvailabilityColor = (availability: string) => {
    switch (availability) {
      case 'Available': return 'text-green-400 bg-green-400/20'
      case 'Busy': return 'text-orange-400 bg-orange-400/20'
      case 'On Break': return 'text-yellow-400 bg-yellow-400/20'
      case 'Off Shift': return 'text-gray-400 bg-gray-400/20'
      default: return 'text-gray-400 bg-gray-400/20'
    }
  }

  const handleAssignment = async () => {
    if (!selectedOperator) return

    setIsSubmitting(true)

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000))

    onAssign(selectedOperator, assignmentNote, deploymentLocation)

    setIsSubmitting(false)
    onClose()
  }

  const currentOperator = operators.find(op => op.name === equipment.assigned_to)

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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-gray-900/95 backdrop-blur-xl rounded-2xl border border-cyan-500/30 overflow-hidden shadow-2xl shadow-cyan-500/20">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900/90 backdrop-blur-lg border-b border-gray-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                <div className="p-2 bg-cyan-500/20 rounded-lg">
                  <Users className="w-6 h-6 text-cyan-400" />
                </div>
                Assign Equipment
              </h3>
              <p className="text-gray-400 mt-1">{equipment.name} • #{equipment.serial_number}</p>
            </div>
            <button
              onClick={onClose}
              className="p-3 hover:bg-gray-800 rounded-xl transition-all border border-white/10 hover:border-red-500/50 min-w-[48px] min-h-[48px] flex items-center justify-center"
            >
              <X className="w-6 h-6 text-gray-400 hover:text-red-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">

          {/* Current Assignment Status */}
          {currentOperator && (
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-xl">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getOperatorAvatar(currentOperator.name).gradient} flex items-center justify-center shadow-lg`}>
                  <span className="text-white font-bold text-sm">{getOperatorAvatar(currentOperator.name).initials}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-blue-300">Currently assigned to:</p>
                  <p className="text-lg text-white font-semibold">{currentOperator.name}</p>
                  <p className="text-sm text-blue-200">{currentOperator.role}</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${getAvailabilityColor(currentOperator.availability)}`}>
                  {currentOperator.availability}
                </div>
              </div>
            </div>
          )}

          {/* Assignment Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">Assignment Type</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'field', label: 'Deploy to Field', icon: Truck, desc: 'Send to job site' },
                { id: 'shop', label: 'Return to Shop', icon: Building, desc: 'Maintenance or storage' },
                { id: 'return', label: 'Equipment Return', icon: CheckCircle, desc: 'Complete assignment' }
              ].map(({ id, label, icon: Icon, desc }) => (
                <button
                  key={id}
                  onClick={() => setAssignmentType(id as any)}
                  className={`p-4 rounded-xl border-2 transition-all text-center ${
                    assignmentType === id
                      ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                      : 'border-gray-700 hover:border-gray-600 text-gray-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-6 h-6 mx-auto mb-2" />
                  <p className="font-semibold text-sm">{label}</p>
                  <p className="text-xs opacity-75 mt-1">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Operator Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Select {assignmentType === 'shop' ? 'Destination' : 'Operator'}
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {operators.map((operator) => {
                const avatar = getOperatorAvatar(operator.name)
                const isSelected = selectedOperator === operator.name
                const isRecommended = equipment.type === 'Floor Saw' && operator.expertise.includes('Floor Saws')

                return (
                  <button
                    key={operator.id}
                    onClick={() => setSelectedOperator(operator.name)}
                    disabled={operator.availability === 'Off Shift'}
                    className={`p-4 rounded-xl border-2 transition-all text-left relative ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/20'
                        : operator.availability === 'Off Shift'
                        ? 'border-gray-800 bg-gray-800/30 opacity-50'
                        : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/30'
                    }`}
                  >
                    {isRecommended && (
                      <div className="absolute -top-2 -right-2 px-2 py-1 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full text-xs font-bold text-white">
                        Recommended
                      </div>
                    )}

                    <div className="flex items-start gap-3">
                      <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatar.gradient} flex items-center justify-center shadow-lg flex-shrink-0`}>
                        <span className="text-white font-bold text-sm">{avatar.initials}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-semibold text-white truncate">{operator.name}</h4>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getAvailabilityColor(operator.availability)}`}>
                            {operator.availability}
                          </span>
                        </div>

                        <p className="text-sm text-gray-400 mb-2">{operator.role}</p>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {operator.currentLocation && (
                            <div className="flex items-center gap-1 text-gray-400">
                              <MapPin className="w-3 h-3" />
                              <span className="truncate">{operator.currentLocation}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-gray-400">
                            <Clock className="w-3 h-3" />
                            <span>{operator.activeJobs} active jobs</span>
                          </div>
                          {operator.phone && (
                            <div className="flex items-center gap-1 text-gray-400 col-span-2">
                              <Phone className="w-3 h-3" />
                              <span>{operator.phone}</span>
                            </div>
                          )}
                        </div>

                        {/* Expertise Tags */}
                        <div className="flex flex-wrap gap-1 mt-3">
                          {operator.expertise.slice(0, 2).map((skill) => (
                            <span
                              key={skill}
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                equipment.type.includes(skill.split(' ')[0]) || skill === equipment.type
                                  ? 'bg-green-500/20 text-green-300'
                                  : 'bg-gray-700/50 text-gray-400'
                              }`}
                            >
                              {skill}
                            </span>
                          ))}
                          {operator.expertise.length > 2 && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700/50 text-gray-400">
                              +{operator.expertise.length - 2}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Location Input (for field assignments) */}
          {assignmentType === 'field' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Deployment Location
              </label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={deploymentLocation}
                  onChange={(e) => setDeploymentLocation(e.target.value)}
                  placeholder="Enter job site or location..."
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-gray-400 focus:border-cyan-400 focus:outline-none transition-all min-h-[48px]"
                />
              </div>
            </div>
          )}

          {/* Assignment Notes */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Assignment Notes
              <span className="text-gray-500 font-normal ml-1">(optional)</span>
            </label>
            <div className="relative">
              <FileText className="absolute left-4 top-4 w-5 h-5 text-gray-400" />
              <textarea
                value={assignmentNote}
                onChange={(e) => setAssignmentNote(e.target.value)}
                placeholder="Add notes about this assignment, special instructions, or observations..."
                rows={3}
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-gray-400 focus:border-cyan-400 focus:outline-none resize-none transition-all"
              />
            </div>
          </div>

          {/* Warning for busy operators */}
          {selectedOperator && operators.find(op => op.name === selectedOperator)?.availability === 'Busy' && (
            <div className="mb-6 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0" />
                <div>
                  <p className="text-orange-300 font-medium">Operator Currently Busy</p>
                  <p className="text-orange-200 text-sm">
                    {selectedOperator} is currently managing {operators.find(op => op.name === selectedOperator)?.activeJobs} active jobs.
                    Consider assigning to an available operator for faster response.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleAssignment}
              disabled={!selectedOperator || isSubmitting}
              className="flex-1 min-h-[48px] bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-semibold text-white transition-all shadow-lg flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Confirm Assignment
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-6 py-3 min-h-[48px] bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-xl font-medium text-white transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}