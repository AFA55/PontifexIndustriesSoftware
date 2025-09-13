'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Search, Filter, Grid, List, Download, QrCode, User, Wrench, MapPin } from 'lucide-react';

interface Equipment {
  id: string;
  name: string;
  brand_name: string;
  model_number: string;
  type: string;
  serial_number: string;
  status: string;
  assigned_to: string;
  location: string;
  qr_code_url: string;
  notes: string;
  created_at: string;
}

export default function EquipmentPage() {
  const router = useRouter();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Fetch equipment on component mount
  useEffect(() => {
    fetchEquipment();
  }, []);

  const fetchEquipment = async () => {
    console.log('Fetching equipment from Supabase...');
    setLoading(true);
    setError('');

    try {
      const { data, error: fetchError } = await supabase
        .from('equipment')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching equipment:', fetchError);
        setError(fetchError.message);
        return;
      }

      console.log('Equipment fetched:', data);
      setEquipment(data || []);
    } catch (err) {
      console.error('Error:', err);
      setError('Failed to load equipment');
    } finally {
      setLoading(false);
    }
  };

  // Add demo equipment if none exists
  const addDemoEquipment = async () => {
    const demoEquipment = [
      {
        name: 'Core Drill CD250',
        brand_name: 'Hilti',
        model_number: 'DD250',
        type: 'Core Drill',
        serial_number: `CD-${Date.now()}-1`,
        status: 'Available',
        assigned_to: 'Matt M',
        location: 'West Warehouse',
        notes: 'Heavy duty core drill for concrete'
      },
      {
        name: 'Diesel Slab Saw',
        brand_name: 'Husqvarna',
        model_number: '5000',
        type: 'Floor Saw',
        serial_number: `DSS-${Date.now()}-2`,
        status: 'In Use',
        assigned_to: 'Skinny H',
        location: 'Job Site Alpha',
        notes: 'Diesel powered, 48" blade capacity'
      },
      {
        name: 'Floor Saw FS400',
        brand_name: 'Stihl',
        model_number: 'FS400',
        type: 'Floor Saw',
        serial_number: `FS-${Date.now()}-3`,
        status: 'Available',
        assigned_to: 'Rex Z',
        location: 'East Storage',
        notes: 'Walk-behind saw for asphalt'
      },
      {
        name: 'Test Jackhammer',
        brand_name: 'Hilti',
        model_number: 'TE-3000',
        type: 'Jackhammer',
        serial_number: `TJ-${Date.now()}-4`,
        status: 'Maintenance',
        assigned_to: 'Unassigned',
        location: 'Shop',
        notes: 'Needs new bits'
      }
    ];

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('equipment')
        .insert(demoEquipment)
        .select();

      if (error) {
        console.error('Error adding demo equipment:', error);
        alert('Failed to add demo equipment: ' + error.message);
      } else {
        console.log('Demo equipment added:', data);
        await fetchEquipment(); // Refresh the list
        alert('Demo equipment added successfully!');
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter equipment based on search
  const filteredEquipment = equipment.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.assigned_to.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate stats
  const stats = {
    total: equipment.length,
    available: equipment.filter(e => e.status === 'Available').length,
    inUse: equipment.filter(e => e.status === 'In Use').length,
    maintenance: equipment.filter(e => e.status === 'Maintenance').length,
    efficiency: equipment.length > 0
      ? Math.round((equipment.filter(e => e.status === 'In Use').length / equipment.length) * 100)
      : 0
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Available': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'In Use': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'Maintenance': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'Out of Service': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black">
      {/* Header */}
      <div className="bg-gray-900/50 backdrop-blur-lg border-b border-gray-800 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white">Equipment Fleet</h1>
              <p className="text-gray-400 mt-1">Real-time fleet management & monitoring</p>
            </div>
            <button
              onClick={() => router.push('/dashboard/tools/add-equipment')}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 rounded-lg font-semibold transition-all flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Equipment
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Total Fleet</div>
              <div className="text-2xl font-bold text-white">{stats.total}</div>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Available</div>
              <div className="text-2xl font-bold text-green-400">{stats.available}</div>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">In Use</div>
              <div className="text-2xl font-bold text-blue-400">{stats.inUse}</div>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Service</div>
              <div className="text-2xl font-bold text-orange-400">{stats.maintenance}</div>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Efficiency</div>
              <div className="text-2xl font-bold text-purple-400">{stats.efficiency}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search equipment, serial numbers, operators..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-600 transition-colors flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-4 py-3 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-gray-800/50 border border-gray-700 text-gray-400 hover:text-white'}`}
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-3 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-gray-800/50 border border-gray-700 text-gray-400 hover:text-white'}`}
            >
              <List className="w-5 h-5" />
            </button>
            <button className="px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-600 transition-colors flex items-center gap-2">
              <Download className="w-5 h-5" />
              Export
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-400">
            Error: {error}
            <div className="mt-2 text-sm">
              Make sure Supabase is configured and the equipment table exists.
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-400">Loading equipment...</div>
          </div>
        ) : filteredEquipment.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-24 h-24 bg-gray-800/50 rounded-full flex items-center justify-center mb-4">
              <QrCode className="w-12 h-12 text-cyan-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No Equipment Found</h3>
            <p className="text-gray-400 mb-6">Add your first equipment to get started</p>
            {!error && (
              <button
                onClick={addDemoEquipment}
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition-colors"
              >
                Add Demo Equipment
              </button>
            )}
          </div>
        ) : (
          /* Equipment Grid */
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
            {filteredEquipment.map((item) => (
              <div
                key={item.id}
                className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-6 border border-gray-700 hover:border-cyan-500/50 transition-all cursor-pointer hover:scale-105"
                onClick={() => console.log('Clicked equipment:', item)}
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
                    <User className="w-4 h-4" />
                    <span>{item.assigned_to}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <MapPin className="w-4 h-4" />
                    <span>{item.location || 'No location'}</span>
                  </div>
                </div>

                {item.qr_code_url && (
                  <div className="mt-4 flex justify-center">
                    <img
                      src={item.qr_code_url}
                      alt={`QR Code for ${item.name}`}
                      className="w-20 h-20 border border-gray-600 rounded-lg"
                    />
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