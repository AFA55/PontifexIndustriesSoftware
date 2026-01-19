'use client'

import { useState, useEffect, useRef } from 'react'
import { BrowserMultiFormatReader } from '@zxing/library'
import { X, Camera, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'

interface QRScannerProps {
  isOpen: boolean
  onClose: () => void
  onScan: (data: string) => void
}

export default function QRScanner({ isOpen, onClose, onScan }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string>('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null)

  useEffect(() => {
    if (isOpen) {
      startScanning()
    } else {
      stopScanning()
    }

    return () => {
      stopScanning()
    }
  }, [isOpen])

  const startScanning = async () => {
    try {
      setError('')
      setIsScanning(true)

      // Initialize the code reader
      const codeReader = new BrowserMultiFormatReader()
      codeReaderRef.current = codeReader

      // Get available video devices
      const videoInputDevices = await codeReader.listVideoInputDevices()

      if (videoInputDevices.length === 0) {
        setError('No camera found. Please ensure your device has a camera.')
        setIsScanning(false)
        return
      }

      // Use the first camera (usually back camera on mobile)
      const selectedDeviceId = videoInputDevices[0].deviceId

      // Start decoding from video device
      codeReader.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current!,
        (result, error) => {
          if (result) {
            // Successfully scanned QR code
            const scannedData = result.getText()
            onScan(scannedData)
            stopScanning()
            onClose()
          }
          // Ignore errors during scanning (they're normal when no QR is in view)
        }
      )
    } catch (err) {
      console.error('Error starting scanner:', err)
      setError('Failed to access camera. Please ensure camera permissions are granted.')
      setIsScanning(false)
    }
  }

  const stopScanning = () => {
    if (codeReaderRef.current) {
      codeReaderRef.current.reset()
      codeReaderRef.current = null
    }
    setIsScanning(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Camera className="w-6 h-6" />
              <h2 className="text-2xl font-bold">Scan QR Code</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-indigo-100 mt-2">Point your camera at the QR code on the blade or bit</p>
        </div>

        {/* Scanner Area */}
        <div className="p-6">
          {error ? (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-8 text-center">
              <div className="text-red-600 text-lg font-semibold mb-2">
                {error}
              </div>
              <button
                onClick={startScanning}
                className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="relative">
              <video
                ref={videoRef}
                className="w-full rounded-lg bg-black"
                style={{ maxHeight: '500px' }}
              />

              {/* Scanner overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 border-4 border-indigo-500 rounded-lg shadow-lg">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
                </div>
              </div>

              {isScanning && (
                <div className="absolute top-4 left-4 flex items-center space-x-2 bg-black/50 text-white px-4 py-2 rounded-lg">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Scanning...</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 text-center text-sm text-gray-600">
            Position the QR code within the scanning area
          </div>
        </div>
      </motion.div>
    </div>
  )
}
