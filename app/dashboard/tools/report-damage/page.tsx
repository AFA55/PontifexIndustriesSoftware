'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { AlertTriangle, Camera, Upload, X, CheckCircle } from 'lucide-react';

interface Equipment {
  id: string;
  name: string;
  brand: string;
  model: string;
  serial_number: string;
}

export default function ReportDamagePage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    equipmentId: '',
    damageTitle: '',
    damageDescription: '',
    severity: 'moderate',
    incidentType: '',
    incidentDescription: '',
    locationOfIncident: '',
    dateOfIncident: new Date().toISOString().split('T')[0],
    equipmentOperable: false,
    safetyConcern: false
  });

  useEffect(() => {
    fetchMyEquipment();
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

    setUploading(true);
    const uploadedUrls: string[] = [];

    try {
      for (const file of photoFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `damage-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `damage-reports/${fileName}`;

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
    } finally {
      setUploading(false);
    }

    return uploadedUrls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Upload photos first
      const photoUrls = await uploadPhotos();

      // Submit damage report
      const response = await fetch('/api/equipment/damage-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipmentId: formData.equipmentId,
          damageTitle: formData.damageTitle,
          damageDescription: formData.damageDescription,
          severity: formData.severity,
          incidentType: formData.incidentType,
          incidentDescription: formData.incidentDescription,
          locationOfIncident: formData.locationOfIncident,
          dateOfIncident: formData.dateOfIncident,
          photoUrls,
          equipmentOperable: formData.equipmentOperable,
          safetyConcern: formData.safetyConcern
        })
      });

      if (response.ok) {
        setSubmitted(true);
        // Reset form
        setFormData({
          equipmentId: '',
          damageTitle: '',
          damageDescription: '',
          severity: 'moderate',
          incidentType: '',
          incidentDescription: '',
          locationOfIncident: '',
          dateOfIncident: new Date().toISOString().split('T')[0],
          equipmentOperable: false,
          safetyConcern: false
        });
        setPhotoFiles([]);
      } else {
        const data = await response.json();
        alert(`Error submitting report: ${data.error}`);
      }
    } catch (error) {
      console.error('Error submitting damage report:', error);
      alert('Error submitting damage report');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6 flex items-center justify-center">
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-12 text-center max-w-md shadow-xl">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Report Submitted</h2>
          <p className="text-gray-600 mb-8">
            Your damage report has been submitted successfully. An admin will review it shortly.
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-medium hover:shadow-lg transition-all"
          >
            Submit Another Report
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg">
              <AlertTriangle className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
                Report Damaged Equipment
              </h1>
              <p className="text-gray-600">Document equipment damage for admin review</p>
            </div>
          </div>
        </div>

        {/* Form */}
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
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select equipment</option>
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.brand} {eq.model} - {eq.name}
                </option>
              ))}
            </select>
          </div>

          {/* Damage Title */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-900 mb-2">
              Damage Title <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={formData.damageTitle}
              onChange={(e) => setFormData({ ...formData, damageTitle: e.target.value })}
              placeholder="e.g., Cracked blade housing"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Damage Description */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-900 mb-2">
              Detailed Description <span className="text-red-600">*</span>
            </label>
            <textarea
              value={formData.damageDescription}
              onChange={(e) => setFormData({ ...formData, damageDescription: e.target.value })}
              placeholder="Describe what happened and the extent of the damage..."
              required
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Severity */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-900 mb-2">Severity</label>
            <select
              value={formData.severity}
              onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="minor">Minor (cosmetic only)</option>
              <option value="moderate">Moderate (affects performance)</option>
              <option value="severe">Severe (unsafe/inoperable)</option>
              <option value="total_loss">Total Loss (beyond repair)</option>
            </select>
          </div>

          {/* Incident Type */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-900 mb-2">How did it happen?</label>
            <select
              value={formData.incidentType}
              onChange={(e) => setFormData({ ...formData, incidentType: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select incident type</option>
              <option value="normal_wear">Normal wear and tear</option>
              <option value="operator_error">Operator error</option>
              <option value="accident">Accident</option>
              <option value="manufacturing_defect">Manufacturing defect</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>

          {/* Incident Description */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-900 mb-2">
              Incident Details
            </label>
            <textarea
              value={formData.incidentDescription}
              onChange={(e) => setFormData({ ...formData, incidentDescription: e.target.value })}
              placeholder="Explain how the damage occurred..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Location and Date */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2">Location</label>
              <input
                type="text"
                value={formData.locationOfIncident}
                onChange={(e) => setFormData({ ...formData, locationOfIncident: e.target.value })}
                placeholder="Where did this happen?"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2">Date</label>
              <input
                type="date"
                value={formData.dateOfIncident}
                onChange={(e) => setFormData({ ...formData, dateOfIncident: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Photo Upload */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-900 mb-2">
              Damage Photos
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
                Upload photos showing the damage
              </p>
            </div>

            {/* Photo Previews */}
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

          {/* Equipment Status Checkboxes */}
          <div className="mb-8 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.equipmentOperable}
                onChange={(e) => setFormData({ ...formData, equipmentOperable: e.target.checked })}
                className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-900">
                Equipment is still operable despite damage
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.safetyConcern}
                onChange={(e) => setFormData({ ...formData, safetyConcern: e.target.checked })}
                className="w-5 h-5 text-red-600 rounded focus:ring-2 focus:ring-red-500"
              />
              <span className="text-sm font-medium text-gray-900">
                This damage poses a safety hazard
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || uploading}
            className="w-full py-4 bg-gradient-to-r from-red-500 to-red-600 text-white font-bold rounded-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading || uploading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                {uploading ? 'Uploading Photos...' : 'Submitting Report...'}
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Submit Damage Report
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
