'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Calendar, User, Building2, Send, MapPin, Wrench, Phone, AlertCircle, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const JOB_TYPES = [
  { code: 'wall_sawing', label: 'Wall Sawing' },
  { code: 'core_drilling', label: 'Core Drilling' },
  { code: 'wire_sawing', label: 'Wire Sawing' },
  { code: 'flat_sawing', label: 'Flat Sawing' },
  { code: 'hand_sawing', label: 'Hand Sawing' },
  { code: 'road_sawing', label: 'Road Sawing' },
  { code: 'ring_sawing', label: 'Ring Sawing' },
  { code: 'chain_sawing', label: 'Chain Sawing' },
  { code: 'demolition', label: 'Demolition' },
  { code: 'cleanup', label: 'Cleanup' },
  { code: 'mobilization', label: 'Mobilization' },
  { code: 'other', label: 'Other' },
];

export interface QuickAddData {
  salesmanName: string;
  salesmanId: string;
  start_date: string;
  end_date: string;
  contractorName: string;
  scope: string;
  jobTypes: string[];
  address: string;
  contactName: string;
  contactPhone: string;
  priority: string;
  estimatedCost: string;
}

interface SalesmanOption { id: string; full_name: string; }

interface QuickAddModalProps {
  salesmen: string[];
  onSubmit: (data: QuickAddData) => void;
  onClose: () => void;
}

