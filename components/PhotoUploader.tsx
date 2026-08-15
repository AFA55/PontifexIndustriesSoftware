'use client';

import { useState, useRef, useEffect } from 'react';
import { Camera, X, Loader2, ImageIcon, MapPin, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toDisplayUrls, needsSigning } from '@/lib/storage-url';

/**
 * Resolve stored photo URLs to display URLs (re-signs private-bucket URLs,
 * security F1). Private-bucket entries start blank so a private `/public/` URL
 * never flashes as a broken image; public/other URLs render immediately.
 */
function useSignedPhotos(urls: string[]): string[] {
  const [resolved, setResolved] = useState<string[]>(() =>
    urls.map((u) => (needsSigning(u) ? '' : u))
  );
  const key = JSON.stringify(urls);
  useEffect(() => {
    let alive = true;
    toDisplayUrls(urls).then((r) => { if (alive) setResolved(r); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return resolved;
}

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

/**
 * Get the current device position; null when denied/unavailable.
 *
 * WHY THIS IS FAST AND FORGIVING (founder, Aug 3 2026): an operator standing on
 * a jobsite hit "took forever and never loaded" and then couldn't submit. The
 * cause was here — a single high-accuracy fix with a 12s timeout. Inside a
 * structure or against concrete, high-accuracy GPS routinely burns the whole
 * 12 seconds and STILL fails, and the old caller then aborted the upload
 * outright. Now: ask for a coarse cached fix first (near-instant when the phone
 * already has one), only then try for a sharper one, and cap the whole thing at
 * a few seconds. A missing position is never fatal — see the caller.
 */
function getPosition(): Promise<GeolocationPosition | null> {
  const attempt = (opts: PositionOptions) =>
    new Promise<GeolocationPosition | null>((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
      let settled = false;
      const done = (p: GeolocationPosition | null) => {
        if (settled) return;
        settled = true;
        resolve(p);
      };
      // Belt and braces: some mobile browsers ignore `timeout` when permission
      // was granted but no fix is obtainable, and the callback never fires.
      const guard = setTimeout(() => done(null), (opts.timeout ?? 5_000) + 500);
      navigator.geolocation.getCurrentPosition(
        (pos) => { clearTimeout(guard); done(pos); },
        () => { clearTimeout(guard); done(null); },
        opts
      );
    });

  return (async () => {
    // 1) Coarse + happily stale: usually returns immediately.
    const quick = await attempt({ enableHighAccuracy: false, timeout: 3_000, maximumAge: 120_000 });
    if (quick) return quick;
    // 2) One short sharper try, then give up rather than hold the photo hostage.
    return attempt({ enableHighAccuracy: true, timeout: 4_000, maximumAge: 60_000 });
  })();
}

/** Reject a hung request instead of spinning forever on flaky site LTE. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    ),
  ]);
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
  /** What's happening right now — a bare spinner reads as "frozen" in the field. */
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [lastStamp, setLastStamp] = useState<{ lat: number; lng: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Display URLs (signed for private buckets). The `photos` prop stays the
  // source of truth for onPhotosChange — we only re-sign for rendering.
  const displayPhotos = useSignedPhotos(photos);

  // Downscale a phone photo before upload — a raw camera image is 3–8MB and
  // slow to upload in the field; ~1800px JPEG @0.82 is a few hundred KB and
  // looks identical on screen. Non-images (PDFs) pass through untouched.
  // `imageOrientation: 'from-image'` also bakes in EXIF rotation so photos
  // aren't sideways.
  // 1400px @0.7 instead of 1800 @0.82: roughly HALVES the bytes an operator has
  // to push over site LTE, and a jobsite photo viewed on a phone or printed on a
  // ticket is indistinguishable. Upload time is the whole complaint here.
  const compressImageFile = async (
    file: File,
    maxEdge = 1400,
    quality = 0.7,
  ): Promise<{ blob: Blob; ext: string; contentType: string }> => {
    const origExt = file.name.split('.').pop() || 'jpg';
    // Treat as an image by MIME OR extension — iPhone photos sometimes arrive
    // with an empty/absent MIME type, and we still want to decode+convert them
    // (esp. HEIC) to a JPEG the storage bucket accepts.
    const looksImage =
      file.type.startsWith('image/') ||
      /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name);
    if (!looksImage) {
      return { blob: file, ext: origExt, contentType: file.type };
    }
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { blob: file, ext: origExt, contentType: file.type };
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close?.();
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
      // Keep the original if compression failed or somehow grew the file.
      if (!blob || blob.size >= file.size) return { blob: file, ext: origExt, contentType: file.type };
      return { blob, ext: 'jpg', contentType: 'image/jpeg' };
    } catch {
      return { blob: file, ext: origExt, contentType: file.type };
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setError('');

    const files = Array.from(e.target.files);
    const remaining = maxPhotos - photos.length;
    if (files.length > remaining) {
      setError(`Max ${maxPhotos} photos. You can add ${remaining} more.`);
      return;
    }

    // GPS stamp is BEST-EFFORT and must never hold the photo hostage.
    // This used to abort the upload when no fix arrived, which is exactly what
    // stranded an operator on site: 12s of waiting, then "Location is required",
    // then no photo and no way to submit. The stamp is nice-to-have evidence;
    // the photo is the thing that matters.
    let position: GeolocationPosition | null = null;
    if (captureLocation) {
      setUploading(true);
      setProgress('Getting location…');
      position = await getPosition();
      if (position) {
        setLastStamp({ lat: position.coords.latitude, lng: position.coords.longitude });
      }
    }

    setUploading(true);
    const newUrls: string[] = [];

    try {
      let index = 0;
      for (const file of files) {
        index += 1;
        const label = files.length > 1 ? `photo ${index} of ${files.length}` : 'photo';
        setProgress(`Preparing ${label}…`);
        // Accept by MIME OR extension (iPhone files can have an empty MIME type).
        const isImage =
          file.type.startsWith('image/') ||
          /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name);
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (!isImage && !isPdf) {
          setError('Only photos and PDFs can be uploaded.');
          continue;
        }

        // Downscale images before upload (big speedup in the field); PDFs pass through.
        const { blob, ext, contentType } = await compressImageFile(file);

        // Size check runs AFTER compression — a 12MB camera photo shrinks to a
        // few hundred KB, so checking the original wrongly rejected good photos.
        if (blob.size > 10 * 1024 * 1024) {
          setError('This file is too large (over 10MB even after shrinking). Try a smaller photo or a PDF.');
          continue;
        }

        // A photo that couldn't be converted to an uploadable format (e.g. an
        // iPhone HEIC that this device/browser can't decode) would be rejected
        // by storage with a cryptic error — tell the user plainly instead.
        const uploadableImage = /^image\/(jpeg|png|webp|gif)$/.test(contentType);
        if (isImage && !isPdf && !uploadableImage) {
          setError("This looks like an iPhone HEIC photo that couldn't be converted here. Upload it from your phone, or save it as a JPEG first.");
          continue;
        }

        const fileName = `${pathPrefix}-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const filePath = `${pathPrefix}/${fileName}`;

        setProgress(`Uploading ${label} (${Math.max(1, Math.round(blob.size / 1024))} KB)…`);

        // Hard cap the request. On weak site LTE the storage call can hang with
        // no error and no completion — which reads to the operator as "it never
        // loaded" while the spinner turns forever.
        let uploadError: { message?: string } | null = null;
        try {
          const res = await withTimeout(
            supabase.storage.from(bucket).upload(filePath, blob, { contentType }),
            45_000,
            'Upload'
          );
          uploadError = res.error;
        } catch (timeoutErr: unknown) {
          uploadError = {
            message:
              'the connection is too slow right now. Your work is still saved — you can add photos later.',
          };
          console.error('Upload timed out:', timeoutErr);
        }

        if (uploadError) {
          console.error('Upload error details:', {
            message: uploadError.message,
            bucket,
            filePath,
            fileType: file.type,
            fileSize: file.size,
          });
          setError(`Photo didn't upload — ${uploadError.message || 'please try again.'}`);
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
      setProgress('');
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
              {/* A PDF in an <img> draws nothing, so the office saw an empty
                  tile immediately after a successful upload and could not tell
                  whether the file had attached. Documents get a labelled tile
                  in the picker too, not just in the viewer. */}
              {attachmentKind(url) !== 'image' ? (
                <a
                  href={displayPhotos[i] || url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={attachmentName(url)}
                  className="flex h-full w-full flex-col items-center justify-center gap-0.5"
                >
                  <FileText className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} text-rose-500`} />
                  <span className={`text-[8px] font-bold uppercase tracking-wide ${lightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                    {attachmentKind(url) === 'pdf' ? 'PDF' : 'File'}
                  </span>
                </a>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                displayPhotos[i] && (
                  <img
                    src={displayPhotos[i]}
                    alt={`Upload ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                )
              )}
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
          {/* NO `capture` attribute — deliberately. It used to be set whenever
              captureLocation was on, which forces the device camera and removes
              "Photo Library" from the iOS/Android sheet entirely. The founder
              asked (Aug 2026) that operators and supervisors be able to EITHER
              take a photo OR pick an existing one — e.g. to replace a bad shot
              taken minutes earlier. The GPS stamp is unaffected: getPosition()
              already runs best-effort and never blocks the upload, so a picked
              photo still records where it was submitted from. */}
          <input
            ref={fileInputRef}
            type="file"
            // GPS-stamp mode: images only + force the CAMERA on mobile so
            // photos are taken on the spot (no gallery uploads).
            accept={captureLocation ? 'image/*' : 'image/*,application/pdf'}
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
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                <span className="truncate">{progress || 'Uploading…'}</span>
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

      {/* Error message — prominent so it isn't missed on a phone in the field */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 font-medium leading-snug">{error}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Read-only photo viewer (for operator job detail pages)
 */
/**
 * Is this attachment a DOCUMENT rather than an image?
 *
 * THE BUG (founder, Aug 15): "I added a photo in PDF form to Javi's ticket and
 * I couldn't see it." The upload worked — the URL is on the job — but every
 * attachment was rendered inside an <img>, and a PDF in an img tag draws
 * nothing. The operator got a blank grey square where his site drawing should
 * be, with no way to know a file was even there.
 *
 * Extension is read from the PATH ONLY: signed Supabase URLs carry a `?token=`
 * query string, so matching against the whole URL misses.
 */
const DOC_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.heic'];
function attachmentKind(url: string): 'image' | 'pdf' | 'file' {
  let path = url;
  try {
    path = new URL(url, 'https://x.invalid').pathname;
  } catch {
    path = url.split('?')[0];
  }
  const lower = path.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  return DOC_EXTENSIONS.some((e) => lower.endsWith(e)) ? 'file' : 'image';
}

/** The file's own name, for the tile label — better than "Document 2". */
function attachmentName(url: string): string {
  try {
    const last = new URL(url, 'https://x.invalid').pathname.split('/').pop() || '';
    return decodeURIComponent(last) || 'Attachment';
  } catch {
    return 'Attachment';
  }
}

export function PhotoViewer({ photos, label = 'Photos' }: { photos: string[]; label?: string }) {
  const displayPhotos = useSignedPhotos(photos ?? []);
  if (!photos || photos.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-blue-500" />
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {photos.map((url, i) => {
          const href = displayPhotos[i] || url;
          const kind = attachmentKind(url);

          // A document gets a tile that says what it is and opens on tap. An
          // <img> here is why these were invisible.
          if (kind !== 'image') {
            return (
              <a
                key={i}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={attachmentName(url)}
                className="flex w-24 h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-slate-200 bg-slate-50 p-1.5 text-center transition-colors hover:border-blue-400 dark:border-white/15 dark:bg-white/[0.03] dark:hover:border-blue-400"
              >
                <FileText className="h-7 w-7 text-rose-500" />
                <span className="text-[9px] font-bold uppercase tracking-wide text-slate-600 dark:text-white/70">
                  {kind === 'pdf' ? 'PDF' : 'File'}
                </span>
                <span className="line-clamp-1 w-full text-[8px] text-slate-400 dark:text-white/45">
                  Tap to open
                </span>
              </a>
            );
          }

          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-24 h-24 rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50 hover:border-blue-400 transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {displayPhotos[i] && (
                <img
                  src={displayPhotos[i]}
                  alt={`${label} ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
