'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { ArrowLeft, Wrench, Package, Calendar, DollarSign, AlertCircle, Loader2 } from 'lucide-react';

interface Equipment {
  id: string;
  name: string;
  type: string;
  manufacturer: string;
  model_number: string;
  size: string | null;
  equipment_for: string | null;
  serial_number: string;
  status: string;
  purchase_price: number;
  assigned_date: string;
  is_from_inventory: boolean;
  inventory: {
    name: string;
    category: string;
  } | null;
}

interface OperatorInfo {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function OperatorEquipmentPage() {
  const router = useRouter();
  const params = useParams();
  const operatorId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [operator, setOperator] = useState<OperatorInfo | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (currentUser.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    fetchData();
  };

  const fetchData = async () => {
    try {
      const response = await fetch(`/api/operator/${operatorId}/equipment`);
      const result = await response.json();

      if (result.success) {
        setOperator(result.operator);
        setEquipment(result.equipment || []);
      } else {
        console.error('Error fetching equipment:', result.error);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'available':
        return { color: 'bg-green-100 text-green-700 border-green-300', label: 'Available', icon: '✓' };
      case 'assigned':
        return { color: 'bg-blue-100 text-blue-700 border-blue-300', label: 'Assigned', icon: '👤' };
      case 'in_use':
        return { color: 'bg-orange-100 text-orange-700 border-orange-300', label: 'In Use', icon: '🔧' };
      case 'maintenance':
        return { color: 'bg-yellow-100 text-yellow-700 border-yellow-300', label: 'Maintenance', icon: '⚠️' };
      case 'retired':
        return { color: 'bg-gray-100 text-gray-700 border-gray-300', label: 'Retired', icon: '📦' };
      default:
        return { color: 'bg-gray-100 text-gray-700 border-gray-300', label: status, icon: '?' };
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'blade':
        return '⚙️';
      case 'bit':
        return '🔩';
      case 'tool':
        return '🔨';
      case 'vehicle':
        return '🚚';
      case 'safety':
        return '🛡️';
      default:
        return '📦';
    }
  };

  const formatEquipmentFor = (equipmentFor: string | null) => {
    if (!equipmentFor) return 'N/A';
    return equipmentFor
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading equipment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 border-b border-blue-800 sticky top-0 z-50 shadow-2xl">
        <div className="container mx-auto px-4 py-6">
          <Link
            href="/dashboard/admin/operator-profiles"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft size={20} />
            <span className="font-medium">Back to Operator Profiles</span>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Equipment Assigned</h1>
              {operator && (
                <div>
                  <p className="text-white/90 text-lg">{operator.full_name}</p>
                  <p className="text-white/70 text-sm">{operator.email}</p>
                </div>
              )}
            </div>
            <div className="bg-white/10 backdrop-blur-lg px-6 py-4 rounded-xl border border-white/20">
              <p className="text-white/70 text-sm mb-1">Total Equipment</p>
              <p className="text-4xl font-bold text-white">{equipment.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {equipment.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-12 text-center">
            <Package size={64} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-bold text-gray-800 mb-2">No Equipment Assigned</h3>
            <p className="text-gray-600">This operator doesn't have any equipment assigned yet.</p>
            <Link
              href="/dashboard/inventory"
              className="inline-block mt-6 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl"
            >
              Go to Inventory
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {equipment.map((item, index) => {
              const statusConfig = getStatusConfig(item.status);
              const typeIcon = getTypeIcon(item.type);

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02]"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Card Header */}
                  <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 px-6 py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/20 backdrop-blur-lg rounded-xl flex items-center justify-center text-2xl border border-white/30">
                          {typeIcon}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white drop-shadow">{item.name}</h3>
                          <p className="text-white/80 text-sm font-medium">{item.type.toUpperCase()}</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border-2 ${statusConfig.color}`}>
                        {statusConfig.icon} {statusConfig.label}
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-6 space-y-4">
                    {/* Details */}
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <Package size={16} className="text-gray-400 mt-1 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 font-medium">Serial Number</p>
                          <p className="text-sm font-bold text-gray-800">{item.serial_number}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <Wrench size={16} className="text-gray-400 mt-1 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 font-medium">Manufacturer & Model</p>
                          <p className="text-sm font-bold text-gray-800">
                            {item.manufacturer} {item.model_number}
                          </p>
                        </div>
                      </div>

                      {item.size && (
                        <div className="flex items-start gap-2">
                          <Package size={16} className="text-gray-400 mt-1 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-xs text-gray-500 font-medium">Size</p>
                            <p className="text-sm font-bold text-gray-800">{item.size}"</p>
                          </div>
                        </div>
                      )}

                      {item.equipment_for && (
                        <div className="flex items-start gap-2">
                          <AlertCircle size={16} className="text-gray-400 mt-1 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-xs text-gray-500 font-medium">Equipment For</p>
                            <p className="text-sm font-bold text-gray-800">{formatEquipmentFor(item.equipment_for)}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-2">
                        <Calendar size={16} className="text-gray-400 mt-1 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 font-medium">Assigned Date</p>
                          <p className="text-sm font-bold text-gray-800">
                            {new Date(item.assigned_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <DollarSign size={16} className="text-gray-400 mt-1 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 font-medium">Purchase Price</p>
                          <p className="text-sm font-bold text-gray-800">
                            ${item.purchase_price?.toFixed(2) || '0.00'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Source Badge */}
                    {item.is_from_inventory && (
                      <div className="pt-4 border-t border-gray-100">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg">
                          <Package size={14} className="text-purple-600" />
                          <span className="text-xs font-semibold text-purple-700">From Inventory</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
