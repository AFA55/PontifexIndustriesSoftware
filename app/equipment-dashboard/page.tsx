'use client';
import { useRouter } from 'next/navigation';
import { QrCode, Plus, Package, Settings } from 'lucide-react';

export default function EquipmentDashboard() {
  const router = useRouter();

  // For now, hardcode the operator - later this will come from auth
  const currentOperator = 'Matt M'; // This should come from user session

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-400 hover:text-white mb-4 transition-colors"
          >
            ← Back to Main Dashboard
          </button>
          <h1 className="text-4xl font-bold text-white">Pontifex Industries Dashboard</h1>
          <p className="text-gray-400 mt-2">Equipment Management System</p>
        </div>

        {/* Action Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* QR Scanner Card */}
          <div
            onClick={() => router.push('/equipment/scanner')}
            className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-8 border border-gray-700 hover:border-cyan-500/50 transition-all hover:scale-105 cursor-pointer"
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mb-4">
                <QrCode className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">QR Scanner</h3>
              <p className="text-gray-400">Scan equipment QR codes to check status and manage assignments</p>
            </div>
          </div>

          {/* Add Equipment Card */}
          <div
            onClick={() => router.push('/dashboard/tools/add-equipment')}
            className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-8 border border-gray-700 hover:border-green-500/50 transition-all hover:scale-105 cursor-pointer"
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl flex items-center justify-center mb-4">
                <Plus className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Add Equipment</h3>
              <p className="text-gray-400">Register new equipment and generate QR codes for tracking</p>
            </div>
          </div>

          {/* My Equipment Card */}
          <div
            onClick={() => router.push('/my-equipment')}
            className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-8 border border-gray-700 hover:border-orange-500/50 transition-all hover:scale-105 cursor-pointer"
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-yellow-500 rounded-2xl flex items-center justify-center mb-4">
                <Package className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">My Equipment</h3>
              <p className="text-gray-400">View and manage all equipment assigned to you</p>
            </div>
          </div>

          {/* Debug Tools Card (Admin Only) */}
          <div
            onClick={() => router.push('/test-connection')}
            className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-8 border border-gray-700 hover:border-purple-500/50 transition-all hover:scale-105 cursor-pointer"
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mb-4">
                <Settings className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Debug Tools</h3>
              <p className="text-gray-400">Database testing and system diagnostics</p>
            </div>
          </div>

        </div>

        {/* Current Operator Info */}
        <div className="mt-8 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
          <p className="text-gray-400 text-sm">Logged in as: <span className="text-cyan-400 font-medium">{currentOperator}</span></p>
        </div>
      </div>
    </div>
  );
}