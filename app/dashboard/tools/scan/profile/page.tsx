'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Package, TrendingUp, User, Calendar, Activity, ArrowLeft, Download } from 'lucide-react'
import Link from 'next/link'
import QRCode from 'qrcode'

interface EquipmentProfile {
  id: string
  name: string
  type: string
  manufacturer: string
  model_number: string
  serial_number: string
  size: string
  equipment_for: string
  purchase_date: string
  purchase_price: number
  total_usage_linear_feet: number
  is_checked_out: boolean
  status: string
  qr_code_data: string
  unique_identification_code: string
}

interface UsageRecord {
  id: string
  usage_date: string
  linear_feet_cut: number
  equipment_type_used: string
  operator: {
    full_name: string
  }
  job_order: {
    location: string
  }
  notes: string
}

interface Assignment {
  id: string
  assigned_date: string
  returned_date: string | null
  status: string
  operator: {
    full_name: string
  }
  assigned_by_user: {
    full_name: string
  }
}

function BladeProfileContent() {
  const searchParams = useSearchParams()
  const equipmentId = searchParams.get('equipmentId')

  const [equipment, setEquipment] = useState<EquipmentProfile | null>(null)
  const [usageHistory, setUsageHistory] = useState<UsageRecord[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [qrCodeUrl, setQrCodeUrl] = useState('')

  useEffect(() => {
    if (equipmentId) {
      fetchEquipmentProfile()
    }
  }, [equipmentId])

  const fetchEquipmentProfile = async () => {
    try {
      setLoading(true)

      // Fetch equipment details
      const equipmentResponse = await fetch(`/api/equipment/${equipmentId}`)
      if (!equipmentResponse.ok) throw new Error('Failed to load equipment')
      const equipmentData = await equipmentResponse.json()
      setEquipment(equipmentData)

      // Generate QR code if data exists
      if (equipmentData.qr_code_data) {
        const qrUrl = await QRCode.toDataURL(equipmentData.qr_code_data, {
          width: 300,
          margin: 2
        })
        setQrCodeUrl(qrUrl)
      }

      // Fetch usage history
      const usageResponse = await fetch(`/api/equipment/${equipmentId}/usage-history`)
      if (usageResponse.ok) {
        const usageData = await usageResponse.json()
        setUsageHistory(usageData)
      }

      // Fetch assignments
      const assignmentsResponse = await fetch(`/api/equipment/${equipmentId}/assignments`)
      if (assignmentsResponse.ok) {
        const assignmentsData = await assignmentsResponse.json()
        setAssignments(assignmentsData)
      }

    } catch (err: any) {
      setError(err.message || 'Failed to load equipment profile')
    } finally {
      setLoading(false)
    }
  }

  const downloadQRCode = () => {
    if (!qrCodeUrl) return

    const link = document.createElement('a')
    link.download = `QR-${equipment?.serial_number || 'code'}.png`
    link.href = qrCodeUrl
    link.click()
  }

  const calculateCostPerFoot = () => {
    if (!equipment || equipment.total_usage_linear_feet === 0) return 0
    return equipment.purchase_price / equipment.total_usage_linear_feet
  }

  if (!equipmentId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Equipment Selected</h2>
          <Link href="/dashboard/tools/scan" className="text-indigo-600 hover:text-indigo-700">
            Go back to scanner
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading equipment profile...</p>
        </div>
      </div>
    )
  }

  if (error || !equipment) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Profile</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link href="/dashboard/tools/scan" className="text-indigo-600 hover:text-indigo-700">
            Go back to scanner
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard/tools/scan"
            className="inline-flex items-center text-indigo-600 hover:text-indigo-700 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Scanner
          </Link>

          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-8 text-white shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2">{equipment.name}</h1>
                <p className="text-indigo-100 text-lg mb-4">
                  {equipment.manufacturer} {equipment.model_number}
                </p>
                <div className="flex items-center space-x-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    equipment.is_checked_out
                      ? 'bg-yellow-500 text-yellow-900'
                      : 'bg-green-500 text-green-900'
                  }`}>
                    {equipment.is_checked_out ? 'Checked Out' : 'Available'}
                  </span>
                  <span className="text-indigo-100">
                    Serial: {equipment.serial_number}
                  </span>
                </div>
              </div>

              {qrCodeUrl && (
                <div className="bg-white p-3 rounded-lg">
                  <img src={qrCodeUrl} alt="QR Code" className="w-32 h-32" />
                  <button
                    onClick={downloadQRCode}
                    className="mt-2 w-full px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 flex items-center justify-center space-x-1"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-8 h-8 text-indigo-600" />
            </div>
            <p className="text-sm text-gray-600">Total Usage</p>
            <p className="text-2xl font-bold text-gray-900">
              {equipment.total_usage_linear_feet.toFixed(2)} ft
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <Activity className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-sm text-gray-600">Cost Per Foot</p>
            <p className="text-2xl font-bold text-gray-900">
              ${calculateCostPerFoot().toFixed(4)}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <Calendar className="w-8 h-8 text-purple-600" />
            </div>
            <p className="text-sm text-gray-600">Purchase Date</p>
            <p className="text-lg font-bold text-gray-900">
              {new Date(equipment.purchase_date).toLocaleDateString()}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <Package className="w-8 h-8 text-orange-600" />
            </div>
            <p className="text-sm text-gray-600">Purchase Price</p>
            <p className="text-2xl font-bold text-gray-900">
              ${equipment.purchase_price.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Equipment Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Equipment Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between border-b border-gray-200 pb-2">
                <span className="text-gray-600">Type</span>
                <span className="font-semibold">{equipment.type}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-2">
                <span className="text-gray-600">Size</span>
                <span className="font-semibold">{equipment.size}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-2">
                <span className="text-gray-600">Equipment For</span>
                <span className="font-semibold capitalize">{equipment.equipment_for.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-2">
                <span className="text-gray-600">Unique ID</span>
                <span className="font-semibold font-mono text-sm">{equipment.unique_identification_code}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Assignment</h3>
            {equipment.is_checked_out && assignments.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center space-x-3 p-3 bg-yellow-50 rounded-lg">
                  <User className="w-8 h-8 text-yellow-600" />
                  <div>
                    <p className="font-semibold text-gray-900">{assignments[0].operator.full_name}</p>
                    <p className="text-sm text-gray-600">
                      Assigned: {new Date(assignments[0].assigned_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>Not currently assigned</p>
              </div>
            )}
          </div>
        </div>

        {/* Usage History */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Usage History</h3>
          {usageHistory.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Operator</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Job Location</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Linear Feet</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {usageHistory.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {new Date(record.usage_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {record.operator?.full_name || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {record.job_order?.location || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-semibold">
                        {record.linear_feet_cut.toFixed(2)} ft
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {record.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Activity className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No usage history yet</p>
            </div>
          )}
        </div>

        {/* Assignment History */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Assignment History</h3>
          {assignments.length > 0 ? (
            <div className="space-y-3">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <User className="w-5 h-5 text-indigo-600" />
                      <span className="font-semibold text-gray-900">{assignment.operator.full_name}</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      assignment.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {assignment.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>Assigned: {new Date(assignment.assigned_date).toLocaleDateString()}</p>
                    {assignment.returned_date && (
                      <p>Returned: {new Date(assignment.returned_date).toLocaleDateString()}</p>
                    )}
                    <p>By: {assignment.assigned_by_user.full_name}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <User className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No assignment history</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BladeProfilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <BladeProfileContent />
    </Suspense>
  )
}
