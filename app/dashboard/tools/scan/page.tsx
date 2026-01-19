'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrowserMultiFormatReader } from '@zxing/library';
import { getEquipmentByQR, updateEquipmentStatus, type Equipment } from '../../../../lib/supabase-equipment';

export default function QRScanPage() {
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(false);
  const [scannedEquipment, setScannedEquipment] = useState<Equipment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualQR, setManualQR] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  // Current operator (in a real app, this would come from auth)
  const currentUser = { name: 'Demo Operator', role: 'operator' };

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
        null, // Use default camera
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

  const handleAssignToMe = async () => {
    if (!scannedEquipment) return;

    try {
      console.log(`🔄 Assigning equipment ${scannedEquipment.id} to ${currentUser.name}`);
      setIsLoading(true);
      setError(null);

      const updatedEquipment = await updateEquipmentStatus(scannedEquipment.id, 'assigned', currentUser.name);

      setScannedEquipment(updatedEquipment);
      console.log('✅ Equipment assigned successfully');

    } catch (err: any) {
      console.error('💥 Error assigning equipment:', err);
      setError(`Error assigning equipment: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnassign = async () => {
    if (!scannedEquipment) return;

    try {
      console.log(`🔄 Unassigning equipment ${scannedEquipment.id}`);
      setIsLoading(true);
      setError(null);

      const updatedEquipment = await updateEquipmentStatus(scannedEquipment.id, 'available', '');

      setScannedEquipment(updatedEquipment);
      console.log('✅ Equipment unassigned successfully');

    } catch (err: any) {
      console.error('💥 Error unassigning equipment:', err);
      setError(`Error unassigning equipment: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMaintenanceRequest = () => {
    if (!scannedEquipment) return;
    router.push(`/dashboard/tools/maintenance-request?equipment=${scannedEquipment.id}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'text-green-700 bg-green-100 border border-green-300';
      case 'assigned': return 'text-blue-700 bg-blue-100 border border-blue-300';
      case 'maintenance': return 'text-orange-700 bg-orange-100 border border-orange-300';
      default: return 'text-gray-700 bg-gray-100 border border-gray-300';
    }
  };

  const getActionButtons = () => {
    if (!scannedEquipment) return null;

    const isAssignedToMe = scannedEquipment.assigned_to === currentUser.name;
    const isAssignedToOther = scannedEquipment.status === 'assigned' && !isAssignedToMe;

    return (
      <div className="space-y-3">
        {/* Assign/Unassign Button */}
        {scannedEquipment.status === 'available' && (
          <button
            onClick={handleAssignToMe}
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 disabled:opacity-50 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-105 min-h-[56px] flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span>{isLoading ? 'Assigning...' : 'Assign to Me'}</span>
          </button>
        )}

        {isAssignedToMe && (
          <button
            onClick={handleUnassign}
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 disabled:from-gray-400 disabled:to-gray-500 disabled:opacity-50 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-105 min-h-[56px] flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
            </svg>
            <span>{isLoading ? 'Unassigning...' : 'Unassign from Me'}</span>
          </button>
        )}

        {isAssignedToOther && (
          <button
            disabled
            className="w-full bg-gray-200 border-2 border-gray-300 text-gray-500 font-bold py-4 px-6 rounded-xl cursor-not-allowed min-h-[56px] flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Not Available (Assigned to {scannedEquipment.assigned_to})</span>
          </button>
        )}

        {/* Always show Maintenance Request button */}
        <button
          onClick={handleMaintenanceRequest}
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 disabled:from-gray-400 disabled:to-gray-500 disabled:opacity-50 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-105 min-h-[56px] flex items-center justify-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Request Maintenance</span>
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="container mx-auto px-6 py-8 relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard/tools"
              className="group p-3 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200 text-gray-700 hover:bg-white transition-all duration-300 hover:scale-105 shadow-sm"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
                QR Scanner
              </h1>
              <p className="text-gray-600 font-medium mt-1">Scan equipment QR codes to manage assignments</p>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Camera Section */}
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 mb-6 shadow-lg">
            <div className="aspect-square bg-gray-900 rounded-xl overflow-hidden mb-6 relative border-2 border-gray-300">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ display: isScanning ? 'block' : 'none' }}
              />

              {!isScanning && (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-cyan-50 to-blue-50">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                      <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M12 12h-4.01M12 12v4m6-7h-2V4h-5.01M7 7h.01" />
                      </svg>
                    </div>
                    <p className="text-lg font-bold text-gray-800">Camera Ready</p>
                    <p className="text-gray-600 font-medium">Tap start to scan QR codes</p>
                  </div>
                </div>
              )}

              {isScanning && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-4 border-2 border-cyan-400 rounded-lg shadow-lg"></div>
                  <div className="absolute top-4 left-4 w-6 h-6 border-t-4 border-l-4 border-cyan-500 rounded-tl-lg"></div>
                  <div className="absolute top-4 right-4 w-6 h-6 border-t-4 border-r-4 border-cyan-500 rounded-tr-lg"></div>
                  <div className="absolute bottom-4 left-4 w-6 h-6 border-b-4 border-l-4 border-cyan-500 rounded-bl-lg"></div>
                  <div className="absolute bottom-4 right-4 w-6 h-6 border-b-4 border-r-4 border-cyan-500 rounded-br-lg"></div>
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
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-gray-800 font-bold mb-3">Manual QR Entry</h3>
              <form onSubmit={handleManualQRSubmit} className="flex space-x-3">
                <input
                  type="text"
                  placeholder="Enter QR code manually"
                  value={manualQR}
                  onChange={(e) => setManualQR(e.target.value)}
                  className="flex-1 px-4 py-3 bg-white border-2 border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                />
                <button
                  type="submit"
                  disabled={!manualQR.trim() || isLoading}
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl min-h-[48px] flex items-center justify-center"
                >
                  {isLoading ? 'Looking up...' : 'Lookup'}
                </button>
              </form>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 mb-6 shadow-lg">
              <div className="flex items-center space-x-3">
                <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-800 font-medium">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="mt-3 text-red-600 hover:text-red-700 text-sm font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Equipment Details */}
          {scannedEquipment && (
            <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Equipment Found</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(scannedEquipment.status)}`}>
                  {scannedEquipment.status.toUpperCase()}
                </span>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-gray-600 text-sm font-semibold">Name</label>
                  <p className="text-gray-800 text-lg font-bold">{scannedEquipment.name}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {scannedEquipment.brand && (
                    <div>
                      <label className="text-gray-600 text-sm font-semibold">Brand</label>
                      <p className="text-gray-800 font-medium">{scannedEquipment.brand}</p>
                    </div>
                  )}
                  {scannedEquipment.model && (
                    <div>
                      <label className="text-gray-600 text-sm font-semibold">Model</label>
                      <p className="text-gray-800 font-medium">{scannedEquipment.model}</p>
                    </div>
                  )}
                </div>

                {scannedEquipment.serial_number && (
                  <div>
                    <label className="text-gray-600 text-sm font-semibold">Serial Number</label>
                    <p className="text-gray-800 font-mono font-medium">{scannedEquipment.serial_number}</p>
                  </div>
                )}

                {scannedEquipment.assigned_to && (
                  <div>
                    <label className="text-gray-600 text-sm font-semibold">Assigned To</label>
                    <p className="text-gray-800 font-medium">{scannedEquipment.assigned_to}</p>
                  </div>
                )}

                {scannedEquipment.location && (
                  <div>
                    <label className="text-gray-600 text-sm font-semibold">Location</label>
                    <p className="text-gray-800 font-medium">{scannedEquipment.location}</p>
                  </div>
                )}

                {scannedEquipment.notes && (
                  <div>
                    <label className="text-gray-600 text-sm font-semibold">Notes</label>
                    <p className="text-gray-800 font-medium">{scannedEquipment.notes}</p>
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
                  className="flex-1 bg-gray-100 hover:bg-gray-200 border-2 border-gray-300 text-gray-800 font-bold py-3 px-6 rounded-xl transition-all shadow-md hover:shadow-lg min-h-[48px] flex items-center justify-center"
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