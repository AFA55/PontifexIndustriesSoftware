'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Smartphone,
  QrCode,
  Search,
  Wrench,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Camera,
  X,
  Clock,
  User,
  Hash,
  Loader2,
  Wifi,
  WifiOff,
  ArrowLeft,
  Shield,
  Package,
  CircleDot,
  Upload,
} from 'lucide-react';
import { getCurrentUser, type User as AuthUser } from '@/lib/auth';
import { apiFetch } from '@/lib/api-client';

// ============================================================
// Types
// ============================================================

interface EquipmentUnit {
  id: string;
  pontifex_id: string;
  name: string;
  category: string;
  equipment_type: string | null;
  manufacturer: string | null;
  model_number: string | null;
  manufacturer_serial: string | null;
  size: string | null;
  lifecycle_status: string;
  purchase_price: number | null;
  estimated_life_linear_feet: number | null;
  linear_feet_used: number;
  cost_per_foot: number | null;
  nfc_tag_id: string | null;
  notes: string | null;
}

interface UnitAssignment {
  operator_name: string;
  assigned_since: string;
}

interface UnitEvent {
  id: string;
  event_type: string;
  description: string | null;
  performed_by_name: string | null;
  created_at: string;
  metadata: any;
}

type ScanState = 'idle' | 'scanning' | 'loading' | 'found' | 'not_found' | 'maintenance_form';

// ============================================================
// Status Helpers
// ============================================================

const statusConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  available: { label: 'Available', color: 'text-teal-700', bgColor: 'bg-teal-50', borderColor: 'border-teal-200' },
  new: { label: 'New', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  active: { label: 'Active', color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
  in_use: { label: 'In Use', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  needs_service: { label: 'Needs Service', color: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' },
  in_maintenance: { label: 'In Maintenance', color: 'text-yellow-700', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
  damaged: { label: 'Damaged', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
  retired: { label: 'Retired', color: 'text-gray-700', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' },
};

const eventTypeColors: Record<string, string> = {
  maintenance_requested: 'border-l-orange-500',
  maintenance_completed: 'border-l-green-500',
  damage_reported: 'border-l-red-500',
  assigned: 'border-l-blue-500',
  unassigned: 'border-l-gray-400',
  usage_logged: 'border-l-indigo-500',
  status_changed: 'border-l-purple-500',
  created: 'border-l-cyan-500',
};

function getStatusBadge(status: string) {
  const config = statusConfig[status] || statusConfig.active;
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${config.bgColor} ${config.color} ${config.borderColor}`}>
      <CircleDot className="w-3 h-3 mr-1.5" />
      {config.label}
    </span>
  );
}

// ============================================================
// NFC Scan Page Component
// ============================================================

function NfcScanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<AuthUser | null>(null);

  // Scan state
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');

  // Equipment data
  const [unit, setUnit] = useState<EquipmentUnit | null>(null);
  const [assignment, setAssignment] = useState<UnitAssignment | null>(null);
  const [events, setEvents] = useState<UnitEvent[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Maintenance form state
  const [maintenanceForm, setMaintenanceForm] = useState({
    title: '',
    description: '',
    urgency: 'normal' as 'low' | 'normal' | 'high' | 'critical',
  });
  const [maintenancePhotos, setMaintenancePhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // NFC reader ref
  const nfcReaderRef = useRef<any>(null);

  // Track if we've already auto-loaded from URL params
  const autoLoadedRef = useRef(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
    if (!currentUser) {
      router.push('/login');
      return;
    }
    // Check NFC support
    if (typeof window !== 'undefined' && 'NDEFReader' in window) {
      setNfcSupported(true);
    }
    // Auto-lookup if ?q= parameter is present (deep-link from admin page)
    const queryParam = searchParams.get('q');
    if (queryParam && !autoLoadedRef.current) {
      autoLoadedRef.current = true;
      setManualId(queryParam);
      // Trigger lookup after component mounts
      setTimeout(() => lookupUnit(queryParam), 100);
    }
  }, [router, searchParams]);

  // ============================================================
  // NFC Scan
  // ============================================================

  const startNfcScan = useCallback(async () => {
    setScanState('scanning');
    setNfcError(null);
    setUnit(null);
    setEvents([]);
    setAssignment(null);

    try {
      const ndef = new (window as any).NDEFReader();
      nfcReaderRef.current = ndef;
      await ndef.scan();

      ndef.addEventListener('reading', ({ serialNumber, message }: any) => {
        // The NFC tag UID or our written pontifex_id
        let lookupValue = serialNumber;

        // Check if message records contain our pontifex_id
        if (message?.records) {
          for (const record of message.records) {
            if (record.recordType === 'text') {
              const decoder = new TextDecoder();
              const text = decoder.decode(record.data);
              if (text.startsWith('PX-')) {
                lookupValue = text;
                break;
              }
            }
          }
        }

        lookupUnit(lookupValue);
      });

      ndef.addEventListener('readingerror', () => {
        setNfcError('Could not read NFC tag. Try again or use manual entry.');
        setScanState('idle');
      });
    } catch (error: any) {
      setNfcError('NFC not available. Try QR code or manual entry.');
      setScanState('idle');
    }
  }, []);

  const stopNfcScan = useCallback(() => {
    nfcReaderRef.current = null;
    setScanState('idle');
  }, []);

  // ============================================================
  // Lookup Unit
  // ============================================================

  const lookupUnit = useCallback(async (query: string) => {
    setScanState('loading');
    setNfcError(null);
    try {
      const result = await apiFetch<{
        success: boolean;
        data: { unit: EquipmentUnit; recentEvents: UnitEvent[]; assignment: UnitAssignment | null };
      }>('/api/equipment-units/scan', {
        params: { q: query },
      });

      if (result.success && result.data?.unit) {
        setUnit(result.data.unit);
        setEvents(result.data.recentEvents || []);
        setAssignment(result.data.assignment || null);
        setScanState('found');
      } else {
        setScanState('not_found');
      }
    } catch (error) {
      setScanState('not_found');
    }
  }, []);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualId.trim()) {
      lookupUnit(manualId.trim());
    }
  };

  // ============================================================
  // Maintenance Form
  // ============================================================

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPhotos = [...maintenancePhotos, ...files].slice(0, 5); // Max 5 photos
    setMaintenancePhotos(newPhotos);

    // Generate preview URLs
    const urls = newPhotos.map((file) => URL.createObjectURL(file));
    // Revoke old ones first
    photoPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    setPhotoPreviewUrls(urls);
  };

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviewUrls[index]);
    setMaintenancePhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const submitMaintenanceRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unit) return;

    setSubmitting(true);
    try {
      // Build form data for photo uploads
      const formData = new FormData();
      formData.append('event_type', 'maintenance_requested');
      formData.append('title', maintenanceForm.title);
      formData.append('description', maintenanceForm.description);
      formData.append('urgency', maintenanceForm.urgency);
      maintenancePhotos.forEach((photo) => {
        formData.append('photos', photo);
      });

      await apiFetch(`/api/equipment-units/${unit.id}/events`, {
        method: 'POST',
        body: formData as any,
        headers: {}, // Let browser set Content-Type with boundary for FormData
      });

      setSubmitSuccess(true);
      setMaintenanceForm({ title: '', description: '', urgency: 'normal' });
      setMaintenancePhotos([]);
      photoPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
      setPhotoPreviewUrls([]);

      // Reset success message after 3 seconds
      setTimeout(() => {
        setSubmitSuccess(false);
        setScanState('found');
      }, 3000);
    } catch (error) {
      console.error('Failed to submit maintenance request:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const resetScan = () => {
    setScanState('idle');
    setUnit(null);
    setEvents([]);
    setAssignment(null);
    setManualId('');
    setNfcError(null);
    setShowHistory(false);
    setSubmitSuccess(false);
  };

  // ============================================================
  // Usage progress
  // ============================================================

  const getUsagePercent = (u: EquipmentUnit) => {
    if (!u.estimated_life_linear_feet || u.estimated_life_linear_feet === 0) return 0;
    return Math.min(100, (u.linear_feet_used / u.estimated_life_linear_feet) * 100);
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 70) return 'bg-orange-500';
    if (percent >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // ============================================================
  // Render
  // ============================================================

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 relative max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/dashboard"
            className="group p-2.5 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200 text-gray-700 hover:bg-white transition-all duration-300 hover:scale-105 shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
              <Smartphone className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-600" />
              Scan Equipment
            </h1>
            <p className="text-gray-500 text-sm font-medium mt-0.5">Tap NFC tag or search by ID</p>
          </div>
        </div>

        {/* ============================== */}
        {/* IDLE / SCANNING STATE         */}
        {/* ============================== */}
        {(scanState === 'idle' || scanState === 'scanning') && (
          <div className="space-y-6">
            {/* NFC Scan Section */}
            <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-2xl p-8 shadow-lg text-center">
              {/* NFC Icon with Pulse */}
              <div className="relative w-32 h-32 mx-auto mb-6">
                {scanState === 'scanning' && (
                  <>
                    <div className="absolute inset-0 bg-indigo-400 rounded-full opacity-20 animate-ping"></div>
                    <div className="absolute inset-2 bg-indigo-400 rounded-full opacity-15 animate-ping delay-300"></div>
                    <div className="absolute inset-4 bg-indigo-400 rounded-full opacity-10 animate-ping delay-700"></div>
                  </>
                )}
                <div className={`relative w-full h-full rounded-full flex items-center justify-center transition-colors duration-300 ${
                  scanState === 'scanning'
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl shadow-indigo-500/30'
                    : 'bg-gradient-to-br from-gray-100 to-gray-200'
                }`}>
                  {nfcSupported ? (
                    <Wifi className={`w-14 h-14 ${scanState === 'scanning' ? 'text-white' : 'text-gray-400'}`} />
                  ) : (
                    <WifiOff className="w-14 h-14 text-gray-400" />
                  )}
                </div>
              </div>

              {scanState === 'scanning' ? (
                <>
                  <h2 className="text-xl font-bold text-gray-800 mb-2">Scanning for NFC tag...</h2>
                  <p className="text-gray-500 mb-6">Hold your phone near the equipment NFC tag</p>
                  <button
                    onClick={stopNfcScan}
                    className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-800 mb-2">
                    {nfcSupported ? 'Tap your phone to the NFC tag' : 'NFC not available on this device'}
                  </h2>
                  <p className="text-gray-500 mb-6">
                    {nfcSupported
                      ? 'Hold your phone near the equipment tag to scan'
                      : 'Use QR code scanning or manual entry below'}
                  </p>

                  {nfcSupported && (
                    <button
                      onClick={startNfcScan}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-8 py-3 rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 flex items-center justify-center gap-2 mx-auto"
                    >
                      <Wifi className="w-5 h-5" />
                      Start NFC Scan
                    </button>
                  )}
                </>
              )}

              {/* NFC Error */}
              {nfcError && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {nfcError}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-gray-200"></div>
              <span className="text-gray-400 text-sm font-medium">or</span>
              <div className="flex-1 h-px bg-gray-200"></div>
            </div>

            {/* QR Code Button */}
            <button
              onClick={() => {
                // QR code scanning would integrate with a scanner library
                // For now, fallback to manual entry
                const el = document.getElementById('manual-entry-input');
                el?.focus();
              }}
              className="w-full bg-white/80 backdrop-blur-lg border border-gray-200 rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01] flex items-center gap-4"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-md">
                <QrCode className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <p className="font-bold text-gray-800">Scan QR Code</p>
                <p className="text-gray-500 text-sm">Use camera to scan equipment QR code</p>
              </div>
            </button>

            {/* Manual Entry */}
            <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-2xl p-5 shadow-lg">
              <form onSubmit={handleManualSearch} className="flex gap-3">
                <div className="flex-1 relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="manual-entry-input"
                    type="text"
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value)}
                    placeholder="Enter Pontifex ID (e.g., PX-BLD-0001)"
                    className="w-full pl-10 pr-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 backdrop-blur-sm shadow-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!manualId.trim()}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2"
                >
                  <Search className="w-5 h-5" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ============================== */}
        {/* LOADING STATE                 */}
        {/* ============================== */}
        {scanState === 'loading' && (
          <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-2xl p-12 shadow-lg text-center">
            <Loader2 className="w-12 h-12 text-indigo-600 mx-auto mb-4 animate-spin" />
            <p className="text-gray-600 font-medium">Looking up equipment...</p>
          </div>
        )}

        {/* ============================== */}
        {/* NOT FOUND STATE               */}
        {/* ============================== */}
        {scanState === 'not_found' && (
          <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-2xl p-8 shadow-lg text-center">
            <div className="w-20 h-20 bg-red-50 border border-red-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Equipment Not Recognized</h2>
            <p className="text-gray-500 mb-6">
              This NFC tag or ID is not linked to any equipment in the system.
              Contact your supervisor or try a different scan method.
            </p>
            <button
              onClick={resetScan}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-8 py-3 rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
            >
              Try Again
            </button>
          </div>
        )}

        {/* ============================== */}
        {/* FOUND STATE — Equipment Card  */}
        {/* ============================== */}
        {(scanState === 'found' || scanState === 'maintenance_form') && unit && (
          <div className="space-y-4">
            {/* Scan Again Button */}
            <button
              onClick={resetScan}
              className="text-indigo-600 hover:text-indigo-700 font-semibold text-sm flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              Scan another item
            </button>

            {/* Equipment Info Card */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl opacity-20 group-hover:opacity-30 blur transition duration-300"></div>
              <div className="relative bg-white/90 backdrop-blur-lg rounded-2xl border border-indigo-100 p-6 shadow-lg">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-800">{unit.name}</h2>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-indigo-600 font-mono text-sm font-semibold bg-indigo-50 px-2 py-0.5 rounded">
                        {unit.pontifex_id}
                      </span>
                      {unit.manufacturer_serial && (
                        <span className="text-gray-500 text-sm">
                          S/N: {unit.manufacturer_serial}
                        </span>
                      )}
                    </div>
                  </div>
                  {getStatusBadge(unit.lifecycle_status)}
                </div>

                {/* Assignment Info */}
                {assignment && (
                  <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 mb-4 flex items-center gap-3">
                    <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-blue-800 font-semibold text-sm">{assignment.operator_name}</p>
                      <p className="text-blue-600 text-xs">
                        Assigned since {new Date(assignment.assigned_since).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )}

                {/* Usage Progress */}
                {unit.estimated_life_linear_feet && unit.estimated_life_linear_feet > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-gray-600 text-sm font-medium">Usage</span>
                      <span className="text-gray-800 text-sm font-semibold">
                        {unit.linear_feet_used.toLocaleString()} / {unit.estimated_life_linear_feet.toLocaleString()} ft
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getUsageColor(getUsagePercent(unit))}`}
                        style={{ width: `${getUsagePercent(unit)}%` }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-gray-500 text-xs">{getUsagePercent(unit).toFixed(1)}% of estimated life</span>
                      {unit.cost_per_foot !== null && (
                        <span className="text-gray-500 text-xs">
                          ${unit.cost_per_foot.toFixed(4)} / ft
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {unit.manufacturer && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-gray-500 text-xs">Manufacturer</p>
                      <p className="text-gray-800 text-sm font-semibold">{unit.manufacturer}</p>
                    </div>
                  )}
                  {unit.model_number && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-gray-500 text-xs">Model</p>
                      <p className="text-gray-800 text-sm font-semibold">{unit.model_number}</p>
                    </div>
                  )}
                  {unit.size && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-gray-500 text-xs">Size</p>
                      <p className="text-gray-800 text-sm font-semibold">{unit.size}</p>
                    </div>
                  )}
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-gray-500 text-xs">Category</p>
                    <p className="text-gray-800 text-sm font-semibold capitalize">{unit.category}</p>
                  </div>
                </div>

                {/* Maintenance History — Expandable */}
                {events.length > 0 && (
                  <div className="border-t border-gray-100 pt-4">
                    <button
                      onClick={() => setShowHistory(!showHistory)}
                      className="flex items-center justify-between w-full text-left"
                    >
                      <span className="text-gray-700 font-semibold text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Recent History ({events.length})
                      </span>
                      {showHistory ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </button>

                    {showHistory && (
                      <div className="mt-3 space-y-2">
                        {events.map((event) => (
                          <div
                            key={event.id}
                            className={`border-l-4 ${eventTypeColors[event.event_type] || 'border-l-gray-300'} bg-gray-50 rounded-r-lg p-3`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-gray-800 text-sm font-semibold capitalize">
                                {event.event_type.replace(/_/g, ' ')}
                              </span>
                              <span className="text-gray-400 text-xs">
                                {new Date(event.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            {event.description && (
                              <p className="text-gray-600 text-sm">{event.description}</p>
                            )}
                            {event.performed_by_name && (
                              <p className="text-gray-400 text-xs mt-1">By: {event.performed_by_name}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {scanState === 'found' && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setScanState('maintenance_form')}
                  className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white px-5 py-4 rounded-2xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] flex flex-col items-center gap-2"
                >
                  <Wrench className="w-6 h-6" />
                  <span className="text-sm">Request Maintenance</span>
                </button>
                <button
                  onClick={() => {
                    // Link to existing damage report flow if available
                    router.push(`/dashboard/tools/damage-report?unit=${unit.id}`);
                  }}
                  className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white px-5 py-4 rounded-2xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] flex flex-col items-center gap-2"
                >
                  <AlertTriangle className="w-6 h-6" />
                  <span className="text-sm">Report Damage</span>
                </button>
              </div>
            )}

            {/* ============================== */}
            {/* MAINTENANCE FORM              */}
            {/* ============================== */}
            {scanState === 'maintenance_form' && (
              <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-2xl p-6 shadow-lg">
                {submitSuccess ? (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 bg-green-50 border border-green-200 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="w-8 h-8 text-green-500" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 mb-1">Request Submitted</h3>
                    <p className="text-gray-500 text-sm">Your maintenance request has been logged.</p>
                  </div>
                ) : (
                  <form onSubmit={submitMaintenanceRequest}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-orange-500" />
                        Request Maintenance
                      </h3>
                      <button
                        type="button"
                        onClick={() => setScanState('found')}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Issue Title */}
                    <div className="mb-4">
                      <label className="block text-gray-700 text-sm font-semibold mb-1">Issue Title</label>
                      <input
                        type="text"
                        value={maintenanceForm.title}
                        onChange={(e) => setMaintenanceForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="Brief description of the issue"
                        required
                        className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
                      />
                    </div>

                    {/* Description */}
                    <div className="mb-4">
                      <label className="block text-gray-700 text-sm font-semibold mb-1">Description</label>
                      <textarea
                        value={maintenanceForm.description}
                        onChange={(e) => setMaintenanceForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="Describe the issue in detail..."
                        rows={4}
                        className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm resize-none"
                      />
                    </div>

                    {/* Photo Upload */}
                    <div className="mb-4">
                      <label className="block text-gray-700 text-sm font-semibold mb-1">
                        Photos <span className="text-gray-400 font-normal">(optional, max 5)</span>
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />

                      {photoPreviewUrls.length > 0 && (
                        <div className="flex gap-2 mb-3 flex-wrap">
                          {photoPreviewUrls.map((url, index) => (
                            <div key={index} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                              <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removePhoto(index)}
                                className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {maintenancePhotos.length < 5 && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          <Camera className="w-5 h-5" />
                          <span className="text-sm font-medium">Add Photo</span>
                        </button>
                      )}
                    </div>

                    {/* Urgency */}
                    <div className="mb-6">
                      <label className="block text-gray-700 text-sm font-semibold mb-2">Urgency</label>
                      <div className="grid grid-cols-4 gap-2">
                        {(['low', 'normal', 'high', 'critical'] as const).map((level) => {
                          const urgencyStyles = {
                            low: { active: 'bg-green-100 border-green-400 text-green-700', label: 'Low' },
                            normal: { active: 'bg-blue-100 border-blue-400 text-blue-700', label: 'Normal' },
                            high: { active: 'bg-orange-100 border-orange-400 text-orange-700', label: 'High' },
                            critical: { active: 'bg-red-100 border-red-400 text-red-700', label: 'Critical' },
                          };
                          const isActive = maintenanceForm.urgency === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => setMaintenanceForm((f) => ({ ...f, urgency: level }))}
                              className={`py-2 px-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                                isActive
                                  ? urgencyStyles[level].active
                                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                              }`}
                            >
                              {urgencyStyles[level].label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={submitting || !maintenanceForm.title.trim()}
                      className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3.5 rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          Submit Maintenance Request
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function NfcScanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div></div>}>
      <NfcScanPageContent />
    </Suspense>
  );
}
