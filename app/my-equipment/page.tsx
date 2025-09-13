'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, QrCode, User, MapPin, Wrench, Search } from 'lucide-react';

export default function MyEquipment() {
  const router = useRouter();
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // This should come from auth/session
  const currentOperator = 'Matt M';

  useEffect(() => {
    fetchMyEquipment();
  }, []);

  const fetchMyEquipment = async () => {
    setLoading(true);
    try {
      // Fetch only equipment assigned to current operator
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('assigned_to', currentOperator)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error:', error);
      } else {
        setEquipment(data || []);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredEquipment = equipment.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.serial_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status) => {
    switch(status) {
      case 'Available': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'In Use': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'Maintenance': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/equipment-dashboard')}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Equipment Dashboard
          </button>
          <h1 className="text-3xl font-bold text-white">My Equipment</h1>
          <p className="text-gray-400 mt-1">Equipment assigned to {currentOperator}</p>
        </div>

        {/* Search Bar */}
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search your equipment..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
          />
        </div>

        {/* Equipment Count */}
        <div className="mb-6 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
          <p className="text-gray-400">
            You have <span className="text-cyan-400 font-bold">{filteredEquipment.length}</span> equipment items assigned
          </p>
        </div>

        {/* Equipment Grid */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <p className="text-gray-400">Loading your equipment...</p>
          </div>
        ) : filteredEquipment.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <QrCode className="w-16 h-16 text-gray-600 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Equipment Assigned</h3>
            <p className="text-gray-400">You don't have any equipment assigned to you yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEquipment.map((item) => (
              <div
                key={item.id}
                className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-6 border border-gray-700 hover:border-cyan-500/50 transition-all cursor-pointer hover:scale-105"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{item.name}</h3>
                    <p className="text-gray-400 text-sm">{item.brand_name} {item.model_number}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(item.status)}`}>
                    {item.status}
                  </span>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-gray-400">
                    <QrCode className="w-4 h-4" />
                    <span>{item.serial_number}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <MapPin className="w-4 h-4" />
                    <span>{item.location || 'No location set'}</span>
                  </div>
                </div>

                {/* QR Code Display */}
                {item.qr_code_url && (
                  <div className="mt-4 p-3 bg-gray-900/50 rounded-lg">
                    <img src={item.qr_code_url} alt="QR Code" className="w-32 h-32 mx-auto" />
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <button className="flex-1 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-lg text-cyan-400 text-sm font-medium transition-colors">
                    View Details
                  </button>
                  <button className="px-3 py-2 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg text-gray-400 hover:text-white transition-colors">
                    <Wrench className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}