export default function QuickAddModal({ salesmen, onSubmit, onClose }: QuickAddModalProps) {
  const [salesmanName, setSalesmanName] = useState('');
  const [salesmanId, setSalesmanId] = useState('');
  const [start_date, setStartDate] = useState('');
  const [end_date, setEndDate] = useState('');
  const [contractorName, setContractorName] = useState('');
  const [scope, setScope] = useState('');
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [address, setAddress] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [priority, setPriority] = useState('medium');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [salesmanOptions, setSalesmanOptions] = useState<SalesmanOption[]>([]);
  const [dateError, setDateError] = useState('');

  useEffect(() => {
    const fetchSalesmen = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['salesman', 'admin', 'super_admin', 'operations_manager'])
        .eq('active', true)
        .order('full_name');
      if (data) setSalesmanOptions(data);
    };
    fetchSalesmen();
  }, []);

  const isValid = salesmanName.trim() && start_date && end_date && contractorName.trim() && jobTypes.length > 0 && !dateError;

  const handleSalesmanChange = (name: string) => {
    setSalesmanName(name);
    const match = salesmanOptions.find(s => s.full_name === name);
    setSalesmanId(match?.id || '');
  };

  // Block weekends from date picker
  const isWeekend = (val: string): boolean => {
    if (!val) return false;
    const d = new Date(val + 'T00:00:00');
    const day = d.getDay();
    return day === 0 || day === 6;
  };

  const handleStartDateChange = (val: string) => {
    if (!val) { setStartDate(''); setEndDate(''); setDateError(''); return; }
    if (isWeekend(val)) return; // silently reject weekends
    setStartDate(val);
    // Default end date to same as start if not set or end < start
    if (!end_date || end_date < val) {
      setEndDate(val);
    }
    setDateError('');
  };

  const handleEndDateChange = (val: string) => {
    if (!val) { setEndDate(''); setDateError(''); return; }
    if (isWeekend(val)) return; // silently reject weekends
    if (start_date && val < start_date) {
      setDateError('End date must be on or after start date');
    } else {
      setDateError('');
    }
    setEndDate(val);
  };

  const toggleJobType = (code: string) => {
    setJobTypes(prev =>
      prev.includes(code) ? prev.filter(t => t !== code) : [...prev, code]
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white dark:bg-[#1a0f35] rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 rounded-t-xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Quick Add Job
                </h2>
                <p className="text-blue-200 text-xs mt-0.5">Required fields marked with *. Assignee notified to complete details.</p>
              </div>
              <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {/* Customer + Salesman */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Customer Name *</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-white/30" />
                  <input type="text" value={contractorName} onChange={(e) => setContractorName(e.target.value)}
                    placeholder="e.g. Turner Construction"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-white/10 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] placeholder:text-gray-400 dark:placeholder-white/30" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Salesman *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-white/30" />
                  <select value={salesmanName} onChange={(e) => handleSalesmanChange(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 border border-gray-300 dark:border-white/10 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] appearance-none">
                    <option value="">Select salesman...</option>
                    {salesmanOptions.length > 0
                      ? salesmanOptions.map(s => <option key={s.id} value={s.full_name}>{s.full_name}</option>)
                      : salesmen.map(name => <option key={name} value={name}>{name}</option>)
                    }
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-white/30 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Start Date + End Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Start Date *</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-white/30" />
                  <input type="date" value={start_date} onChange={(e) => handleStartDateChange(e.target.value)}
                    className="w-full pl-9 pr-2 py-2 border border-gray-300 dark:border-white/10 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm text-gray-900 dark:text-white bg-white dark:bg-white/[0.05]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">End Date *</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-white/30" />
                  <input type="date" value={end_date} onChange={(e) => handleEndDateChange(e.target.value)}
                    min={start_date || undefined}
                    className={`w-full pl-9 pr-2 py-2 border rounded-lg focus:ring-1 text-sm text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] dark:border-white/10 ${
                      dateError ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                    }`} />
                </div>
                {dateError && <p className="text-xs text-red-500 mt-0.5">{dateError}</p>}
              </div>
            </div>

            {/* Priority + Est Cost */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Priority</label>
                <div className="flex gap-1.5">
                  {[
                    { value: 'low', label: 'Low', active: 'bg-gray-200 text-gray-700 ring-gray-400' },
                    { value: 'medium', label: 'Med', active: 'bg-blue-100 text-blue-700 ring-blue-400' },
                    { value: 'high', label: 'High', active: 'bg-amber-100 text-amber-700 ring-amber-400' },
                    { value: 'urgent', label: 'Urgent', active: 'bg-red-100 text-red-700 ring-red-400' },
                  ].map(p => (
                    <button key={p.value} type="button" onClick={() => setPriority(p.value)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        priority === p.value ? `${p.active} border-current ring-1 ring-offset-1` : 'bg-gray-50 dark:bg-white/[0.03] text-gray-400 dark:text-white/40 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/[0.08]'
                      }`}>{p.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Est. Quote $</label>
                <input type="text" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 dark:border-white/10 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] placeholder:text-gray-400 dark:placeholder-white/30" />
              </div>
            </div>

            {/* Job Types — multi-select chips */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1.5 flex items-center gap-1">
                <Wrench className="w-3 h-3" /> Job Types * <span className="text-gray-400 dark:text-white/30 font-normal">(select all that apply)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {JOB_TYPES.map(jt => {
                  const selected = jobTypes.includes(jt.code);
                  return (
                    <button
                      key={jt.code}
                      type="button"
                      onClick={() => toggleJobType(jt.code)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                        selected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-gray-50 dark:bg-white/[0.03] text-gray-600 dark:text-white/60 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:border-gray-300 dark:hover:border-white/20'
                      }`}
                    >
                      {selected && <span className="mr-1">✓</span>}{jt.label}
                    </button>
                  );
                })}
              </div>
              {jobTypes.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-white/30 mt-1">No types selected yet</p>
              )}
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Job Address</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-white/30" />
                <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St, City, State"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-white/10 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] placeholder:text-gray-400 dark:placeholder-white/30" />
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Site Contact</label>
                <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)}
                  placeholder="Foreman name" className="w-full px-3 py-2 border border-gray-300 dark:border-white/10 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] placeholder:text-gray-400 dark:placeholder-white/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Contact Phone</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-white/30" />
                  <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-white/10 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] placeholder:text-gray-400 dark:placeholder-white/30" />
                </div>
              </div>
            </div>

            {/* Scope */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Scope of Work</label>
              <textarea value={scope} onChange={(e) => setScope(e.target.value)}
                placeholder="Brief description — e.g. Core drill 8 holes, 6in diameter through 12in slab"
                rows={2} className="w-full px-3 py-2 border border-gray-300 dark:border-white/10 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] placeholder:text-gray-400 dark:placeholder-white/30 resize-none" />
            </div>

            {/* Notification info */}
            <div className="bg-amber-50 rounded-lg p-2.5 border border-amber-200 flex gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                <strong>{salesmanName || 'The salesman'}</strong> will be notified to complete the full Schedule Form with equipment, permits, and jobsite details.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button onClick={onClose}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-gray-700 dark:text-white rounded-lg font-semibold text-sm transition-all">
                Cancel
              </button>
              <button
                onClick={() => isValid && onSubmit({ salesmanName, salesmanId, start_date, end_date, contractorName, scope, jobTypes, address, contactName, contactPhone, priority, estimatedCost })}
                disabled={!isValid}
                className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white rounded-lg font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                <Send className="w-3.5 h-3.5" /> Create & Notify
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
