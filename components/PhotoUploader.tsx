'use client';

import { useState, useRef } from 'react';
import { Camera, X, Loader2, ImageIcon, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface PhotoUploaderProps {
  bucket: string;
  pathPrefix: string;
  photos: string[];
  onPhotosChange: (urls: string[]) => void;
  maxPhotos?: number;
  label?: string;
  compact?: boolean;
  lightMode?: boolean;
  /**
   * GPS-stamp mode (founder ask Jul 8): photos must be taken ON THE SPOT.
   * - Forces the device CAMERA on mobile (no gallery picking) via capture attr.
   * - Requires location permission: the device position is captured BEFORE the
   *   upload starts and recorded against each uploaded photo URL
   *   (photo_locations table via /api/photo-locations). Upload is BLOCKED if
   *   location is unavailable/denied — the stamp is the point.
   */
  captureLocation?: boolean;
  /** Job to associate the GPS stamps with (work-performed flow). */
  jobId?: string;
}

/** Get the current device position; null when denied/unavailable. */
function getPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 }
    );
  });
}

/**
 * Reusable photo/file upload component.
 * Uploads to Supabase Storage and returns public URLs.
 */
export default function PhotoUploader({
  bucket,
  pathPrefix,
  photos,
  onPhotosChange,
  maxPhotos = 10,
  label = 'Add Photos',
  compact = false,
  lightMode = false,
  captureLocation = false,
  jobId,
}: PhotoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [lastStamp, setLastStamp] = useState<{ lat: number; lng: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setError('');

    const files = Array.from(e.target.files);
    const remaining = maxPhotos - photos.length;
    if (files.length > remaining) {
      setError(`Max ${maxPhotos} photos. You can add ${remaining} more.`);
      return;
    }

    // GPS-stamp mode: grab the position FIRST — no location, no upload.
    let position: GeolocationPosition | null = null;
    if (captureLocation) {
      setUploading(true);
      position = await getPosition();
      if (!position) {
        setUploading(false);
        setError('Location is required for jobsite photos. Enable location access and try again.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setLastStamp({ lat: position.coords.latitude, lng: position.coords.longitude });
    }

    setUploading(true);
    const newUrls: string[] = [];

    try {
      for (const file of files) {
        // Validate file type
        if (!file.type.startsWith('image/') && !file.type.startsWith('application/pdf')) {
          setError('Only images and PDFs are supported');
          continue;
        }

        // Validate file size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
          setError('Files must be under 10MB');
          continue;
        }

        const fileExt = file.name.split('.').pop() || 'jpg';
        const fileName = `${pathPrefix}-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${pathPrefix}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error details:', {
            message: uploadError.message,
            bucket,
            filePath,
            fileType: file.type,
            fileSize: file.size,
          });
          setError(`Upload failed: ${uploadError.message || 'Please try again.'}`);
          continue;
        }

        const { data } = supabase.storage
          .from(bucket)
          .getPublicUrl(filePath);

        if (data?.publicUrl) {
          newUrls.push(data.publicUrl);
        }
      }

      if (newUrls.length > 0) {
        onPhotosChange([...photos, ...newUrls]);

        // Record the GPS stamp for each uploaded photo. Best-effort: a failed
        // stamp write never removes the photo, but we surface a soft warning.
        if (captureLocation && position) {
          const { latitude, longitude, accuracy } = position.coords;
          supabase.auth.getSession().then(({ data }) => {
            const token = data.session?.access_token;
            if (!token) return;
            for (const url of newUrls) {
              fetch('/api/photo-locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  photo_url: url,
                  lat: latitude,
                  lng: longitude,
                  accuracy_m: accuracy ?? null,
                  job_id: jobId ?? null,
                }),
              }).catch(() => console.warn('[PhotoUploader] GPS stamp write failed for', url));
            }
          });
        }
      }
    } catch (err) {
      console.error('Photo upload error:', err);
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhoto = (index: number) => {
    const updated = photos.filter((_, i) => i !== index);
    onPhotosChange(updated);
  };

  return (
    <div className="space-y-3">
      {/* Thumbnail previews */}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((url, i) => (
            <div key={i} className={`relative group ${compact ? 'w-16 h-16' : 'w-20 h-20'} rounded-xl overflow-hidden border-2 ${lightMode ? 'border-slate-200 bg-slate-50' : 'border-slate-600 bg-slate-900'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Upload ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {photos.length < maxPhotos && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            // GPS-stamp mode: images only + force the CAMERA on mobile so
            // photos are taken on the spot (no gallery uploads).
            accept={captureLocation ? 'image/*' : 'image/*,application/pdf'}
            {...(captureLocation ? { capture: 'environment' as const } : {})}
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all ${
              compact
                ? lightMode
                  ? 'text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
                  : 'text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600'
                : lightMode
                  ? 'text-sm bg-white text-slate-600 hover:bg-slate-50 border-2 border-dashed border-slate-300 hover:border-slate-400'
                  : 'text-sm bg-slate-800 text-slate-300 hover:bg-slate-700 border-2 border-dashed border-slate-600 hover:border-slate-500'
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                {label}
                {photos.length > 0 && (
                  <span className="text-slate-500 text-xs">({photos.length}/{maxPhotos})</span>
                )}
              </>
            )}
          </button>
        </div>
      )}

      {/* GPS stamp confirmation — the demo-visible proof photos are on-the-spot */}
      {captureLocation && lastStamp && !error && (
        <p className={`flex items-center gap-1 text-xs font-medium ${lightMode ? 'text-emerald-600' : 'text-emerald-400'}`}>
          <MapPin className="w-3.5 h-3.5" />
          GPS-stamped: {lastStamp.lat.toFixed(5)}, {lastStamp.lng.toFixed(5)}
        </p>
      )}

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-400 font-medium">{error}</p>
      )}
    </div>
  );
}

/**
 * Read-only photo viewer (for operator job detail pages)
 */
export function PhotoViewer({ photos, label = 'Photos' }: { photos: string[]; label?: string }) {
  if (!photos || photos.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-blue-500" />
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {photos.map((url, i) => (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-24 h-24 rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50 hover:border-blue-400 transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`${label} ${i + 1}`}
              className="w-full h-full object-cover"
            />
          </a>
        ))}
      </div>
    </div>
  );
}
