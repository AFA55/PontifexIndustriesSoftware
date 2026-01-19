'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Disc, Wrench } from 'lucide-react';

interface Equipment {
  id: string;
  name: string;
  type: string;
  brand?: string;
  model?: string;
  serial_number: string;
  blade_type?: string;
  bit_size?: string;
  qr_code?: string;
  total_usage?: number;
}

interface EquipmentUsageData {
  equipment_type: string;
  equipment_id?: string;
  linear_feet_cut: number;
  task_type: string;
  difficulty_level: 'easy' | 'medium' | 'hard' | 'extreme';
  difficulty_notes?: string;
  blade_type?: string;
  blades_used: number;
  blade_wear_notes?: string;
  hydraulic_hose_used_ft: number;
  water_hose_used_ft: number;
  power_hours: number;
  location_changes: number;
  setup_time_minutes: number;
  notes?: string;
}

interface EquipmentUsageFormProps {
  onSave: (data: EquipmentUsageData) => void;
  onCancel: () => void;
  initialData?: Partial<EquipmentUsageData>;
}

const EQUIPMENT_TYPES = [
  { id: 'hand_saw', label: 'Hand Saw', icon: '🪚' },
  { id: 'slab_saw', label: 'Slab Saw', icon: '⚙️' },
  { id: 'wall_saw', label: 'Wall Saw', icon: '🔨' },
  { id: 'core_drill', label: 'Core Drill', icon: '🔩' },
  { id: 'brokk', label: 'Brokk', icon: '🤖' },
  { id: 'mini_x', label: 'Mini X', icon: '🚜' },
  { id: 'skid_steer', label: 'Skid Steer', icon: '🚧' },
  { id: 'wire_saw', label: 'Wire Saw', icon: '🔗' },
];

const TASK_TYPES = [
  'core_drilling',
  'slab_sawing',
  'wall_sawing',
  'hand_sawing',
  'wire_sawing',
  'demolition',
  'breaking',
];

const DIFFICULTY_LEVELS = [
  { value: 'easy', label: 'Easy', color: 'from-green-500 to-emerald-600', desc: 'Open areas, simple cuts' },
  { value: 'medium', label: 'Medium', color: 'from-yellow-500 to-orange-500', desc: 'Standard job conditions' },
  { value: 'hard', label: 'Hard', color: 'from-orange-500 to-red-500', desc: 'Tight spaces, thick material' },
  { value: 'extreme', label: 'Extreme', color: 'from-red-600 to-pink-700', desc: 'Very difficult access/conditions' },
];

