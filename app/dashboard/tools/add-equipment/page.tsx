'use client';

import { useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { addEquipment } from '../../../../lib/supabase-equipment';

export default function AddEquipmentPage() {
  const [form, setForm] = useState({
    name: '',
    brand: '',
    model: '',
    serial_number: '',
    location: '',
    notes: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [savedEquipment, setSavedEquipment] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string>('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const generateQRCode = async (text: string): Promise<string> => {
    try {
      const qrDataUrl = await QRCode.toDataURL(text, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      return qrDataUrl;
    } catch (err) {
      console.error('Error generating QR code:', err);
      return '';
    }
  };

  const saveEquipment = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('🚀 Starting equipment save process...');
      
      // Validate required fields
      if (!form.name.trim()) {
        setError('Equipment name is required');
        return;
      }

      const equipmentData = {
        name: form.name.trim(),
        brand: form.brand.trim(),
        model: form.model.trim(),
        serial_number: form.serial_number.trim(),
        location: form.location.trim(),
        notes: form.notes.trim()
      };

      console.log('🔧 Sending equipment data to save:', equipmentData);
      const result = await addEquipment(equipmentData);
      
      console.log('📥 Received result from addEquipment:', result);

      if (result.success && result.equipment) {
        console.log('✅ Equipment saved successfully:', result.equipment);
        
        // Generate QR code
        const qrImageData = await generateQRCode(result.equipment.qr_code);
        setQrImage(qrImageData);
        
        setSavedEquipment(result.equipment);
        
        // Reset form
        setForm({
          name: '',
          brand: '',
          model: '',
          serial_number: '',
          location: '',
          notes: ''
        });
        
        console.log('🎉 Save process completed successfully');
      } else {
        console.error('❌ Save failed:', result.error);
        setError(result.error || 'Failed to save equipment');
        
        if (result.details) {
          console.error('💥 Error details:', result.details);
        }
      }
    } catch (err: any) {
      console.error('💥 Unexpected error during save:', err);
      setError(`Unexpected error: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setSavedEquipment(null);
    setQrImage('');
    setError(null);
    setForm({
      name: '',
      brand: '',
      model: '',
      serial_number: '',
      location: '',
      notes: ''
    });
  };

  if (savedEquipment) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-slate-800 to-gray-900">
        <div className="container mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              <Link
                href="/dashboard"
                className="p-3 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 text-white hover:bg-white/20 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-3xl font-bold text-white">Equipment Added Successfully</h1>
            </div>
          </div>

          <div className="max-w-2xl mx-auto">
            {/* Success Card */}
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-8 text-center">
              <div className="w-20 h-20 bg-green-500/20 rounded-xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-4">Equipment Registered</h2>
              <p className="text-blue-200 mb-8">
                {savedEquipment.name} has been successfully added to the system.
              </p>

              {/* Equipment Details */}
              <div className="bg-white/5 rounded-xl p-6 mb-8 text-left">
                <h3 className="text-white font-semibold mb-4">Equipment Details</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-blue-200">Name:</span>
                    <span className="text-white font-medium">{savedEquipment.name}</span>
                  </div>
                  {savedEquipment.brand && (
                    <div className="flex justify-between">
                      <span className="text-blue-200">Brand:</span>
                      <span className="text-white">{savedEquipment.brand}</span>
                    </div>
                  )}
                  {savedEquipment.model && (
                    <div className="flex justify-between">
                      <span className="text-blue-200">Model:</span>
                      <span className="text-white">{savedEquipment.model}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-blue-200">QR Code:</span>
                    <span className="text-white font-mono text-sm">{savedEquipment.qr_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-200">Status:</span>
                    <span className="text-green-400 font-medium">Available</span>
                  </div>
                </div>
              </div>

              {/* QR Code */}
              {qrImage && (
                <div className="bg-white p-6 rounded-xl mb-8 inline-block">
                  <h3 className="text-gray-800 font-semibold mb-4">QR Code</h3>
                  <img 
                    src={qrImage} 
                    alt={`QR Code for ${savedEquipment.name}`}
                    className="mx-auto"
                  />
                  <p className="text-gray-600 text-sm mt-4 font-mono">{savedEquipment.qr_code}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-4">
                <button
                  onClick={resetForm}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors"
                >
                  Add Another Equipment
                </button>
                <Link
                  href="/dashboard/tools/my-equipment"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-xl transition-colors text-center"
                >
                  View All Equipment
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-slate-800 to-gray-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard"
              className="p-3 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 text-white hover:bg-white/20 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-3xl font-bold text-white">Add New Equipment</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Error Display */}
          {error && (
            <div className="bg-red-500/20 backdrop-blur-xl rounded-2xl border border-red-500/30 p-6 mb-6">
              <div className="flex items-center space-x-3">
                <svg className="w-6 h-6 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-red-200 font-medium">Save Failed</p>
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              </div>
              <button
                onClick={() => setError(null)}
                className="mt-3 text-red-300 hover:text-red-200 text-sm"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Form */}
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-8">
            <h2 className="text-2xl font-bold text-white mb-8">Equipment Information</h2>

            <div className="space-y-6">
              {/* Equipment Name */}
              <div>
                <label className="block text-blue-200 font-medium mb-2">
                  Equipment Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleInputChange}
                  placeholder="Enter equipment name"
                  required
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>

              {/* Brand and Model */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-blue-200 font-medium mb-2">Brand</label>
                  <input
                    type="text"
                    name="brand"
                    value={form.brand}
                    onChange={handleInputChange}
                    placeholder="Enter brand"
                    className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-blue-200 font-medium mb-2">Model</label>
                  <input
                    type="text"
                    name="model"
                    value={form.model}
                    onChange={handleInputChange}
                    placeholder="Enter model"
                    className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Serial Number */}
              <div>
                <label className="block text-blue-200 font-medium mb-2">Serial Number</label>
                <input
                  type="text"
                  name="serial_number"
                  value={form.serial_number}
                  onChange={handleInputChange}
                  placeholder="Enter serial number"
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-blue-200 font-medium mb-2">Location</label>
                <input
                  type="text"
                  name="location"
                  value={form.location}
                  onChange={handleInputChange}
                  placeholder="Enter current location"
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-blue-200 font-medium mb-2">Notes</label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleInputChange}
                  placeholder="Add any additional notes or comments"
                  rows={4}
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="mt-8 flex space-x-4">
              <button
                onClick={saveEquipment}
                disabled={isLoading || !form.name.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Saving Equipment...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span>Add Equipment</span>
                  </>
                )}
              </button>

              <Link
                href="/dashboard"
                className="bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center justify-center"
              >
                Cancel
              </Link>
            </div>

            <p className="text-blue-300 text-sm mt-4 text-center">
              * Required fields. A QR code will be automatically generated for this equipment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}