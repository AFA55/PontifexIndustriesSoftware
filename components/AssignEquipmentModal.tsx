'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, UserPlus, Package, AlertCircle, CheckCircle } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

interface InventoryItem {
  id: string
  name: string
  category: string
  manufacturer: string
  model_number: string
  size: string
  equipment_for: string | null
  quantity_in_stock: number
}

interface Operator {
  id: string
  name: string
  email: string
}

interface AssignEquipmentModalProps {
  isOpen: boolean
  onClose: () => void
  inventoryItem: InventoryItem | null
  onSuccess: () => void
}

export default function AssignEquipmentModal({
  isOpen,
  onClose,
  inventoryItem,
  onSuccess
}: AssignEquipmentModalProps) {
  const [operators, setOperators] = useState<Operator[]>([])
  const [selectedOperator, setSelectedOperator] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [isLoadingOperators, setIsLoadingOperators] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchOperators()
      // Reset form
      setSelectedOperator('')
      setSerialNumber('')
      setNotes('')
      setError('')
    }
  }, [isOpen])

  const fetchOperators = async () => {
    setIsLoadingOperators(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/users?role=operator', {
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}` },
      })
      if (response.ok) {
        const data = await response.json()
        setOperators(data)
      }
    } catch (err) {
      console.error('Error fetching operators:', err)
      setError('Failed to load operators')
    } finally {
      setIsLoadingOperators(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedOperator) {
      setError('Please select an operator')
      return
    }

    if (!serialNumber.trim()) {
      setError('Please enter a serial number')
      return
    }

    if (!inventoryItem) {
      setError('No inventory item selected')
      return
    }

    if (inventoryItem.quantity_in_stock < 1) {
      setError('No stock available to assign')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      // Get current user for assigned_by field
      const currentUser = getCurrentUser()
      if (!currentUser) {
        setError('You must be logged in to assign equipment')
        setIsSubmitting(false)
        return
      }

      const response = await fetch('/api/inventory/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventory_id: inventoryItem.id,
          operator_id: selectedOperator,
          serial_number: serialNumber.trim(),
          notes: notes.trim() || null,
          assigned_by: currentUser.id
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to assign equipment')
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      console.error('Error assigning equipment:', err)
      setError(err.message || 'Failed to assign equipment. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen || !inventoryItem) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <UserPlus className="w-6 h-6" />
              <h2 className="text-2xl font-bold">Assign Equipment</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Inventory Item Info */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <Package className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{inventoryItem.name}</h3>
                <div className="text-sm text-gray-600 mt-1 space-y-1">
                  <div><span className="font-medium">Category:</span> {inventoryItem.category}</div>
                  <div><span className="font-medium">Manufacturer:</span> {inventoryItem.manufacturer}</div>
                  <div><span className="font-medium">Model:</span> {inventoryItem.model_number}</div>
                  <div><span className="font-medium">Size:</span> {inventoryItem.size}</div>
                  {inventoryItem.equipment_for && (
                    <div><span className="font-medium">For:</span> {inventoryItem.equipment_for.replace(/_/g, ' ')}</div>
                  )}
                </div>
                <div className="mt-2 inline-flex items-center px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                  {inventoryItem.quantity_in_stock} in stock
                </div>
              </div>
            </div>
          </div>

          {/* Select Operator */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assign to Operator <span className="text-red-500">*</span>
            </label>
            {isLoadingOperators ? (
              <div className="text-sm text-gray-500">Loading operators...</div>
            ) : operators.length === 0 ? (
              <div className="text-sm text-gray-500">No operators found</div>
            ) : (
              <select
                value={selectedOperator}
                onChange={(e) => setSelectedOperator(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                required
              >
                <option value="">Select an operator...</option>
                {operators.map((operator) => (
                  <option key={operator.id} value={operator.id}>
                    {operator.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Serial Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Serial Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="Enter unique serial number for this item"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              This serial number will identify this specific item
            </p>
          </div>

          {/* Notes (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes about this assignment..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isLoadingOperators}
              className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  <span>Assigning...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span>Assign Equipment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
