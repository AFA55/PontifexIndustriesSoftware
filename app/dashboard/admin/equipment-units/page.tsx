'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import {
  Package,
  Plus,
  Search,
  Wrench,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  User,
  Hash,
  Loader2,
  Wifi,
  WifiOff,
  ArrowLeft,
  Shield,
  Smartphone,
  CircleDot,
  Tag,
  RotateCcw,
  History,
  UserPlus,
  Archive,
  Filter,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import {
  useEquipmentUnits,
  useCreateEquipmentUnit,
  useUpdateEquipmentUnit,
  useOperators,
  usePairNfc,
} from '@/lib/hooks/useApiQueries';

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
  purchase_date: string | null;
  estimated_life_linear_feet: number | null;
  linear_feet_used: number;
  cost_per_foot: number | null;
  nfc_tag_id: string | null;
  inventory_id: string | null;
  notes: string | null;
  created_at: string;
  // Joined
  operator_name?: string | null;
  assigned_since?: string | null;
}

interface UnitEvent {
  id: string;
  event_type: string;
  description: string | null;
  performed_by_name: string | null;
  created_at: string;
}

// ============================================================
// Constants
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

const categoryEquipmentTypes: Record<string, string[]> = {
  blade: ['Diamond Blade', 'Abrasive Blade', 'Chain Saw Blade', 'Ring Saw Blade', 'Wire Saw'],
  bit: ['Core Bit', 'Drill Bit', 'Anchor Bit', 'PDC Bit'],
  tool: ['Hydraulic Saw', 'Flat Saw', 'Wall Saw', 'Wire Saw Machine', 'Core Drill', 'Hand Tool'],
  vehicle: ['Truck', 'Trailer', 'Skid Steer', 'Crane', 'Other Vehicle'],
  safety: ['Harness', 'Respirator', 'Hard Hat', 'Safety Glasses', 'PPE Kit'],
};

