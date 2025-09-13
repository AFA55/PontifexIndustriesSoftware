'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Camera, CheckCircle, AlertCircle, Loader2, QrCode } from 'lucide-react'
import Webcam from 'react-webcam'
import { BrowserMultiFormatReader } from '@zxing/library'

interface QRScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScanSuccess: (equipmentData: any) => void
}

export default function QRScannerModal({
  isOpen,
  onClose,
  onScanSuccess
}: QRScannerModalProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState('')
  const [cameraPermission, setCameraPermission] = useState<'pending' | 'granted' | 'denied'>('pending')
  const webcamRef = useRef<Webcam>(null)
  const scannerRef = useRef<BrowserMultiFormatReader | null>(null)
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isOpen) {
      initializeScanner()
    } else {
      cleanup()
    }

    return () => cleanup()
  }, [isOpen])

  const initializeScanner = async () => {
    try {
      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      setCameraPermission('granted')

      // Create scanner instance
      scannerRef.current = new BrowserMultiFormatReader()

      // Stop the test stream
      stream.getTracks().forEach(track => track.stop())
    } catch (error) {
      console.error('Camera permission denied:', error)
      setCameraPermission('denied')
      setError('Camera access is required for QR scanning')
    }
  }

  const startScanning = () => {
    if (!scannerRef.current || !webcamRef.current) return

    setIsScanning(true)
    setError('')

    // Start scanning interval
    scanIntervalRef.current = setInterval(() => {
      scanFromWebcam()
    }, 500)
  }

  const scanFromWebcam = async () => {
    if (!webcamRef.current || !scannerRef.current) return

    try {
      const imageSrc = webcamRef.current.getScreenshot()
      if (!imageSrc) return

      // Create image element for scanning
      const img = new Image()
      img.onload = async () => {
        try {
          const result = await scannerRef.current!.decodeFromImageElement(img)
          if (result) {
            handleScanResult(result.getText())
          }
        } catch (error) {
          // No QR code found in this frame, continue scanning
        }
      }
      img.src = imageSrc
    } catch (error) {
      console.error('Scan error:', error)
    }
  }

  const handleScanResult = (text: string) => {
    try {
      const data = JSON.parse(text)

      // Validate that this is a Pontifex equipment QR code
      if (data.type === 'pontifex-equipment' && data.id) {
        stopScanning()
        onScanSuccess(data)
        onClose()
      } else {
        setError('Invalid QR code. Please scan a Pontifex equipment QR code.')
        stopScanning()
      }
    } catch (error) {
      setError('Unable to read QR code data. Please try again.')
      stopScanning()
    }
  }

  const stopScanning = () => {
    setIsScanning(false)
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
  }

  const cleanup = () => {
    stopScanning()
    if (scannerRef.current) {
      scannerRef.current = null
    }
  }

  const videoConstraints = {
    width: 640,
    height: 480,
    facingMode: 'environment' // Use back camera if available
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <QrCode className="w-6 h-6 text-cyan-400" />
            <h2 className="text-2xl font-bold text-white">Scan QR Code</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {cameraPermission === 'pending' && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-4" />
              <p className="text-white">Requesting camera permission...</p>
            </div>
          )}

          {cameraPermission === 'denied' && (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Camera Access Required</h3>
              <p className="text-white/70 mb-4">
                Please allow camera access to scan QR codes. You may need to refresh the page and try again.
              </p>
              <button
                onClick={() => {
                  setCameraPermission('pending')
                  initializeScanner()
                }}
                className="bg-cyan-500 hover:bg-cyan-400 text-white px-6 py-3 rounded-xl transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {cameraPermission === 'granted' && (
            <div className="space-y-4">
              {/* Camera View */}
              <div className="relative bg-black rounded-xl overflow-hidden">
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  videoConstraints={videoConstraints}
                  className="w-full h-auto"
                />

                {/* Scanning Overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-64 h-64 border-2 border-cyan-400 rounded-xl relative">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-cyan-400 rounded-tl-xl"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyan-400 rounded-tr-xl"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyan-400 rounded-bl-xl"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-cyan-400 rounded-br-xl"></div>
                  </div>
                </div>

                {/* Scanning Status */}
                {isScanning && (
                  <div className="absolute top-4 left-4 bg-cyan-500/20 backdrop-blur-sm border border-cyan-400/50 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                      <span className="text-cyan-400 text-sm font-medium">Scanning...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="text-center">
                <p className="text-white/70 mb-4">
                  Position the equipment QR code within the frame to scan
                </p>

                {!isScanning ? (
                  <button
                    onClick={startScanning}
                    className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold px-8 py-3 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 transform hover:scale-105 flex items-center gap-2 mx-auto"
                  >
                    <Camera className="w-5 h-5" />
                    Start Scanning
                  </button>
                ) : (
                  <button
                    onClick={stopScanning}
                    className="bg-white/10 border border-white/20 text-white font-medium px-8 py-3 rounded-xl hover:bg-white/20 transition-all flex items-center gap-2 mx-auto"
                  >
                    Stop Scanning
                  </button>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/50 rounded-xl p-4 text-red-300 text-sm flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}