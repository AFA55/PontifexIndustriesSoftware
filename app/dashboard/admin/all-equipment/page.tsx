'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';

type EquipmentType = 'tool' | 'blade' | 'vehicle' | 'safety' | 'other';
type EquipmentStatus = 'available' | 'in_use' | 'maintenance' | 'retired';

interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  brand?: string;
  model?: string;
  serialNumber: string;
  status: EquipmentStatus;
  assignedTo?: string;
  assignedToRole?: string;
  location?: string;
  lastUsed?: string;
  totalUsage?: number;
  purchaseDate: string;
  notes?: string;
}

export default function AllEquipmentPage() {
  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<EquipmentType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<EquipmentStatus | 'all'>('all');
  const [selectedOperator, setSelectedOperator] = useState<string>('all');
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAssignedTo, setNewAssignedTo] = useState('');

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
  }, []);

  // New equipment form state
  interface NewEquipmentForm {
    name: string;
    type: EquipmentType;
    brand: string;
    model: string;
    serialNumber: string;
    status: EquipmentStatus;
    assignedTo: string;
    location: string;
    purchaseDate: string;
    notes: string;
  }

  const [newEquipmentForm, setNewEquipmentForm] = useState<NewEquipmentForm>({
    name: '',
    type: 'tool',
    brand: '',
    model: '',
    serialNumber: '',
    status: 'available',
    assignedTo: '',
    location: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    notes: ''
  });

  // Mock data - in production, this would come from database
  const [equipment, setEquipment] = useState<Equipment[]>([
    {
      id: '1',
      name: 'Wall Saw - Husqvarna 24"',
      type: 'blade',
      brand: 'Husqvarna',
      model: 'WS-440',
      serialNumber: 'HV-WS-001',
      status: 'in_use',
      assignedTo: 'ANDRES GUERRERO-C',
      assignedToRole: 'operator',
      location: 'Job Site: Downtown Plaza',
      lastUsed: '2024-11-16',
      totalUsage: 2450,
      purchaseDate: '2024-01-15'
    },
    {
      id: '2',
      name: 'Core Drill - Hilti 4"',
      type: 'blade',
      brand: 'Hilti',
      model: 'DD130',
      serialNumber: 'HI-CD-002',
      status: 'in_use',
      assignedTo: 'CARLOS MARTINEZ',
      assignedToRole: 'operator',
      location: 'Job Site: Harbor Construction',
      lastUsed: '2024-11-15',
      totalUsage: 840,
      purchaseDate: '2024-02-10'
    },
    {
      id: '3',
      name: 'Hand Saw - Stihl 20"',
      type: 'blade',
      brand: 'Stihl',
      model: 'TS420',
      serialNumber: 'ST-HS-003',
      status: 'maintenance',
      location: 'Maintenance Bay',
      lastUsed: '2024-11-10',
      totalUsage: 3100,
      purchaseDate: '2023-11-20',
      notes: 'Scheduled maintenance - blade replacement needed'
    },
    {
      id: '4',
      name: 'Concrete Saw',
      type: 'tool',
      brand: 'DeWalt',
      model: 'DCS450B',
      serialNumber: 'DW-CS-004',
      status: 'available',
      location: 'Tool Shed A',
      purchaseDate: '2024-03-01'
    },
    {
      id: '5',
      name: 'Angle Grinder',
      type: 'tool',
      brand: 'Makita',
      model: '9557PBX1',
      serialNumber: 'MK-AG-005',
      status: 'in_use',
      assignedTo: 'MIKE JOHNSON',
      assignedToRole: 'operator',
      location: 'Job Site: Riverside Building',
      lastUsed: '2024-11-16',
      purchaseDate: '2024-01-05'
    },
    {
      id: '6',
      name: 'Safety Harness Set',
      type: 'safety',
      brand: 'Miller',
      model: 'T7500',
      serialNumber: 'ML-SH-006',
      status: 'in_use',
      assignedTo: 'ANDRES GUERRERO-C',
      assignedToRole: 'operator',
      location: 'Job Site: Downtown Plaza',
      purchaseDate: '2023-12-15'
    },
    {
      id: '7',
      name: 'Work Truck',
      type: 'vehicle',
      brand: 'Ford',
      model: 'F-150',
      serialNumber: 'FORD-F150-007',
      status: 'in_use',
      assignedTo: 'CARLOS MARTINEZ',
      assignedToRole: 'operator',
      location: 'Job Site: Harbor Construction',
      purchaseDate: '2023-06-01'
    },
    {
      id: '8',
      name: 'Chainsaw 15"',
      type: 'blade',
      brand: 'Stihl',
      model: 'MS 500i',
      serialNumber: 'ST-CS-008',
      status: 'available',
      location: 'Tool Shed B',
      lastUsed: '2024-11-12',
      totalUsage: 1200,
      purchaseDate: '2024-04-20'
    }
  ]);

  // Get unique operators for filter
  const operators = Array.from(new Set(equipment.filter(e => e.assignedTo).map(e => e.assignedTo)));

  const filteredEquipment = equipment.filter(item => {
    const searchMatch = searchQuery === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.assignedTo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location?.toLowerCase().includes(searchQuery.toLowerCase());

    const typeMatch = filterType === 'all' || item.type === filterType;
    const statusMatch = filterStatus === 'all' || item.status === filterStatus;
    const operatorMatch = selectedOperator === 'all' || item.assignedTo === selectedOperator;

    return searchMatch && typeMatch && statusMatch && operatorMatch;
  });

  const getStatusConfig = (status: EquipmentStatus) => {
    switch (status) {
      case 'available':
        return { color: 'bg-green-100 text-green-700 border-green-300', label: 'Available', icon: '✓' };
      case 'in_use':
        return { color: 'bg-blue-100 text-blue-700 border-blue-300', label: 'In Use', icon: '🔧' };
      case 'maintenance':
        return { color: 'bg-orange-100 text-orange-700 border-orange-300', label: 'Maintenance', icon: '⚠️' };
      case 'retired':
        return { color: 'bg-gray-100 text-gray-700 border-gray-300', label: 'Retired', icon: '📦' };
    }
  };

  const getTypeConfig = (type: EquipmentType) => {
    switch (type) {
      case 'tool':
        return { icon: '🔨', label: 'Tool', color: 'text-orange-600' };
      case 'blade':
        return { icon: '⚙️', label: 'Blade/Bit', color: 'text-purple-600' };
      case 'vehicle':
        return { icon: '🚚', label: 'Vehicle', color: 'text-blue-600' };
      case 'safety':
        return { icon: '🛡️', label: 'Safety', color: 'text-green-600' };
      case 'other':
        return { icon: '📦', label: 'Other', color: 'text-gray-600' };
    }
  };

  // Stats
  const stats = {
    total: equipment.length,
    available: equipment.filter(e => e.status === 'available').length,
    inUse: equipment.filter(e => e.status === 'in_use').length,
    maintenance: equipment.filter(e => e.status === 'maintenance').length
  };

  // Handler functions
  const handleRetireEquipment = () => {
    if (!selectedEquipment) return;

    setEquipment(prev => prev.map(e =>
      e.id === selectedEquipment.id
        ? { ...e, status: 'retired' as EquipmentStatus, assignedTo: undefined }
        : e
    ));
    setShowManageModal(false);
    setSelectedEquipment(null);
  };

  const handleChangeAssignment = () => {
    if (!selectedEquipment) return;

    setEquipment(prev => prev.map(e =>
      e.id === selectedEquipment.id
        ? {
            ...e,
            assignedTo: newAssignedTo || undefined,
            status: newAssignedTo ? 'in_use' as EquipmentStatus : 'available' as EquipmentStatus
          }
        : e
    ));
    setShowManageModal(false);
    setSelectedEquipment(null);
    setNewAssignedTo('');
  };

  const handleAddEquipment = () => {
    if (!newEquipmentForm.name || !newEquipmentForm.serialNumber) {
      alert('Please fill in equipment name and serial number');
      return;
    }

    const newEquipment: Equipment = {
      id: Date.now().toString(),
      name: newEquipmentForm.name,
      type: newEquipmentForm.type,
      brand: newEquipmentForm.brand || undefined,
      model: newEquipmentForm.model || undefined,
      serialNumber: newEquipmentForm.serialNumber,
      status: newEquipmentForm.status,
      assignedTo: newEquipmentForm.assignedTo || undefined,
      assignedToRole: newEquipmentForm.assignedTo ? 'operator' : undefined,
      location: newEquipmentForm.location || undefined,
      purchaseDate: newEquipmentForm.purchaseDate,
      notes: newEquipmentForm.notes || undefined
    };

    setEquipment(prev => [...prev, newEquipment]);

    // Reset form
    setNewEquipmentForm({
      name: '',
      type: 'tool',
      brand: '',
      model: '',
      serialNumber: '',
      status: 'available',
      assignedTo: '',
      location: '',
      purchaseDate: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setShowAddModal(false);
  };

  const handleOpenManageModal = (item: Equipment) => {
    setSelectedEquipment(item);
    setNewAssignedTo(item.assignedTo || '');
    setShowManageModal(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Global input text color fix */}
      <style jsx global>{`
        input[type="text"],
        select,
        option {
          color: #111827 !important;
        }
        input::placeholder {
          color: #9ca3af !important;
        }
      `}</style>

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
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                All Tools & Equipment
              </h1>
              <p className="text-gray-600 font-medium mt-1">Company-wide equipment inventory and assignments</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user?.role === 'admin' && (
              <button
                onClick={() => setShowAddModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Equipment
              </button>
            )}
            {user?.role === 'admin' && (
              <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg">
                👑 ADMIN VIEW
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">Total Equipment</p>
                <p className="text-indigo-600 text-3xl font-bold">{stats.total}</p>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">Available</p>
                <p className="text-green-600 text-3xl font-bold">{stats.available}</p>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">In Use</p>
                <p className="text-blue-600 text-3xl font-bold">{stats.inUse}</p>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">Maintenance</p>
                <p className="text-orange-600 text-3xl font-bold">{stats.maintenance}</p>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 mb-6 shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search Bar */}
            <div className="lg:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Search Equipment</label>
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name, brand, serial, operator, or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white border-2 border-gray-300 rounded-xl font-medium focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Filter by Operator */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Filter by Operator</label>
              <select
                value={selectedOperator}
                onChange={(e) => setSelectedOperator(e.target.value)}
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl font-medium focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Operators</option>
                {operators.map(op => (
                  <option key={op} value={op}>{op}</option>
                ))}
                <option value="unassigned">Unassigned</option>
              </select>
            </div>

            {/* Filter by Type */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Equipment Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as EquipmentType | 'all')}
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl font-medium focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="tool">Tools</option>
                <option value="blade">Blades/Bits</option>
                <option value="vehicle">Vehicles</option>
                <option value="safety">Safety Equipment</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* Status Filter Pills */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <label className="block text-sm font-semibold text-gray-700 mb-3">Filter by Status</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                  filterStatus === 'all'
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All Status
              </button>
              <button
                onClick={() => setFilterStatus('available')}
                className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                  filterStatus === 'available'
                    ? 'bg-green-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                ✓ Available
              </button>
              <button
                onClick={() => setFilterStatus('in_use')}
                className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                  filterStatus === 'in_use'
                    ? 'bg-blue-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                🔧 In Use
              </button>
              <button
                onClick={() => setFilterStatus('maintenance')}
                className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                  filterStatus === 'maintenance'
                    ? 'bg-orange-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                ⚠️ Maintenance
              </button>
              <button
                onClick={() => setFilterStatus('retired')}
                className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                  filterStatus === 'retired'
                    ? 'bg-gray-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                📦 Retired
              </button>
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-4">
          <p className="text-gray-700 font-semibold">
            Showing {filteredEquipment.length} of {equipment.length} equipment items
          </p>
        </div>

        {/* Equipment Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEquipment.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-white rounded-2xl border-2 border-gray-200">
              <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-gray-600 font-medium text-lg">No equipment found matching your filters</p>
              <p className="text-gray-500 text-sm mt-2">Try adjusting your search or filters</p>
            </div>
          ) : (
            filteredEquipment.map(item => {
              const statusConfig = getStatusConfig(item.status);
              const typeConfig = getTypeConfig(item.type);

              return (
                <div
                  key={item.id}
                  onClick={() => user?.role === 'admin' && handleOpenManageModal(item)}
                  className={`bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] ${
                    user?.role === 'admin' ? 'cursor-pointer' : ''
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`text-3xl ${typeConfig.color}`}>{typeConfig.icon}</div>
                      <div>
                        <h3 className="font-bold text-gray-800 text-lg">{item.name}</h3>
                        <p className="text-sm text-gray-500">{typeConfig.label}</p>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="mb-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border-2 ${statusConfig.color}`}>
                      {statusConfig.icon} {statusConfig.label}
                    </span>
                  </div>

                  {/* Equipment Details */}
                  <div className="space-y-2 mb-4">
                    {item.brand && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600 font-medium">Brand:</span>
                        <span className="text-gray-800 font-semibold">{item.brand} {item.model}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600 font-medium">Serial:</span>
                      <span className="text-gray-800 font-mono text-xs">{item.serialNumber}</span>
                    </div>
                    {item.location && (
                      <div className="flex items-center gap-2 text-sm">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-gray-700 font-medium text-xs">{item.location}</span>
                      </div>
                    )}
                  </div>

                  {/* Assignment Info */}
                  {item.assignedTo ? (
                    <div className="bg-blue-50 rounded-xl p-3 mb-4 border border-blue-200">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="text-xs font-semibold text-blue-700 uppercase">Assigned To</span>
                      </div>
                      <p className="text-sm font-bold text-blue-900">{item.assignedTo}</p>
                      {item.assignedToRole && (
                        <p className="text-xs text-blue-600 capitalize">{item.assignedToRole}</p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-green-50 rounded-xl p-3 mb-4 border border-green-200">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm font-bold text-green-700">Unassigned - Available</span>
                      </div>
                    </div>
                  )}

                  {/* Usage Stats (for blades) */}
                  {item.type === 'blade' && item.totalUsage !== undefined && (
                    <div className="bg-purple-50 rounded-xl p-3 mb-4 border border-purple-200">
                      <p className="text-xs font-semibold text-purple-700 uppercase mb-1">Total Usage</p>
                      <p className="text-2xl font-bold text-purple-900">{item.totalUsage.toLocaleString()}</p>
                      <p className="text-xs text-purple-600">Linear feet / inches</p>
                    </div>
                  )}

                  {/* Last Used */}
                  {item.lastUsed && (
                    <div className="text-xs text-gray-500">
                      Last used: {new Date(item.lastUsed).toLocaleDateString()}
                    </div>
                  )}

                  {/* Notes */}
                  {item.notes && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600 italic">{item.notes}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Manage Equipment Modal */}
        {showManageModal && selectedEquipment && user?.role === 'admin' && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h3 className="text-2xl font-bold text-gray-800 mb-2">Manage Equipment</h3>
                <p className="text-gray-600 mb-6">
                  {selectedEquipment.name} - {selectedEquipment.serialNumber}
                </p>

                {/* Equipment Details */}
                <div className="bg-blue-50 rounded-xl p-4 mb-6 border border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-3">Current Status</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Status:</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        selectedEquipment.status === 'available' ? 'bg-green-100 text-green-700' :
                        selectedEquipment.status === 'in_use' ? 'bg-blue-100 text-blue-700' :
                        selectedEquipment.status === 'maintenance' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {selectedEquipment.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Assigned to:</span>
                      <span className="text-gray-800 font-semibold">
                        {selectedEquipment.assignedTo || 'Unassigned'}
                      </span>
                    </div>
                    {selectedEquipment.location && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Location:</span>
                        <span className="text-gray-800 font-semibold">{selectedEquipment.location}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Change Assignment */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Change Assignment
                  </label>
                  <select
                    value={newAssignedTo}
                    onChange={(e) => setNewAssignedTo(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Unassigned</option>
                    {operators.map(op => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleChangeAssignment}
                    className="w-full mt-3 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-all"
                  >
                    Update Assignment
                  </button>
                </div>

                {/* Retire Equipment */}
                {selectedEquipment.status !== 'retired' && (
                  <div className="mb-6 bg-red-50 rounded-xl p-4 border border-red-200">
                    <h4 className="font-semibold text-red-900 mb-2">Retire Equipment</h4>
                    <p className="text-sm text-red-700 mb-3">
                      This will mark the equipment as retired and remove any assignments.
                    </p>
                    <button
                      onClick={handleRetireEquipment}
                      className="w-full px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-all"
                    >
                      Retire Equipment
                    </button>
                  </div>
                )}

                {/* Close Button */}
                <button
                  onClick={() => {
                    setShowManageModal(false);
                    setSelectedEquipment(null);
                    setNewAssignedTo('');
                  }}
                  className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Equipment Modal */}
        {showAddModal && user?.role === 'admin' && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">Add New Equipment</h3>

                <div className="space-y-4">
                  {/* Equipment Name */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Equipment Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={newEquipmentForm.name}
                      onChange={(e) => setNewEquipmentForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                      placeholder="e.g., Wall Saw - Husqvarna 24 inch"
                    />
                  </div>

                  {/* Equipment Type */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Equipment Type
                    </label>
                    <select
                      value={newEquipmentForm.type}
                      onChange={(e) => setNewEquipmentForm(prev => ({ ...prev, type: e.target.value as EquipmentType }))}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                    >
                      <option value="tool">Tool</option>
                      <option value="blade">Blade/Bit</option>
                      <option value="vehicle">Vehicle</option>
                      <option value="safety">Safety Equipment</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Brand & Model */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Brand
                      </label>
                      <input
                        type="text"
                        value={newEquipmentForm.brand}
                        onChange={(e) => setNewEquipmentForm(prev => ({ ...prev, brand: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                        placeholder="e.g., Husqvarna"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Model
                      </label>
                      <input
                        type="text"
                        value={newEquipmentForm.model}
                        onChange={(e) => setNewEquipmentForm(prev => ({ ...prev, model: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                        placeholder="e.g., WS-440"
                      />
                    </div>
                  </div>

                  {/* Serial Number */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Serial Number <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={newEquipmentForm.serialNumber}
                      onChange={(e) => setNewEquipmentForm(prev => ({ ...prev, serialNumber: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                      placeholder="e.g., HV-WS-001"
                    />
                  </div>

                  {/* Status & Assignment */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Initial Status
                      </label>
                      <select
                        value={newEquipmentForm.status}
                        onChange={(e) => setNewEquipmentForm(prev => ({ ...prev, status: e.target.value as EquipmentStatus }))}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                      >
                        <option value="available">Available</option>
                        <option value="in_use">In Use</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Assign to Operator
                      </label>
                      <select
                        value={newEquipmentForm.assignedTo}
                        onChange={(e) => setNewEquipmentForm(prev => ({ ...prev, assignedTo: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">Unassigned</option>
                        {operators.map(op => (
                          <option key={op} value={op}>{op}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Location */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Location
                    </label>
                    <input
                      type="text"
                      value={newEquipmentForm.location}
                      onChange={(e) => setNewEquipmentForm(prev => ({ ...prev, location: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                      placeholder="e.g., Tool Shed A"
                    />
                  </div>

                  {/* Purchase Date */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Purchase Date
                    </label>
                    <input
                      type="date"
                      value={newEquipmentForm.purchaseDate}
                      onChange={(e) => setNewEquipmentForm(prev => ({ ...prev, purchaseDate: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Notes
                    </label>
                    <textarea
                      value={newEquipmentForm.notes}
                      onChange={(e) => setNewEquipmentForm(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                      placeholder="Any additional information..."
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddEquipment}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-colors font-semibold"
                  >
                    Add Equipment
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
