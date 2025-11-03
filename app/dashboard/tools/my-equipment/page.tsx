'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '../../../../lib/auth';

// Equipment interface for mock data
interface Equipment {
  id: string;
  name: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  qr_code: string;
  status: 'available' | 'assigned' | 'maintenance';
  assigned_to?: string | null;
  location?: string;
  notes?: string;
}

export default function MyEquipmentPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const router = useRouter();

  // Mock equipment data - No database fetching
  const [equipment, setEquipment] = useState<Equipment[]>([
    {
      id: '1',
      name: 'Concrete Saw',
      brand: 'Husqvarna',
      model: 'K970',
      serial_number: 'HS-2024-001',
      qr_code: 'EQUIP-CONCRETE-SAW-001',
      status: 'available',
      assigned_to: null,
      location: 'Shop'
    },
    {
      id: '2',
      name: 'Jackhammer',
      brand: 'Bosch',
      model: 'BH2760VC',
      serial_number: 'BO-2024-042',
      qr_code: 'EQUIP-JACKHAMMER-002',
      status: 'assigned',
      assigned_to: 'Demo Operator',
      location: 'Job Site A'
    },
    {
      id: '3',
      name: 'Core Drill',
      brand: 'Milwaukee',
      model: 'DD160',
      serial_number: 'ML-2024-123',
      qr_code: 'EQUIP-CORE-DRILL-003',
      status: 'available',
      assigned_to: null,
      location: 'Shop'
    },
    {
      id: '4',
      name: 'Rebar Cutter',
      brand: 'DeWalt',
      model: 'DW849',
      serial_number: 'DW-2024-078',
      qr_code: 'EQUIP-REBAR-CUTTER-004',
      status: 'maintenance',
      assigned_to: null,
      location: 'Maintenance Bay'
    },
    {
      id: '5',
      name: 'Concrete Grinder',
      brand: 'Makita',
      model: '9564PC',
      serial_number: 'MK-2024-234',
      qr_code: 'EQUIP-GRINDER-005',
      status: 'assigned',
      assigned_to: 'Rex Z',
      location: 'Job Site B'
    },
    {
      id: '6',
      name: 'Wet Saw',
      brand: 'MK Diamond',
      model: 'MK-101',
      serial_number: 'MKD-2024-345',
      qr_code: 'EQUIP-WET-SAW-006',
      status: 'available',
      assigned_to: null,
      location: 'Shop'
    }
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);
  }, []);

  const loadEquipment = () => {
    // Refresh button - just reset any errors
    setError(null);
    console.log('Equipment refreshed (UI only - no database fetch)');
  };

  const handleAssignToMe = (equipmentItem: Equipment) => {
    if (!currentUser) return;

    console.log(`Assigning ${equipmentItem.name} to ${currentUser.name} (UI only)`);

    // Update local state only - no database call
    setEquipment(prev => prev.map(item =>
      item.id === equipmentItem.id
        ? { ...item, status: 'assigned' as const, assigned_to: currentUser.name }
        : item
    ));
  };

  const handleUnassign = (equipmentItem: Equipment) => {
    console.log(`Unassigning ${equipmentItem.name} (UI only)`);

    // Update local state only - no database call
    setEquipment(prev => prev.map(item =>
      item.id === equipmentItem.id
        ? { ...item, status: 'available' as const, assigned_to: null }
        : item
    ));
  };

  const handleMaintenanceRequest = (equipmentItem: Equipment) => {
    // Navigate to maintenance request page with equipment pre-selected
    router.push(`/dashboard/tools/maintenance-request?equipment=${equipmentItem.id}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'assigned':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'maintenance':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getNextMaintenanceDate = (item: Equipment) => {
    // Mock data - you can replace with actual maintenance schedule logic
    const today = new Date();
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + 30); // 30 days from now
    return nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const isAssignedToMe = (item: Equipment) => {
    return item.assigned_to === currentUser?.name;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
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
              <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-600 via-red-600 to-pink-600 bg-clip-text text-transparent">
                View My Equipment
              </h1>
              <p className="text-gray-600 font-medium mt-1">Manage and track your tools</p>
            </div>
          </div>

          <button
            onClick={loadEquipment}
            className="p-3 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200 text-gray-700 hover:bg-white transition-all duration-300 hover:scale-105 shadow-sm"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-800 font-medium">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-700 font-semibold"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Equipment Grid */}
        {equipment.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-3xl font-bold text-gray-800 mb-4">No Equipment Found</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto text-lg">
              There's no equipment in the system yet. Add new equipment to get started.
            </p>
            <Link
              href="/dashboard/tools/add-equipment"
              className="inline-flex items-center space-x-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>Add Equipment</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {equipment.map((item) => (
              <div
                key={item.id}
                className="bg-white/80 backdrop-blur-lg rounded-2xl border-2 border-gray-200 p-6 hover:border-orange-300 hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
              >
                {/* Equipment Icon */}
                <div className="flex items-center justify-center mb-4">
                  <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </div>

                {/* Equipment Name */}
                <h3 className="text-xl font-bold text-gray-800 mb-3 text-center">
                  {item.name}
                </h3>

                {/* Status Badge */}
                <div className="flex justify-center mb-4">
                  <span className={`px-4 py-2 rounded-full text-sm font-bold border-2 ${getStatusColor(item.status)}`}>
                    {item.status.toUpperCase()}
                  </span>
                </div>

                {/* Equipment Info */}
                <div className="space-y-3 mb-6">
                  {/* QR Code */}
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                    <p className="text-xs text-gray-600 font-semibold mb-1">QR CODE</p>
                    <p className="text-gray-800 font-mono font-bold">{item.qr_code}</p>
                  </div>

                  {/* Assigned To */}
                  {item.assigned_to && (
                    <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
                      <p className="text-xs text-blue-600 font-semibold mb-1">ASSIGNED TO</p>
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">{item.assigned_to.charAt(0)}</span>
                        </div>
                        <p className="text-blue-800 font-bold">{item.assigned_to}</p>
                      </div>
                    </div>
                  )}

                  {/* Next Maintenance */}
                  <div className="bg-orange-50 rounded-xl p-3 border border-orange-200">
                    <p className="text-xs text-orange-600 font-semibold mb-1">NEXT MAINTENANCE</p>
                    <p className="text-orange-800 font-bold">{getNextMaintenanceDate(item)}</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  {/* Assign/Unassign Button */}
                  {isAssignedToMe(item) ? (
                    <button
                      onClick={() => handleUnassign(item)}
                      className="w-full bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center space-x-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span>Unassign from Me</span>
                    </button>
                  ) : item.status === 'available' ? (
                    <button
                      onClick={() => handleAssignToMe(item)}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center space-x-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span>Assign to Me</span>
                    </button>
                  ) : (
                    <div className="w-full bg-gray-100 border-2 border-gray-300 text-gray-500 font-bold py-3 px-4 rounded-xl flex items-center justify-center">
                      <span>Not Available</span>
                    </div>
                  )}

                  {/* Maintenance Request Button */}
                  <button
                    onClick={() => handleMaintenanceRequest(item)}
                    className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center space-x-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Request Maintenance</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .delay-1000 {
          animation-delay: 1s;
        }
      `}</style>
    </div>
  );
}
