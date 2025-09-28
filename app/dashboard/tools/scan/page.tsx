'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { BrowserMultiFormatReader } from '@zxing/library';
import { getEquipmentByQR, updateEquipmentStatus, type Equipment } from '../../../../lib/supabase-equipment';

export default function QRScanPage() {
  const [isScanning, setIsScanning] = useState(false);
  const [scannedEquipment, setScannedEquipment] = useState<Equipment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualQR, setManualQR] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [assigneeName, setAssigneeName] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (readerRef.current) {
        try {
          readerRef.current.reset();
        } catch (e) {
          console.log('Reader cleanup error (expected):', e);
        }
      }
    };
  }, []);

  const startScanning = async () => {
    try {
      setError(null);
      setScannedEquipment(null);
      console.log('🎥 Starting camera scan...');
      
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not supported in this browser');
      }

      // Request camera permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment' // Use back camera if available
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Initialize reader
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      setIsScanning(true);

      // Start scanning
      reader.decodeFromVideoDevice(
        undefined, // Use default camera
        videoRef.current!,
        (result, error) => {
          if (result) {
            console.log('📱 QR Code detected:', result.getText());
            handleQRCodeScanned(result.getText());
          }
          if (error && !(error.name === 'NotFoundException')) {
            console.error('❌ Scanner error:', error);
          }
        }
      );

    } catch (err: any) {
      console.error('💥 Camera error:', err);
      setError(err.message || 'Failed to start camera');
      setIsScanning(false);
    }
  };

  const stopScanning = () => {
    console.log('⏹️ Stopping camera scan...');
    setIsScanning(false);
    
    if (readerRef.current) {
      try {
        readerRef.current.reset();
      } catch (e) {
        console.log('Reader reset error (expected):', e);
      }
    }

    // Stop video stream
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const handleQRCodeScanned = async (qrCode: string) => {
    try {
      console.log('🔍 Looking up equipment for QR:', qrCode);
      setIsLoading(true);
      
      const equipment = await getEquipmentByQR(qrCode);
      
      if (equipment) {
        console.log('✅ Equipment found:', equipment);
        setScannedEquipment(equipment);
        stopScanning();
      } else {
        console.log('❌ No equipment found for QR:', qrCode);
        setError(`No equipment found with QR code: ${qrCode}`);
      }
    } catch (err: any) {
      console.error('💥 Error looking up equipment:', err);
      setError(`Error looking up equipment: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualQRSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualQR.trim()) {
      handleQRCodeScanned(manualQR.trim());
      setManualQR('');
    }
  };

  const handleStatusUpdate = async (newStatus: Equipment['status']) => {
    if (!scannedEquipment) return;

    try {
      console.log(`🔄 Updating equipment ${scannedEquipment.id} to status: ${newStatus}`);
      setIsLoading(true);
      
      const assignedTo = newStatus === 'assigned' ? assigneeName.trim() : undefined;
      const updatedEquipment = await updateEquipmentStatus(scannedEquipment.id, newStatus, assignedTo);
      
      setScannedEquipment(updatedEquipment);
      setAssigneeName('');
      console.log('✅ Status updated successfully');
      
    } catch (err: any) {
      console.error('💥 Error updating status:', err);
      setError(`Error updating status: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'text-green-400 bg-green-500/20';
      case 'assigned': return 'text-blue-400 bg-blue-500/20';
      case 'maintenance': return 'text-orange-400 bg-orange-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  const getActionButtons = () => {
    if (!scannedEquipment) return null;

    switch (scannedEquipment.status) {
      case 'available':
        return (
          <div className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="Enter assignee name"
                value={assigneeName}
                onChange={(e) => setAssigneeName(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => handleStatusUpdate('assigned')}
                disabled={!assigneeName.trim() || isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center justify-center"
              >
                {isLoading ? 'Assigning...' : 'Assign Equipment'}
              </button>
              <button
                onClick={() => handleStatusUpdate('maintenance')}
                disabled={isLoading}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center justify-center"
              >
                {isLoading ? 'Updating...' : 'Send to Maintenance'}
              </button>
            </div>
          </div>
        );

      case 'assigned':
        return (
          <div className="flex space-x-3">
            <button
              onClick={() => handleStatusUpdate('available')}
              disabled={isLoading}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center justify-center"
            >
              {isLoading ? 'Returning...' : 'Return Equipment'}
            </button>
            <button
              onClick={() => handleStatusUpdate('maintenance')}
              disabled={isLoading}
              className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center justify-center"
            >
              {isLoading ? 'Updating...' : 'Send to Maintenance'}
            </button>
          </div>
        );

      case 'maintenance':
        return (
          <button
            onClick={() => handleStatusUpdate('available')}
            disabled={isLoading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center justify-center"
          >
            {isLoading ? 'Updating...' : 'Mark as Available'}
          </button>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard/tools"
              className="group p-3 backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 text-white hover:bg-white/10 transition-all duration-300 hover:scale-105"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">QR Scanner</h1>
              <p className="text-blue-200">Scan equipment QR codes to manage assignments</p>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Camera Section */}
          <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-6 mb-6">
            <div className="aspect-square bg-black rounded-xl overflow-hidden mb-6 relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ display: isScanning ? 'block' : 'none' }}
              />
              
              {!isScanning && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-white">
                    <div className="w-20 h-20 mx-auto mb-4 bg-white/10 rounded-xl flex items-center justify-center">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M12 12h-4.01M12 12v4m6-7h-2V4h-5.01M7 7h.01" />
                      </svg>
                    </div>
                    <p className="text-lg">Camera ready</p>
                    <p className="text-blue-200">Tap start to scan QR codes</p>
                  </div>
                </div>
              )}

              {isScanning && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-4 border-2 border-white/50 rounded-lg"></div>
                  <div className="absolute top-4 left-4 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-lg"></div>
                  <div className="absolute top-4 right-4 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-lg"></div>
                  <div className="absolute bottom-4 left-4 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-lg"></div>
                  <div className="absolute bottom-4 right-4 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-lg"></div>
                </div>
              )}
            </div>

            {/* Camera Controls */}
            <div className="flex space-x-3 mb-6">
              {!isScanning ? (
                <button
                  onClick={startScanning}
                  className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-medium py-4 px-6 rounded-xl transition-all duration-300 hover:scale-105 min-h-[48px] flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Start Scanning</span>
                </button>
              ) : (
                <button
                  onClick={stopScanning}
                  className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium py-4 px-6 rounded-xl transition-all duration-300 hover:scale-105 min-h-[48px] flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Stop Scanning</span>
                </button>
              )}
            </div>

            {/* Manual QR Entry */}
            <div className="border-t border-white/20 pt-6">
              <h3 className="text-white font-medium mb-3">Manual QR Entry</h3>
              <form onSubmit={handleManualQRSubmit} className="flex space-x-3">
                <input
                  type="text"
                  placeholder="Enter QR code manually"
                  value={manualQR}
                  onChange={(e) => setManualQR(e.target.value)}
                  className="flex-1 px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={!manualQR.trim() || isLoading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center justify-center"
                >
                  {isLoading ? 'Looking up...' : 'Lookup'}
                </button>
              </form>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="backdrop-blur-xl bg-red-500/10 rounded-2xl border border-red-500/20 p-6 mb-6">
              <div className="flex items-center space-x-3">
                <svg className="w-6 h-6 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-200">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="mt-3 text-red-300 hover:text-red-200 text-sm"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Equipment Details */}
          {scannedEquipment && (
            <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Equipment Found</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(scannedEquipment.status)}`}>
                  {scannedEquipment.status.toUpperCase()}
                </span>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-blue-200 text-sm font-medium">Name</label>
                  <p className="text-white text-lg font-medium">{scannedEquipment.name}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {scannedEquipment.brand && (
                    <div>
                      <label className="text-blue-200 text-sm font-medium">Brand</label>
                      <p className="text-white">{scannedEquipment.brand}</p>
                    </div>
                  )}
                  {scannedEquipment.model && (
                    <div>
                      <label className="text-blue-200 text-sm font-medium">Model</label>
                      <p className="text-white">{scannedEquipment.model}</p>
                    </div>
                  )}
                </div>

                {scannedEquipment.serial_number && (
                  <div>
                    <label className="text-blue-200 text-sm font-medium">Serial Number</label>
                    <p className="text-white font-mono">{scannedEquipment.serial_number}</p>
                  </div>
                )}

                {scannedEquipment.assigned_to && (
                  <div>
                    <label className="text-blue-200 text-sm font-medium">Assigned To</label>
                    <p className="text-white">{scannedEquipment.assigned_to}</p>
                  </div>
                )}

                {scannedEquipment.location && (
                  <div>
                    <label className="text-blue-200 text-sm font-medium">Location</label>
                    <p className="text-white">{scannedEquipment.location}</p>
                  </div>
                )}

                {scannedEquipment.notes && (
                  <div>
                    <label className="text-blue-200 text-sm font-medium">Notes</label>
                    <p className="text-white">{scannedEquipment.notes}</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {getActionButtons()}

              <div className="mt-6 flex space-x-3">
                <button
                  onClick={() => {
                    setScannedEquipment(null);
                    setError(null);
                  }}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center justify-center"
                >
                  Scan Another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}