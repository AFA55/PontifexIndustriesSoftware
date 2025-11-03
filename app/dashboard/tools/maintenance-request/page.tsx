'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { BrowserMultiFormatReader } from '@zxing/library';
import { getAllEquipment, getEquipmentByQR, type Equipment } from '../../../../lib/supabase-equipment';
import { getCurrentUser } from '../../../../lib/auth';

type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent';
type IssueCategory = 'mechanical' | 'electrical' | 'hydraulic' | 'safety' | 'other';

interface MaintenanceRequest {
  equipmentId: string;
  equipmentName: string;
  issueCategory: IssueCategory;
  priority: PriorityLevel;
  description: string;
  requestedBy: string;
  dateRequested: string;
}

export default function MaintenanceRequestPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [selectedEquipment, setSelectedEquipment] = useState<string>('');
  const [issueCategory, setIssueCategory] = useState<IssueCategory>('mechanical');
  const [priority, setPriority] = useState<PriorityLevel>('medium');
  const [description, setDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [isScanningEquipment, setIsScanningEquipment] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    loadEquipment();
  }, []);

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

  const loadEquipment = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const equipmentData = await getAllEquipment();
      setEquipment(equipmentData);
    } catch (err: any) {
      console.error('Error loading equipment:', err);
      setError(`Failed to load equipment: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const startScanning = async () => {
    try {
      setError(null);
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
      setIsScanningEquipment(true);

      const scannedEquipment = await getEquipmentByQR(qrCode);

      if (scannedEquipment) {
        console.log('✅ Equipment found:', scannedEquipment);
        setSelectedEquipment(scannedEquipment.id);
        setSearchTerm(scannedEquipment.name); // Update search term to show the scanned equipment
        stopScanning();

        // Show success message
        const successMsg = document.createElement('div');
        successMsg.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-xl shadow-lg z-50 animate-fade-in';
        successMsg.textContent = `✓ Equipment "${scannedEquipment.name}" selected!`;
        document.body.appendChild(successMsg);
        setTimeout(() => successMsg.remove(), 3000);
      } else {
        console.log('❌ No equipment found for QR:', qrCode);
        setError(`No equipment found with QR code: ${qrCode}`);
      }
    } catch (err: any) {
      console.error('💥 Error looking up equipment:', err);
      setError(`Error looking up equipment: ${err.message}`);
    } finally {
      setIsScanningEquipment(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedEquipment || !description.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const currentUser = getCurrentUser();
      const selectedEquipmentItem = equipment.find(e => e.id === selectedEquipment);

      const request: MaintenanceRequest = {
        equipmentId: selectedEquipment,
        equipmentName: selectedEquipmentItem?.name || 'Unknown',
        issueCategory,
        priority,
        description: description.trim(),
        requestedBy: currentUser?.name || 'Unknown',
        dateRequested: new Date().toISOString(),
      };

      // TODO: Save to database
      console.log('Maintenance Request:', request);

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      setSuccess(true);

      // Reset form
      setTimeout(() => {
        setSelectedEquipment('');
        setIssueCategory('mechanical');
        setPriority('medium');
        setDescription('');
        setSearchTerm('');
        setSuccess(false);
      }, 3000);

    } catch (err: any) {
      console.error('Error submitting maintenance request:', err);
      setError(`Failed to submit request: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPriorityConfig = (p: PriorityLevel) => {
    switch (p) {
      case 'low':
        return {
          color: 'bg-blue-50 border-blue-400 text-blue-700 shadow-lg shadow-blue-200',
          label: 'Low',
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5" />
            </svg>
          ),
        };
      case 'medium':
        return {
          color: 'bg-yellow-50 border-yellow-400 text-yellow-700 shadow-lg shadow-yellow-200',
          label: 'Medium',
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          ),
        };
      case 'high':
        return {
          color: 'bg-orange-50 border-orange-400 text-orange-700 shadow-lg shadow-orange-200',
          label: 'High',
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
        };
      case 'urgent':
        return {
          color: 'bg-red-50 border-red-500 text-red-700 shadow-lg shadow-red-200 animate-pulse',
          label: 'Urgent',
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
        };
    }
  };

  const getCategoryConfig = (c: IssueCategory) => {
    switch (c) {
      case 'mechanical':
        return { icon: '⚙️', label: 'Mechanical' };
      case 'electrical':
        return { icon: '⚡', label: 'Electrical' };
      case 'hydraulic':
        return { icon: '💧', label: 'Hydraulic' };
      case 'safety':
        return { icon: '🛡️', label: 'Safety' };
      case 'other':
        return { icon: '📋', label: 'Other' };
    }
  };

  const filteredEquipment = equipment.filter(e =>
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.qr_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.serial_number && e.serial_number.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
        {/* Animated Background Elements */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
        </div>

        <div className="container mx-auto px-6 py-8 relative">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-orange-300 border-t-orange-600 rounded-full animate-spin mx-auto mb-6"></div>
              <p className="text-gray-800 text-lg font-medium">Loading Equipment...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
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
              <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-600 via-red-600 to-pink-600 bg-clip-text text-transparent">
                Maintenance Request
              </h1>
              <p className="text-gray-600 font-medium mt-1">Report equipment issues and request repairs</p>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Success Message */}
          {success && (
            <div className="mb-6 bg-green-50 rounded-2xl border-2 border-green-300 p-6 shadow-lg animate-fade-in">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-gray-800 font-bold text-lg">Request Submitted Successfully!</h3>
                  <p className="text-gray-600 font-medium">Your maintenance request has been received and will be processed shortly.</p>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 rounded-2xl border-2 border-red-300 p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-800 font-medium">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-red-600 hover:text-red-700 text-sm font-semibold"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Main Form */}
          <form onSubmit={handleSubmit} className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-8 shadow-lg">
            {/* Equipment Selection */}
            <div className="mb-8">
              <label className="text-gray-800 font-bold text-lg mb-4 block">
                Select Equipment <span className="text-red-600">*</span>
              </label>

              {/* Search Box and Scan Button */}
              <div className="mb-4 flex space-x-3">
                <div className="flex-1 relative">
                  <svg className="absolute left-4 top-4 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search equipment by name, QR code, or serial number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-white border-2 border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all shadow-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={isScanning ? stopScanning : startScanning}
                  className={`px-6 py-4 rounded-xl font-bold transition-all shadow-md hover:shadow-lg flex items-center space-x-2 ${
                    isScanning
                      ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white'
                      : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {isScanning ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M12 12h-4.01M12 12v4m6-7h-2V4h-5.01M7 7h.01" />
                    )}
                  </svg>
                  <span className="hidden sm:inline">{isScanning ? 'Stop' : 'Scan'}</span>
                </button>
              </div>

              {/* Scanner Section */}
              {isScanning && (
                <div className="mb-4 bg-gray-900 rounded-xl overflow-hidden border-2 border-cyan-400 shadow-lg">
                  <div className="aspect-video relative">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />

                    {/* Scanner overlay */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute inset-4 border-2 border-cyan-400 rounded-lg"></div>
                      <div className="absolute top-4 left-4 w-6 h-6 border-t-4 border-l-4 border-cyan-500 rounded-tl-lg"></div>
                      <div className="absolute top-4 right-4 w-6 h-6 border-t-4 border-r-4 border-cyan-500 rounded-tr-lg"></div>
                      <div className="absolute bottom-4 left-4 w-6 h-6 border-b-4 border-l-4 border-cyan-500 rounded-bl-lg"></div>
                      <div className="absolute bottom-4 right-4 w-6 h-6 border-b-4 border-r-4 border-cyan-500 rounded-br-lg"></div>

                      {/* Scanning text */}
                      <div className="absolute bottom-8 left-0 right-0 text-center">
                        <div className="inline-block bg-cyan-500/90 backdrop-blur-sm px-4 py-2 rounded-full">
                          <p className="text-white font-bold text-sm flex items-center space-x-2">
                            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>Scanning for QR codes...</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Loading indicator when processing */}
                    {isScanningEquipment && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                        <div className="bg-white rounded-xl p-6 shadow-xl">
                          <div className="w-12 h-12 border-4 border-cyan-300 border-t-cyan-600 rounded-full animate-spin mx-auto mb-3"></div>
                          <p className="text-gray-800 font-bold">Looking up equipment...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Equipment Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto custom-scrollbar">
                {filteredEquipment.length === 0 ? (
                  <div className="col-span-2 text-center py-8 text-gray-500 font-medium">
                    No equipment found matching your search.
                  </div>
                ) : (
                  filteredEquipment.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedEquipment(item.id)}
                      className={`
                        text-left p-4 rounded-xl border-2 transition-all duration-300 hover:scale-[1.02] shadow-sm
                        ${selectedEquipment === item.id
                          ? 'bg-orange-50 border-orange-400 shadow-lg shadow-orange-200'
                          : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        }
                      `}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${selectedEquipment === item.id ? 'bg-orange-500' : 'bg-gray-300'}`}></div>
                        <div className="flex-1">
                          <h4 className="text-gray-800 font-bold">{item.name}</h4>
                          <p className="text-gray-600 text-sm font-medium">{item.qr_code}</p>
                          {item.serial_number && (
                            <p className="text-gray-500 text-xs font-mono mt-1">{item.serial_number}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Issue Category */}
            <div className="mb-8">
              <label className="text-gray-800 font-bold text-lg mb-4 block">
                Issue Category <span className="text-red-600">*</span>
              </label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {(['mechanical', 'electrical', 'hydraulic', 'safety', 'other'] as IssueCategory[]).map((cat) => {
                  const config = getCategoryConfig(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setIssueCategory(cat)}
                      className={`
                        p-4 rounded-xl border-2 transition-all duration-300 hover:scale-105 shadow-sm
                        ${issueCategory === cat
                          ? 'bg-orange-50 border-orange-400 shadow-lg shadow-orange-200'
                          : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        }
                      `}
                    >
                      <div className="text-3xl mb-2">{config.icon}</div>
                      <div className="text-gray-800 text-sm font-bold">{config.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Priority Level */}
            <div className="mb-8">
              <label className="text-gray-800 font-bold text-lg mb-4 block">
                Priority Level <span className="text-red-600">*</span>
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(['low', 'medium', 'high', 'urgent'] as PriorityLevel[]).map((p) => {
                  const config = getPriorityConfig(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`
                        p-4 rounded-xl border-2 transition-all duration-300 hover:scale-105 shadow-sm
                        ${priority === p
                          ? config.color
                          : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 text-gray-800'
                        }
                      `}
                    >
                      <div className="flex items-center justify-center space-x-2">
                        {config.icon}
                        <span className="font-bold">{config.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div className="mb-8">
              <label className="text-gray-800 font-bold text-lg mb-4 block">
                Issue Description <span className="text-red-600">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Please describe the issue in detail, including any symptoms, when it started, and any relevant information..."
                rows={6}
                className="w-full px-4 py-4 bg-white border-2 border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all resize-none shadow-sm"
                required
              />
              <p className="text-gray-600 text-sm font-medium mt-2">{description.length} characters</p>
            </div>

            {/* Submit Button */}
            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={isSubmitting || !selectedEquipment || !description.trim()}
                className="flex-1 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 disabled:from-gray-400 disabled:to-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 hover:scale-[1.02] shadow-lg hover:shadow-xl min-h-[56px] flex items-center justify-center"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Submitting Request...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Submit Maintenance Request
                  </>
                )}
              </button>

              <Link
                href="/dashboard/tools"
                className="px-8 py-4 bg-gray-100 hover:bg-gray-200 border-2 border-gray-300 text-gray-800 font-bold rounded-xl transition-all duration-300 hover:scale-[1.02] shadow-md min-h-[56px] flex items-center justify-center"
              >
                Cancel
              </Link>
            </div>
          </form>

          {/* Info Section */}
          <div className="mt-8 bg-blue-50 rounded-2xl border-2 border-blue-300 p-6 shadow-lg">
            <div className="flex items-start space-x-3">
              <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-gray-800 font-bold mb-2">Maintenance Request Guidelines</h4>
                <ul className="text-gray-700 text-sm font-medium space-y-1">
                  <li>• Urgent requests will be prioritized and addressed within 24 hours</li>
                  <li>• High priority requests typically receive attention within 2-3 business days</li>
                  <li>• Include specific details about the issue to help technicians prepare</li>
                  <li>• You will receive email notifications about your request status</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(249, 250, 251, 1);
          border-radius: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(249, 115, 22, 0.4);
          border-radius: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(249, 115, 22, 0.6);
        }

        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}
