'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, PlusCircle, AlertCircle, CheckCircle } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'

interface InventoryItem {
  id: string
  name: string
  category: string
  manufacturer: string
  model_number: string
  size: string
  quantity_in_stock: number
  unit_price: number
}

interface AddStockModalProps {
  isOpen: boolean
  onClose: () => void
  item: InventoryItem | null
  onSuccess: () => void
}

export default function AddStockModal({
  isOpen,
  onClose,
  item,
  onSuccess
}: AddStockModalProps) {
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!item) return

    if (quantity < 1) {
      setError('Quantity must be at least 1')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      // Get current user
      const currentUser = getCurrentUser()
      if (!currentUser) {
        setError('You must be logged in to add stock')
        setIsSubmitting(false)
        return
      }

      const response = await fetch('/api/inventory/add-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventory_id: item.id,
          quantity: quantity,
          notes: notes.trim() || null,
          user_id: currentUser.id
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add stock')
      }

      onSuccess()
      onClose()
      resetForm()
    } catch (err: any) {
      console.error('Error adding stock:', err)
      setError(err.message || 'Failed to add stock. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setQuantity(1)
    setNotes('')
    setError('')
  }

  if (!isOpen || !item) return null

  const newTotal = item.quantity_in_stock + quantity
  const newValue = newTotal * item.unit_price

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <PlusCircle className="w-6 h-6" />
              <h2 className="text-2xl font-bold">Add Stock</h2>
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
          {/* Item Info */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">{item.name}</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <div><span className="font-medium">Manufacturer:</span> {item.manufacturer}</div>
              <div><span className="font-medium">Model:</span> {item.model_number}</div>
              <div><span className="font-medium">Size:</span> {item.size}</div>
              <div className="mt-2 pt-2 border-t border-green-300">
                <span className="font-medium">Current Stock:</span>{' '}
                <span className="font-bold text-green-700">{item.quantity_in_stock}</span>
              </div>
            </div>
          </div>

          {/* Quantity Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity to Add <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center justify-center space-x-4 my-4">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-12 h-12 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-xl font-bold"
              >
                -
              </button>
              <div className="text-4xl font-bold text-green-600 w-20 text-center">
                {quantity}
              </div>
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="w-12 h-12 rounded-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center text-xl font-bold"
              >
                +
              </button>
            </div>
          </div>

          {/* New Total Preview */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-700 font-medium">New Total Stock:</span>
              <span className="text-2xl font-bold text-blue-600">{newTotal}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700 font-medium">New Total Value:</span>
              <span className="text-xl font-bold text-green-600">${newValue.toFixed(2)}</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for adding stock, purchase order number, etc..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900"
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
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  <span>Adding...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span>Add Stock</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
