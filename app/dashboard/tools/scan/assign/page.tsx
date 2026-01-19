'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { UserCheck, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

function AssignEquipmentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const equipmentId = searchParams.get('equipmentId')

  const [equipment, setEquipment] = useState<any>(null)
  const [operators, setOperators] = useState<any[]>([])
  const [selectedOperator, setSelectedOperator] = useState('')
  const [assignmentDate, setAssignmentDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (equipmentId) {
      fetchEquipmentDetails()
      fetchOperators()
    }
  }, [equipmentId])

  const fetchEquipmentDetails = async () => {
    try {
      const response = await fetch(`/api/equipment/${equipmentId}`)
      if (response.ok) {
        const data = await response.json()
        setEquipment(data)
      } else {
        setError('Failed to load equipment details')
      }
    } catch (err) {
      setError('Error loading equipment')
    }
  }

  const fetchOperators = async () => {
    try {
      const response = await fetch('/api/users?role=operator')
      if (response.ok) {
        const data = await response.json()
        setOperators(data)
      }
    } catch (err) {
      console.error('Error loading operators:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedOperator) {
      setError('Please select an operator')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/equipment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipment_id: equipmentId,
          operator_id: selectedOperator,
          assignment_date: assignmentDate,
          notes
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to assign equipment')
      }

      setSuccess(true)

      // Redirect after 2 seconds
      setTimeout(() => {
        router.push('/dashboard/tools/scan')
      }, 2000)

    } catch (err: any) {
      setError(err.message || 'Failed to assign equipment')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!equipmentId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Equipment Selected</h2>
          <Link href="/dashboard/tools/scan" className="text-indigo-600 hover:text-indigo-700">
            Go back to scanner
          </Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Successfully Assigned!</h2>
          <p className="text-gray-600 mb-4">Equipment has been checked out to the operator.</p>
          <p className="text-sm text-gray-500">Redirecting...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard/tools/scan"
            className="inline-flex items-center text-indigo-600 hover:text-indigo-700 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Scanner
          </Link>
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Assign Equipment</h1>
              <p className="text-gray-600">Check out equipment to an operator</p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-800 font-medium">Error</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Equipment Info Card */}
        {equipment && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Equipment Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Name</p>
                <p className="font-semibold">{equipment.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Type</p>
                <p className="font-semibold">{equipment.type}</p>
              </div>
              {equipment.manufacturer && (
                <div>
                  <p className="text-sm text-gray-600">Manufacturer</p>
                  <p className="font-semibold">{equipment.manufacturer}</p>
                </div>
              )}
              {equipment.serial_number && (
                <div>
                  <p className="text-sm text-gray-600">Serial Number</p>
                  <p className="font-semibold font-mono">{equipment.serial_number}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Assignment Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Assignment Details</h3>

          {/* Operator Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Operator *
            </label>
            <select
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Choose an operator...</option>
              {operators.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.full_name} - {op.phone_number || 'No phone'}
                </option>
              ))}
            </select>
          </div>

          {/* Assignment Date */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assignment Date *
            </label>
            <input
              type="date"
              value={assignmentDate}
              onChange={(e) => setAssignmentDate(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Notes */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Any additional information about this assignment..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !selectedOperator}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                <span>Assigning...</span>
              </>
            ) : (
              <>
                <UserCheck className="w-5 h-5" />
                <span>Assign Equipment</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function AssignEquipmentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <AssignEquipmentContent />
    </Suspense>
  )
}
