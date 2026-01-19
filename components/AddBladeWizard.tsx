'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Check, Package } from 'lucide-react'
import QRCode from 'qrcode'

interface BladeFormData {
  equipmentCategory: 'blade' | 'bit' | ''
  manufacturer: string
  modelNumber: string
  size: string
  equipmentFor: string
  purchaseDate: string
  purchasePrice: string
  quantity: number
  serialNumbers: string[]
  location: string
  notes: string
}

interface AddBladeWizardProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const MANUFACTURERS = [
  { value: 'husqvarna', label: 'Husqvarna' },
  { value: 'hilti', label: 'Hilti' },
  { value: 'ddm', label: 'DDM' },
  { value: 'other', label: 'Other' }
]

const BLADE_EQUIPMENT_TYPES = [
  { value: 'slab_saw', label: 'Slab Saw' },
  { value: 'hand_saw_flush_cut', label: 'Flush Cut / Hand Saw' },
  { value: 'wall_saw', label: 'Wall Saw' },
  { value: 'chop_saw', label: 'Chop Saw' }
]

const BIT_EQUIPMENT_TYPES = [
  { value: 'core_drill', label: 'Core Drill' },
  { value: 'hammer_drill', label: 'Hammer Drill' },
  { value: 'rotary_hammer', label: 'Rotary Hammer' }
]

