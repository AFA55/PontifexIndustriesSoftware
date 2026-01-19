'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Operator {
  id: string;
  full_name: string;
  email: string;
}

// Equipment options
const CORE_DRILLING_EQUIPMENT = {
  drills: ['Hilti DD250CA', 'Hilti DD500CA', 'Hilti DD160'],
  ladders: ['6ft Ladder', '8ft Ladder', '10ft Ladder', '12ft Ladder'],
  lifts: ['Scissor Lift'],
  accessories: ['Plastic', 'Vacuum Base', 'Drill Extensions', 'Tape', 'Sticky Spray'],
  cords: ['50ft Extension Cord', '100ft Extension Cord', '150ft Extension Cord'],
  vacuums: ['Hilti Vacuum', 'Regular Vacuum'],
  generators: ['Portable Generator'],
};

const BIT_SIZES = [
  '1/2"', '3/4"', '1"', '1-1/4"', '1-1/2"', '2"', '2-1/2"', '3"', '4"', '5"', '6"', '8"', '10"', '12"'
];

export default function CreateJobOrderPage() {
  const router = useRouter();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [selectedBitSizes, setSelectedBitSizes] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    job_number: '',
    title: '',
    customer_name: '',
    customer_contact: '',
    job_type: '',
    location: '',
    address: '',
    description: '',
    assigned_to: '',
    foreman_name: '',
    foreman_phone: '',
    salesman_name: '',
    priority: 'medium',
    difficulty_rating: '5',
    scheduled_date: '',
    arrival_time: '',
    shop_arrival_time: '',
    estimated_hours: '',
    job_site_number: '',
    po_number: '',
    customer_job_number: '',
    hole_diameter: '',
  });

  useEffect(() => {
    fetchOperators();
  }, []);

  const fetchOperators = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/admin/users?role=operator', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setOperators(result.data);
        }
      }
    } catch (error) {
      console.error('Error fetching operators:', error);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleEquipment = (item: string) => {
    setSelectedEquipment(prev =>
      prev.includes(item)
        ? prev.filter(e => e !== item)
        : [...prev, item]
    );
  };

  const toggleBitSize = (size: string) => {
    setSelectedBitSizes(prev =>
      prev.includes(size)
        ? prev.filter(s => s !== size)
        : [...prev, size]
    );
  };

  // Calculate shop arrival time based on job arrival time minus offset
  const calculateShopArrival = (minutesBefore: number) => {
    if (!formData.arrival_time) {
      alert('Please set the job arrival time first');
      return;
    }

    const [hours, minutes] = formData.arrival_time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes - minutesBefore;

    // Handle negative times (wrap to previous day)
    const shopHours = Math.floor((totalMinutes + 1440) % 1440 / 60);
    const shopMinutes = (totalMinutes + 1440) % 60;

    const shopArrivalTime = `${String(shopHours).padStart(2, '0')}:${String(shopMinutes).padStart(2, '0')}`;
    handleInputChange('shop_arrival_time', shopArrivalTime);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired. Please log in again.');
        router.push('/login');
        return;
      }

      // Combine bit sizes with equipment
      const allEquipment = [...selectedEquipment];
      if (selectedBitSizes.length > 0) {
        allEquipment.push(...selectedBitSizes.map(size => `${size} Bit`));
      }

      const response = await fetch('/api/admin/job-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          ...formData,
          estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
          assigned_to: formData.assigned_to || null,
          equipment_needed: allEquipment,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setShowSuccess(true);
        setTimeout(() => {
          router.push('/dashboard/admin/job-orders');
        }, 2000);
      } else {
        alert(result.error || 'Failed to create job order');
      }
    } catch (error) {
      console.error('Error creating job order:', error);
      alert('An error occurred while creating the job order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard/admin"
              className="p-3 bg-white rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
            >
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
                <span className="text-5xl">📋</span>
                Create Job Order
              </h1>
              <p className="text-gray-600 font-medium mt-1">Create and assign new work order to operators</p>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {showSuccess && (
          <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-6 mb-6 shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-800 font-bold text-lg">
                Job order created successfully! Redirecting...
              </p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Basic Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Job Number *</label>
                <input
                  type="text"
                  required
                  value={formData.job_number}
                  onChange={(e) => handleInputChange('job_number', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                  placeholder="e.g., 234893"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Job Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                  placeholder="e.g., WHITEHAWK (CAM) / PIEDMONT ATH."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={formData.customer_name}
                  onChange={(e) => handleInputChange('customer_name', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                  placeholder="e.g., WHITEHAWK (CAM)"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Contact</label>
                <input
                  type="text"
                  value={formData.customer_contact}
                  onChange={(e) => handleInputChange('customer_contact', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                  placeholder="Phone or email"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Job Type *</label>
                <select
                  required
                  value={formData.job_type}
                  onChange={(e) => handleInputChange('job_type', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                >
                  <option value="">Select job type</option>
                  <option value="CORE DRILLING">Core Drilling</option>
                  <option value="WALL SAWING">Wall Sawing</option>
                  <option value="SLAB SAWING">Slab Sawing</option>
                  <option value="WIRE SAWING">Wire Sawing</option>
                  <option value="HAND SAWING">Hand Sawing</option>
                  <option value="DEMOLITION">Demolition</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => handleInputChange('priority', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-3">Job Difficulty Rating (1-10)</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => handleInputChange('difficulty_rating', rating.toString())}
                      className={`flex-1 py-3 px-2 rounded-xl font-bold text-sm transition-all ${
                        formData.difficulty_rating === rating.toString()
                          ? rating <= 3
                            ? 'bg-green-500 text-white shadow-lg scale-105'
                            : rating <= 6
                            ? 'bg-yellow-500 text-white shadow-lg scale-105'
                            : rating <= 8
                            ? 'bg-orange-500 text-white shadow-lg scale-105'
                            : 'bg-red-500 text-white shadow-lg scale-105'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-2 px-1">
                  <span>Easy</span>
                  <span>Moderate</span>
                  <span>Hard</span>
                  <span>Very Hard</span>
                </div>
              </div>
            </div>
          </div>

          {/* Location Information */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Location Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Location Name *</label>
                <input
                  type="text"
                  required
                  value={formData.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                  placeholder="e.g., PIEDMONT ATHENS"
                />
              </div>

              <div className="md:col-span-1">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Address *</label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                  placeholder="e.g., 1199 PRINCE AVE, ATHENS, GA"
                />
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Job Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={6}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                placeholder="Detailed job description and instructions..."
              />
            </div>
          </div>

          {/* Assignment & Scheduling */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Assignment & Scheduling</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Assign to Operator
                </label>
                <select
                  value={formData.assigned_to}
                  onChange={(e) => handleInputChange('assigned_to', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                >
                  <option value="">Unassigned (Schedule Later)</option>
                  {operators.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Scheduled Date</label>
                <input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => handleInputChange('scheduled_date', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Job Site Arrival Time *</label>
                <input
                  type="time"
                  value={formData.arrival_time}
                  onChange={(e) => handleInputChange('arrival_time', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                />
                <p className="text-xs text-gray-500 mt-1">When operator should arrive at job site</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Shop Arrival Time *</label>
                <input
                  type="time"
                  value={formData.shop_arrival_time}
                  onChange={(e) => handleInputChange('shop_arrival_time', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                />
                <p className="text-xs text-gray-500 mt-1 mb-2">When operator should be at shop</p>

                {/* Quick Choose Buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => calculateShopArrival(30)}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    30 min before
                  </button>
                  <button
                    type="button"
                    onClick={() => calculateShopArrival(45)}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    45 min before
                  </button>
                  <button
                    type="button"
                    onClick={() => calculateShopArrival(60)}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    1 hr before
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Estimated Hours</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={formData.estimated_hours}
                  onChange={(e) => handleInputChange('estimated_hours', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                  placeholder="e.g., 8.00"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Point of Contact On-Site Name</label>
                <input
                  type="text"
                  value={formData.foreman_name}
                  onChange={(e) => handleInputChange('foreman_name', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                  placeholder="e.g., JAMES"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Point of Contact On-Site Phone</label>
                <input
                  type="tel"
                  value={formData.foreman_phone}
                  onChange={(e) => handleInputChange('foreman_phone', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                  placeholder="(xxx) xxx-xxxx"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Salesman Name</label>
                <input
                  type="text"
                  value={formData.salesman_name}
                  onChange={(e) => handleInputChange('salesman_name', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                  placeholder="e.g., CAMERON AMOS"
                />
              </div>
            </div>
          </div>

          {/* Equipment Selection - Show for Core Drilling */}
          {formData.job_type === 'CORE DRILLING' && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Equipment Needed</h2>

              {/* Drills */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase">Hilti Drills</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {CORE_DRILLING_EQUIPMENT.drills.map((drill) => (
                    <label
                      key={drill}
                      className="flex items-center gap-2 p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-400 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEquipment.includes(drill)}
                        onChange={() => toggleEquipment(drill)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm font-medium text-gray-800">{drill}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Bit Sizes */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase">Bit Sizes</h3>
                <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
                  {BIT_SIZES.map((size) => (
                    <label
                      key={size}
                      className="flex items-center justify-center gap-2 p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-400 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedBitSizes.includes(size)}
                        onChange={() => toggleBitSize(size)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm font-bold text-gray-800">{size}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Ladders */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase">Ladders</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {CORE_DRILLING_EQUIPMENT.ladders.map((ladder) => (
                    <label
                      key={ladder}
                      className="flex items-center gap-2 p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-400 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEquipment.includes(ladder)}
                        onChange={() => toggleEquipment(ladder)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm font-medium text-gray-800">{ladder}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Lifts */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase">Lifts</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {CORE_DRILLING_EQUIPMENT.lifts.map((lift) => (
                    <label
                      key={lift}
                      className="flex items-center gap-2 p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-400 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEquipment.includes(lift)}
                        onChange={() => toggleEquipment(lift)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm font-medium text-gray-800">{lift}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Accessories */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase">Accessories</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {CORE_DRILLING_EQUIPMENT.accessories.map((accessory) => (
                    <label
                      key={accessory}
                      className="flex items-center gap-2 p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-400 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEquipment.includes(accessory)}
                        onChange={() => toggleEquipment(accessory)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm font-medium text-gray-800">{accessory}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Extension Cords */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase">Extension Cords</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {CORE_DRILLING_EQUIPMENT.cords.map((cord) => (
                    <label
                      key={cord}
                      className="flex items-center gap-2 p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-400 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEquipment.includes(cord)}
                        onChange={() => toggleEquipment(cord)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm font-medium text-gray-800">{cord}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Vacuums */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase">Vacuums</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {CORE_DRILLING_EQUIPMENT.vacuums.map((vacuum) => (
                    <label
                      key={vacuum}
                      className="flex items-center gap-2 p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-400 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEquipment.includes(vacuum)}
                        onChange={() => toggleEquipment(vacuum)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm font-medium text-gray-800">{vacuum}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Generators */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase">Power</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {CORE_DRILLING_EQUIPMENT.generators.map((generator) => (
                    <label
                      key={generator}
                      className="flex items-center gap-2 p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-400 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEquipment.includes(generator)}
                        onChange={() => toggleEquipment(generator)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm font-medium text-gray-800">{generator}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Selected Equipment Summary */}
              {(selectedEquipment.length > 0 || selectedBitSizes.length > 0) && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-blue-800 mb-2">
                    Selected Equipment ({selectedEquipment.length + selectedBitSizes.length} items):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedEquipment.map((item) => (
                      <span
                        key={item}
                        className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold"
                      >
                        {item}
                      </span>
                    ))}
                    {selectedBitSizes.map((size) => (
                      <span
                        key={size}
                        className="px-3 py-1 bg-purple-600 text-white rounded-lg text-xs font-semibold"
                      >
                        {size} Bit
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Job Site Details */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Job Site Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Job Site Number</label>
                <input
                  type="text"
                  value={formData.job_site_number}
                  onChange={(e) => handleInputChange('job_site_number', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">PO Number</label>
                <input
                  type="text"
                  value={formData.po_number}
                  onChange={(e) => handleInputChange('po_number', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Job Number</label>
                <input
                  type="text"
                  value={formData.customer_job_number}
                  onChange={(e) => handleInputChange('customer_job_number', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <Link
              href="/dashboard/admin"
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-semibold transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Save size={20} />
                  Create Job Order
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
