'use client';

import { useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';

export default function AddEquipmentPage() {
  const [form, setForm] = useState({
    name: '',
    brand: '',
    model: '',
    serial_number: '',
    location: 'Shop', // Default location
    notes: '',
    assigned_to: '', // Empty by default - can assign later or now
    next_maintenance: '' // New field for maintenance schedule
  });

  const [showOtherAssignment, setShowOtherAssignment] = useState(false);
  const [otherAssignment, setOtherAssignment] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [savedEquipment, setSavedEquipment] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string>('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAssignmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'Other') {
      setShowOtherAssignment(true);
      setForm(prev => ({
        ...prev,
        assigned_to: otherAssignment || ''
      }));
    } else {
      setShowOtherAssignment(false);
      setOtherAssignment('');
      setForm(prev => ({
        ...prev,
        assigned_to: value
      }));
    }
  };

  const handleOtherAssignmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOtherAssignment(value);
    setForm(prev => ({
      ...prev,
      assigned_to: value
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

      // Simple validation - only name is required
      if (!form.name.trim()) {
        console.log('❌ Validation failed: name is required');
        setError('Equipment name is required');
        setIsLoading(false);
        return;
      }

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Generate a mock QR code based on equipment name
      const qrCodeValue = `EQUIP-${form.name.toUpperCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-6)}`;

      // Create equipment object with form data
      const equipmentData = {
        id: `temp-${Date.now()}`,
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        serial_number: form.serial_number.trim() || null,
        location: form.location.trim() || 'Shop',
        notes: form.notes.trim() || null,
        assigned_to: form.assigned_to.trim() || null,
        next_maintenance: form.next_maintenance || null,
        qr_code: qrCodeValue,
        status: 'available',
        created_at: new Date().toISOString()
      };

      console.log('✅ Equipment data prepared:', equipmentData);

      // Generate QR code image
      const qrImageData = await generateQRCode(qrCodeValue);
      setQrImage(qrImageData);

      setSavedEquipment(equipmentData);

      // Reset form
      setForm({
        name: '',
        brand: '',
        model: '',
        serial_number: '',
        location: 'Shop',
        notes: '',
        assigned_to: '',
        next_maintenance: ''
      });
      setShowOtherAssignment(false);
      setOtherAssignment('');

      console.log('🎉 Equipment saved successfully (UI only)');
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
      location: 'Shop',
      notes: '',
      assigned_to: '',
      next_maintenance: ''
    });
    setShowOtherAssignment(false);
    setOtherAssignment('');
  };

  if (savedEquipment) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50">
        {/* Animated Background Elements */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
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
                <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  Equipment Added Successfully
                </h1>
                <p className="text-gray-600 font-medium mt-1">New equipment registered in the system</p>
              </div>
            </div>
          </div>

          <div className="max-w-2xl mx-auto">
            {/* Success Card */}
            <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-8 shadow-lg text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-gray-800 mb-4">Equipment Registered</h2>
              <p className="text-gray-600 font-medium mb-8">
                {savedEquipment.name} has been successfully added to the system.
              </p>

              {/* Equipment Details */}
              <div className="bg-gray-50 rounded-xl p-6 mb-8 text-left border border-gray-200">
                <h3 className="text-gray-800 font-bold mb-4">Equipment Details</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-semibold">Name:</span>
                    <span className="text-gray-800 font-bold">{savedEquipment.name}</span>
                  </div>
                  {savedEquipment.brand && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-semibold">Brand:</span>
                      <span className="text-gray-800 font-medium">{savedEquipment.brand}</span>
                    </div>
                  )}
                  {savedEquipment.model && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-semibold">Model:</span>
                      <span className="text-gray-800 font-medium">{savedEquipment.model}</span>
                    </div>
                  )}
                  {savedEquipment.serial_number && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-semibold">Serial Number:</span>
                      <span className="text-gray-800 font-mono font-medium">{savedEquipment.serial_number}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-semibold">Location:</span>
                    <span className="text-gray-800 font-medium">{savedEquipment.location}</span>
                  </div>
                  {savedEquipment.assigned_to && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-semibold">Assigned To:</span>
                      <span className="text-gray-800 font-medium">{savedEquipment.assigned_to}</span>
                    </div>
                  )}
                  {savedEquipment.next_maintenance && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-semibold">Next Maintenance:</span>
                      <span className="text-gray-800 font-medium">{new Date(savedEquipment.next_maintenance).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-3 border-t border-gray-300">
                    <span className="text-gray-600 font-semibold">QR Code:</span>
                    <span className="text-gray-800 font-mono text-sm font-bold">{savedEquipment.qr_code}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-semibold">Status:</span>
                    <span className="text-green-700 bg-green-100 px-3 py-1 rounded-full text-sm font-bold border border-green-300">Available</span>
                  </div>
                </div>
              </div>

              {/* QR Code */}
              {qrImage && (
                <div className="bg-white p-6 rounded-xl mb-8 inline-block border-2 border-gray-200 shadow-md">
                  <h3 className="text-gray-800 font-bold mb-4">QR Code</h3>
                  <img
                    src={qrImage}
                    alt={`QR Code for ${savedEquipment.name}`}
                    className="mx-auto"
                  />
                  <p className="text-gray-600 text-sm mt-4 font-mono font-bold">{savedEquipment.qr_code}</p>
                  <p className="text-gray-500 text-xs mt-2">Print and attach to equipment</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-4">
                <button
                  onClick={resetForm}
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl min-h-[56px] flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span>Add Another Equipment</span>
                </button>
                <Link
                  href="/dashboard/tools/my-equipment"
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl text-center min-h-[56px] flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span>View All Equipment</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <style jsx>{`
          .delay-1000 {
            animation-delay: 1s;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
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
              <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 bg-clip-text text-transparent">
                Add New Equipment
              </h1>
              <p className="text-gray-600 font-medium mt-1">Register equipment and generate QR code</p>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Error Display */}
          {error && (
            <div className="bg-red-50 rounded-2xl border-2 border-red-200 p-6 mb-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-red-800 font-bold">Save Failed</p>
                    <p className="text-red-700 text-sm font-medium">{error}</p>
                  </div>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-red-600 hover:text-red-700 font-semibold text-sm"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Form */}
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-8 shadow-lg">
            <h2 className="text-2xl font-bold text-gray-800 mb-8">Equipment Information</h2>

            <div className="space-y-6">
              {/* Equipment Name */}
              <div>
                <label className="block text-gray-800 font-bold mb-2">
                  Equipment Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleInputChange}
                  placeholder="Enter equipment name"
                  required
                  className="w-full px-4 py-4 bg-white border-2 border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all shadow-sm min-h-[56px]"
                />
              </div>

              {/* Brand and Model */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-gray-800 font-bold mb-2">Brand</label>
                  <input
                    type="text"
                    name="brand"
                    value={form.brand}
                    onChange={handleInputChange}
                    placeholder="Enter brand"
                    className="w-full px-4 py-4 bg-white border-2 border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all shadow-sm min-h-[56px]"
                  />
                </div>

                <div>
                  <label className="block text-gray-800 font-bold mb-2">Model</label>
                  <input
                    type="text"
                    name="model"
                    value={form.model}
                    onChange={handleInputChange}
                    placeholder="Enter model"
                    className="w-full px-4 py-4 bg-white border-2 border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all shadow-sm min-h-[56px]"
                  />
                </div>
              </div>

              {/* Serial Number */}
              <div>
                <label className="block text-gray-800 font-bold mb-2">Serial Number</label>
                <input
                  type="text"
                  name="serial_number"
                  value={form.serial_number}
                  onChange={handleInputChange}
                  placeholder="Enter serial number"
                  className="w-full px-4 py-4 bg-white border-2 border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all shadow-sm min-h-[56px]"
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-gray-800 font-bold mb-2">Location</label>
                <input
                  type="text"
                  name="location"
                  value={form.location}
                  onChange={handleInputChange}
                  placeholder="Shop"
                  className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all shadow-sm min-h-[56px]"
                />
                <p className="text-gray-500 text-sm mt-2 font-medium">Default location is "Shop"</p>
              </div>

              {/* Assign To */}
              <div>
                <label className="block text-gray-800 font-bold mb-2">Assign To (Optional)</label>
                <select
                  name="assigned_to_select"
                  value={showOtherAssignment ? 'Other' : (form.assigned_to || '')}
                  onChange={handleAssignmentChange}
                  className="w-full px-4 py-4 bg-white border-2 border-gray-300 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all shadow-sm min-h-[56px]"
                >
                  <option value="">Assign Later</option>
                  <option value="Shop">Shop</option>
                  <option value="Rex Z">Rex Z</option>
                  <option value="Skinny H">Skinny H</option>
                  <option value="Brandon R">Brandon R</option>
                  <option value="Matt M">Matt M</option>
                  <option value="Other">Other</option>
                </select>
                {showOtherAssignment && (
                  <input
                    type="text"
                    value={otherAssignment}
                    onChange={handleOtherAssignmentChange}
                    placeholder="Enter custom assignment"
                    className="w-full px-4 py-4 bg-white border-2 border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all shadow-sm min-h-[56px] mt-3"
                  />
                )}
                <p className="text-gray-500 text-sm mt-2 font-medium">You can assign equipment now or later</p>
              </div>

              {/* Next Maintenance Schedule */}
              <div>
                <label className="block text-gray-800 font-bold mb-2">Next Maintenance/Inspection Date</label>
                <input
                  type="date"
                  name="next_maintenance"
                  value={form.next_maintenance}
                  onChange={handleInputChange}
                  className="w-full px-4 py-4 bg-white border-2 border-gray-300 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all shadow-sm min-h-[56px]"
                />
                <p className="text-gray-500 text-sm mt-2 font-medium">When should this equipment be inspected or maintained?</p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-gray-800 font-bold mb-2">Notes (Optional)</label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleInputChange}
                  placeholder="Add any additional notes or comments about this equipment..."
                  rows={4}
                  className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none shadow-sm"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="mt-8 flex space-x-4">
              <button
                onClick={saveEquipment}
                disabled={isLoading || !form.name.trim()}
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl min-h-[56px] flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Saving Equipment...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span>Add Equipment</span>
                  </>
                )}
              </button>

              <Link
                href="/dashboard/tools"
                className="px-8 py-4 bg-gray-100 hover:bg-gray-200 border-2 border-gray-300 text-gray-800 font-bold rounded-xl transition-all duration-300 hover:scale-105 shadow-md min-h-[56px] flex items-center justify-center"
              >
                Cancel
              </Link>
            </div>

            <p className="text-gray-600 text-sm mt-6 text-center font-medium">
              <span className="text-red-600 font-bold">*</span> Required fields. A QR code will be automatically generated for this equipment.
            </p>
          </div>

          {/* Info Section */}
          <div className="mt-8 bg-blue-50 rounded-2xl border-2 border-blue-300 p-6 shadow-lg">
            <div className="flex items-start space-x-3">
              <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-gray-800 font-bold mb-2">Equipment Management Tips</h4>
                <ul className="text-gray-700 text-sm font-medium space-y-1">
                  <li>• Each equipment gets a unique QR code for easy tracking</li>
                  <li>• Print and attach the QR code label to the equipment</li>
                  <li>• Location defaults to "Shop" - you can change this anytime</li>
                  <li>• Set maintenance schedules to get reminders for inspections</li>
                  <li>• Equipment can be assigned now or later from the equipment list</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .delay-1000 {
          animation-delay: 1s;
        }
      `}</style>
    </div>
  );
}