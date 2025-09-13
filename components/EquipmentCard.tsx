'use client'

import { useState } from 'react'
import {
  QrCode,
  User,
  Wrench,
  Clock,
  Calendar,
  MapPin,
  CheckCircle,
  AlertCircle,
  Package,
  Activity,
  Settings,
  ChevronDown,
  Zap,
  Shield,
  Gauge
} from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect } from 'react'

interface EquipmentCardProps {
  equipment: {
    id: string
    name: string
    brand_name?: string
    model_number?: string
    type: string
    serial_number: string
    status: 'Available' | 'In Use' | 'Maintenance' | 'Reserved' | 'Out of Service'
    assigned_to: string
    location?: string
    last_service_date?: string
    next_service_due?: string
    usage_hours?: number
    efficiency?: number
    notes?: string
  }
  onAssign: (id: string, operator: string) => void
  onStatusChange: (id: string, status: string) => void
  onServiceRequest: (id: string) => void
  onCardClick: (equipment: any) => void
  onOpenAssignment: (equipment: any) => void
  operators: string[]
}

export default function EquipmentCard({
  equipment,
  onAssign,
  onStatusChange,
  onServiceRequest,
  onCardClick,
  onOpenAssignment,
  operators
}: EquipmentCardProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [showAssignDropdown, setShowAssignDropdown] = useState(false)
  const [isAnimating, setIsAnimating] = useState(true)

  useEffect(() => {
    // Generate QR code with proper JSON structure
    const qrData = {
      id: equipment.id,
      name: equipment.name,
      brand: equipment.brand_name || '',
      model: equipment.model_number || '',
      serial: equipment.serial_number,
      type: "pontifex-equipment"
    }

    QRCode.toDataURL(
      JSON.stringify(qrData),
      {
        width: 120,
        margin: 1,
        color: {
          dark: '#0891b2',
          light: '#ffffff00'
        }
      }
    ).then(setQrCodeUrl)
  }, [equipment.id, equipment.name, equipment.serial_number])

  const getStatusColor = () => {
    switch (equipment.status) {
      case 'Available':
        return 'from-green-400 to-emerald-600'
      case 'In Use':
        return 'from-blue-400 to-cyan-600'
      case 'Maintenance':
        return 'from-orange-400 to-amber-600'
      case 'Reserved':
        return 'from-purple-400 to-indigo-600'
      case 'Out of Service':
        return 'from-red-400 to-rose-600'
      default:
        return 'from-gray-400 to-slate-600'
    }
  }

  const getStatusIcon = () => {
    switch (equipment.status) {
      case 'Available':
        return <CheckCircle className="w-5 h-5" />
      case 'In Use':
        return <Activity className="w-5 h-5" />
      case 'Maintenance':
        return <Wrench className="w-5 h-5 animate-spin-slow" />
      case 'Reserved':
        return <Clock className="w-5 h-5" />
      case 'Out of Service':
        return <AlertCircle className="w-5 h-5" />
      default:
        return <Package className="w-5 h-5" />
    }
  }

  const getOperatorAvatar = (name: string) => {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase()
    const colors = {
      'Shop': 'from-cyan-400 to-blue-500',
      'Rex Z': 'from-violet-400 to-purple-500',
      'Skinny H': 'from-green-400 to-emerald-500',
      'Brandon R': 'from-orange-400 to-red-500',
      'Matt M': 'from-blue-400 to-indigo-500'
    }
    return {
      initials: initials.slice(0, 2),
      gradient: colors[name as keyof typeof colors] || 'from-gray-400 to-slate-500'
    }
  }

  const avatar = getOperatorAvatar(equipment.assigned_to)
  const hoursUsed = equipment.usage_hours || Math.floor(Math.random() * 500)
  const efficiency = equipment.efficiency || Math.floor(Math.random() * 20) + 80

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking on interactive elements
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('select')) {
      return
    }
    onCardClick(equipment)
  }

  return (
    <div className="group relative">
      {/* Glassmorphic Card Container */}
      <div
        className="relative bg-gray-900/60 backdrop-blur-lg rounded-2xl border border-white/10 hover:border-cyan-500/50 transition-all duration-500 overflow-hidden cursor-pointer"
        onClick={handleCardClick}
      >
        {/* Animated Background Gradient */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-purple-500/10" />
        </div>

        {/* Card Content */}
        <div className="relative z-10 p-6">
          {/* Header Section */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white mb-1 line-clamp-1">
                {equipment.name}
              </h3>
              <p className="text-cyan-400 text-sm font-medium">{equipment.type}</p>
            </div>

            {/* Animated Status Badge */}
            <div className={`relative ${equipment.status === 'Available' && isAnimating ? 'animate-pulse' : ''}`}>
              <div className={`px-3 py-1.5 rounded-xl bg-gradient-to-r ${getStatusColor()} shadow-lg`}>
                <div className="flex items-center gap-2">
                  {getStatusIcon()}
                  <span className="text-white font-semibold text-sm">{equipment.status}</span>
                </div>
              </div>
              {equipment.status === 'Available' && (
                <div className="absolute inset-0 rounded-xl bg-green-400/20 blur-xl animate-ping" />
              )}
            </div>
          </div>

          {/* Visual Section with QR Code and Metrics */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* QR Code Container */}
            <div className="relative group/qr">
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/10 group-hover/qr:border-cyan-400/50 transition-all">
                {qrCodeUrl && (
                  <img
                    src={qrCodeUrl}
                    alt="Equipment QR Code"
                    className="w-full h-auto opacity-80 group-hover/qr:opacity-100 transition-opacity"
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/qr:opacity-100 transition-opacity bg-black/50 backdrop-blur-sm rounded-xl">
                  <QrCode className="w-8 h-8 text-cyan-400" />
                </div>
              </div>
            </div>

            {/* Metrics Display */}
            <div className="space-y-3">
              <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-lg p-3 backdrop-blur-sm border border-cyan-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <Gauge className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-cyan-300 font-medium">Hours Used</span>
                </div>
                <p className="text-2xl font-bold text-white">{hoursUsed}h</p>
              </div>

              <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg p-3 backdrop-blur-sm border border-green-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-green-300 font-medium">Efficiency</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-black/30 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-1000"
                      style={{ width: `${efficiency}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-white">{efficiency}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Assignment Section */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-4 mb-4 border border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`relative w-12 h-12 rounded-full bg-gradient-to-br ${avatar.gradient} flex items-center justify-center shadow-lg`}>
                  <span className="text-white font-bold text-sm">{avatar.initials}</span>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-900" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Assigned to</p>
                  <p className="text-white font-semibold">{equipment.assigned_to}</p>
                </div>
              </div>

              {/* Assignment Button */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenAssignment(equipment)
                  }}
                  className="px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 rounded-lg border border-cyan-500/30 transition-all flex items-center gap-2"
                >
                  <User className="w-4 h-4 text-cyan-400" />
                  <span className="text-cyan-300 text-sm font-medium">Reassign</span>
                </button>
              </div>
            </div>

            {/* Location and Service Info */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              {equipment.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-400" />
                  <span className="text-blue-200 text-sm">{equipment.location}</span>
                </div>
              )}
              {equipment.next_service_due && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-400" />
                  <span className="text-orange-200 text-sm">
                    Service: {new Date(equipment.next_service_due).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons - Large Touch Targets */}
          <div className="grid grid-cols-3 gap-3">
            <button className="group/btn relative min-h-[48px] bg-gradient-to-r from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 rounded-xl border border-cyan-500/30 hover:border-cyan-400 transition-all duration-300 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 group-hover/btn:opacity-10 transition-opacity" />
              <div className="relative flex items-center justify-center gap-2 py-3">
                <QrCode className="w-5 h-5 text-cyan-400" />
                <span className="text-cyan-300 font-medium text-sm">Scan</span>
              </div>
            </button>

            <button
              onClick={() => onStatusChange(equipment.id, 'In Use')}
              className="group/btn relative min-h-[48px] bg-gradient-to-r from-blue-500/10 to-indigo-500/10 hover:from-blue-500/20 hover:to-indigo-500/20 rounded-xl border border-blue-500/30 hover:border-blue-400 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-500 opacity-0 group-hover/btn:opacity-10 transition-opacity" />
              <div className="relative flex items-center justify-center gap-2 py-3">
                <Shield className="w-5 h-5 text-blue-400" />
                <span className="text-blue-300 font-medium text-sm">Deploy</span>
              </div>
            </button>

            <button
              onClick={() => onServiceRequest(equipment.id)}
              className="group/btn relative min-h-[48px] bg-gradient-to-r from-orange-500/10 to-red-500/10 hover:from-orange-500/20 hover:to-red-500/20 rounded-xl border border-orange-500/30 hover:border-orange-400 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-orange-400 to-red-500 opacity-0 group-hover/btn:opacity-10 transition-opacity" />
              <div className="relative flex items-center justify-center gap-2 py-3">
                <Settings className="w-5 h-5 text-orange-400 animate-spin-slow" />
                <span className="text-orange-300 font-medium text-sm">Service</span>
              </div>
            </button>
          </div>
        </div>

        {/* Serial Number Footer */}
        <div className="px-6 py-3 bg-black/30 backdrop-blur-sm border-t border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Serial #</span>
            <span className="text-xs font-mono text-cyan-400">{equipment.serial_number}</span>
          </div>
        </div>
      </div>

      {/* Hover Glow Effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl opacity-0 group-hover:opacity-20 blur transition-opacity duration-500" />
    </div>
  )
}