'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';

// Blade types
type BladeType = 'wall_saw' | 'hand_saw' | 'slab_saw' | 'chainsaw' | 'core_bit';

interface Blade {
  id: string;
  type: BladeType;
  brandName: string;
  size: string;
  serialNumber: string;
  purchaseDate: string;
  cost?: number; // Admin only
  status: 'active' | 'retired';

  // Usage tracking
  totalLinearFeet?: number; // For saws
  totalInches?: number; // For core bits and chainsaws
  holesCount?: number; // For core bits

  // Metadata
  assignedTo?: string;
  createdAt: string;
  retiredAt?: string;
  retirementReason?: string;
  retirementPhotoUrl?: string;
  notes?: string;
}

interface NewBladeForm {
  type: BladeType | '';
  brandName: string;
  size: string;
  serialNumber: string;
  purchaseDate: string;
  notes: string;
  assignmentType: 'operator' | 'equipment' | 'unassigned';
  assignedOperator: string;
  assignedEquipmentId: string;
}

export default function ManageBladesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'retired' | 'analytics'>('active');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRetireModal, setShowRetireModal] = useState(false);
  const [showCostModal, setShowCostModal] = useState(false);
  const [selectedBlade, setSelectedBlade] = useState<Blade | null>(null);
  const [filterType, setFilterType] = useState<BladeType | 'all'>('all');
  const [editingCost, setEditingCost] = useState<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
  }, []);

  // Retirement form
  const [retirementReason, setRetirementReason] = useState('');
  const [retirementPhoto, setRetirementPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');

  // New blade form
  const [newBladeForm, setNewBladeForm] = useState<NewBladeForm>({
    type: '',
    brandName: '',
    size: '',
    serialNumber: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    notes: '',
    assignmentType: 'unassigned',
    assignedOperator: '',
    assignedEquipmentId: ''
  });

  // Mock operators list
  const operators = ['ANDRES GUERRERO-C', 'CARLOS MARTINEZ', 'MIKE JOHNSON', 'SARAH WILLIAMS'];

  // Mock data - in production, this would come from database
  const [blades, setBlades] = useState<Blade[]>([
    {
      id: '1',
      type: 'wall_saw',
      brandName: 'Husqvarna',
      size: '24"',
      serialNumber: 'HV-24-001',
      purchaseDate: '2024-01-15',
      cost: 450,
      status: 'active',
      totalLinearFeet: 2450,
      assignedTo: 'ANDRES GUERRERO-C',
      createdAt: '2024-01-15',
      notes: 'Diamond blade for reinforced concrete'
    },
    {
      id: '2',
      type: 'core_bit',
      brandName: 'Hilti',
      size: '4"',
      serialNumber: 'HI-4-002',
      purchaseDate: '2024-02-10',
      cost: 180,
      status: 'active',
      totalInches: 840,
      holesCount: 45,
      assignedTo: 'CARLOS MARTINEZ',
      createdAt: '2024-02-10'
    },
    {
      id: '3',
      type: 'hand_saw',
      brandName: 'Stihl',
      size: '20"',
      serialNumber: 'ST-20-003',
      purchaseDate: '2023-11-20',
      cost: 320,
      status: 'retired',
      totalLinearFeet: 4200,
      createdAt: '2023-11-20',
      retiredAt: '2024-11-01',
      retirementReason: 'Worn out - exceeded expected lifespan',
      notes: 'Performed well throughout life'
    }
  ]);

  const bladeTypeConfig: Record<BladeType, { label: string; icon: string; unit: string; color: string }> = {
    wall_saw: { label: 'Wall Saw Blade', icon: '🔷', unit: 'Linear Feet', color: 'blue' },
    hand_saw: { label: 'Hand Saw Blade', icon: '🔶', unit: 'Linear Feet', color: 'orange' },
    slab_saw: { label: 'Slab Saw Blade', icon: '🔸', unit: 'Linear Feet', color: 'yellow' },
    chainsaw: { label: 'Chainsaw Chain', icon: '⛓️', unit: 'Inches', color: 'gray' },
    core_bit: { label: 'Core Drill Bit', icon: '⚙️', unit: 'Inches', color: 'purple' }
  };

  const sizeOptions: Record<BladeType, string[]> = {
    wall_saw: ['14"', '16"', '18"', '20"', '24"', '30"', '36"'],
    hand_saw: ['20"', '24"', '30"'],
    slab_saw: ['14"', '16"', '18"', '20"', '24"', '30"'],
    chainsaw: ['10"', '12"', '15"', '20"', '24"'],
    core_bit: ['1/2"', '5/8"', '3/4"', '1"', '1-1/4"', '1-1/2"', '2"', '2-1/2"', '3"', '4"', '5"', '6"', '8"', '10"', '12"']
  };

  const filteredBlades = blades.filter(blade => {
    if (activeTab === 'analytics') return true; // Show all for analytics

    const statusMatch = blade.status === activeTab;
    const typeMatch = filterType === 'all' || blade.type === filterType;
    const searchMatch = searchQuery === '' ||
      blade.brandName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      blade.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      blade.size.toLowerCase().includes(searchQuery.toLowerCase()) ||
      blade.assignedTo?.toLowerCase().includes(searchQuery.toLowerCase());

    return statusMatch && typeMatch && searchMatch;
  });

  // Analytics calculations
  const brandStats = blades.reduce((acc, blade) => {
    if (!acc[blade.brandName]) {
      acc[blade.brandName] = {
        totalBlades: 0,
        activeBlades: 0,
        retiredBlades: 0,
        totalUsage: 0,
        totalCost: 0,
        avgLifespan: 0
      };
    }
    acc[blade.brandName].totalBlades++;
    if (blade.status === 'active') acc[blade.brandName].activeBlades++;
    if (blade.status === 'retired') acc[blade.brandName].retiredBlades++;
    acc[blade.brandName].totalUsage += (blade.totalLinearFeet || 0) + (blade.totalInches || 0);
    acc[blade.brandName].totalCost += (blade.cost || 0);
    return acc;
  }, {} as Record<string, any>);

  // Calculate average lifespan for retired blades
  Object.keys(brandStats).forEach(brand => {
    const retiredBladesForBrand = blades.filter(b => b.brandName === brand && b.status === 'retired');
    if (retiredBladesForBrand.length > 0) {
      const totalLifespan = retiredBladesForBrand.reduce((sum, b) => {
        return sum + ((b.totalLinearFeet || 0) + (b.totalInches || 0));
      }, 0);
      brandStats[brand].avgLifespan = Math.round(totalLifespan / retiredBladesForBrand.length);
    }
  });

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRetirementPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRetireBlade = () => {
    if (!selectedBlade || !retirementReason.trim()) {
      alert('Please provide a retirement reason');
      return;
    }

    // Update blade status
    setBlades(prev => prev.map(b =>
      b.id === selectedBlade.id
        ? {
            ...b,
            status: 'retired',
            retiredAt: new Date().toISOString(),
            retirementReason,
            retirementPhotoUrl: photoPreview
          }
        : b
    ));

    // Reset form
    setShowRetireModal(false);
    setSelectedBlade(null);
    setRetirementReason('');
    setRetirementPhoto(null);
    setPhotoPreview('');
  };

  const handleAddBlade = () => {
    if (!newBladeForm.type || !newBladeForm.brandName || !newBladeForm.size || !newBladeForm.serialNumber) {
      alert('Please fill in all required fields');
      return;
    }

    const newBlade: Blade = {
      id: Date.now().toString(),
      type: newBladeForm.type,
      brandName: newBladeForm.brandName,
      size: newBladeForm.size,
      serialNumber: newBladeForm.serialNumber,
      purchaseDate: newBladeForm.purchaseDate,
      status: 'active',
      createdAt: new Date().toISOString(),
      totalLinearFeet: newBladeForm.type !== 'core_bit' && newBladeForm.type !== 'chainsaw' ? 0 : undefined,
      totalInches: newBladeForm.type === 'core_bit' || newBladeForm.type === 'chainsaw' ? 0 : undefined,
      holesCount: newBladeForm.type === 'core_bit' ? 0 : undefined,
      notes: newBladeForm.notes || undefined
    };

    setBlades(prev => [...prev, newBlade]);

    // Reset form
    setNewBladeForm({
      type: '',
      brandName: '',
      size: '',
      serialNumber: '',
      purchaseDate: new Date().toISOString().split('T')[0],
      notes: '',
      assignmentType: 'unassigned',
      assignedOperator: '',
      assignedEquipmentId: ''
    });
    setShowAddModal(false);
  };

  const handleUpdateCost = () => {
    if (!selectedBlade || editingCost === undefined) {
      alert('Please enter a valid cost');
      return;
    }

    setBlades(prev => prev.map(b =>
      b.id === selectedBlade.id
        ? { ...b, cost: editingCost }
        : b
    ));

    setShowCostModal(false);
    setSelectedBlade(null);
    setEditingCost(undefined);
  };

  const getUsageDisplay = (blade: Blade) => {
    if (blade.type === 'core_bit') {
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-purple-600">{blade.holesCount || 0}</span>
            <span className="text-sm text-gray-600">holes</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-gray-700">{blade.totalInches || 0}"</span>
            <span className="text-xs text-gray-500">total depth</span>
          </div>
        </div>
      );
    } else if (blade.type === 'chainsaw') {
      return (
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-gray-700">{blade.totalInches || 0}"</span>
          <span className="text-sm text-gray-600">inches cut</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-blue-600">{blade.totalLinearFeet || 0}</span>
          <span className="text-sm text-gray-600">linear feet</span>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Global input text color fix */}
      <style jsx global>{`
        input[type="text"],
        input[type="date"],
        input[type="file"],
        textarea,
        select,
        option {
          color: #111827 !important;
        }
        input::placeholder,
        textarea::placeholder {
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
              href="/dashboard/tools"
              className="group p-3 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200 text-gray-700 hover:bg-white transition-all duration-300 hover:scale-105 shadow-sm"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                Blade & Bit Management
              </h1>
              <p className="text-gray-600 font-medium mt-1">Track blade usage and lifecycle</p>
            </div>
          </div>

          {user?.role === 'admin' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add New Blade/Bit
            </button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">Active Blades</p>
                <p className="text-green-600 text-3xl font-bold">
                  {blades.filter(b => b.status === 'active').length}
                </p>
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
                <p className="text-gray-600 text-sm font-semibold">Retired Blades</p>
                <p className="text-gray-700 text-3xl font-bold">
                  {blades.filter(b => b.status === 'retired').length}
                </p>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-gray-500 to-gray-600 rounded-2xl flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">Total Linear Feet</p>
                <p className="text-blue-600 text-3xl font-bold">
                  {blades.reduce((sum, b) => sum + (b.totalLinearFeet || 0), 0).toLocaleString()}
                </p>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">Holes Drilled</p>
                <p className="text-purple-600 text-3xl font-bold">
                  {blades.reduce((sum, b) => sum + (b.holesCount || 0), 0).toLocaleString()}
                </p>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs & Filters */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-4 mb-6 shadow-lg">
          <div className="flex flex-col gap-4">
            {/* Status Tabs */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setActiveTab('active')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                  activeTab === 'active'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setActiveTab('retired')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                  activeTab === 'retired'
                    ? 'bg-gradient-to-r from-gray-500 to-gray-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Retired
              </button>
              {user?.role === 'admin' && (
                <button
                  onClick={() => setActiveTab('analytics')}
                  className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                    activeTab === 'analytics'
                      ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  📊 Analytics
                </button>
              )}
            </div>

            {/* Search Bar and Filters */}
            {activeTab !== 'analytics' && (
              <div className="flex flex-col md:flex-row gap-3">
                {/* Search Bar */}
                <div className="flex-1 relative">
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search by brand, serial, size, or operator..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white border-2 border-gray-300 rounded-xl font-medium focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Type Filter */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">Filter by Type:</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as BladeType | 'all')}
                    className="px-4 py-3 bg-white border-2 border-gray-300 rounded-xl font-medium focus:border-blue-500 focus:outline-none"
                  >
                    <option value="all">All Types</option>
                    {Object.entries(bladeTypeConfig).map(([key, config]) => (
                      <option key={key} value={key}>{config.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Analytics View (Admin Only) */}
        {activeTab === 'analytics' && user?.role === 'admin' && (
          <div className="space-y-6">
            {/* Brand Performance Header */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-6 text-white shadow-xl">
              <h2 className="text-3xl font-bold mb-2">📊 Blade Analytics & Performance</h2>
              <p className="text-purple-100">Compare brand performance and lifecycle statistics</p>
            </div>

            {/* Brand Comparison Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(brandStats).map(([brand, stats]) => (
                <div key={brand} className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg hover:shadow-xl transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-bold text-gray-800">{brand}</h3>
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 font-medium">Total Blades</span>
                      <span className="text-xl font-bold text-gray-800">{stats.totalBlades}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 font-medium">Active</span>
                      <span className="text-lg font-bold text-green-600">{stats.activeBlades}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 font-medium">Retired</span>
                      <span className="text-lg font-bold text-gray-600">{stats.retiredBlades}</span>
                    </div>

                    <div className="border-t-2 border-gray-200 pt-3 mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600 font-medium">Avg Lifespan</span>
                        <span className="text-lg font-bold text-blue-600">
                          {stats.avgLifespan > 0 ? `${stats.avgLifespan.toLocaleString()}` : 'N/A'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">Total usage across retired blades</p>
                    </div>

                    <div className="border-t-2 border-gray-200 pt-3 mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600 font-medium">Total Usage</span>
                        <span className="text-lg font-bold text-purple-600">
                          {stats.totalUsage.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">Linear feet + inches drilled</p>
                    </div>

                    {stats.totalCost > 0 && (
                      <div className="border-t-2 border-gray-200 pt-3 mt-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-600 font-medium">Total Investment</span>
                          <span className="text-lg font-bold text-green-600">
                            ${stats.totalCost.toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          Avg: ${stats.totalBlades > 0 ? Math.round(stats.totalCost / stats.totalBlades) : 0} per blade
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Performance Insights */}
            <div className="bg-blue-50 rounded-2xl border-2 border-blue-200 p-6">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <div>
                  <h4 className="text-lg font-bold text-blue-900 mb-2">Performance Insights</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Brands with higher avg lifespan provide better value over time</li>
                    <li>• Compare total investment vs usage to calculate cost per linear foot</li>
                    <li>• Track retirement patterns to predict replacement schedules</li>
                    <li>• Monitor active blade distribution across operators for optimal allocation</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Blades Grid */}
        {activeTab !== 'analytics' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBlades.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <p className="text-gray-600 font-medium text-lg">No {activeTab} blades found</p>
              </div>
            ) : (
              filteredBlades.map(blade => {
              const config = bladeTypeConfig[blade.type];
              return (
                <div
                  key={blade.id}
                  className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="text-4xl">{config.icon}</div>
                      <div>
                        <h3 className="font-bold text-gray-800 text-sm">{config.label}</h3>
                        <p className="text-3xl font-black text-blue-600">{blade.size}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      blade.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {blade.status === 'active' ? 'ACTIVE' : 'RETIRED'}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600 font-medium">Brand:</span>
                      <span className="text-gray-800 font-semibold">{blade.brandName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600 font-medium">S/N:</span>
                      <span className="text-gray-800 font-mono">{blade.serialNumber}</span>
                    </div>
                    {blade.assignedTo && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600 font-medium">Assigned to:</span>
                        <span className="text-blue-600 font-semibold">{blade.assignedTo}</span>
                      </div>
                    )}
                  </div>

                  {/* Usage Stats */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 mb-4">
                    <p className="text-xs text-gray-600 font-semibold mb-2 uppercase">Total Usage</p>
                    {getUsageDisplay(blade)}
                  </div>

                  {/* Dates */}
                  <div className="text-xs text-gray-500 mb-4 space-y-1">
                    <p>Purchased: {new Date(blade.purchaseDate).toLocaleDateString()}</p>
                    {blade.retiredAt && (
                      <p>Retired: {new Date(blade.retiredAt).toLocaleDateString()}</p>
                    )}
                  </div>

                  {/* Retirement Info */}
                  {blade.status === 'retired' && blade.retirementReason && (
                    <div className="bg-red-50 rounded-xl p-3 mb-4 border border-red-200">
                      <p className="text-xs font-semibold text-red-700 mb-1">Retirement Reason:</p>
                      <p className="text-sm text-red-600">{blade.retirementReason}</p>
                      {blade.retirementPhotoUrl && (
                        <img
                          src={blade.retirementPhotoUrl}
                          alt="Retirement condition"
                          className="mt-2 rounded-lg w-full object-cover"
                        />
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="space-y-2">
                    {blade.status === 'active' && (
                      <button
                        onClick={() => {
                          setSelectedBlade(blade);
                          setShowRetireModal(true);
                        }}
                        className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-all"
                      >
                        Retire Blade
                      </button>
                    )}

                    {/* Admin-only cost button */}
                    {user?.role === 'admin' && (
                      <button
                        onClick={() => {
                          setSelectedBlade(blade);
                          setEditingCost(blade.cost);
                          setShowCostModal(true);
                        }}
                        className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {blade.cost ? `Update Cost ($${blade.cost})` : 'Set Cost'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          </div>
        )}

      {/* Add Blade Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-2xl font-bold text-gray-800 mb-6">Add New Blade/Bit</h3>

              <div className="space-y-4">
                {/* Blade Type */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Blade/Bit Type <span className="text-red-600">*</span>
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(bladeTypeConfig).map(([key, config]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setNewBladeForm(prev => ({ ...prev, type: key as BladeType, size: '' }))}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          newBladeForm.type === key
                            ? 'bg-blue-50 border-blue-400 shadow-lg'
                            : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-2xl mb-1">{config.icon}</div>
                        <div className="text-xs font-semibold text-gray-700">{config.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Size */}
                {newBladeForm.type && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Size <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={newBladeForm.size}
                      onChange={(e) => setNewBladeForm(prev => ({ ...prev, size: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Select size...</option>
                      {sizeOptions[newBladeForm.type].map(size => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Brand Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Brand Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={newBladeForm.brandName}
                    onChange={(e) => setNewBladeForm(prev => ({ ...prev, brandName: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                    placeholder="e.g., Husqvarna, Hilti, Stihl"
                  />
                </div>

                {/* Serial Number */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Serial Number <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={newBladeForm.serialNumber}
                    onChange={(e) => setNewBladeForm(prev => ({ ...prev, serialNumber: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                    placeholder="e.g., HV-24-001"
                  />
                </div>

                {/* Purchase Date */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Purchase Date <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    value={newBladeForm.purchaseDate}
                    onChange={(e) => setNewBladeForm(prev => ({ ...prev, purchaseDate: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={newBladeForm.notes}
                    onChange={(e) => setNewBladeForm(prev => ({ ...prev, notes: e.target.value }))}
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
                  onClick={handleAddBlade}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-colors font-semibold"
                >
                  Add Blade/Bit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Retire Blade Modal */}
      {showRetireModal && selectedBlade && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Retire Blade/Bit</h3>
              <p className="text-gray-600 mb-6">
                {selectedBlade.brandName} {selectedBlade.size} - {selectedBlade.serialNumber}
              </p>

              <div className="space-y-4">
                {/* Reason */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Reason for Retirement <span className="text-red-600">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {['Worn out', 'Damaged', 'Broken', 'Lost'].map(reason => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setRetirementReason(reason)}
                        className={`px-4 py-2 rounded-xl border-2 transition-all ${
                          retirementReason === reason
                            ? 'bg-red-50 border-red-400'
                            : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={retirementReason}
                    onChange={(e) => setRetirementReason(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:outline-none"
                    placeholder="Describe the condition and reason for retirement..."
                  />
                </div>

                {/* Photo Upload */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Upload Photo of Condition <span className="text-red-600">*</span>
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoUpload}
                      className="hidden"
                      id="photo-upload"
                    />
                    <label
                      htmlFor="photo-upload"
                      className="cursor-pointer block"
                    >
                      {photoPreview ? (
                        <img src={photoPreview} alt="Preview" className="mx-auto rounded-lg max-h-64 object-cover" />
                      ) : (
                        <div>
                          <svg className="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <p className="text-gray-600 font-semibold">Tap to take photo</p>
                          <p className="text-sm text-gray-500">or choose from library</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowRetireModal(false);
                    setSelectedBlade(null);
                    setRetirementReason('');
                    setRetirementPhoto(null);
                    setPhotoPreview('');
                  }}
                  className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRetireBlade}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-xl hover:from-red-700 hover:to-pink-700 transition-colors font-semibold"
                >
                  Retire Blade
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin-Only Cost Modal */}
      {showCostModal && selectedBlade && user?.role === 'admin' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-800">Set Blade Cost</h3>
                  <p className="text-sm text-gray-600">Admin Only - Not visible to operators</p>
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-4 mb-6 border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold text-blue-800">Blade Information</span>
                </div>
                <p className="text-sm text-blue-700">
                  {selectedBlade.brandName} {selectedBlade.size} - {selectedBlade.serialNumber}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Purchase Cost (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 text-xl font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingCost || ''}
                    onChange={(e) => setEditingCost(parseFloat(e.target.value) || 0)}
                    className="w-full pl-10 pr-4 py-4 text-2xl font-bold border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">This information is only visible to administrators</p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowCostModal(false);
                    setSelectedBlade(null);
                    setEditingCost(undefined);
                  }}
                  className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateCost}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-colors font-semibold"
                >
                  Save Cost
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
