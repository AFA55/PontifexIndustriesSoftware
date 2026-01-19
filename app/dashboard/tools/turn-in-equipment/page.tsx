'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Wrench, Camera, X, CheckCircle, Clock } from 'lucide-react';

interface Equipment {
  id: string;
  name: string;
  brand: string;
  model: string;
  serial_number: string;
}

interface TurnInRequest {
  id: string;
  equipment_id: string;
  reason: string;
  description: string;
  urgency: string;
  status: string;
  created_at: string;
  equipment: {
    name: string;
    brand: string;
    model: string;
  };
}

export default function TurnInEquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [requests, setRequests] = useState<TurnInRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [showForm, setShowForm] = useState(true);

  const [formData, setFormData] = useState({
    equipmentId: '',
    reason: 'scheduled_maintenance',
    description: '',
    urgency: 'normal'
  });

  useEffect(() => {
    fetchMyEquipment();
    fetchMyRequests();
  }, []);

  const fetchMyEquipment = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('equipment')
        .select('id, name, brand, model, serial_number')
        .eq('assigned_to', user.id);

      if (error) {
        console.error('Error fetching equipment:', error);
      } else {
        setEquipment(data || []);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const fetchMyRequests = async () => {
    try {
      const response = await fetch('/api/equipment/turn-in-request');
      const data = await response.json();

      if (response.ok) {
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setPhotoFiles([...photoFiles, ...newFiles]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotoFiles(photoFiles.filter((_, i) => i !== index));
  };

  const uploadPhotos = async (): Promise<string[]> => {
    if (photoFiles.length === 0) return [];

    const uploadedUrls: string[] = [];

    try {
      for (const file of photoFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `turn-in-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `turn-in-requests/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('equipment-photos')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }

        const { data } = supabase.storage
          .from('equipment-photos')
          .getPublicUrl(filePath);

        if (data?.publicUrl) {
          uploadedUrls.push(data.publicUrl);
        }
      }
    } catch (error) {
      console.error('Error uploading photos:', error);
    }

    return uploadedUrls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const photoUrls = await uploadPhotos();

      const response = await fetch('/api/equipment/turn-in-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipmentId: formData.equipmentId,
          reason: formData.reason,
          description: formData.description,
          urgency: formData.urgency,
          photoUrls
        })
      });

      if (response.ok) {
        setSubmitted(true);
        setFormData({
          equipmentId: '',
          reason: 'scheduled_maintenance',
          description: '',
          urgency: 'normal'
        });
        setPhotoFiles([]);
        fetchMyRequests(); // Refresh request list
        setTimeout(() => {
          setSubmitted(false);
          setShowForm(false);
        }, 2000);
      } else {
        const data = await response.json();
        alert(`Error submitting request: ${data.error}`);
      }
    } catch (error) {
      console.error('Error submitting turn-in request:', error);
      alert('Error submitting request');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'approved':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'in_service':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return 'text-red-600';
      case 'high':
        return 'text-orange-600';
      case 'normal':
        return 'text-blue-600';
      case 'low':
        return 'text-gray-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
              <Wrench className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Turn In Equipment
              </h1>
              <p className="text-gray-600">Request equipment service or maintenance</p>
            </div>
          </div>
        </div>

        {/* Toggle Buttons */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setShowForm(true)}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              showForm
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg'
                : 'bg-white/60 text-gray-700 hover:bg-white'
            }`}
          >
            New Request
          </button>
          <button
            onClick={() => setShowForm(false)}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              !showForm
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg'
                : 'bg-white/60 text-gray-700 hover:bg-white'
            }`}
          >
            My Requests ({requests.length})
          </button>
        </div>

        {/* Success Message */}
        {submitted && (
          <div className="bg-green-100 border border-green-300 rounded-lg p-4 mb-6 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <div>
              <div className="font-bold text-green-900">Request Submitted</div>
              <div className="text-sm text-green-700">
                Your turn-in request has been submitted to admin for review.
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        {showForm ? (
          <form onSubmit={handleSubmit} className="bg-white/60 backdrop-blur-sm border border-gray-200 rounded-xl p-8 shadow-lg">
            {/* Equipment Selection */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-900 mb-2">
                Equipment <span className="text-red-600">*</span>
              </label>
              <select
                value={formData.equipmentId}
                onChange={(e) => setFormData({ ...formData, equipmentId: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select equipment to turn in</option>
                {equipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.brand} {eq.model} - {eq.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Reason */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-900 mb-2">
                Reason <span className="text-red-600">*</span>
              </label>
              <select
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="scheduled_maintenance">Scheduled Maintenance</option>
                <option value="damaged">Damaged - Needs Repair</option>
                <option value="not_working_properly">Not Working Properly</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Description */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-900 mb-2">
                Description <span className="text-red-600">*</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Explain why equipment needs to be turned in..."
                required
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Urgency */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-900 mb-2">Urgency</label>
              <select
                value={formData.urgency}
                onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="low">Low - Can wait a few weeks</option>
                <option value="normal">Normal - Within a week</option>
                <option value="high">High - Within a few days</option>
                <option value="critical">Critical - ASAP</option>
              </select>
            </div>

            {/* Photo Upload */}
            <div className="mb-8">
              <label className="block text-sm font-bold text-gray-900 mb-2">
                Photos (Optional)
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoChange}
                  className="hidden"
                  id="photo-upload"
                />
                <label
                  htmlFor="photo-upload"
                  className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all"
                >
                  <Camera className="w-5 h-5" />
                  Add Photos
                </label>
                <p className="text-sm text-gray-600 mt-2">
                  Upload photos if relevant (e.g., damage, issues)
                </p>
              </div>

              {photoFiles.length > 0 && (
                <div className="grid grid-cols-3 gap-4 mt-4">
                  {photoFiles.map((file, index) => (
                    <div key={index} className="relative">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        className="absolute -top-2 -right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold rounded-lg hover:shadow-xl transition-all disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Submit Turn-In Request'}
            </button>
          </form>
        ) : (
          /* Requests List */
          <div className="space-y-4">
            {requests.length === 0 ? (
              <div className="bg-white/60 backdrop-blur-sm border border-gray-200 rounded-xl p-12 text-center">
                <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">No Requests</h3>
                <p className="text-gray-600">You haven't submitted any turn-in requests yet.</p>
              </div>
            ) : (
              requests.map((request) => (
                <div
                  key={request.id}
                  className="bg-white/60 backdrop-blur-sm border border-gray-200 rounded-xl p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">
                        {request.equipment.brand} {request.equipment.model}
                      </h3>
                      <p className="text-sm text-gray-600">{request.equipment.name}</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(
                        request.status
                      )}`}
                    >
                      {request.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  <div className="mb-3">
                    <div className="text-sm font-medium text-gray-700 mb-1">Reason:</div>
                    <div className="text-sm text-gray-900">
                      {request.reason.replace('_', ' ')}
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="text-sm font-medium text-gray-700 mb-1">Description:</div>
                    <div className="text-sm text-gray-900">{request.description}</div>
                  </div>

                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span className={`font-medium ${getUrgencyColor(request.urgency)}`}>
                      Urgency: {request.urgency.toUpperCase()}
                    </span>
                    <span>{new Date(request.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
