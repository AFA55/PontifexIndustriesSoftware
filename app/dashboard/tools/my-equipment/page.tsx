'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  Search,
  Filter,
  Grid3x3,
  List,
  SlidersHorizontal,
  Activity,
  TrendingUp,
  Package,
  Wrench,
  CheckCircle,
  AlertTriangle,
  Download,
  Upload
} from 'lucide-react'
import { getUserEquipment, updateEquipment, deleteEquipment } from '@/lib/supabase-equipment'
import EquipmentCard from '@/components/EquipmentCard'
import EquipmentDetailModal from '@/components/EquipmentDetailModal'
import AssignmentModal from '@/components/AssignmentModal'

type Equipment = {
  id: string
  name: string
  type: string
  serial_number: string
  status: 'Available' | 'In Use' | 'Maintenance' | 'Reserved' | 'Out of Service'
  assigned_to: string
  location?: string
  last_service?: string
  next_service?: string
  hours_used?: number
  efficiency?: number
  notes?: string
}

export default function MyEquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [filteredEquipment, setFilteredEquipment] = useState<Equipment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [assignmentEquipment, setAssignmentEquipment] = useState<Equipment | null>(null)
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false)

  const operators = ['Shop', 'Rex Z', 'Skinny H', 'Brandon R', 'Matt M']

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      setCurrentUser(JSON.parse(userStr))
    }
    fetchEquipment()
  }, [])

  useEffect(() => {
    filterEquipment()
  }, [equipment, searchTerm, statusFilter, typeFilter])

  const fetchEquipment = async () => {
    setIsLoading(true)
    const result = await getUserEquipment()
    if (result.success) {
      // Add mock data for hours_used and efficiency if not present
      const enhancedEquipment = (result.data || []).map((item: Equipment) => ({
        ...item,
        hours_used: item.hours_used || Math.floor(Math.random() * 500),
        efficiency: item.efficiency || Math.floor(Math.random() * 20) + 80,
        status: item.status || 'Available'
      }))
      setEquipment(enhancedEquipment)
    }
    setIsLoading(false)
  }

  const filterEquipment = () => {
    let filtered = [...equipment]

    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.assigned_to.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(item => item.status === statusFilter)
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(item => item.type === typeFilter)
    }

    setFilteredEquipment(filtered)
  }

  const handleAssign = async (id: string, operator: string) => {
    const result = await updateEquipment(id, { assigned_to: operator })
    if (result.success) {
      await fetchEquipment()
    }
  }

  const handleStatusChange = async (id: string, status: string) => {
    const result = await updateEquipment(id, { status: status as Equipment['status'] })
    if (result.success) {
      await fetchEquipment()
    }
  }

  const handleServiceRequest = async (id: string) => {
    const result = await updateEquipment(id, {
      status: 'Maintenance' as Equipment['status'],
      assigned_to: 'Shop'
    })
    if (result.success) {
      await fetchEquipment()
    }
  }

  const handleCardClick = (equipment: Equipment) => {
    console.log('Card clicked:', equipment)
    setSelectedEquipment(equipment)
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setSelectedEquipment(null)
  }

  const handleEquipmentUpdate = async (id: string, updates: Partial<Equipment>) => {
    const result = await updateEquipment(id, updates)
    if (result.success) {
      await fetchEquipment()
      // Update selected equipment if it's the same one
      if (selectedEquipment && selectedEquipment.id === id) {
        setSelectedEquipment({ ...selectedEquipment, ...updates })
      }
    }
  }

  const handleOpenAssignment = (equipment: Equipment) => {
    setAssignmentEquipment(equipment)
    setIsAssignmentModalOpen(true)
  }

  const handleCloseAssignment = () => {
    setIsAssignmentModalOpen(false)
    setAssignmentEquipment(null)
  }

  const handleAssignmentConfirm = async (operatorName: string, note?: string, location?: string) => {
    if (!assignmentEquipment) return

    const updates: Partial<Equipment> = {
      assigned_to: operatorName
    }

    if (location) {
      updates.location = location
    }

    const result = await updateEquipment(assignmentEquipment.id, updates)
    if (result.success) {
      await fetchEquipment()
      // TODO: Save assignment note to database
      console.log('Assignment note:', note)
    }
  }

  const isOperator = currentUser && operators.includes(currentUser.name)

  // Calculate statistics
  const stats = {
    total: equipment.length,
    available: equipment.filter(e => e.status === 'Available').length,
    inUse: equipment.filter(e => e.status === 'In Use').length,
    maintenance: equipment.filter(e => e.status === 'Maintenance').length,
    avgEfficiency: equipment.length > 0
      ? Math.round(equipment.reduce((sum, e) => sum + (e.efficiency || 0), 0) / equipment.length)
      : 0
  }

  // Get unique equipment types
  const equipmentTypes = Array.from(new Set(equipment.map(e => e.type).filter(Boolean)))

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-float-slow" style={{ animationDelay: '5s' }} />
      </div>

      <div className="relative z-10 p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="p-3 bg-gray-900/60 backdrop-blur-xl rounded-xl border border-white/10 hover:bg-white/10 transition-all min-w-[48px] min-h-[48px] flex items-center justify-center"
              >
                <ArrowLeft className="w-5 h-5 text-cyan-400" />
              </Link>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-white">
                  {isOperator ? 'My Equipment' : 'Equipment Fleet'}
                </h1>
                <p className="text-blue-200 mt-1">
                  {isOperator
                    ? `Equipment assigned to ${currentUser.name}`
                    : 'Real-time fleet management & monitoring'}
                </p>
              </div>
            </div>

            <Link
              href="/dashboard/tools/add-equipment"
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/25 min-h-[48px]"
            >
              <Plus className="w-5 h-5" />
              <span className="font-semibold">Add Equipment</span>
            </Link>
          </div>

          {/* Statistics Dashboard */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-gray-900/60 backdrop-blur-lg rounded-xl border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Package className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Total Fleet</p>
                  <p className="text-2xl font-bold text-white">{stats.total}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-900/60 backdrop-blur-lg rounded-xl border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Available</p>
                  <p className="text-2xl font-bold text-white">{stats.available}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-900/60 backdrop-blur-lg rounded-xl border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/20 rounded-lg">
                  <Activity className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">In Use</p>
                  <p className="text-2xl font-bold text-white">{stats.inUse}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-900/60 backdrop-blur-lg rounded-xl border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <Wrench className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Service</p>
                  <p className="text-2xl font-bold text-white">{stats.maintenance}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-900/60 backdrop-blur-lg rounded-xl border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Efficiency</p>
                  <p className="text-2xl font-bold text-white">{stats.avgEfficiency}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Filters Bar */}
          <div className="bg-gray-900/60 backdrop-blur-lg rounded-2xl border border-white/10 p-4 mb-6">
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Search Bar */}
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 w-5 h-5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search equipment, serial numbers, operators..."
                  className="w-full bg-black/30 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400 focus:bg-black/50 transition-all min-h-[48px]"
                />
              </div>

              {/* Filter Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="px-4 py-3 bg-black/30 hover:bg-cyan-500/20 rounded-xl border border-white/10 hover:border-cyan-500/50 transition-all flex items-center gap-2 min-h-[48px]"
                >
                  <SlidersHorizontal className="w-5 h-5 text-cyan-400" />
                  <span className="text-cyan-300 font-medium">Filters</span>
                  {(statusFilter !== 'all' || typeFilter !== 'all') && (
                    <span className="px-2 py-0.5 bg-cyan-500/30 rounded-full text-xs text-cyan-300">
                      Active
                    </span>
                  )}
                </button>

                {/* View Mode Toggle */}
                <div className="flex bg-black/30 rounded-xl border border-white/10 overflow-hidden">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`px-4 py-3 flex items-center gap-2 transition-all min-h-[48px] ${
                      viewMode === 'grid'
                        ? 'bg-cyan-500/20 text-cyan-300 border-r border-cyan-500/30'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Grid3x3 className="w-5 h-5" />
                    <span className="hidden md:inline">Grid</span>
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`px-4 py-3 flex items-center gap-2 transition-all min-h-[48px] ${
                      viewMode === 'list'
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <List className="w-5 h-5" />
                    <span className="hidden md:inline">List</span>
                  </button>
                </div>

                {/* Export Button */}
                <button className="px-4 py-3 bg-black/30 hover:bg-green-500/20 rounded-xl border border-white/10 hover:border-green-500/50 transition-all flex items-center gap-2 min-h-[48px]">
                  <Download className="w-5 h-5 text-green-400" />
                  <span className="text-green-300 font-medium hidden md:inline">Export</span>
                </button>
              </div>
            </div>

            {/* Expandable Filter Options */}
            {showFilters && (
              <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 transition-all min-h-[48px]"
                  >
                    <option value="all" className="bg-gray-900">All Status</option>
                    <option value="Available" className="bg-gray-900">Available</option>
                    <option value="In Use" className="bg-gray-900">In Use</option>
                    <option value="Maintenance" className="bg-gray-900">Maintenance</option>
                    <option value="Reserved" className="bg-gray-900">Reserved</option>
                    <option value="Out of Service" className="bg-gray-900">Out of Service</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-2 block">Equipment Type</label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 transition-all min-h-[48px]"
                  >
                    <option value="all" className="bg-gray-900">All Types</option>
                    {equipmentTypes.map(type => (
                      <option key={type} value={type} className="bg-gray-900">{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-2 block">Quick Actions</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setStatusFilter('all')
                        setTypeFilter('all')
                        setSearchTerm('')
                      }}
                      className="flex-1 px-4 py-3 bg-black/30 hover:bg-red-500/20 rounded-xl border border-white/10 hover:border-red-500/50 transition-all text-red-300 font-medium min-h-[48px]"
                    >
                      Clear All
                    </button>
                    <button className="flex-1 px-4 py-3 bg-black/30 hover:bg-blue-500/20 rounded-xl border border-white/10 hover:border-blue-500/50 transition-all text-blue-300 font-medium min-h-[48px]">
                      Save View
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Equipment Grid/List */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-cyan-500/20 rounded-full animate-spin border-t-cyan-400" />
                <div className="absolute inset-0 w-20 h-20 border-4 border-blue-500/20 rounded-full animate-spin border-t-blue-400 animation-delay-150" />
              </div>
              <p className="text-blue-200 mt-6 text-lg">Loading equipment fleet...</p>
            </div>
          ) : filteredEquipment.length === 0 ? (
            <div className="bg-gray-900/60 backdrop-blur-lg rounded-2xl border border-white/10 p-20 text-center">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-cyan-500/10 rounded-full mb-6">
                <Package className="w-12 h-12 text-cyan-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">No Equipment Found</h3>
              <p className="text-blue-200 text-lg mb-6">
                {isOperator
                  ? 'No equipment is currently assigned to you'
                  : searchTerm || statusFilter !== 'all' || typeFilter !== 'all'
                  ? 'No equipment matches your search criteria'
                  : 'Add your first equipment to get started'}
              </p>
              {(searchTerm || statusFilter !== 'all' || typeFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchTerm('')
                    setStatusFilter('all')
                    setTypeFilter('all')
                  }}
                  className="px-6 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-xl border border-cyan-500/50 text-cyan-300 font-medium transition-all"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredEquipment.map((item) => (
                <EquipmentCard
                  key={item.id}
                  equipment={item}
                  onAssign={handleAssign}
                  onStatusChange={handleStatusChange}
                  onServiceRequest={handleServiceRequest}
                  onCardClick={handleCardClick}
                  onOpenAssignment={handleOpenAssignment}
                  operators={operators}
                />
              ))}
            </div>
          ) : (
            // List View (simplified for now)
            <div className="space-y-4">
              {filteredEquipment.map((item) => (
                <div key={item.id} className="bg-gray-900/60 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-white">{item.name}</h3>
                      <p className="text-cyan-400">{item.type} • {item.serial_number}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-white">Assigned to: {item.assigned_to}</span>
                      <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                        item.status === 'Available' ? 'bg-green-500/20 text-green-300' :
                        item.status === 'In Use' ? 'bg-blue-500/20 text-blue-300' :
                        item.status === 'Maintenance' ? 'bg-orange-500/20 text-orange-300' :
                        'bg-gray-500/20 text-gray-300'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Equipment Detail Modal */}
      {selectedEquipment && (
        <EquipmentDetailModal
          equipment={selectedEquipment}
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onUpdate={handleEquipmentUpdate}
        />
      )}

      {/* Assignment Modal */}
      {assignmentEquipment && (
        <AssignmentModal
          equipment={assignmentEquipment}
          isOpen={isAssignmentModalOpen}
          onClose={handleCloseAssignment}
          onAssign={handleAssignmentConfirm}
        />
      )}

      <style jsx>{`
        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        .animate-float-slow {
          animation: float-slow 20s ease-in-out infinite;
        }
        .animation-delay-150 {
          animation-delay: 150ms;
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </div>
  )
}