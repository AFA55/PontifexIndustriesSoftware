'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Package,
  Wrench,
  Calendar,
  Hash,
  FileText,
  MapPin,
  User
} from 'lucide-react'
import Link from 'next/link'
import { saveEquipment } from '@/lib/supabase-equipment'

type EquipmentStatus = 'Available' | 'In Use' | 'Maintenance' | 'Out of Service'
type AssignmentOption = 'Shop' | 'Rex Z' | 'Skinny H' | 'Brandon R' | 'Matt M' | 'Other'

export default function AddEquipmentPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    brand_name: '',
    model_number: '',
    type: '',
    serial_number: '',
    status: 'Available' as EquipmentStatus,
    assigned_to: 'Shop' as string,
    custom_assignment: '',
    location: '',
    usage_hours: 0,
    last_service_date: '',
    next_service_due: '',
    notes: ''
  })

  const [assignmentType, setAssignmentType] = useState<AssignmentOption>('Shop')

  const handleAssignmentChange = (value: AssignmentOption) => {
    setAssignmentType(value)
    if (value !== 'Other') {
      setFormData({ ...formData, assigned_to: value, custom_assignment: '' })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name || !formData.brand_name || !formData.model_number || !formData.type || !formData.serial_number) {
      setError('Please fill in all required fields')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const equipmentData = {
        ...formData,
        assigned_to: assignmentType === 'Other' ? formData.custom_assignment : assignmentType
      }

      const result = await saveEquipment(equipmentData)

      if (result.success) {
        setIsSuccess(true)
        setTimeout(() => {
          router.push('/dashboard/tools/my-equipment')
        }, 1500)
      } else {
        setError(result.error || 'Failed to add equipment')
        setIsLoading(false)
      }
    } catch (error: any) {
      setError('An unexpected error occurred')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950">
      <div className="relative z-10 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="p-2 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 hover:bg-white/10 transition-all"
              >
                <ArrowLeft className="w-5 h-5 text-cyan-400" />
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-white">Add Equipment</h1>
                <p className="text-blue-200 mt-1">Register new equipment to the inventory</p>
              </div>
            </div>
          </div>

          {/* Form Card */}
          <div className="backdrop-blur-2xl bg-white/[0.07] rounded-3xl shadow-2xl border border-white/20 p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/50 rounded-xl p-3 text-red-300 text-sm flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
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
                    <option value="Out of Service" className="bg-slate-900">Out of Service</option>
                  </select>
                </div>

                {/* Assign To */}
                <div className="space-y-2">
                  <label className="text-blue-100 text-sm font-medium flex items-center gap-2">
                    <User className="w-4 h-4 text-cyan-400" />
                    Assign To
                  </label>
                  <select
                    value={assignmentType}
                    onChange={(e) => handleAssignmentChange(e.target.value as AssignmentOption)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                  >
                    <option value="Shop" className="bg-slate-900">Shop</option>
                    <option value="Rex Z" className="bg-slate-900">Rex Z</option>
                    <option value="Skinny H" className="bg-slate-900">Skinny H</option>
                    <option value="Brandon R" className="bg-slate-900">Brandon R</option>
                    <option value="Matt M" className="bg-slate-900">Matt M</option>
                    <option value="Other" className="bg-slate-900">Other</option>
                  </select>
                </div>

                {/* Custom Assignment (if Other selected) */}
                {assignmentType === 'Other' && (
                  <div className="space-y-2">
                    <label className="text-blue-100 text-sm font-medium">Custom Location/Person</label>
                    <input
                      type="text"
                      value={formData.custom_assignment}
                      onChange={(e) => setFormData({ ...formData, custom_assignment: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all"
                      placeholder="Enter custom assignment"
                      required
                    />
                  </div>
                )}

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

              {/* Submit Button */}
              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  disabled={isLoading || isSuccess}
                  className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold py-3.5 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg hover:shadow-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center"
                >
                  {isLoading && !isSuccess && (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Adding Equipment...
                    </>
                  )}
                  {isSuccess && (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Equipment Added!
                    </>
                  )}
                  {!isLoading && !isSuccess && (
                    <>
                      <Save className="w-5 h-5 mr-2" />
                      Add Equipment
                    </>
                  )}
                </button>

                <Link
                  href="/dashboard"
                  className="px-6 py-3.5 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 text-white font-medium hover:bg-white/10 transition-all"
                >
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}