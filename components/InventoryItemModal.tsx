'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, UserPlus, PlusCircle, QrCode as QrCodeIcon, Package } from 'lucide-react'

interface InventoryItem {
  id: string
  name: string
  category: string
  manufacturer: string
  model_number: string
  size: string
  equipment_for: string | null
  quantity_in_stock: number
  quantity_assigned: number
  reorder_level: number
  unit_price: number
  qr_code_url: string
  location: string | null
  notes: string | null
}

interface InventoryItemModalProps {
  isOpen: boolean
  onClose: () => void
  item: InventoryItem | null
  onAssign: () => void
  onAddStock: () => void
}

export default function InventoryItemModal({
  isOpen,
  onClose,
  item,
  onAssign,
  onAddStock
}: InventoryItemModalProps) {
  if (!isOpen || !item) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-black/60 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Package className="w-6 h-6" />
              <h2 className="text-2xl font-bold">Inventory Item Details</h2>
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
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column - Details */}
            <div className="space-y-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{item.name}</h3>
                <div className="inline-flex items-center px-3 py-1 bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-700/50 rounded-full text-sm text-indigo-700 dark:text-indigo-300 capitalize font-medium">
                  {item.category}
                </div>
              </div>

              <div className="space-y-3 border-t border-gray-200 dark:border-slate-700 pt-4">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-slate-400 font-medium">Manufacturer:</span>
                  <span className="text-gray-900 dark:text-white font-semibold">{item.manufacturer}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-slate-400 font-medium">Model Number:</span>
                  <span className="text-gray-900 dark:text-white font-semibold">{item.model_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-slate-400 font-medium">Size:</span>
                  <span className="text-gray-900 dark:text-white font-semibold">{item.size}</span>
                </div>
                {item.equipment_for && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-slate-400 font-medium">For:</span>
                    <span className="text-gray-900 dark:text-white font-semibold capitalize">
                      {item.equipment_for.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-gray-200 dark:border-slate-700 pt-4">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-slate-400 font-medium">In Stock:</span>
                  <span className={`font-bold text-lg ${
                    item.quantity_in_stock <= item.reorder_level
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-green-600 dark:text-green-400'
                  }`}>
                    {item.quantity_in_stock}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-slate-400 font-medium">Assigned:</span>
                  <span className="text-purple-600 dark:text-purple-400 font-bold text-lg">{item.quantity_assigned}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-slate-400 font-medium">Reorder Level:</span>
                  <span className="text-gray-900 dark:text-white font-semibold">{item.reorder_level}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-slate-400 font-medium">Unit Price:</span>
                  <span className="text-gray-900 dark:text-white font-semibold">${item.unit_price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-slate-400 font-medium">Total Value:</span>
                  <span className="text-green-600 dark:text-green-400 font-bold text-lg">
                    ${(item.quantity_in_stock * item.unit_price).toFixed(2)}
                  </span>
                </div>
              </div>

              {(item.location || item.notes) && (
                <div className="space-y-3 border-t border-gray-200 dark:border-slate-700 pt-4">
                  {item.location && (
                    <div>
                      <span className="text-gray-600 dark:text-slate-400 font-medium">Location:</span>
                      <p className="text-gray-900 dark:text-white mt-1">{item.location}</p>
                    </div>
                  )}
                  {item.notes && (
                    <div>
                      <span className="text-gray-600 dark:text-slate-400 font-medium">Notes:</span>
                      <p className="text-gray-900 dark:text-white mt-1">{item.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column - QR Code & Actions */}
            <div className="space-y-4">
              {/* QR Code */}
              <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-center mb-3">
                  <QrCodeIcon className="w-5 h-5 text-gray-600 dark:text-slate-400 mr-2" />
                  <span className="text-gray-700 dark:text-slate-300 font-medium">QR Code</span>
                </div>
                <div className="flex justify-center">
                  <img
                    src={item.qr_code_url}
                    alt="QR Code"
                    className="w-48 h-48 border-2 border-gray-300 dark:border-slate-600 rounded-lg"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400 text-center mt-2">
                  Scan to assign to operator
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={() => {
                    onAssign()
                  }}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-3 rounded-lg font-bold transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-5 h-5" />
                  Assign to Operator
                </button>

                <button
                  onClick={() => {
                    onAddStock()
                  }}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-6 py-3 rounded-lg font-bold transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  <PlusCircle className="w-5 h-5" />
                  Add More Stock
                </button>

                <button
                  onClick={onClose}
                  className="w-full border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
