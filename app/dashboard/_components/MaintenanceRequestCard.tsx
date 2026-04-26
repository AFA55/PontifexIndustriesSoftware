'use client';

import { useRef, useState } from 'react';
import { Wrench, Camera, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export default function MaintenanceRequestCard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState('');
  const [equipmentNumber, setEquipmentNumber] = useState('');
  const [whatHappened, setWhatHappened] = useState('');
  const [whatsWrong, setWhatsWrong] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const isFormValid =
    photoFile !== null &&
    equipmentId.trim() !== '' &&
    whatHappened.trim() !== '' &&
    whatsWrong.trim() !== '';

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const uploadPhoto = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `maintenance/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('maintenance-photos').upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from('maintenance-photos').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async () => {
    if (!isFormValid || submitState === 'submitting') return;

    setSubmitState('submitting');
    setErrorMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired. Please log in again.');

      const photoUrl = await uploadPhoto(photoFile!);

      const response = await fetch('/api/operator/maintenance-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          equipment_id: equipmentId.trim(),
          equipment_number: equipmentNumber.trim() || null,
          photo_url: photoUrl,
          what_happened: whatHappened.trim(),
          whats_wrong: whatsWrong.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit request');
      }

      setSubmitState('success');
      // Reset form after short delay
      setTimeout(() => {
        setPhotoFile(null);
        setPhotoPreview(null);
        setEquipmentId('');
        setEquipmentNumber('');
        setWhatHappened('');
        setWhatsWrong('');
        setSubmitState('idle');
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';
      }, 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred';
      setErrorMessage(msg);
      setSubmitState('error');
      setTimeout(() => setSubmitState('idle'), 5000);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-xl border bg-white dark:bg-white/10 border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:focus:ring-orange-500 transition-all text-sm';
  const labelClass = 'block text-xs font-semibold text-gray-700 dark:text-white/70 mb-1.5 uppercase tracking-wide';

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-orange-50 dark:from-white/[0.05] dark:to-orange-900/10 p-1.5 shadow-2xl animate-fade-in-up">
      <div className="relative bg-white/95 dark:bg-white/[0.05] backdrop-blur-sm rounded-[22px] p-7">
        {/* Card Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-2xl flex items-center justify-center shadow-xl ring-4 ring-orange-100 dark:ring-orange-900/30 flex-shrink-0">
            <Wrench className="w-7 h-7 text-white drop-shadow-lg" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Maintenance Request</h3>
            <p className="text-sm text-gray-500 dark:text-white/50 font-medium">Report equipment issues to the team</p>
          </div>
        </div>

        {/* Success State */}
        {submitState === 'success' && (
          <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/40 rounded-2xl mb-4">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-green-800 dark:text-green-300">Request submitted!</p>
              <p className="text-sm text-green-700 dark:text-green-400">Our team will follow up shortly.</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {submitState === 'error' && (
          <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-2xl mb-4">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800 dark:text-red-300">Submission failed</p>
              <p className="text-sm text-red-700 dark:text-red-400">{errorMessage}</p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* Equipment Photo */}
          <div>
            <label className={labelClass}>
              Equipment Photo <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-32 rounded-2xl border-2 border-dashed border-orange-200 dark:border-orange-700/40 bg-orange-50/50 dark:bg-orange-900/10 hover:bg-orange-100/60 dark:hover:bg-orange-900/20 transition-all overflow-hidden focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Equipment preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
                    <Camera className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <span className="text-sm font-semibold text-orange-700 dark:text-orange-400">Take Photo</span>
                  <span className="text-xs text-gray-500 dark:text-white/40">Tap to open camera</span>
                </div>
              )}
            </button>
            {photoPreview && (
              <button
                type="button"
                onClick={() => {
                  setPhotoFile(null);
                  setPhotoPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="mt-1.5 text-xs text-red-500 dark:text-red-400 hover:underline"
              >
                Remove photo
              </button>
            )}
          </div>

          {/* Equipment ID */}
          <div>
            <label className={labelClass}>
              Equipment ID <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              type="text"
              value={equipmentId}
              onChange={e => setEquipmentId(e.target.value)}
              placeholder="e.g. Core Drill #3"
              className={inputClass}
            />
          </div>

          {/* Equipment Number */}
          <div>
            <label className={labelClass}>Equipment Number</label>
            <input
              type="text"
              value={equipmentNumber}
              onChange={e => setEquipmentNumber(e.target.value)}
              placeholder="e.g. CD-103 (optional)"
              className={inputClass}
            />
          </div>

          {/* What Happened */}
          <div>
            <label className={labelClass}>
              What Happened <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <textarea
              value={whatHappened}
              onChange={e => setWhatHappened(e.target.value)}
              placeholder="Describe what happened..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* What's Wrong */}
          <div>
            <label className={labelClass}>
              What&apos;s Wrong <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <textarea
              value={whatsWrong}
              onChange={e => setWhatsWrong(e.target.value)}
              placeholder="Describe the issue / symptoms..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isFormValid || submitState === 'submitting' || submitState === 'success'}
            className="w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 disabled:from-gray-300 disabled:via-gray-300 disabled:to-gray-300 dark:disabled:from-white/10 dark:disabled:via-white/10 dark:disabled:to-white/10 text-white disabled:text-gray-400 dark:disabled:text-white/30 font-bold rounded-2xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none"
          >
            {submitState === 'submitting' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Submitting...</span>
              </>
            ) : submitState === 'success' ? (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>Submitted!</span>
              </>
            ) : (
              <>
                <Wrench className="w-5 h-5" />
                <span>Submit Request</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
