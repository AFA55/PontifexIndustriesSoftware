'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAllEquipment, getEquipmentForUser, updateEquipment, updateEquipmentStatus, type Equipment } from '../../../../lib/supabase-equipment';
import { getCurrentUser } from '../../../../lib/auth';
import EquipmentDetailModal from '../../../../components/EquipmentDetailModal';
import AssignmentModal from '../../../../components/AssignmentModal';

// Status Badge Component with Animations
const StatusBadge = ({ status, animated = true }: { status: string; animated?: boolean }) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'available':
        return {
          colors: 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-400/30 text-green-300',
          animation: animated ? 'animate-pulse' : '',
          icon: (
            <div className="w-2 h-2 bg-green-400 rounded-full animate-ping absolute -top-1 -right-1"></div>
          )
        };
      case 'assigned':
        return {
          colors: 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-400/30 text-blue-300',
          animation: '',
          icon: (
            <svg className="w-3 h-3 ml-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
          )
        };
      case 'maintenance':
        return {
          colors: 'bg-gradient-to-r from-orange-500/20 to-amber-500/20 border-orange-400/30 text-orange-300',
          animation: '',
          icon: (
            <svg className="w-3 h-3 ml-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )
        };
      default:
        return {
          colors: 'bg-gradient-to-r from-gray-500/20 to-slate-500/20 border-gray-400/30 text-gray-300',
          animation: '',
          icon: null
        };
    }
  };

  const config = getStatusConfig(status);
  
  return (
    <div className={`relative inline-flex items-center px-3 py-1.5 rounded-xl border backdrop-blur-sm ${config.colors} ${config.animation} font-medium text-xs tracking-wide`}>
      {status.toUpperCase()}
      {config.icon}
    </div>
  );
};

// Operator Avatar Component
const OperatorAvatar = ({ operator }: { operator: string | null }) => {
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-gradient-to-br from-purple-500 to-pink-500',
      'bg-gradient-to-br from-blue-500 to-cyan-500',
      'bg-gradient-to-br from-green-500 to-teal-500',
      'bg-gradient-to-br from-orange-500 to-red-500',
      'bg-gradient-to-br from-indigo-500 to-purple-500',
    ];
    const hash = name.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  if (!operator || operator === 'Shop') {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-gradient-to-br from-gray-600 to-gray-700 rounded-xl flex items-center justify-center">
          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H3m2 0h4M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 8h1m4 0h1" />
          </svg>
        </div>
        <span className="text-sm text-gray-400">Shop</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <div className={`w-8 h-8 ${getAvatarColor(operator)} rounded-xl flex items-center justify-center shadow-lg`}>
        <span className="text-white text-xs font-bold">{getInitials(operator)}</span>
      </div>
      <span className="text-sm text-white font-medium">{operator}</span>
    </div>
  );
};

