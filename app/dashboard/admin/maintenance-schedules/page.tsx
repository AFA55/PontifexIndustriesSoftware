'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Calendar, Plus, Edit2, Trash2, CheckCircle, Clock } from 'lucide-react';

interface Equipment {
  id: string;
  name: string;
  brand: string;
  model: string;
}

interface MaintenanceSchedule {
  id: string;
  equipment_id: string;
  maintenance_type: string;
  description: string;
  interval_hours: number | null;
  interval_days: number | null;
  interval_linear_feet: number | null;
  alert_hours_before: number;
  alert_days_before: number;
  alert_feet_before: number;
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  is_active: boolean;
  equipment: {
    name: string;
    brand: string;
    model: string;
  };
}

export default function MaintenanceSchedulesPage() {
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MaintenanceSchedule | null>(null);

  const [formData, setFormData] = useState({
    equipmentId: '',
    maintenanceType: '',
    description: '',
    intervalHours: '',
    intervalDays: '',
    intervalLinearFeet: '',
    alertHoursBefore: '5',
    alertDaysBefore: '7',
    alertFeetBefore: '500',
    lastMaintenanceDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchSchedules();
    fetchEquipment();
  }, []);

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/equipment/maintenance-schedule');
      const data = await response.json();

      if (response.ok) {
        setSchedules(data.schedules || []);
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEquipment = async () => {
    try {
      const { data, error } = await supabase
        .from('equipment')
        .select('id, name, brand, model')
        .order('name');

      if (!error) {
        setEquipment(data || []);
      }
    } catch (error) {
      console.error('Error fetching equipment:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        equipmentId: formData.equipmentId,
        maintenanceType: formData.maintenanceType,
        description: formData.description,
        intervalHours: formData.intervalHours ? parseFloat(formData.intervalHours) : null,
        intervalDays: formData.intervalDays ? parseInt(formData.intervalDays) : null,
        intervalLinearFeet: formData.intervalLinearFeet ? parseFloat(formData.intervalLinearFeet) : null,
        alertHoursBefore: parseFloat(formData.alertHoursBefore),
        alertDaysBefore: parseInt(formData.alertDaysBefore),
        alertFeetBefore: parseFloat(formData.alertFeetBefore),
        lastMaintenanceDate: formData.lastMaintenanceDate,
        lastMaintenanceHours: 0,
        lastMaintenanceFeet: 0
      };

      const url = editingSchedule
        ? '/api/equipment/maintenance-schedule'
        : '/api/equipment/maintenance-schedule';

      const response = await fetch(url, {
        method: editingSchedule ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingSchedule
            ? { scheduleId: editingSchedule.id, ...payload }
            : payload
        )
      });

      if (response.ok) {
        fetchSchedules();
        resetForm();
        setShowForm(false);
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error submitting schedule:', error);
      alert('Error submitting schedule');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (schedule: MaintenanceSchedule) => {
    setEditingSchedule(schedule);
    setFormData({
      equipmentId: schedule.equipment_id,
      maintenanceType: schedule.maintenance_type,
      description: schedule.description || '',
      intervalHours: schedule.interval_hours?.toString() || '',
      intervalDays: schedule.interval_days?.toString() || '',
      intervalLinearFeet: schedule.interval_linear_feet?.toString() || '',
      alertHoursBefore: schedule.alert_hours_before.toString(),
      alertDaysBefore: schedule.alert_days_before.toString(),
      alertFeetBefore: schedule.alert_feet_before.toString(),
      lastMaintenanceDate: schedule.last_maintenance_date?.split('T')[0] || new Date().toISOString().split('T')[0]
    });
    setShowForm(true);
  };

  const handleDelete = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this maintenance schedule?')) return;

    try {
      const response = await fetch(`/api/equipment/maintenance-schedule?scheduleId=${scheduleId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchSchedules();
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      equipmentId: '',
      maintenanceType: '',
      description: '',
      intervalHours: '',
      intervalDays: '',
      intervalLinearFeet: '',
      alertHoursBefore: '5',
      alertDaysBefore: '7',
      alertFeetBefore: '500',
      lastMaintenanceDate: new Date().toISOString().split('T')[0]
    });
    setEditingSchedule(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
              <Calendar className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Maintenance Schedules
              </h1>
              <p className="text-gray-600">Preventive maintenance scheduling and tracking</p>
            </div>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowForm(!showForm);
            }}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-medium hover:shadow-lg transition-all flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Schedule
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white/60 backdrop-blur-sm border border-gray-200 rounded-xl p-8 shadow-lg mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              {editingSchedule ? 'Edit' : 'Create'} Maintenance Schedule
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-6 mb-6">
                {/* Equipment */}
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Equipment <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={formData.equipmentId}
                    onChange={(e) => setFormData({ ...formData, equipmentId: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select equipment</option>
                    {equipment.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.brand} {eq.model} - {eq.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Maintenance Type */}
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Maintenance Type <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.maintenanceType}
                    onChange={(e) => setFormData({ ...formData, maintenanceType: e.target.value })}
                    placeholder="e.g., Oil Change, Blade Inspection"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Last Maintenance Date */}
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Last Maintenance Date
                  </label>
                  <input
                    type="date"
                    value={formData.lastMaintenanceDate}
                    onChange={(e) => setFormData({ ...formData, lastMaintenanceDate: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Description */}
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Additional details about this maintenance..."
                    rows={2}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Interval Settings */}
                <div className="col-span-2">
                  <h3 className="font-bold text-gray-900 mb-3">Maintenance Intervals (set at least one)</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Every X Hours
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={formData.intervalHours}
                        onChange={(e) => setFormData({ ...formData, intervalHours: e.target.value })}
                        placeholder="100"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Every X Days
                      </label>
                      <input
                        type="number"
                        value={formData.intervalDays}
                        onChange={(e) => setFormData({ ...formData, intervalDays: e.target.value })}
                        placeholder="90"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Every X Linear Feet
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={formData.intervalLinearFeet}
                        onChange={(e) => setFormData({ ...formData, intervalLinearFeet: e.target.value })}
                        placeholder="5000"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Alert Thresholds */}
                <div className="col-span-2">
                  <h3 className="font-bold text-gray-900 mb-3">Alert Thresholds (when to warn operator)</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Alert X Hours Before
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={formData.alertHoursBefore}
                        onChange={(e) => setFormData({ ...formData, alertHoursBefore: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Alert X Days Before
                      </label>
                      <input
                        type="number"
                        value={formData.alertDaysBefore}
                        onChange={(e) => setFormData({ ...formData, alertDaysBefore: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Alert X Feet Before
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={formData.alertFeetBefore}
                        onChange={(e) => setFormData({ ...formData, alertFeetBefore: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {loading ? 'Saving...' : editingSchedule ? 'Update Schedule' : 'Create Schedule'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowForm(false);
                  }}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Schedules List */}
        {loading && !showForm ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading schedules...</p>
          </div>
        ) : schedules.length === 0 ? (
          <div className="bg-white/60 backdrop-blur-sm border border-gray-200 rounded-xl p-12 text-center">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Schedules</h3>
            <p className="text-gray-600">Create your first maintenance schedule to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="bg-white/60 backdrop-blur-sm border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-gray-900">
                        {schedule.maintenance_type}
                      </h3>
                      {schedule.is_active ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                          ACTIVE
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-full">
                          INACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      {schedule.equipment.brand} {schedule.equipment.model} - {schedule.equipment.name}
                    </p>

                    {schedule.description && (
                      <p className="text-sm text-gray-700 mb-3">{schedule.description}</p>
                    )}

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      {schedule.interval_hours && (
                        <div className="bg-blue-50 rounded-lg p-3">
                          <div className="font-medium text-blue-900">Interval</div>
                          <div className="text-blue-700">Every {schedule.interval_hours} hrs</div>
                        </div>
                      )}
                      {schedule.interval_days && (
                        <div className="bg-purple-50 rounded-lg p-3">
                          <div className="font-medium text-purple-900">Interval</div>
                          <div className="text-purple-700">Every {schedule.interval_days} days</div>
                        </div>
                      )}
                      {schedule.interval_linear_feet && (
                        <div className="bg-green-50 rounded-lg p-3">
                          <div className="font-medium text-green-900">Interval</div>
                          <div className="text-green-700">Every {schedule.interval_linear_feet} ft</div>
                        </div>
                      )}
                    </div>

                    {schedule.next_maintenance_date && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="w-4 h-4" />
                        <span>
                          Next maintenance: {new Date(schedule.next_maintenance_date).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(schedule)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(schedule.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