function getStatusBadge(status: string) {
  const config = statusConfig[status] || statusConfig.active;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bgColor} ${config.color} ${config.borderColor}`}>
      <CircleDot className="w-2.5 h-2.5 mr-1" />
      {config.label}
    </span>
  );
}

// ============================================================
// Admin Equipment Units Page
// ============================================================

function EquipmentUnitsContent() {
  const router = useRouter();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // UI state
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [pairingUnitId, setPairingUnitId] = useState<string | null>(null);
  const [nfcPairingStatus, setNfcPairingStatus] = useState<'idle' | 'scanning' | 'writing' | 'success' | 'error'>('idle');
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [showRetireConfirm, setShowRetireConfirm] = useState<string | null>(null);
  const [assigningUnitId, setAssigningUnitId] = useState<string | null>(null);
  const [selectedOperatorId, setSelectedOperatorId] = useState('');

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  // Data fetching
  const { data: unitsData, isLoading, refetch: refetchUnits } = useEquipmentUnits({
    page,
    pageSize,
    category: filterCategory,
    status: filterStatus,
    search: debouncedSearch,
  });

  const { data: operatorsData } = useOperators();
  const createUnit = useCreateEquipmentUnit();
  const updateUnit = useUpdateEquipmentUnit();

  const units: EquipmentUnit[] = unitsData?.data || [];
  const pagination = unitsData?.pagination || { page: 1, pageSize, total: 0, totalPages: 1 };
  const stats = unitsData?.stats || { total: 0, active: 0, needsService: 0, retired: 0 };
  const operators = operatorsData?.data || [];

  const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

  // ============================================================
  // NFC Pairing Flow
  // ============================================================

  const startNfcPairing = useCallback(async (unitId: string, pontifexId: string) => {
    setPairingUnitId(unitId);
    setNfcPairingStatus('scanning');
    setNfcError(null);

    try {
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();

      const handleReading = async ({ serialNumber }: any) => {
        try {
          setNfcPairingStatus('writing');

          // Write the Pontifex ID to the NFC tag
          await ndef.write({
            records: [{ recordType: 'text', data: pontifexId }],
          });

          // Register the pairing in the database
          await apiFetch(`/api/equipment-units/${unitId}/pair-nfc`, {
            method: 'POST',
            body: JSON.stringify({ nfc_tag_id: serialNumber }),
          });

          setNfcPairingStatus('success');
          refetchUnits();

          // Reset after 2 seconds
          setTimeout(() => {
            setPairingUnitId(null);
            setNfcPairingStatus('idle');
          }, 2000);
        } catch (error: any) {
          setNfcError(error.message || 'Failed to write NFC tag');
          setNfcPairingStatus('error');
        }
      };

      ndef.addEventListener('reading', handleReading, { once: true });
    } catch (error: any) {
      setNfcError('NFC not available or permission denied');
      setNfcPairingStatus('error');
    }
  }, [refetchUnits]);

  const cancelNfcPairing = () => {
    setPairingUnitId(null);
    setNfcPairingStatus('idle');
    setNfcError(null);
  };

  // ============================================================
  // Assign Operator
  // ============================================================

  const handleAssignOperator = async () => {
    if (!assigningUnitId || !selectedOperatorId) return;
    try {
      await apiFetch(`/api/equipment-units/${assigningUnitId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ operator_id: selectedOperatorId }),
      });
      refetchUnits();
      setAssigningUnitId(null);
      setSelectedOperatorId('');
    } catch (error) {
      console.error('Failed to assign operator:', error);
    }
  };

  // ============================================================
  // Retire Unit
  // ============================================================

  const handleRetireUnit = async (unitId: string) => {
    try {
      await apiFetch(`/api/equipment-units/${unitId}`, {
        method: 'PATCH',
        body: JSON.stringify({ lifecycle_status: 'retired' }),
      });
      refetchUnits();
      setShowRetireConfirm(null);
      setExpandedRow(null);
    } catch (error) {
      console.error('Failed to retire unit:', error);
    }
  };

  // ============================================================
  // Add Unit Modal
  // ============================================================

  const [addForm, setAddForm] = useState({
    name: '',
    category: 'blade',
    equipment_type: '',
    manufacturer: '',
    model_number: '',
    size: '',
    manufacturer_serial: '',
    purchase_price: '',
    purchase_date: '',
    estimated_life_linear_feet: '',
    inventory_id: '',
    notes: '',
  });

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUnit.mutateAsync({
        name: addForm.name,
        category: addForm.category,
        equipment_type: addForm.equipment_type || null,
        manufacturer: addForm.manufacturer || null,
        model_number: addForm.model_number || null,
        size: addForm.size || null,
        manufacturer_serial: addForm.manufacturer_serial || null,
        purchase_price: addForm.purchase_price ? parseFloat(addForm.purchase_price) : null,
        purchase_date: addForm.purchase_date || null,
        estimated_life_linear_feet: addForm.estimated_life_linear_feet
          ? parseInt(addForm.estimated_life_linear_feet)
          : null,
        inventory_id: addForm.inventory_id || null,
        notes: addForm.notes || null,
      });
      setShowAddModal(false);
      setAddForm({
        name: '',
        category: 'blade',
        equipment_type: '',
        manufacturer: '',
        model_number: '',
        size: '',
        manufacturer_serial: '',
        purchase_price: '',
        purchase_date: '',
        estimated_life_linear_feet: '',
        inventory_id: '',
        notes: '',
      });
    } catch (error) {
      console.error('Failed to create unit:', error);
    }
  };

  // ============================================================
  // Expanded row events
  // ============================================================

  const [expandedEvents, setExpandedEvents] = useState<UnitEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const toggleExpandRow = async (unitId: string) => {
    if (expandedRow === unitId) {
      setExpandedRow(null);
      setExpandedEvents([]);
      return;
    }
    setExpandedRow(unitId);
    setLoadingEvents(true);
    try {
      const result = await apiFetch<{ success: boolean; data: UnitEvent[] }>(
        `/api/equipment-units/${unitId}/events`,
        { params: { pageSize: 5 } }
      );
      setExpandedEvents(result.data || []);
    } catch {
      setExpandedEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="container mx-auto px-6 py-8 relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard/admin"
              className="group p-3 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200 text-gray-700 hover:bg-white transition-all duration-300 hover:scale-105 shadow-sm"
            >
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-3">
                <Package className="w-9 h-9 lg:w-10 lg:h-10 text-indigo-600" />
                Equipment Unit Tracking
              </h1>
              <p className="text-gray-600 font-medium mt-1 flex items-center gap-2">
                Manage individual equipment units with NFC support
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">
                  <Smartphone className="w-3 h-3 mr-1" />
                  NFC Tag Management
                </span>
              </p>
            </div>
          </div>

          {/* Quick link to Blade Management */}
          <Link
            href="/dashboard/inventory"
            className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
            Blade Management
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Units */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl opacity-30 group-hover:opacity-50 blur transition duration-300"></div>
            <div className="relative bg-white/90 backdrop-blur-lg rounded-2xl border border-indigo-100 p-6 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-semibold">Total Units</p>
                  <p className="text-indigo-600 text-3xl font-bold">{stats.total}</p>
                  <p className="text-gray-500 text-sm mt-1">All equipment</p>
                </div>
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                  <Package className="w-7 h-7 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Active / Assigned */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-30 group-hover:opacity-50 blur transition duration-300"></div>
            <div className="relative bg-white/90 backdrop-blur-lg rounded-2xl border border-green-100 p-6 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-semibold">Active / Assigned</p>
                  <p className="text-green-600 text-3xl font-bold">{stats.active}</p>
                  <p className="text-gray-500 text-sm mt-1">Currently in use</p>
                </div>
                <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                  <CheckCircle className="w-7 h-7 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Needs Service */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl opacity-30 group-hover:opacity-50 blur transition duration-300"></div>
            <div className="relative bg-white/90 backdrop-blur-lg rounded-2xl border border-orange-100 p-6 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-semibold">Needs Service</p>
                  <p className="text-orange-600 text-3xl font-bold">{stats.needsService}</p>
                  <p className="text-gray-500 text-sm mt-1">Maintenance required</p>
                </div>
                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                  <Wrench className="w-7 h-7 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Retired */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-gray-400 to-gray-600 rounded-2xl opacity-30 group-hover:opacity-50 blur transition duration-300"></div>
            <div className="relative bg-white/90 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-semibold">Retired</p>
                  <p className="text-gray-600 text-3xl font-bold">{stats.retired}</p>
                  <p className="text-gray-500 text-sm mt-1">End of life</p>
                </div>
                <div className="w-14 h-14 bg-gradient-to-br from-gray-400 to-gray-600 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                  <Archive className="w-7 h-7 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-2xl p-6 mb-8 shadow-lg">
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            <div className="flex gap-3 w-full lg:w-auto flex-wrap">
              <div className="flex-1 lg:flex-none relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/80 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 backdrop-blur-sm shadow-sm"
                />
              </div>

              <select
                value={filterCategory}
                onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
                className="px-4 py-2.5 bg-white/80 border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 backdrop-blur-sm shadow-sm"
              >
                <option value="all">All Categories</option>
                <option value="blade">Blades</option>
                <option value="bit">Bits</option>
                <option value="tool">Tools</option>
                <option value="vehicle">Vehicles</option>
                <option value="safety">Safety</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                className="px-4 py-2.5 bg-white/80 border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 backdrop-blur-sm shadow-sm"
              >
                <option value="all">All Statuses</option>
                <option value="available">Available</option>
                <option value="new">New</option>
                <option value="active">Active</option>
                <option value="in_use">In Use</option>
                <option value="needs_service">Needs Service</option>
                <option value="in_maintenance">In Maintenance</option>
                <option value="damaged">Damaged</option>
                <option value="retired">Retired</option>
              </select>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex-shrink-0 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Unit
            </button>
          </div>
        </div>

        {/* Units Table */}
        <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/80 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Pontifex ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 hidden md:table-cell">Category</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 hidden lg:table-cell">Operator</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 hidden xl:table-cell">Usage</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">NFC Tag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading equipment units...
                    </td>
                  </tr>
                ) : units.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No equipment units found</p>
                      <p className="text-sm mt-1">Add your first unit or adjust your filters</p>
                    </td>
                  </tr>
                ) : (
                  units.map((unit) => (
                    <>
                      <tr
                        key={unit.id}
                        onClick={() => toggleExpandRow(unit.id)}
                        className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <span className="text-indigo-600 font-mono text-sm font-semibold bg-indigo-50 px-2 py-0.5 rounded">
                            {unit.pontifex_id}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-800 font-semibold">{unit.name}</p>
                          {unit.manufacturer && (
                            <p className="text-gray-500 text-sm">{unit.manufacturer} {unit.model_number || ''}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell">
                          <span className="bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full text-sm text-indigo-700 capitalize font-medium">
                            {unit.category}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(unit.lifecycle_status)}
                        </td>
                        <td className="px-6 py-4 hidden lg:table-cell">
                          {unit.operator_name ? (
                            <span className="text-gray-700 text-sm font-medium">{unit.operator_name}</span>
                          ) : (
                            <span className="text-gray-400 text-sm">Unassigned</span>
                          )}
                        </td>
                        <td className="px-6 py-4 hidden xl:table-cell">
                          {unit.estimated_life_linear_feet ? (
                            <div className="w-32">
                              <div className="flex justify-between text-xs mb-0.5">
                                <span className="text-gray-600">{unit.linear_feet_used.toLocaleString()} ft</span>
                                <span className="text-gray-400">{unit.estimated_life_linear_feet.toLocaleString()}</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div
                                  className={`h-full rounded-full ${
                                    (unit.linear_feet_used / unit.estimated_life_linear_feet) >= 0.9
                                      ? 'bg-red-500'
                                      : (unit.linear_feet_used / unit.estimated_life_linear_feet) >= 0.7
                                      ? 'bg-orange-500'
                                      : 'bg-green-500'
                                  }`}
                                  style={{
                                    width: `${Math.min(100, (unit.linear_feet_used / unit.estimated_life_linear_feet) * 100)}%`,
                                  }}
                                ></div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">N/A</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {unit.nfc_tag_id ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                              <Wifi className="w-3 h-3 mr-1" />
                              Paired
                            </span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (nfcSupported) {
                                  startNfcPairing(unit.id, unit.pontifex_id);
                                } else {
                                  setNfcError('NFC not available on this device');
                                }
                              }}
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors"
                            >
                              <Tag className="w-3 h-3 mr-1" />
                              Pair
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Row */}
                      {expandedRow === unit.id && (
                        <tr key={`${unit.id}-expanded`}>
                          <td colSpan={7} className="px-6 py-4 bg-gray-50/50">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Recent Events */}
                              <div>
                                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                  <Clock className="w-4 h-4" />
                                  Recent Events
                                </h4>
                                {loadingEvents ? (
                                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Loading events...
                                  </div>
                                ) : expandedEvents.length === 0 ? (
                                  <p className="text-gray-400 text-sm">No events recorded yet</p>
                                ) : (
                                  <div className="space-y-2">
                                    {expandedEvents.map((event) => (
                                      <div key={event.id} className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm">
                                        <div className="flex items-center justify-between">
                                          <span className="text-gray-800 text-sm font-medium capitalize">
                                            {event.event_type.replace(/_/g, ' ')}
                                          </span>
                                          <span className="text-gray-400 text-xs">
                                            {new Date(event.created_at).toLocaleDateString()}
                                          </span>
                                        </div>
                                        {event.description && (
                                          <p className="text-gray-500 text-xs mt-1">{event.description}</p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Actions */}
                              <div>
                                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                  <Wrench className="w-4 h-4" />
                                  Actions
                                </h4>
                                <div className="space-y-2">
                                  {/* Pair NFC Tag */}
                                  {!unit.nfc_tag_id && (
                                    <button
                                      onClick={() => {
                                        if (nfcSupported) {
                                          startNfcPairing(unit.id, unit.pontifex_id);
                                        } else {
                                          setNfcError('NFC not available on this device');
                                        }
                                      }}
                                      className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-colors text-left"
                                    >
                                      <Smartphone className="w-5 h-5 text-indigo-600" />
                                      <div>
                                        <p className="text-gray-800 text-sm font-semibold">Pair NFC Tag</p>
                                        <p className="text-gray-500 text-xs">Write Pontifex ID to NFC tag</p>
                                      </div>
                                    </button>
                                  )}

                                  {/* Assign Operator */}
                                  <button
                                    onClick={() => {
                                      setAssigningUnitId(unit.id);
                                      setSelectedOperatorId('');
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-colors text-left"
                                  >
                                    <UserPlus className="w-5 h-5 text-blue-600" />
                                    <div>
                                      <p className="text-gray-800 text-sm font-semibold">Assign to Operator</p>
                                      <p className="text-gray-500 text-xs">
                                        {unit.operator_name ? `Currently: ${unit.operator_name}` : 'Unassigned'}
                                      </p>
                                    </div>
                                  </button>

                                  {/* View Full History */}
                                  <button
                                    onClick={() => {
                                      // Navigate to NFC scan page with unit pre-loaded
                                      router.push(`/dashboard/tools/nfc-scan?q=${unit.pontifex_id}`);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-purple-50 hover:border-purple-200 transition-colors text-left"
                                  >
                                    <History className="w-5 h-5 text-purple-600" />
                                    <div>
                                      <p className="text-gray-800 text-sm font-semibold">View Full Details</p>
                                      <p className="text-gray-500 text-xs">Open in equipment scanner with full history</p>
                                    </div>
                                  </button>

                                  {/* Retire Unit */}
                                  {unit.lifecycle_status !== 'retired' && (
                                    <button
                                      onClick={() => setShowRetireConfirm(unit.id)}
                                      className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-colors text-left"
                                    >
                                      <Archive className="w-5 h-5 text-red-500" />
                                      <div>
                                        <p className="text-red-700 text-sm font-semibold">Retire Unit</p>
                                        <p className="text-gray-500 text-xs">Mark as end of life</p>
                                      </div>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50/50">
              <p className="text-gray-500 text-sm">
                Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, pagination.total)} of {pagination.total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-gray-700 text-sm font-medium px-2">
                  Page {page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================== */}
      {/* NFC Pairing Overlay           */}
      {/* ============================== */}
      {pairingUnitId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
            {nfcPairingStatus === 'scanning' && (
              <>
                <div className="relative w-24 h-24 mx-auto mb-4">
                  <div className="absolute inset-0 bg-indigo-400 rounded-full opacity-20 animate-ping"></div>
                  <div className="absolute inset-2 bg-indigo-400 rounded-full opacity-15 animate-ping delay-300"></div>
                  <div className="relative w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center shadow-xl">
                    <Wifi className="w-10 h-10 text-white" />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">Scanning for NFC tag...</h3>
                <p className="text-gray-500 text-sm mb-6">Hold the NFC tag near the device to pair</p>
                <button
                  onClick={cancelNfcPairing}
                  className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
            {nfcPairingStatus === 'writing' && (
              <>
                <Loader2 className="w-12 h-12 text-indigo-600 mx-auto mb-4 animate-spin" />
                <h3 className="text-lg font-bold text-gray-800 mb-2">Writing to NFC tag...</h3>
                <p className="text-gray-500 text-sm">Keep the tag close until complete</p>
              </>
            )}
            {nfcPairingStatus === 'success' && (
              <>
                <div className="w-16 h-16 bg-green-50 border border-green-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">NFC Tag Paired</h3>
                <p className="text-gray-500 text-sm">The tag is now linked to this equipment unit.</p>
              </>
            )}
            {nfcPairingStatus === 'error' && (
              <>
                <div className="w-16 h-16 bg-red-50 border border-red-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">Pairing Failed</h3>
                <p className="text-gray-500 text-sm mb-4">{nfcError || 'An unknown error occurred.'}</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={cancelNfcPairing}
                    className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      const u = units.find((u) => u.id === pairingUnitId);
                      if (u) startNfcPairing(u.id, u.pontifex_id);
                    }}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============================== */}
      {/* Assign Operator Modal         */}
      {/* ============================== */}
      {assigningUnitId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                Assign to Operator
              </h3>
              <button onClick={() => setAssigningUnitId(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <select
              value={selectedOperatorId}
              onChange={(e) => setSelectedOperatorId(e.target.value)}
              className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm mb-4"
            >
              <option value="">Select an operator...</option>
              {operators.map((op: any) => (
                <option key={op.id} value={op.id}>{op.name}</option>
              ))}
            </select>

            <div className="flex gap-3">
              <button
                onClick={() => setAssigningUnitId(null)}
                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignOperator}
                disabled={!selectedOperatorId}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl font-semibold transition-all shadow-lg"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================== */}
      {/* Retire Confirmation Modal     */}
      {/* ============================== */}
      {showRetireConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-50 border border-red-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <Archive className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Retire This Unit?</h3>
            <p className="text-gray-500 text-sm mb-6">
              This will mark the equipment as retired and remove it from active tracking.
              This action can be reversed later if needed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRetireConfirm(null)}
                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRetireUnit(showRetireConfirm)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-xl font-semibold transition-colors shadow-lg"
              >
                Retire Unit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================== */}
      {/* Add Unit Modal                */}
      {/* ============================== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                Add New Equipment Unit
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-gray-700 text-sm font-semibold mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder='e.g. "14" Diamond Blade - Husqvarna"'
                  required
                  className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
              </div>

              {/* Category + Equipment Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 text-sm font-semibold mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={addForm.category}
                    onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value, equipment_type: '' }))}
                    className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  >
                    <option value="blade">Blade</option>
                    <option value="bit">Bit</option>
                    <option value="tool">Tool</option>
                    <option value="vehicle">Vehicle</option>
                    <option value="safety">Safety</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-semibold mb-1">
                    Equipment Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={addForm.equipment_type}
                    onChange={(e) => setAddForm((f) => ({ ...f, equipment_type: e.target.value }))}
                    required
                    className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  >
                    <option value="">Select type...</option>
                    {(categoryEquipmentTypes[addForm.category] || []).map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Manufacturer + Model */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 text-sm font-semibold mb-1">
                    Manufacturer <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.manufacturer}
                    onChange={(e) => setAddForm((f) => ({ ...f, manufacturer: e.target.value }))}
                    placeholder="e.g. Husqvarna"
                    required
                    className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-semibold mb-1">
                    Model Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.model_number}
                    onChange={(e) => setAddForm((f) => ({ ...f, model_number: e.target.value }))}
                    placeholder="e.g. DERA-3000"
                    required
                    className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  />
                </div>
              </div>

              {/* Size + Serial */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 text-sm font-semibold mb-1">
                    Size <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.size}
                    onChange={(e) => setAddForm((f) => ({ ...f, size: e.target.value }))}
                    placeholder='e.g. 14", 4"'
                    required
                    className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-semibold mb-1">
                    Manufacturer Serial <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.manufacturer_serial}
                    onChange={(e) => setAddForm((f) => ({ ...f, manufacturer_serial: e.target.value }))}
                    placeholder="Serial number"
                    required
                    className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  />
                </div>
              </div>

              {/* Purchase Price + Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 text-sm font-semibold mb-1">Purchase Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={addForm.purchase_price}
                    onChange={(e) => setAddForm((f) => ({ ...f, purchase_price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-semibold mb-1">Purchase Date</label>
                  <input
                    type="date"
                    value={addForm.purchase_date}
                    onChange={(e) => setAddForm((f) => ({ ...f, purchase_date: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  />
                </div>
              </div>

              {/* Estimated Life */}
              <div>
                <label className="block text-gray-700 text-sm font-semibold mb-1">Estimated Life (linear feet)</label>
                <input
                  type="number"
                  min="0"
                  value={addForm.estimated_life_linear_feet}
                  onChange={(e) => setAddForm((f) => ({ ...f, estimated_life_linear_feet: e.target.value }))}
                  placeholder="e.g. 5000"
                  className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-gray-700 text-sm font-semibold mb-1">Notes</label>
                <textarea
                  value={addForm.notes}
                  onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Any additional notes..."
                  rows={3}
                  className="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm resize-none"
                />
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUnit.isPending || !addForm.name.trim() || !addForm.equipment_type || !addForm.manufacturer.trim() || !addForm.model_number.trim() || !addForm.size.trim() || !addForm.manufacturer_serial.trim()}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  {createUnit.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      Add Unit
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Wrap with Admin Protection
// ============================================================

export default function AdminEquipmentUnitsPage() {
  return (
    <AuthGuard requiredRole={['admin', 'shop_manager']}>
      <EquipmentUnitsContent />
    </AuthGuard>
  );
}