// Equipment Metrics Component
const EquipmentMetrics = ({ equipment }: { equipment: Equipment }) => {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const calculateDaysSince = (dateString: string) => {
    if (!dateString) return 0;
    const diffTime = Math.abs(new Date().getTime() - new Date(dateString).getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="glassmorphic-metric">
        <div className="metric-icon bg-blue-500/20">
          <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-xs text-blue-200">Days Active</p>
          <p className="text-sm font-semibold text-white">{calculateDaysSince(equipment.created_at)}</p>
        </div>
      </div>
      
      <div className="glassmorphic-metric">
        <div className="metric-icon bg-green-500/20">
          <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-xs text-blue-200">Last Updated</p>
          <p className="text-sm font-semibold text-white">{formatDate(equipment.updated_at)}</p>
        </div>
      </div>
    </div>
  );
};

// Enhanced Action Button Component
const ActionButton = ({ 
  icon, 
  label, 
  onClick, 
  variant = 'primary',
  disabled = false 
}: { 
  icon: React.ReactNode; 
  label: string; 
  onClick: (e?: React.MouseEvent) => void; 
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'primary':
        return 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 border-cyan-400/30 text-cyan-300 hover:text-cyan-200';
      case 'secondary':
        return 'bg-gradient-to-r from-gray-500/10 to-slate-500/10 hover:from-gray-500/20 hover:to-slate-500/20 border-gray-400/30 text-gray-300 hover:text-gray-200';
      case 'danger':
        return 'bg-gradient-to-r from-red-500/10 to-orange-500/10 hover:from-red-500/20 hover:to-orange-500/20 border-red-400/30 text-red-300 hover:text-red-200';
      default:
        return 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 border-cyan-400/30 text-cyan-300 hover:text-cyan-200';
    }
  };

  return (
    <button
      onClick={(e) => onClick(e)}
      disabled={disabled}
      className={`
        flex-1 min-h-[48px] flex items-center justify-center space-x-2 
        border backdrop-blur-sm rounded-xl font-medium text-sm
        transition-all duration-300 hover:scale-105 hover:shadow-lg
        ${getVariantClasses()}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};

export default function MyEquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignModalEquipment, setAssignModalEquipment] = useState<Equipment | null>(null);

  useEffect(() => {
    loadEquipment();
  }, []);

  const loadEquipment = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const currentUser = getCurrentUser();
      if (!currentUser) {
        setError('No user logged in');
        return;
      }
      
      console.log(`📋 Loading equipment for user: ${currentUser.name} (${currentUser.role})`);
      const equipmentData = await getEquipmentForUser(currentUser.role, currentUser.name);
      setEquipment(equipmentData);
      console.log(`✅ Loaded ${equipmentData.length} equipment items`);
    } catch (err: any) {
      console.error('💥 Error loading equipment:', err);
      setError(`Failed to load equipment: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (equipmentId: string, newStatus: Equipment['status'], assignTo?: string) => {
    try {
      const updatedEquipment = await updateEquipmentStatus(equipmentId, newStatus, assignTo);
      setEquipment(prev => prev.map(item => 
        item.id === equipmentId ? updatedEquipment : item
      ));
    } catch (err: any) {
      console.error('Error updating equipment status:', err);
      setError(`Failed to update equipment: ${err.message}`);
    }
  };

  const openAssignModal = (equipment: Equipment) => {
    setAssignModalEquipment(equipment);
    setShowAssignModal(true);
  };

  const handleAssignment = async (operatorName: string, note?: string) => {
    if (!assignModalEquipment) return;
    
    try {
      // Update status to assigned if assigning to someone, available if unassigning
      const newStatus = operatorName ? 'assigned' : 'available';
      await handleStatusChange(assignModalEquipment.id, newStatus, operatorName);
      
      // TODO: Add note to equipment history if provided
      if (note) {
        console.log('Assignment note:', note);
      }
      
      setShowAssignModal(false);
      setAssignModalEquipment(null);
    } catch (error) {
      console.error('Failed to assign equipment:', error);
      throw error; // Let the modal handle the error display
    }
  };

  const openDetailModal = (equipment: Equipment) => {
    setSelectedEquipment(equipment);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setSelectedEquipment(null);
    setShowDetailModal(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-6"></div>
              <p className="text-white text-lg font-medium">Loading Equipment...</p>
              <p className="text-blue-200 text-sm mt-2">Fetching your equipment data</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950">
      <div className="container mx-auto px-6 py-8">
        {/* Enhanced Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard/tools"
              className="group p-3 backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 text-white hover:bg-white/10 transition-all duration-300 hover:scale-105"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">My Equipment</h1>
              <p className="text-blue-200">Manage your assigned equipment and track status</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={loadEquipment}
              className="p-3 backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 text-white hover:bg-white/10 transition-all duration-300 hover:scale-105"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 backdrop-blur-xl bg-red-500/10 border border-red-400/20 rounded-xl text-red-200">
            <div className="flex items-center justify-between">
              <p>{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Equipment Grid */}
        {equipment.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-8">
              <svg className="w-12 h-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">No Equipment Assigned</h3>
            <p className="text-blue-200 mb-8 max-w-md mx-auto">
              You don't have any equipment assigned to you yet. Contact your manager or add new equipment to get started.
            </p>
            <Link
              href="/dashboard/tools/add-equipment"
              className="inline-flex items-center space-x-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-medium py-4 px-8 rounded-xl transition-all duration-300 hover:scale-105"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>Add Equipment</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {equipment.map((item) => (
              <div
                key={item.id}
                className="equipment-card group relative backdrop-blur-lg bg-gray-900/60 rounded-2xl border border-white/10 p-6 hover:border-gradient transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-cyan-500/10 cursor-pointer"
                onClick={() => openDetailModal(item)}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-white mb-1 group-hover:text-cyan-100 transition-colors">
                      {item.name}
                    </h3>
                    {(item.brand || item.model) && (
                      <p className="text-blue-200 text-sm">
                        {[item.brand, item.model].filter(Boolean).join(' ')}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={item.status} animated={true} />
                </div>

                {/* Visual Section */}
                <div className="mb-6">
                  {/* QR Code Display */}
                  <div className="glassmorphic-qr-container mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-blue-200 text-xs font-medium">QR CODE</p>
                      <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M12 12h-4.01M12 12v4m6-7h-2V4h-5.01M7 7h.01" />
                      </svg>
                    </div>
                    <p className="text-white font-mono text-sm bg-white/5 rounded-lg p-2 border border-white/10">
                      {item.qr_code}
                    </p>
                  </div>

                  {/* Equipment Metrics */}
                  <EquipmentMetrics equipment={item} />
                </div>

                {/* Assignment Section */}
                <div className="mb-6">
                  <p className="text-blue-200 text-xs font-medium mb-2">ASSIGNED TO</p>
                  <OperatorAvatar operator={item.assigned_to} />
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                  <ActionButton
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M12 12h-4.01M12 12v4m6-7h-2V4h-5.01M7 7h.01" />
                      </svg>
                    }
                    label="Scan"
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: Add scan functionality
                    }}
                    variant="primary"
                  />
                  
                  <ActionButton
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    }
                    label="Assign"
                    onClick={(e) => {
                      e.stopPropagation();
                      openAssignModal(item);
                    }}
                    variant="secondary"
                  />
                  
                  <ActionButton
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    }
                    label="Service"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(item.id, 'maintenance', 'Shop');
                    }}
                    variant="danger"
                  />
                </div>

                {/* Additional Equipment Details */}
                {item.serial_number && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-blue-200 text-xs font-medium mb-1">SERIAL NUMBER</p>
                    <p className="text-white font-mono text-sm">{item.serial_number}</p>
                  </div>
                )}

                {/* Hover Effect Overlay */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Equipment Detail Modal */}
      {selectedEquipment && (
        <EquipmentDetailModal
          equipment={selectedEquipment}
          isOpen={showDetailModal}
          onClose={closeDetailModal}
          onStatusUpdate={handleStatusChange}
        />
      )}

      {/* Assignment Modal */}
      {assignModalEquipment && (
        <AssignmentModal
          equipment={assignModalEquipment}
          isOpen={showAssignModal}
          onClose={() => {
            setShowAssignModal(false);
            setAssignModalEquipment(null);
          }}
          onAssign={handleAssignment}
        />
      )}

      <style jsx>{`
        .equipment-card:hover {
          border-image: linear-gradient(45deg, #06b6d4, #3b82f6) 1;
        }
        
        .glassmorphic-qr-container {
          backdrop-filter: blur(10px);
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 12px;
        }
        
        .glassmorphic-metric {
          backdrop-filter: blur(10px);
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .metric-icon {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}