export default function AddBladeWizard({ isOpen, onClose, onSuccess }: AddBladeWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<BladeFormData>({
    equipmentCategory: '',
    manufacturer: '',
    modelNumber: '',
    size: '',
    equipmentFor: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchasePrice: '',
    quantity: 1,
    serialNumbers: [''],
    location: '',
    notes: ''
  })
  const [customManufacturer, setCustomManufacturer] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1)
      setFormData({
        equipmentCategory: '',
        manufacturer: '',
        modelNumber: '',
        size: '',
        equipmentFor: '',
        purchaseDate: new Date().toISOString().split('T')[0],
        purchasePrice: '',
        quantity: 1,
        serialNumbers: [''],
        location: '',
        notes: ''
      })
      setCustomManufacturer('')
      setErrors({})
    }
  }, [isOpen])

  // Add global style to force all inputs and text to be black
  if (typeof document !== 'undefined' && isOpen) {
    const styleId = 'blade-wizard-text-fix'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        .blade-wizard-modal * {
          color: #111827 !important;
        }
        .blade-wizard-modal input,
        .blade-wizard-modal textarea,
        .blade-wizard-modal select,
        .blade-wizard-modal button {
          color: #111827 !important;
        }
        .blade-wizard-modal input::placeholder,
        .blade-wizard-modal textarea::placeholder {
          color: #9CA3AF !important;
        }
      `
      document.head.appendChild(style)
    }
  }

  // Total steps: 7 for bits (skip equipment type), 8 for blades
  const totalSteps = formData.equipmentCategory === 'bit' ? 7 : 8

  const updateFormData = (field: keyof BladeFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  // Auto-set equipment_for when selecting bit type
  const handleEquipmentCategoryChange = (category: 'blade' | 'bit') => {
    updateFormData('equipmentCategory', category)
    // For bits, auto-set equipment_for to 'core_drill' since all bits work with all machines
    if (category === 'bit') {
      updateFormData('equipmentFor', 'core_drill')
    } else {
      // Clear equipment_for when switching to blade
      updateFormData('equipmentFor', '')
    }
  }

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    switch (step) {
      case 1:
        if (!formData.equipmentCategory) {
          newErrors.equipmentCategory = 'Please select an equipment type'
        }
        break
      case 2:
        if (!formData.manufacturer) {
          newErrors.manufacturer = 'Please select a manufacturer'
        }
        if (formData.manufacturer === 'other' && !customManufacturer.trim()) {
          newErrors.customManufacturer = 'Please enter manufacturer name'
        }
        break
      case 3:
        if (!formData.modelNumber.trim()) {
          newErrors.modelNumber = 'Please enter a model number'
        }
        break
      case 4:
        if (!formData.size.trim()) {
          newErrors.size = 'Please enter the size'
        }
        break
      case 5:
        // Skip validation for bits (they don't need to select equipment type)
        if (formData.equipmentCategory !== 'bit' && !formData.equipmentFor) {
          newErrors.equipmentFor = 'Please select equipment type'
        }
        break
      case 6:
        if (!formData.purchaseDate) {
          newErrors.purchaseDate = 'Please enter purchase date'
        }
        if (!formData.purchasePrice || parseFloat(formData.purchasePrice) <= 0) {
          newErrors.purchasePrice = 'Please enter a valid price'
        }
        break
      case 7:
        if (!formData.quantity || formData.quantity < 1) {
          newErrors.quantity = 'Quantity must be at least 1'
        }
        break
      case 8:
        // Step 8 (Storage Location & Notes) has no required fields
        // Both location and notes are optional for inventory
        break
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      // For bits, skip step 5 (equipment type selection)
      if (formData.equipmentCategory === 'bit' && currentStep === 4) {
        setCurrentStep(6) // Jump from step 4 to step 6
      } else {
        setCurrentStep(prev => Math.min(prev + 1, totalSteps))
      }
    }
  }

  const handleBack = () => {
    // For bits, skip step 5 when going back from step 6
    if (formData.equipmentCategory === 'bit' && currentStep === 6) {
      setCurrentStep(4) // Jump from step 6 back to step 4
    } else {
      setCurrentStep(prev => Math.max(prev - 1, 1))
    }
  }

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return

    setIsSubmitting(true)
    try {
      const finalManufacturer = formData.manufacturer === 'other' ? customManufacturer : formData.manufacturer

      // Generate unique identification code for inventory item
      const uniqueId = `INV-${formData.equipmentCategory.toUpperCase().substring(0, 3)}-${finalManufacturer.substring(0, 3).toUpperCase()}-${Date.now()}`

      // Generate QR code data with inventory reference
      const qrData = JSON.stringify({
        id: uniqueId,
        type: 'inventory',
        category: formData.equipmentCategory,
        manufacturer: finalManufacturer,
        model: formData.modelNumber,
        size: formData.size
      })

      // Generate QR code as base64 image
      const qrCodeImage = await QRCode.toDataURL(qrData, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })

      // Create inventory item (single record with quantity)
      const inventoryData = {
        name: `${finalManufacturer} ${formData.modelNumber} ${formData.size}`,
        category: formData.equipmentCategory,
        manufacturer: finalManufacturer,
        model_number: formData.modelNumber,
        size: formData.size,
        equipment_for: formData.equipmentFor || null,
        quantity_in_stock: formData.quantity,
        quantity_assigned: 0,
        reorder_level: Math.max(5, Math.floor(formData.quantity * 0.2)), // 20% of initial quantity
        unit_price: parseFloat(formData.purchasePrice) || 0,
        qr_code_data: qrData,
        qr_code_url: qrCodeImage,
        location: formData.location || null,
        notes: formData.notes || null
      }

      // Submit to inventory API
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inventoryData)
      })

      if (!response.ok) {
        throw new Error('Failed to add inventory')
      }

      onSuccess()
      resetForm()
    } catch (error) {
      console.error('Error adding inventory:', error)
      alert('Failed to add inventory. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      equipmentCategory: '',
      manufacturer: '',
      modelNumber: '',
      size: '',
      equipmentFor: '',
      purchaseDate: new Date().toISOString().split('T')[0],
      purchasePrice: '',
      quantity: 1,
      serialNumbers: [''],
      location: '',
      notes: ''
    })
    setCustomManufacturer('')
    setCurrentStep(1)
    setErrors({})
  }

  const handleQuantityChange = (newQuantity: number) => {
    updateFormData('quantity', newQuantity)
    // Adjust serial numbers array
    const newSerials = [...formData.serialNumbers]
    if (newQuantity > newSerials.length) {
      // Add empty strings for new items
      for (let i = newSerials.length; i < newQuantity; i++) {
        newSerials.push('')
      }
    } else {
      // Trim array
      newSerials.length = newQuantity
    }
    updateFormData('serialNumbers', newSerials)
  }

  const updateSerialNumber = (index: number, value: string) => {
    const newSerials = [...formData.serialNumbers]
    newSerials[index] = value
    updateFormData('serialNumbers', newSerials)
    // Clear error for this serial
    if (errors[`serial_${index}`]) {
      setErrors(prev => ({ ...prev, [`serial_${index}`]: '' }))
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Select Equipment Type</h3>
            <p className="text-sm text-gray-600">What type of equipment are you adding to inventory?</p>
            <div className="grid grid-cols-2 gap-4 mt-6">
              <button
                type="button"
                onClick={() => handleEquipmentCategoryChange('blade')}
                className={`p-8 border-2 rounded-lg transition-all ${
                  formData.equipmentCategory === 'blade'
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-gray-300 hover:border-indigo-300'
                }`}
                style={{ color: '#111827' }}
              >
                <div className="text-5xl font-bold mb-3 text-gray-700">⚙</div>
                <div className="font-bold text-lg text-gray-900">Concrete Cutting Blade</div>
                <div className="text-sm text-gray-600 mt-2">Diamond saw blades for cutting</div>
              </button>
              <button
                type="button"
                onClick={() => handleEquipmentCategoryChange('bit')}
                className={`p-8 border-2 rounded-lg transition-all ${
                  formData.equipmentCategory === 'bit'
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-gray-300 hover:border-indigo-300'
                }`}
                style={{ color: '#111827' }}
              >
                <div className="text-5xl font-bold mb-3 text-gray-700">◆</div>
                <div className="font-bold text-lg text-gray-900">Core Drill Bit</div>
                <div className="text-sm text-gray-600 mt-2">Core drilling bits</div>
              </button>
            </div>
            {errors.equipmentCategory && (
              <p className="text-sm text-red-600 mt-2">{errors.equipmentCategory}</p>
            )}
          </div>
        )

      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Manufacturer</h3>
            <p className="text-sm text-gray-600">Who manufactures this {formData.equipmentCategory}?</p>
            <div className="space-y-3 mt-6">
              {MANUFACTURERS.map((mfg) => (
                <button
                  key={mfg.value}
                  type="button"
                  onClick={() => updateFormData('manufacturer', mfg.value)}
                  className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                    formData.manufacturer === mfg.value
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-300 hover:border-indigo-300'
                  }`}
                  style={{ color: '#111827' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{mfg.label}</span>
                    {formData.manufacturer === mfg.value && (
                      <Check className="w-5 h-5 text-indigo-600" />
                    )}
                  </div>
                </button>
              ))}
            </div>
            {formData.manufacturer === 'other' && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter Manufacturer Name
                </label>
                <input
                  type="text"
                  value={customManufacturer}
                  onChange={(e) => setCustomManufacturer(e.target.value)}
                  placeholder="e.g., Diamond Products"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                  style={{ color: '#111827' }}
                />
                {errors.customManufacturer && (
                  <p className="text-sm text-red-600 mt-1">{errors.customManufacturer}</p>
                )}
              </div>
            )}
            {errors.manufacturer && (
              <p className="text-sm text-red-600 mt-2">{errors.manufacturer}</p>
            )}
          </div>
        )

      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Model Number</h3>
            <p className="text-sm text-gray-600">Enter the model number of this {formData.equipmentCategory}</p>
            <input
              type="text"
              value={formData.modelNumber}
              onChange={(e) => updateFormData('modelNumber', e.target.value)}
              placeholder="e.g., Elite-Cut 580"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
              style={{ color: '#111827' }}
            />
            {errors.modelNumber && (
              <p className="text-sm text-red-600">{errors.modelNumber}</p>
            )}
          </div>
        )

      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Size (in inches)</h3>
            <p className="text-sm text-gray-600">Enter the diameter/size in inches</p>
            <div className="relative">
              <input
                type="text"
                value={formData.size}
                onChange={(e) => updateFormData('size', e.target.value)}
                placeholder="e.g., 20, 14, 3/4"
                className="w-full px-4 py-3 pr-16 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                style={{ color: '#111827' }}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                inches
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Enter size in inches only</p>
            {errors.size && (
              <p className="text-sm text-red-600">{errors.size}</p>
            )}
          </div>
        )

      case 5:
        const equipmentTypes = formData.equipmentCategory === 'blade' ? BLADE_EQUIPMENT_TYPES : BIT_EQUIPMENT_TYPES
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Equipment Type</h3>
            <p className="text-sm text-gray-600">What equipment is this {formData.equipmentCategory} for?</p>
            <div className="space-y-3 mt-6">
              {equipmentTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => updateFormData('equipmentFor', type.value)}
                  className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                    formData.equipmentFor === type.value
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-300 hover:border-indigo-300'
                  }`}
                  style={{ color: '#111827' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{type.label}</span>
                    {formData.equipmentFor === type.value && (
                      <Check className="w-5 h-5 text-indigo-600" />
                    )}
                  </div>
                </button>
              ))}
            </div>
            {errors.equipmentFor && (
              <p className="text-sm text-red-600 mt-2">{errors.equipmentFor}</p>
            )}
          </div>
        )

      case 6:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Purchase Information</h3>
            <p className="text-sm text-gray-600">When was this purchased and for how much?</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Purchase Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(e) => updateFormData('purchaseDate', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 bg-white"
                  style={{
                    color: '#111827',
                    colorScheme: 'light'
                  }}
                />
              </div>
              {errors.purchaseDate && (
                <p className="text-sm text-red-600 mt-1">{errors.purchaseDate}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Purchase Price ($)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.purchasePrice}
                  onChange={(e) => updateFormData('purchasePrice', e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                  style={{ color: '#111827' }}
                />
              </div>
              {errors.purchasePrice && (
                <p className="text-sm text-red-600 mt-1">{errors.purchasePrice}</p>
              )}
            </div>
          </div>
        )

      case 7:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Quantity</h3>
            <p className="text-sm text-gray-600">How many of these items are you adding to inventory?</p>

            <div className="flex items-center justify-center space-x-4 my-8">
              <button
                type="button"
                onClick={() => handleQuantityChange(Math.max(1, formData.quantity - 1))}
                className="w-12 h-12 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-xl font-bold"
              >
                -
              </button>
              <div className="text-4xl font-bold text-indigo-600 w-20 text-center">
                {formData.quantity}
              </div>
              <button
                type="button"
                onClick={() => handleQuantityChange(formData.quantity + 1)}
                className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center text-xl font-bold"
              >
                +
              </button>
            </div>

            <div className="text-center text-sm text-gray-600">
              {formData.quantity === 1 ? '1 item' : `${formData.quantity} items`} will be added
            </div>
            {errors.quantity && (
              <p className="text-sm text-red-600 text-center">{errors.quantity}</p>
            )}
          </div>
        )

      case 8:
        return (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900">Storage Location & Notes</h3>
            <p className="text-sm text-gray-600">
              Where will these items be stored? Add any additional notes about this inventory.
            </p>

            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Storage Location (Optional)
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => updateFormData('location', e.target.value)}
                  placeholder="e.g., Tool Shed A, Shelf 3, Warehouse B"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                  style={{ color: '#111827' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => updateFormData('notes', e.target.value)}
                  placeholder="Any additional information about this inventory item..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                  style={{ color: '#111827' }}
                />
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="blade-wizard-modal bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="border-b border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Package className="w-6 h-6 text-indigo-600" />
              <h2 className="text-2xl font-bold text-gray-900">Add Equipment to Inventory</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="flex items-center space-x-2">
            {Array.from({ length: totalSteps }).map((_, index) => {
              // Adjust display for bits (skip step 5)
              const displayStep = formData.equipmentCategory === 'bit' && index >= 4 ? index + 2 : index + 1
              return (
                <div
                  key={index}
                  className={`h-2 flex-1 rounded-full transition-all ${
                    displayStep <= currentStep ? 'bg-indigo-600' : 'bg-gray-200'
                  }`}
                />
              )
            })}
          </div>
          <div className="text-sm text-gray-600 mt-2">
            Step {formData.equipmentCategory === 'bit' && currentStep > 5 ? currentStep - 1 : currentStep} of {totalSteps}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 flex justify-between">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className="px-6 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back</span>
          </button>

          {currentStep < totalSteps ? (
            <button
              onClick={handleNext}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2"
            >
              <span>Next</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  <span>Adding...</span>
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  <span>Add to Inventory</span>
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
