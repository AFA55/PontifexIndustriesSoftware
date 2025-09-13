'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Save,
  Loader2,
  Package,
  Hash,
  MapPin,
  User,
  Calendar,
  FileText,
  Wrench
} from 'lucide-react'
import { Equipment, updateEquipment } from '@/lib/supabase-equipment'

interface EquipmentEditModalProps {
  equipment: Equipment
  isOpen: boolean
  onClose: () => void
  onSave: (updatedEquipment: Equipment) => void
}

type EquipmentStatus = 'Available' | 'In Use' | 'Maintenance' | 'Reserved'

export default function EquipmentEditModal({
  equipment,
  isOpen,
  onClose,
  onSave
}: EquipmentEditModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    brand_name: '',
    model_number: '',
    type: '',
    serial_number: '',
    status: 'Available' as EquipmentStatus,
    assigned_to: '',
    location: '',
    usage_hours: 0,
    last_service_date: '',
    next_service_due: '',
    notes: ''
  })

  useEffect(() => {
    if (equipment && isOpen) {
      setFormData({
        name: equipment.name || '',
        brand_name: equipment.brand_name || '',
        model_number: equipment.model_number || '',
        type: equipment.type || '',
        serial_number: equipment.serial_number || '',
        status: equipment.status || 'Available',
        assigned_to: equipment.assigned_to || '',
        location: equipment.location || '',
        usage_hours: equipment.usage_hours || 0,
        last_service_date: equipment.last_service_date || '',
        next_service_due: equipment.next_service_due || '',
        notes: equipment.notes || ''
      })
      setError('')
    }
  }, [equipment, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name || !formData.brand_name || !formData.model_number || !formData.type || !formData.serial_number) {
      setError('Please fill in all required fields')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const result = await updateEquipment(equipment.id!, formData)

      if (result.success) {
        onSave(result.data)
        onClose()
      } else {
        setError(result.error || 'Failed to update equipment')
      }
    } catch (error: any) {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-2xl font-bold text-white">Edit Equipment</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/50 rounded-xl p-3 text-red-300 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Equipment Name */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                  <Package className="w-4 h-4 text-cyan-400" />
                  Equipment Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                  placeholder="e.g., Husqvarna FS 500"
                  required
                />
              </div>

              {/* Brand Name */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                  <Package className="w-4 h-4 text-cyan-400" />
                  Brand Name *
                </label>
                <input
                  type="text"
                  value={formData.brand_name}
                  onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                  placeholder="e.g., Husqvarna"
                  required
                />
              </div>

              {/* Model Number */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                  <Hash className="w-4 h-4 text-cyan-400" />
                  Model Number *
                </label>
                <input
                  type="text"
                  value={formData.model_number}
                  onChange={(e) => setFormData({ ...formData, model_number: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                  placeholder="e.g., FS 500"
                  required
                />
              </div>

              {/* Equipment Type */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-cyan-400" />
                  Equipment Type *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                  required
                >
                  <option value="" className="bg-slate-900">Select Type</option>
                  <option value="Floor Saw" className="bg-slate-900">Floor Saw</option>
                  <option value="Wall Saw" className="bg-slate-900">Wall Saw</option>
                  <option value="Core Drill" className="bg-slate-900">Core Drill</option>
                  <option value="Hand Saw" className="bg-slate-900">Hand Saw</option>
                  <option value="Ring Saw" className="bg-slate-900">Ring Saw</option>
                  <option value="Chain Saw" className="bg-slate-900">Chain Saw</option>
                  <option value="Generator" className="bg-slate-900">Generator</option>
                  <option value="Vacuum" className="bg-slate-900">Vacuum</option>
                  <option value="Other" className="bg-slate-900">Other</option>
                </select>
              </div>

              {/* Serial Number */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                  <Hash className="w-4 h-4 text-cyan-400" />
                  Serial Number *
                </label>
                <input
                  type="text"
                  value={formData.serial_number}
                  onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                  placeholder="Enter serial number"
                  required
                />
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as EquipmentStatus })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                >
                  <option value="Available" className="bg-slate-900">Available</option>
                  <option value="In Use" className="bg-slate-900">In Use</option>
                  <option value="Maintenance" className="bg-slate-900">Maintenance</option>
                  <option value="Reserved" className="bg-slate-900">Reserved</option>
                </select>
              </div>

              {/* Assigned To */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                  <User className="w-4 h-4 text-cyan-400" />
                  Assigned To
                </label>
                <select
                  value={formData.assigned_to}
                  onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                >
                  <option value="Shop" className="bg-slate-900">Shop</option>
                  <option value="Rex Z" className="bg-slate-900">Rex Z</option>
                  <option value="Skinny H" className="bg-slate-900">Skinny H</option>
                  <option value="Brandon R" className="bg-slate-900">Brandon R</option>
                  <option value="Matt M" className="bg-slate-900">Matt M</option>
                </select>
              </div>

              {/* Location */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-cyan-400" />
                  Current Location
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                  placeholder="e.g., Job Site #123"
                />
              </div>

              {/* Usage Hours */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                  <Package className="w-4 h-4 text-cyan-400" />
                  Usage Hours
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.usage_hours}
                  onChange={(e) => setFormData({ ...formData, usage_hours: parseInt(e.target.value) || 0 })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                  placeholder="0"
                />
              </div>

              {/* Last Service */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  Last Service Date
                </label>
                <input
                  type="date"
                  value={formData.last_service_date}
                  onChange={(e) => setFormData({ ...formData, last_service_date: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                />
              </div>

              {/* Next Service */}
              <div className="space-y-2">
                <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  Next Service Due
                </label>
                <input
                  type="date"
                  value={formData.next_service_due}
                  onChange={(e) => setFormData({ ...formData, next_service_due: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all min-h-[100px]"
                placeholder="Additional notes about this equipment..."
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold py-3 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5 mr-2" />
                    Save Changes
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 text-white font-medium hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}