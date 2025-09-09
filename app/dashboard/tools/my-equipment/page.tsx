'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAllEquipment, updateEquipment, type Equipment } from '../../../../lib/supabase-equipment';

export default function MyEquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<{equipmentId: string; field: string} | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    loadEquipment();
  }, []);

  const loadEquipment = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('📋 Loading all equipment...');
      const equipmentData = await getAllEquipment();
      setEquipment(equipmentData);
      console.log(`✅ Loaded ${equipmentData.length} equipment items`);
    } catch (err: any) {
      console.error('💥 Error loading equipment:', err);
      setError(`Failed to load equipment: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = (equipmentId: string, field: string, currentValue: string) => {
    setEditingField({ equipmentId, field });
    setEditValue(currentValue || '');
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    if (!editingField) return;

    try {
      console.log(`💾 Updating ${editingField.field} for equipment ${editingField.equipmentId}`);
      const updates = {
        [editingField.field]: editValue.trim()
      };
      
      const updatedEquipment = await updateEquipment(editingField.equipmentId, updates);
      
      // Update local state
      setEquipment(prev => prev.map(item => 
        item.id === editingField.equipmentId ? updatedEquipment : item
      ));
      
      setEditingField(null);
      setEditValue('');
      console.log('✅ Equipment updated successfully');
    } catch (err: any) {
      console.error('💥 Error updating equipment:', err);
      setError(`Failed to update equipment: ${err.message}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'text-green-400 bg-green-500/20';
      case 'assigned': return 'text-blue-400 bg-blue-500/20';
      case 'maintenance': return 'text-orange-400 bg-orange-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-slate-800 to-gray-900">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <svg className="animate-spin w-12 h-12 text-blue-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-blue-200">Loading equipment...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-slate-800 to-gray-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard"
              className="p-3 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 text-white hover:bg-white/20 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-3xl font-bold text-white">My Equipment</h1>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={loadEquipment}
              className="p-3 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 text-white hover:bg-white/20 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <Link
              href="/dashboard/tools/add-equipment"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors"
            >
              Add Equipment
            </Link>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/20 backdrop-blur-xl rounded-2xl border border-red-500/30 p-6 mb-6">
            <div className="flex items-center space-x-3">
              <svg className="w-6 h-6 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-200">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="mt-3 text-red-300 hover:text-red-200 text-sm"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Equipment Count */}
        <div className="mb-6">
          <p className="text-blue-200">
            {equipment.length === 0 ? 'No equipment found' : `${equipment.length} equipment item${equipment.length !== 1 ? 's' : ''} found`}
          </p>
        </div>

        {/* Equipment Grid */}
        {equipment.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">No Equipment Found</h3>
            <p className="text-blue-200 mb-6">Get started by adding your first piece of equipment.</p>
            <Link
              href="/dashboard/tools/add-equipment"
              className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>Add First Equipment</span>
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {equipment.map((item) => (
              <div
                key={item.id}
                className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 hover:bg-white/15 transition-colors"
              >
                {/* Equipment Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">{item.name}</h3>
                    {(item.brand || item.model) && (
                      <p className="text-blue-200 text-sm">
                        {[item.brand, item.model].filter(Boolean).join(' ')}
                      </p>
                    )}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                    {item.status.toUpperCase()}
                  </span>
                </div>

                {/* QR Code */}
                <div className="bg-white/5 rounded-lg p-3 mb-4">
                  <p className="text-blue-200 text-xs mb-1">QR Code</p>
                  <p className="text-white font-mono text-sm">{item.qr_code}</p>
                </div>

                {/* Expand Button */}
                <button
                  onClick={() => setExpandedCard(expandedCard === item.id ? null : item.id)}
                  className="w-full bg-white/5 hover:bg-white/10 text-blue-200 py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 text-sm"
                >
                  <span>{expandedCard === item.id ? 'Show Less' : 'Show More'}</span>
                  <svg 
                    className={`w-4 h-4 transition-transform ${expandedCard === item.id ? 'rotate-180' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded Content */}
                {expandedCard === item.id && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                    {/* Serial Number */}
                    {item.serial_number && (
                      <div>
                        <p className="text-blue-200 text-xs mb-1">Serial Number</p>
                        <p className="text-white font-mono text-sm">{item.serial_number}</p>
                      </div>
                    )}

                    {/* Assignment Info */}
                    {item.assigned_to && (
                      <div>
                        <p className="text-blue-200 text-xs mb-1">Assigned To</p>
                        <p className="text-white text-sm">{item.assigned_to}</p>
                        {item.assigned_at && (
                          <p className="text-blue-300 text-xs">Since {formatDate(item.assigned_at)}</p>
                        )}
                      </div>
                    )}

                    {/* Location */}
                    <div>
                      <p className="text-blue-200 text-xs mb-1">Location</p>
                      {editingField?.equipmentId === item.id && editingField.field === 'location' ? (
                        <div className="flex space-x-2">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm"
                            onKeyPress={(e) => e.key === 'Enter' && saveEdit()}
                          />
                          <button onClick={saveEdit} className="text-green-400 hover:text-green-300">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button onClick={cancelEditing} className="text-red-400 hover:text-red-300">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <p className="text-white text-sm flex-1">{item.location || 'Not specified'}</p>
                          <button
                            onClick={() => startEditing(item.id, 'location', item.location || '')}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <div>
                      <p className="text-blue-200 text-xs mb-1">Notes</p>
                      {editingField?.equipmentId === item.id && editingField.field === 'notes' ? (
                        <div className="space-y-2">
                          <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm resize-none"
                            rows={3}
                          />
                          <div className="flex space-x-2">
                            <button onClick={saveEdit} className="text-green-400 hover:text-green-300 text-sm">
                              Save
                            </button>
                            <button onClick={cancelEditing} className="text-red-400 hover:text-red-300 text-sm">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start space-x-2">
                          <p className="text-white text-sm flex-1">{item.notes || 'No notes'}</p>
                          <button
                            onClick={() => startEditing(item.id, 'notes', item.notes || '')}
                            className="text-blue-400 hover:text-blue-300 flex-shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                      <div>
                        <p className="text-blue-200 text-xs mb-1">Created</p>
                        <p className="text-white text-xs">{formatDate(item.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-blue-200 text-xs mb-1">Updated</p>
                        <p className="text-white text-xs">{formatDate(item.updated_at)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}