export default function EquipmentUsageForm({ onSave, onCancel, initialData }: EquipmentUsageFormProps) {
  const [formData, setFormData] = useState<EquipmentUsageData>({
    equipment_type: initialData?.equipment_type || '',
    equipment_id: initialData?.equipment_id || '',
    linear_feet_cut: initialData?.linear_feet_cut || 0,
    task_type: initialData?.task_type || '',
    difficulty_level: initialData?.difficulty_level || 'medium',
    difficulty_notes: initialData?.difficulty_notes || '',
    blade_type: initialData?.blade_type || '',
    blades_used: initialData?.blades_used || 0,
    blade_wear_notes: initialData?.blade_wear_notes || '',
    hydraulic_hose_used_ft: initialData?.hydraulic_hose_used_ft || 0,
    water_hose_used_ft: initialData?.water_hose_used_ft || 0,
    power_hours: initialData?.power_hours || 0,
    location_changes: initialData?.location_changes || 0,
    setup_time_minutes: initialData?.setup_time_minutes || 0,
    notes: initialData?.notes || '',
  });

  const [myEquipment, setMyEquipment] = useState<Equipment[]>([]);
  const [filteredEquipment, setFilteredEquipment] = useState<Equipment[]>([]);
  const [loadingEquipment, setLoadingEquipment] = useState(false);

  // Fetch operator's assigned equipment
  useEffect(() => {
    fetchMyEquipment();
  }, []);

  // Filter equipment based on task type
  useEffect(() => {
    if (!formData.task_type) {
      setFilteredEquipment([]);
      return;
    }

    let filtered: Equipment[] = [];

    // Map task types to equipment types
    if (formData.task_type === 'hand_sawing') {
      filtered = myEquipment.filter(eq => eq.type === 'blade' && eq.blade_type === 'handsaw');
    } else if (formData.task_type === 'wall_sawing') {
      filtered = myEquipment.filter(eq => eq.type === 'blade' && eq.blade_type === 'wall_saw');
    } else if (formData.task_type === 'slab_sawing') {
      filtered = myEquipment.filter(eq => eq.type === 'blade' && eq.blade_type === 'slab_saw');
    } else if (formData.task_type === 'core_drilling') {
      filtered = myEquipment.filter(eq => eq.type === 'bit');
    } else {
      // For other tasks, show all equipment
      filtered = myEquipment;
    }

    setFilteredEquipment(filtered);
  }, [formData.task_type, myEquipment]);

  const fetchMyEquipment = async () => {
    setLoadingEquipment(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('equipment')
        .select('id, name, type, brand, model, serial_number, blade_type, bit_size, qr_code, total_usage')
        .eq('assigned_to', user.id)
        .eq('status', 'in_use');

      if (error) {
        console.error('Error fetching equipment:', error);
      } else {
        setMyEquipment(data || []);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoadingEquipment(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.equipment_type || !formData.task_type) {
      alert('Please select equipment type and task type');
      return;
    }

    onSave(formData);
  };

  const updateField = (field: keyof EquipmentUsageData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-2xl border-2 border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-8 py-6">
        <h2 className="text-2xl font-bold text-white drop-shadow-lg">Equipment Usage Tracking</h2>
        <p className="text-blue-100 mt-1 font-medium">Track equipment performance & resource consumption</p>
      </div>

      <div className="p-8 space-y-8">
        {/* Equipment Selection */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border-2 border-blue-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Equipment & Task Info</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Equipment Type *</label>
              <select
                value={formData.equipment_type}
                onChange={(e) => updateField('equipment_type', e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none font-semibold"
                required
              >
                <option value="">Select equipment...</option>
                {EQUIPMENT_TYPES.map(eq => (
                  <option key={eq.id} value={eq.id}>{eq.icon} {eq.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Equipment ID</label>
              <input
                type="text"
                value={formData.equipment_id}
                onChange={(e) => updateField('equipment_id', e.target.value)}
                placeholder="e.g., BROKK-001"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none font-semibold"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Task Type *</label>
              <select
                value={formData.task_type}
                onChange={(e) => updateField('task_type', e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none font-semibold"
                required
              >
                <option value="">Select task...</option>
                {TASK_TYPES.map(task => (
                  <option key={task} value={task}>{task.replace(/_/g, ' ').toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Smart Equipment Selector - Shows after task type is selected */}
          {formData.task_type && filteredEquipment.length > 0 && (
            <div className="mt-4 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-300 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                {formData.task_type.includes('drilling') ? (
                  <Disc className="w-5 h-5 text-purple-600" />
                ) : (
                  <Wrench className="w-5 h-5 text-purple-600" />
                )}
                <h4 className="text-sm font-bold text-purple-900">
                  Select Specific {formData.task_type.includes('drilling') ? 'Bit' : 'Blade'} Used
                </h4>
              </div>
              <select
                value={formData.equipment_id || ''}
                onChange={(e) => {
                  const selectedEquip = filteredEquipment.find(eq => eq.id === e.target.value);
                  updateField('equipment_id', e.target.value);
                  if (selectedEquip) {
                    if (selectedEquip.blade_type) {
                      updateField('blade_type', selectedEquip.blade_type);
                    }
                  }
                }}
                className="w-full px-4 py-3 rounded-xl font-medium bg-white border-2 border-purple-200 hover:border-purple-300 focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition-all duration-200 shadow-sm hover:shadow-md text-gray-900 cursor-pointer"
              >
                <option value="">Select equipment...</option>
                {filteredEquipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.brand} {eq.model} - {eq.name}
                    {eq.blade_type && ` (${eq.blade_type.replace('_', ' ')})`}
                    {eq.bit_size && ` (${eq.bit_size}" bit)`}
                    {eq.qr_code && ` - QR: ${eq.qr_code}`}
                    {` - SN: ...${eq.serial_number.slice(-4)}`}
                    {eq.total_usage !== undefined && ` - ${eq.total_usage.toFixed(0)}ft used`}
                  </option>
                ))}
              </select>
              <p className="text-xs text-purple-700 mt-2 flex items-center gap-1">
                <span>💡</span>
                <span>Usage will be tracked on the selected {formData.task_type.includes('drilling') ? 'bit' : 'blade'} for analytics</span>
              </p>
            </div>
          )}

          {/* Show message if task selected but no equipment available */}
          {formData.task_type && filteredEquipment.length === 0 && !loadingEquipment && (
            <div className="mt-4 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4">
              <p className="text-sm text-yellow-900 font-medium">
                ⚠️ No {formData.task_type.includes('drilling') ? 'bits' : 'blades'} assigned to you for this task type. Contact admin to get equipment assigned.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Linear Feet Cut</label>
              <input
                type="number"
                step="0.01"
                value={formData.linear_feet_cut}
                onChange={(e) => updateField('linear_feet_cut', parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none font-semibold text-lg"
              />
            </div>
          </div>
        </div>

        {/* Difficulty Rating */}
        <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-6 border-2 border-orange-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Job Difficulty *</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {DIFFICULTY_LEVELS.map(level => (
              <button
                key={level.value}
                type="button"
                onClick={() => updateField('difficulty_level', level.value)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  formData.difficulty_level === level.value
                    ? `bg-gradient-to-r ${level.color} text-white border-transparent shadow-xl scale-105`
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                <p className="font-bold text-sm">{level.label}</p>
                <p className={`text-xs mt-1 ${formData.difficulty_level === level.value ? 'text-white/90' : 'text-gray-500'}`}>
                  {level.desc}
                </p>
              </button>
            ))}
          </div>
          <textarea
            value={formData.difficulty_notes}
            onChange={(e) => updateField('difficulty_notes', e.target.value)}
            placeholder="Why was this job difficult? (e.g., tight spaces, thick rebar, multiple location changes)"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none"
            rows={3}
          />
        </div>

        {/* Blade Tracking */}
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border-2 border-purple-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Blade Usage</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Blade Type</label>
              <input
                type="text"
                value={formData.blade_type}
                onChange={(e) => updateField('blade_type', e.target.value)}
                placeholder="e.g., 14-inch diamond"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none font-semibold"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Blades Used</label>
              <input
                type="number"
                value={formData.blades_used}
                onChange={(e) => updateField('blades_used', parseInt(e.target.value) || 0)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none font-semibold text-lg"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-2">Blade Wear Notes</label>
              <input
                type="text"
                value={formData.blade_wear_notes}
                onChange={(e) => updateField('blade_wear_notes', e.target.value)}
                placeholder="e.g., 1 blade 50% worn, 1 blade fully worn"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Resource Consumption */}
        <div className="bg-gradient-to-br from-green-50 to-teal-50 rounded-2xl p-6 border-2 border-green-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Resource Consumption</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Hydraulic Hose (ft)</label>
              <input
                type="number"
                step="0.1"
                value={formData.hydraulic_hose_used_ft}
                onChange={(e) => updateField('hydraulic_hose_used_ft', parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none font-semibold text-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Water Hose (ft)</label>
              <input
                type="number"
                step="0.1"
                value={formData.water_hose_used_ft}
                onChange={(e) => updateField('water_hose_used_ft', parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none font-semibold text-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Power (hours)</label>
              <input
                type="number"
                step="0.1"
                value={formData.power_hours}
                onChange={(e) => updateField('power_hours', parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none font-semibold text-lg"
              />
            </div>
          </div>
        </div>

        {/* Setup & Movement */}
        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-2xl p-6 border-2 border-yellow-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Setup & Movement</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Location Changes</label>
              <input
                type="number"
                value={formData.location_changes}
                onChange={(e) => updateField('location_changes', parseInt(e.target.value) || 0)}
                placeholder="Times equipment was moved"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-yellow-500 focus:outline-none font-semibold text-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Setup Time (minutes)</label>
              <input
                type="number"
                step="0.1"
                value={formData.setup_time_minutes}
                onChange={(e) => updateField('setup_time_minutes', parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-yellow-500 focus:outline-none font-semibold text-lg"
              />
            </div>
          </div>
        </div>

        {/* Additional Notes */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">Additional Notes</label>
          <textarea
            value={formData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Any additional information about equipment usage..."
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
            rows={4}
          />
        </div>
      </div>

      {/* Footer Actions */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-8 py-6 flex gap-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-6 py-4 bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-300 rounded-xl font-bold transition-all shadow-md hover:shadow-lg"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 px-6 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl"
        >
          Save Equipment Usage
        </button>
      </div>
    </form>
  );
}
