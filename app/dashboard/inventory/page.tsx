'use client';

import { useState, useEffect } from 'react';
import { getCurrentUser, type User } from '@/lib/auth';
import { Package, Plus, QrCode, AlertCircle, TrendingDown, History } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AddBladeWizard from '@/components/AddBladeWizard';
import QRScanner from '@/components/QRScanner';
import AssignEquipmentModal from '@/components/AssignEquipmentModal';
import InventoryItemModal from '@/components/InventoryItemModal';
import AddStockModal from '@/components/AddStockModal';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  model_number: string;
  size: string;
  equipment_for: string | null;
  quantity_in_stock: number;
  quantity_assigned: number;
  reorder_level: number;
  unit_price: number;
  total_value: number;
  qr_code_data: string;
  qr_code_url: string;
  location: string | null;
  notes: string | null;
  created_at: string;
}

export default function InventoryManagementPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddWizard, setShowAddWizard] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItem | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);

    // Check permission
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'inventory_manager')) {
      router.push('/dashboard');
      return;
    }

    fetchInventory();
  }, [router]);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/inventory');

      if (!response.ok) {
        console.error('Failed to fetch inventory');
        return;
      }

      const data = await response.json();
      setInventory(data);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQRScan = (scannedData: string) => {
    try {
      // Parse QR code data
      const qrData = JSON.parse(scannedData);

      // Find the inventory item by ID
      const inventoryItem = inventory.find(item => {
        const itemQrData = JSON.parse(item.qr_code_data);
        return itemQrData.id === qrData.id;
      });

      if (inventoryItem) {
        setSelectedInventoryItem(inventoryItem);
        setShowAssignModal(true);
      } else {
        alert('Inventory item not found. Please ensure the QR code is valid.');
      }
    } catch (error) {
      console.error('Error parsing QR code:', error);
      alert('Invalid QR code. Please scan a valid blade or bit QR code.');
    }
  };

  const filteredInventory = inventory.filter(item => {
    const categoryMatch = filterCategory === 'all' || item.category === filterCategory;
    const searchMatch = searchQuery === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.manufacturer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.model_number.toLowerCase().includes(searchQuery.toLowerCase());

    return categoryMatch && searchMatch;
  });

  const lowStockItems = inventory.filter(item => item.quantity_in_stock <= item.reorder_level);
  const totalValue = inventory.reduce((sum, item) => sum + item.total_value, 0);
  const totalItems = inventory.reduce((sum, item) => sum + item.quantity_in_stock, 0);

  if (!user || (user.role !== 'admin' && user.role !== 'inventory_manager')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
        <div className="bg-white border border-red-300 rounded-2xl p-8 max-w-md shadow-xl">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">Access Denied</h1>
          <p className="text-gray-600 text-center">
            You don't have permission to access blade & bit management.
            Only admins and inventory managers can view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
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
              <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-3">
                <Package className="w-10 h-10 text-indigo-600" />
                Blade & Bit Management
              </h1>
              <p className="text-gray-600 font-medium mt-1">Track blade/bit stock levels and assign to operators</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl opacity-30 group-hover:opacity-50 blur transition duration-300"></div>
            <div className="relative bg-white/90 backdrop-blur-lg rounded-2xl border border-indigo-100 p-6 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-semibold">Total Items</p>
                  <p className="text-indigo-600 text-3xl font-bold">{totalItems}</p>
                  <p className="text-gray-500 text-sm mt-1">{inventory.length} unique items</p>
                </div>
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                  <Package className="w-7 h-7 text-white" />
                </div>
              </div>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-30 group-hover:opacity-50 blur transition duration-300"></div>
            <div className="relative bg-white/90 backdrop-blur-lg rounded-2xl border border-green-100 p-6 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-semibold">Total Value</p>
                  <p className="text-green-600 text-3xl font-bold">${totalValue.toFixed(2)}</p>
                  <p className="text-gray-500 text-sm mt-1">Inventory worth</p>
                </div>
                <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                  <span className="text-3xl">💰</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl opacity-30 group-hover:opacity-50 blur transition duration-300"></div>
            <div className="relative bg-white/90 backdrop-blur-lg rounded-2xl border border-orange-100 p-6 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-semibold">Low Stock</p>
                  <p className="text-orange-600 text-3xl font-bold">{lowStockItems.length}</p>
                  <p className="text-gray-500 text-sm mt-1">Items need reorder</p>
                </div>
                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                  <TrendingDown className="w-7 h-7 text-white" />
                </div>
              </div>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl opacity-30 group-hover:opacity-50 blur transition duration-300"></div>
            <div className="relative bg-white/90 backdrop-blur-lg rounded-2xl border border-purple-100 p-6 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-semibold">Assigned</p>
                  <p className="text-purple-600 text-3xl font-bold">
                    {inventory.reduce((sum, item) => sum + item.quantity_assigned, 0)}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">In use by operators</p>
                </div>
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                  <span className="text-3xl">👥</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-2xl p-6 mb-8 shadow-lg">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex gap-4 w-full md:w-auto">
              <button
                onClick={() => setShowAddWizard(true)}
                className="flex-1 md:flex-none bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add Blade/Bit
              </button>

              <button
                onClick={() => setShowScanner(true)}
                className="flex-1 md:flex-none bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-6 py-3 rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 flex items-center justify-center gap-2"
              >
                <QrCode className="w-5 h-5" />
                Scan QR Code
              </button>

              <Link
                href="/dashboard/inventory/history"
                className="flex-1 md:flex-none bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white px-6 py-3 rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 flex items-center justify-center gap-2"
              >
                <History className="w-5 h-5" />
                History
              </Link>
            </div>

            <div className="flex gap-4 w-full md:w-auto">
              <input
                type="text"
                placeholder="Search inventory..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 md:w-64 px-4 py-2 bg-white/80 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 backdrop-blur-sm shadow-sm"
              />

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-4 py-2 bg-white/80 border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 backdrop-blur-sm shadow-sm"
              >
                <option value="all">All Categories</option>
                <option value="blade">Blades</option>
                <option value="bit">Bits</option>
                <option value="tool">Tools</option>
                <option value="vehicle">Vehicles</option>
                <option value="safety">Safety</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* Low Stock Alert */}
        {lowStockItems.length > 0 && (
          <div className="bg-orange-50/80 backdrop-blur-lg border border-orange-200 rounded-2xl p-6 mb-8 shadow-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-orange-700 mb-2">Low Stock Alert</h3>
                <p className="text-gray-700 mb-3">
                  {lowStockItems.length} item(s) are at or below reorder level
                </p>
                <div className="flex flex-wrap gap-2">
                  {lowStockItems.slice(0, 5).map(item => (
                    <span
                      key={item.id}
                      className="bg-white/80 border border-orange-300 px-3 py-1 rounded-full text-sm text-orange-700 font-medium shadow-sm"
                    >
                      {item.name} ({item.quantity_in_stock} left)
                    </span>
                  ))}
                  {lowStockItems.length > 5 && (
                    <span className="text-orange-600 px-3 py-1 text-sm font-medium">
                      +{lowStockItems.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Inventory Table */}
        <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/80 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Item</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Category</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">In Stock</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Assigned</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Unit Price</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Total Value</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      Loading inventory...
                    </td>
                  </tr>
                ) : filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      No inventory items found
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setSelectedInventoryItem(item);
                            setShowItemModal(true);
                          }}
                          className="text-left hover:bg-indigo-50 rounded-lg p-2 -m-2 transition-colors w-full"
                        >
                          <p className="text-indigo-600 font-semibold hover:text-indigo-700 cursor-pointer">
                            {item.name}
                          </p>
                          <p className="text-gray-500 text-sm">{item.manufacturer} {item.model_number}</p>
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full text-sm text-indigo-700 capitalize font-medium">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`font-semibold ${
                          item.quantity_in_stock <= item.reorder_level
                            ? 'text-orange-600'
                            : 'text-green-600'
                        }`}>
                          {item.quantity_in_stock}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-purple-600 font-semibold">{item.quantity_assigned}</span>
                      </td>
                      <td className="px-6 py-4 text-gray-700">${item.unit_price.toFixed(2)}</td>
                      <td className="px-6 py-4 text-green-600 font-semibold">${item.total_value.toFixed(2)}</td>
                      <td className="px-6 py-4 text-gray-600">{item.location || 'N/A'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Blade/Bit Wizard */}
        <AddBladeWizard
          isOpen={showAddWizard}
          onClose={() => setShowAddWizard(false)}
          onSuccess={() => {
            setShowAddWizard(false);
            fetchInventory();
          }}
        />

        {/* QR Code Scanner */}
        <QRScanner
          isOpen={showScanner}
          onClose={() => setShowScanner(false)}
          onScan={handleQRScan}
        />

        {/* Assignment Modal */}
        <AssignEquipmentModal
          isOpen={showAssignModal}
          onClose={() => {
            setShowAssignModal(false);
            setSelectedInventoryItem(null);
          }}
          inventoryItem={selectedInventoryItem}
          onSuccess={() => {
            setShowAssignModal(false);
            setSelectedInventoryItem(null);
            fetchInventory();
          }}
        />

        {/* Item Detail Modal */}
        <InventoryItemModal
          isOpen={showItemModal}
          onClose={() => {
            setShowItemModal(false);
            setSelectedInventoryItem(null);
          }}
          item={selectedInventoryItem}
          onAssign={() => {
            setShowItemModal(false);
            setShowAssignModal(true);
          }}
          onAddStock={() => {
            setShowItemModal(false);
            setShowAddStockModal(true);
          }}
        />

        {/* Add Stock Modal */}
        <AddStockModal
          isOpen={showAddStockModal}
          onClose={() => {
            setShowAddStockModal(false);
            setSelectedInventoryItem(null);
          }}
          item={selectedInventoryItem}
          onSuccess={() => {
            setShowAddStockModal(false);
            setSelectedInventoryItem(null);
            fetchInventory();
          }}
        />
      </div>
    </div>
  );
}
