'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isAdmin, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { GoogleAddressAutocomplete } from '@/components/ui/GoogleAddressAutocomplete';
import {
  ArrowLeft, ArrowRight, Check, ClipboardList, User as UserIcon,
  MapPin, Wrench, HardHat, Calendar, ShieldCheck, BarChart3,
  Building2, ChevronRight, Loader2, CheckCircle, AlertTriangle,
  ChevronDown, Phone, FileText, DollarSign, Zap, Clock,
  Clipboard, Star, Droplets, Plug, Wind, Scissors, Truck, Mic
} from 'lucide-react';
import { CalendarPicker } from '@/components/ui/CalendarPicker';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { VoiceMicButton } from '@/components/ui/VoiceMicButton';

// ── Constants ─────────────────────────────────────────────────
const SALESMEN = [
  'Andres A',
  'Adam I',
  'Jey Y',
  'Doug R',
  'David S',
];

const STEPS = [
  { num: 1, title: 'Request Info', icon: ClipboardList, color: 'from-blue-500 to-blue-600' },
  { num: 2, title: 'Customer & Location', icon: MapPin, color: 'from-indigo-500 to-purple-600' },
  { num: 3, title: 'Scope of Work', icon: Wrench, color: 'from-violet-500 to-purple-600' },
  { num: 4, title: 'Equipment', icon: HardHat, color: 'from-amber-500 to-orange-600' },
  { num: 5, title: 'Scheduling', icon: Calendar, color: 'from-cyan-500 to-blue-600' },
  { num: 6, title: 'Site Compliance', icon: ShieldCheck, color: 'from-emerald-500 to-teal-600' },
  { num: 7, title: 'Difficulty & Notes', icon: BarChart3, color: 'from-rose-500 to-red-600' },
  { num: 8, title: 'Jobsite Conditions', icon: Building2, color: 'from-orange-500 to-red-600' },
];

const SERVICE_TYPES = [
  { code: 'CD', label: 'Core Drilling', gradient: 'from-blue-500 to-indigo-600', lightBg: 'bg-blue-50 border-blue-200 text-blue-700' },
  { code: 'DFS', label: 'Diamond Flat Sawing', gradient: 'from-violet-500 to-purple-600', lightBg: 'bg-violet-50 border-violet-200 text-violet-700' },
  { code: 'WS/TS', label: 'Wall/Track Sawing', gradient: 'from-orange-500 to-red-500', lightBg: 'bg-orange-50 border-orange-200 text-orange-700' },
  { code: 'CS', label: 'Chain Sawing', gradient: 'from-amber-500 to-orange-600', lightBg: 'bg-amber-50 border-amber-200 text-amber-700' },
  { code: 'HHS', label: 'Handheld Sawing', gradient: 'from-emerald-500 to-teal-600', lightBg: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  { code: 'WireSaw', label: 'Wire Sawing', gradient: 'from-cyan-500 to-blue-600', lightBg: 'bg-cyan-50 border-cyan-200 text-cyan-700' },
  { code: 'GPR', label: 'GPR Scanning', gradient: 'from-rose-500 to-pink-600', lightBg: 'bg-rose-50 border-rose-200 text-rose-700' },
  { code: 'Demo', label: 'Selective Demo', gradient: 'from-slate-600 to-slate-800', lightBg: 'bg-slate-50 border-slate-300 text-slate-700' },
  { code: 'Other', label: 'Other', gradient: 'from-gray-500 to-gray-700', lightBg: 'bg-gray-50 border-gray-200 text-gray-700' },
];

const EQUIPMENT_PRESETS = [
  { abbrev: 'HHS', full: 'Hydraulic Hand Saw', gradient: 'from-emerald-500 to-teal-600' },
  { abbrev: 'DPP', full: 'Diesel Power Pack', gradient: 'from-blue-500 to-indigo-600' },
  { abbrev: 'TS', full: 'Track Saw', gradient: 'from-orange-500 to-red-500' },
  { abbrev: 'WS', full: 'Wall Saw', gradient: 'from-violet-500 to-purple-600' },
  { abbrev: 'GPP', full: 'Gas Power Pack', gradient: 'from-amber-500 to-orange-600' },
  { abbrev: 'DFS', full: 'Diesel Floor Saw', gradient: 'from-cyan-500 to-blue-600' },
  { abbrev: 'ECD', full: 'Electric Core Drill', gradient: 'from-rose-500 to-pink-600' },
  { abbrev: 'HCD', full: 'Hydraulic Core Drill', gradient: 'from-sky-500 to-blue-600' },
];

// ── Form state type ──────────────────────────────────────────
interface FormData {
  // Step 1
  submitted_by: string;
  date_submitted: string;
  po_number: string;
  // Step 2
  contractor_name: string;
  site_contact: string;
  site_address: string;
  contact_phone: string;
  location_name: string;
  // Step 3
  description: string;
  service_types: string[];
  estimated_cost: string;
  // Step 4
  equipment_needed: string[];
  special_equipment: string;
  custom_equipment_input: string;
  equipment_rentals: { name: string; pickup_required: boolean }[];
  rental_equipment_input: string;
  // Step 5
  start_date: string;
  end_date: string;
  special_arrival: boolean;
  special_arrival_time: string;
  can_work_fridays: boolean;
  can_work_weekends: boolean;
  outside_hours: boolean;
  outside_hours_details: string;
  // Step 6
  orientation_required: boolean;
  orientation_datetime: string;
  badging_required: boolean;
  badging_type: string;
  special_instructions: string;
  // Step 7
  difficulty_rating: number;
  additional_notes: string;
  // Step 8
  water_available: boolean;
  water_available_ft: string;
  water_control: boolean;
  manpower_provided: boolean;
  scaffolding_provided: boolean;
  electricity_available: boolean;
  electricity_available_ft: string;
  inside_outside: 'inside' | 'outside' | '';
  proper_ventilation: boolean;
  overcutting_allowed: boolean;
  cord_480: boolean;
  cord_480_ft: string;
  clean_up_required: boolean;
  high_work: boolean;
  high_work_ft: string;
  high_work_access: 'lift_provided' | 'we_provide' | 'ladder' | '';
  hyd_hose: boolean;
  hyd_hose_ft: string;
  plastic_needed: boolean;
}

const initialFormData: FormData = {
  submitted_by: '',
  date_submitted: new Date().toISOString().split('T')[0],
  po_number: '',
  contractor_name: '',
  site_contact: '',
  site_address: '',
  contact_phone: '',
  location_name: '',
  description: '',
  service_types: [],
  estimated_cost: '',
  equipment_needed: [],
  special_equipment: '',
  custom_equipment_input: '',
  equipment_rentals: [],
  rental_equipment_input: '',
  start_date: '',
  end_date: '',
  special_arrival: false,
  special_arrival_time: '',
  can_work_fridays: true,
  can_work_weekends: false,
  outside_hours: false,
  outside_hours_details: '',
  orientation_required: false,
  orientation_datetime: '',
  badging_required: false,
  badging_type: '',
  special_instructions: '',
  difficulty_rating: 1,
  additional_notes: '',
  water_available: false,
  water_available_ft: '',
  water_control: false,
  manpower_provided: false,
  scaffolding_provided: false,
  electricity_available: false,
  electricity_available_ft: '',
  inside_outside: '',
  proper_ventilation: false,
  overcutting_allowed: false,
  cord_480: false,
  cord_480_ft: '',
  clean_up_required: false,
  high_work: false,
  high_work_ft: '',
  high_work_access: '',
  hyd_hose: false,
  hyd_hose_ft: '',
  plastic_needed: false,
};

// ── Reusable UI helpers ──────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-500 uppercase tracking-wider mb-2.5">
      {children}
      {required && <span className="text-red-400 text-sm">*</span>}
    </label>
  );
}

function InputField({ icon: Icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: any }) {
  return (
    <div className="relative group">
      {Icon && (
        <Icon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
      )}
      <input
        {...props}
        className={`w-full ${Icon ? 'pl-12' : 'pl-4'} pr-4 py-3.5 sm:py-4 bg-white border border-slate-200 rounded-xl text-base text-slate-800 placeholder-slate-400
          focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:shadow-sm
          hover:border-slate-300 transition-all duration-200 ${props.className || ''}`}
      />
    </div>
  );
}

function TextArea({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full px-4 py-3.5 sm:py-4 bg-white border border-slate-200 rounded-xl text-base text-slate-800 placeholder-slate-400
        focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:shadow-sm
        hover:border-slate-300 transition-all duration-200 resize-none ${props.className || ''}`}
    />
  );
}

function Toggle({ checked, onChange, label, icon: Icon }: { checked: boolean; onChange: (v: boolean) => void; label: string; icon?: any }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-4 w-full text-left p-4 rounded-xl border transition-all duration-200 ${
        checked
          ? 'bg-blue-50 border-blue-200 shadow-sm'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className={`relative w-12 h-7 rounded-full transition-all duration-200 flex-shrink-0 ${checked ? 'bg-blue-600 shadow-inner' : 'bg-slate-300'}`}>
        <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-200 ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </div>
      {Icon && <Icon size={18} className={`flex-shrink-0 ${checked ? 'text-blue-600' : 'text-slate-400'}`} />}
      <span className={`text-base font-medium ${checked ? 'text-blue-700' : 'text-slate-600'}`}>{label}</span>
    </button>
  );
}

function ConditionCheck({ checked, onChange, label, icon: Icon, showFt, ftValue, onFtChange, accentColor = 'blue' }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; icon?: any;
  showFt?: boolean; ftValue?: string; onFtChange?: (v: string) => void;
  accentColor?: 'blue' | 'amber' | 'emerald' | 'violet' | 'rose' | 'cyan' | 'orange' | 'teal';
}) {
  const colorMap: Record<string, { bg: string; border: string; check: string; icon: string; text: string; ftBg: string; ftBorder: string; ftRing: string }> = {
    blue:    { bg: 'bg-blue-50', border: 'border-blue-300', check: 'bg-blue-600 border-blue-600', icon: 'text-blue-600', text: 'text-blue-800', ftBg: 'bg-blue-50', ftBorder: 'border-blue-300', ftRing: 'focus:ring-blue-500/20 focus:border-blue-500' },
    amber:   { bg: 'bg-amber-50', border: 'border-amber-300', check: 'bg-amber-600 border-amber-600', icon: 'text-amber-600', text: 'text-amber-800', ftBg: 'bg-amber-50', ftBorder: 'border-amber-300', ftRing: 'focus:ring-amber-500/20 focus:border-amber-500' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-300', check: 'bg-emerald-600 border-emerald-600', icon: 'text-emerald-600', text: 'text-emerald-800', ftBg: 'bg-emerald-50', ftBorder: 'border-emerald-300', ftRing: 'focus:ring-emerald-500/20 focus:border-emerald-500' },
    violet:  { bg: 'bg-violet-50', border: 'border-violet-300', check: 'bg-violet-600 border-violet-600', icon: 'text-violet-600', text: 'text-violet-800', ftBg: 'bg-violet-50', ftBorder: 'border-violet-300', ftRing: 'focus:ring-violet-500/20 focus:border-violet-500' },
    rose:    { bg: 'bg-rose-50', border: 'border-rose-300', check: 'bg-rose-600 border-rose-600', icon: 'text-rose-600', text: 'text-rose-800', ftBg: 'bg-rose-50', ftBorder: 'border-rose-300', ftRing: 'focus:ring-rose-500/20 focus:border-rose-500' },
    cyan:    { bg: 'bg-cyan-50', border: 'border-cyan-300', check: 'bg-cyan-600 border-cyan-600', icon: 'text-cyan-600', text: 'text-cyan-800', ftBg: 'bg-cyan-50', ftBorder: 'border-cyan-300', ftRing: 'focus:ring-cyan-500/20 focus:border-cyan-500' },
    orange:  { bg: 'bg-orange-50', border: 'border-orange-300', check: 'bg-orange-600 border-orange-600', icon: 'text-orange-600', text: 'text-orange-800', ftBg: 'bg-orange-50', ftBorder: 'border-orange-300', ftRing: 'focus:ring-orange-500/20 focus:border-orange-500' },
    teal:    { bg: 'bg-teal-50', border: 'border-teal-300', check: 'bg-teal-600 border-teal-600', icon: 'text-teal-600', text: 'text-teal-800', ftBg: 'bg-teal-50', ftBorder: 'border-teal-300', ftRing: 'focus:ring-teal-500/20 focus:border-teal-500' },
  };
  const c = colorMap[accentColor] || colorMap.blue;

  return (
    <div className={`flex items-center gap-4 p-4 sm:p-5 rounded-xl border-2 transition-all duration-200 ${
      checked ? `${c.bg} ${c.border} shadow-sm` : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
    }`}>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`flex-shrink-0 w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
          checked ? `${c.check} shadow-sm` : 'border-slate-300 bg-white hover:border-blue-400'
        }`}
      >
        {checked && <Check size={18} className="text-white" />}
      </button>
      {Icon && <Icon size={20} className={`flex-shrink-0 ${checked ? c.icon : 'text-slate-400'}`} />}
      <span className={`text-base sm:text-lg flex-1 ${checked ? `${c.text} font-semibold` : 'text-slate-600'}`}>{label}</span>
      {showFt && checked && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={ftValue || ''}
            onChange={(e) => onFtChange?.(e.target.value)}
            placeholder="0"
            className={`w-24 sm:w-28 px-4 py-2.5 sm:py-3 border-2 ${c.ftBorder} ${c.ftBg} rounded-xl text-base sm:text-lg font-bold text-slate-800 text-center ${c.ftRing} focus:ring-2 focus:outline-none transition-all`}
          />
          <span className="text-sm sm:text-base text-slate-600 font-bold">ft.</span>
        </div>
      )}
    </div>
  );
}

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-50/80 border border-slate-200/60 rounded-2xl p-5 sm:p-6 space-y-4 ${className}`}>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function ScheduleFormPage() {
  const [user, setUser] = useState<User | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState<FormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdJobNumber, setCreatedJobNumber] = useState('');
  const [error, setError] = useState('');
  const [salesDropdownOpen, setSalesDropdownOpen] = useState(false);
  // Customer/contact autocomplete state
  const [customerSuggestions, setCustomerSuggestions] = useState<string[]>([]);
  const [contactSuggestions, setContactSuggestions] = useState<{ contact_name: string; contact_phone: string }[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [allCustomers, setAllCustomers] = useState<string[]>([]);
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);
  const salesDropdownRef = useRef<HTMLDivElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const contactDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || !isAdmin()) {
      router.push('/dashboard');
      return;
    }
    setUser(currentUser);

    // Load all customer names for autocomplete
    const loadCustomers = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      try {
        const res = await fetch('/api/admin/schedule-contacts', {
          headers: { 'Authorization': `Bearer ${session.session.access_token}` },
        });
        const data = await res.json();
        if (data.customers) setAllCustomers(data.customers);
      } catch {}
    };
    loadCustomers();
  }, [router]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (salesDropdownRef.current && !salesDropdownRef.current.contains(e.target as Node)) {
        setSalesDropdownOpen(false);
      }
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
      if (contactDropdownRef.current && !contactDropdownRef.current.contains(e.target as Node)) {
        setShowContactDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const updateForm = useCallback((updates: Partial<FormData>) => {
    setForm(f => ({ ...f, ...updates }));
    setError('');
  }, []);

  // Filter customer suggestions as user types
  const handleCustomerChange = useCallback((value: string) => {
    updateForm({ contractor_name: value });
    if (value.trim().length > 0) {
      const filtered = allCustomers.filter(c =>
        c.toLowerCase().includes(value.toLowerCase())
      );
      setCustomerSuggestions(filtered);
      setShowCustomerDropdown(filtered.length > 0);
    } else {
      setCustomerSuggestions([]);
      setShowCustomerDropdown(false);
    }
  }, [allCustomers, updateForm]);

  // When a customer is selected, load their contacts
  const selectCustomer = useCallback(async (name: string) => {
    updateForm({ contractor_name: name });
    setShowCustomerDropdown(false);
    // Fetch contacts for this customer
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;
    try {
      const res = await fetch(`/api/admin/schedule-contacts?customer=${encodeURIComponent(name)}`, {
        headers: { 'Authorization': `Bearer ${session.session.access_token}` },
      });
      const data = await res.json();
      if (data.contacts) setContactSuggestions(data.contacts);
    } catch {}
  }, [updateForm]);

  // Handle contact name input with autocomplete
  const handleContactChange = useCallback((value: string) => {
    updateForm({ site_contact: value });
    if (value.trim().length > 0 && contactSuggestions.length > 0) {
      const filtered = contactSuggestions.filter(c =>
        c.contact_name?.toLowerCase().includes(value.toLowerCase())
      );
      setShowContactDropdown(filtered.length > 0);
    } else {
      setShowContactDropdown(false);
    }
  }, [contactSuggestions, updateForm]);

  // When a contact is selected, auto-fill the phone
  const selectContact = useCallback((contact: { contact_name: string; contact_phone: string }) => {
    updateForm({
      site_contact: contact.contact_name,
      contact_phone: contact.contact_phone || '',
    });
    setShowContactDropdown(false);
  }, [updateForm]);

  // ── Voice input for description ─────────────────────────────
  const voiceInput = useVoiceInput({
    continuous: true,
    accumulateResults: true,
    silenceTimeout: 3000,
    onResult: (transcript: string) => {
      // Append transcribed text to existing description
      setForm(f => ({
        ...f,
        description: f.description
          ? f.description.trimEnd() + ' ' + transcript
          : transcript,
      }));
    },
  });

  const toggleVoice = useCallback(() => {
    if (voiceInput.isListening) {
      voiceInput.stop();
    } else {
      voiceInput.start();
    }
  }, [voiceInput]);

  // ── Validation per step ────────────────────────────────────
  const validateStep = (step: number): string | null => {
    switch (step) {
      case 2:
        if (!form.contractor_name.trim()) return 'Contractor / Customer name is required.';
        break;
      case 3:
        if (form.service_types.length === 0) return 'Select at least one service type.';
        break;
      case 5:
        if (!form.start_date) return 'Start date is required.';
        break;
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(currentStep);
    if (err) { setError(err); return; }
    setError('');
    setCurrentStep(s => Math.min(s + 1, 8));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goPrev = () => {
    setError('');
    setCurrentStep(s => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Submit ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    const err = validateStep(currentStep);
    if (err) { setError(err); return; }
    setSubmitting(true);
    setError('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { router.push('/login'); return; }

      const payload = {
        // Step 1
        submitted_by: form.submitted_by || null,
        date_submitted: form.date_submitted,
        po_number: form.po_number || null,
        // Step 2
        customer_name: form.contractor_name.trim(),
        site_contact: form.site_contact || null,
        contact_phone: form.contact_phone || null,
        address: form.site_address || null,
        location_name: form.location_name || null,
        // Step 3
        description: form.description || null,
        job_type: form.service_types.join(', '),
        estimated_cost: form.estimated_cost ? parseFloat(form.estimated_cost) : null,
        // Step 4
        equipment_needed: form.equipment_needed,
        special_equipment: form.special_equipment || null,
        equipment_rentals: form.equipment_rentals.map(r =>
          r.pickup_required ? `${r.name} (PICKUP REQUIRED)` : r.name
        ),
        // Step 5
        scheduled_date: form.start_date,
        end_date: form.end_date || null,
        scheduling_flexibility: {
          special_arrival: form.special_arrival,
          special_arrival_time: form.special_arrival_time || null,
          can_work_fridays: form.can_work_fridays,
          can_work_weekends: form.can_work_weekends,
          outside_hours: form.outside_hours,
          outside_hours_details: form.outside_hours_details || null,
        },
        site_compliance: {
          orientation_required: form.orientation_required,
          orientation_datetime: form.orientation_datetime || null,
          badging_required: form.badging_required,
          badging_type: form.badging_type || null,
          special_instructions: form.special_instructions || null,
        },
        difficulty_rating: form.difficulty_rating,
        additional_notes: form.additional_notes || null,
        jobsite_conditions: {
          water_available: form.water_available,
          water_available_ft: form.water_available_ft ? Number(form.water_available_ft) : null,
          water_control: form.water_control,
          manpower_provided: form.manpower_provided,
          scaffolding_provided: form.scaffolding_provided,
          electricity_available: form.electricity_available,
          electricity_available_ft: form.electricity_available_ft ? Number(form.electricity_available_ft) : null,
          inside_outside: form.inside_outside || null,
          proper_ventilation: form.proper_ventilation,
          overcutting_allowed: form.overcutting_allowed,
          cord_480: form.cord_480,
          cord_480_ft: form.cord_480_ft ? Number(form.cord_480_ft) : null,
          clean_up_required: form.clean_up_required,
          high_work: form.high_work,
          high_work_ft: form.high_work_ft ? Number(form.high_work_ft) : null,
          high_work_access: form.high_work_access || null,
          hyd_hose: form.hyd_hose,
          hyd_hose_ft: form.hyd_hose_ft ? Number(form.hyd_hose_ft) : null,
          plastic_needed: form.plastic_needed,
        },
      };

      const res = await fetch('/api/admin/schedule-form', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        setError(result.error || 'Failed to create job');
        return;
      }

      setCreatedJobNumber(result.data.job_number);
      setSubmitted(true);

      // Fire-and-forget: save contact info for autocomplete
      if (form.contractor_name.trim()) {
        const { data: sessionForContacts } = await supabase.auth.getSession();
        if (sessionForContacts.session) {
          fetch('/api/admin/schedule-contacts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sessionForContacts.session.access_token}`,
            },
            body: JSON.stringify({
              customer_name: form.contractor_name.trim(),
              contact_name: form.site_contact?.trim() || null,
              contact_phone: form.contact_phone?.trim() || null,
            }),
          }).catch(() => {}); // ignore errors — non-critical
        }
      }
    } catch (err: any) {
      setError(err.message || 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Add custom equipment ───────────────────────────────────
  const addCustomEquipment = () => {
    const val = form.custom_equipment_input.trim();
    if (val && !form.equipment_needed.includes(val)) {
      updateForm({ equipment_needed: [...form.equipment_needed, val], custom_equipment_input: '' });
    }
  };

  // ── Add rental equipment ──────────────────────────────────
  const addRentalEquipment = () => {
    const val = form.rental_equipment_input.trim();
    if (val && !form.equipment_rentals.some(r => r.name === val)) {
      updateForm({ equipment_rentals: [...form.equipment_rentals, { name: val, pickup_required: false }], rental_equipment_input: '' });
    }
  };

  // ── Loading ────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 relative">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-sm text-slate-500 font-medium">Loading Schedule Form...</p>
        </div>
      </div>
    );
  }

  // ── Success screen ─────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200/60 p-10 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-200">
            <CheckCircle size={40} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Job Created!</h2>
          <p className="text-sm text-slate-500 mb-1">Job Number</p>
          <p className="text-xl font-bold text-blue-600 mb-1">{createdJobNumber}</p>
          <p className="text-sm text-slate-500 mb-8">
            Customer: <span className="font-semibold text-slate-700">{form.contractor_name}</span>
          </p>
          <div className="flex gap-3">
            <Link
              href="/dashboard/admin/schedule-board"
              className="flex-1 px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl text-sm font-semibold transition-all shadow-md hover:shadow-lg text-center"
            >
              View Schedule Board
            </Link>
            <button
              onClick={() => { setForm({ ...initialFormData }); setSubmitted(false); setCurrentStep(1); }}
              className="flex-1 px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-all"
            >
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentStepData = STEPS[currentStep - 1];

  // ══════════════════════════════════════════════════════════════
  // RENDER STEPS
  // ══════════════════════════════════════════════════════════════
  const renderStep = () => {
    switch (currentStep) {
      // ── STEP 1: Request Information ───────────────────────
      case 1:
        return (
          <div className="space-y-6">
            {/* Salesman Dropdown */}
            <div>
              <Label>Submitted By</Label>
              <div className="relative" ref={salesDropdownRef}>
                <button
                  type="button"
                  onClick={() => setSalesDropdownOpen(!salesDropdownOpen)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 sm:py-4 bg-white border rounded-xl text-base transition-all duration-200 ${
                    salesDropdownOpen
                      ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <UserIcon size={18} className="text-slate-400" />
                    <span className={form.submitted_by ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                      {form.submitted_by || 'Select salesman...'}
                    </span>
                  </div>
                  <ChevronDown size={18} className={`text-slate-400 transition-transform duration-200 ${salesDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {salesDropdownOpen && (
                  <div className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                    {SALESMEN.map(name => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => { updateForm({ submitted_by: name }); setSalesDropdownOpen(false); }}
                        className={`w-full flex items-center gap-4 px-5 py-4 text-base text-left transition-all ${
                          form.submitted_by === name
                            ? 'bg-blue-50 text-blue-700 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${
                          form.submitted_by === name
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {name.split(' ').map(n => n[0]).join('')}
                        </div>
                        {name}
                        {form.submitted_by === name && <Check size={16} className="ml-auto text-blue-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <Label>Date Submitted</Label>
                <InputField
                  icon={Calendar}
                  type="date"
                  value={form.date_submitted}
                  readOnly
                  className="bg-slate-50/80 text-slate-500 cursor-default"
                />
              </div>
              <div>
                <Label>PO Number</Label>
                <InputField
                  icon={FileText}
                  placeholder="Enter PO # (optional)"
                  value={form.po_number}
                  onChange={e => updateForm({ po_number: e.target.value })}
                />
              </div>
            </div>
          </div>
        );

      // ── STEP 2: Customer & Job Location ───────────────────
      case 2:
        return (
          <div className="space-y-6">
            {/* Customer Name with Autocomplete */}
            <div ref={customerDropdownRef} className="relative">
              <Label required>Contractor / Customer Name</Label>
              <InputField
                icon={Building2}
                placeholder="Enter contractor or customer name"
                value={form.contractor_name}
                onChange={e => handleCustomerChange(e.target.value)}
                onFocus={() => {
                  if (form.contractor_name.trim() && customerSuggestions.length > 0) {
                    setShowCustomerDropdown(true);
                  }
                }}
                autoFocus
                autoComplete="off"
              />
              {showCustomerDropdown && customerSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                  {customerSuggestions.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => selectCustomer(name)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-all"
                    >
                      <Building2 size={16} className="text-slate-400 flex-shrink-0" />
                      <span className="font-medium">{name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Site Contact with Autocomplete */}
              <div ref={contactDropdownRef} className="relative">
                <Label>Site Contact Name</Label>
                <InputField
                  icon={UserIcon}
                  placeholder="Contact person on site"
                  value={form.site_contact}
                  onChange={e => handleContactChange(e.target.value)}
                  onFocus={() => {
                    if (contactSuggestions.length > 0) setShowContactDropdown(true);
                  }}
                  autoComplete="off"
                />
                {showContactDropdown && contactSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                    {contactSuggestions
                      .filter(c => c.contact_name && (!form.site_contact.trim() || c.contact_name.toLowerCase().includes(form.site_contact.toLowerCase())))
                      .map((contact, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectContact(contact)}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-all"
                      >
                        <span className="font-medium">{contact.contact_name}</span>
                        {contact.contact_phone && (
                          <span className="text-xs text-slate-400">{contact.contact_phone}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label>Contact Phone</Label>
                <InputField
                  icon={Phone}
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={form.contact_phone}
                  onChange={e => updateForm({ contact_phone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Site Address</Label>
              <GoogleAddressAutocomplete
                value={form.site_address}
                onChange={(address) => updateForm({ site_address: address })}
                placeholder="Start typing an address..."
              />
            </div>
            <div>
              <Label>Location Name</Label>
              <InputField
                icon={MapPin}
                placeholder="Building name, floor, area, etc."
                value={form.location_name}
                onChange={e => updateForm({ location_name: e.target.value })}
              />
            </div>
          </div>
        );

      // ── STEP 3: Scope of Work ─────────────────────────────
      case 3:
        return (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <Label>Description of Work</Label>
                {voiceInput.isSupported && (
                  <div className="flex items-center gap-2">
                    {voiceInput.isListening && (
                      <span className="text-xs font-semibold text-orange-500 animate-pulse">Listening...</span>
                    )}
                    <VoiceMicButton
                      isListening={voiceInput.isListening}
                      onClick={toggleVoice}
                      size="sm"
                      mode="free-speech"
                    />
                  </div>
                )}
              </div>
              <TextArea
                rows={4}
                placeholder="Describe the work to be performed in detail... or tap the mic to dictate"
                value={form.description}
                onChange={e => updateForm({ description: e.target.value })}
              />
              {voiceInput.isListening && voiceInput.interimTranscript && (
                <div className="mt-2 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-700 italic">
                  <span className="font-semibold text-orange-600">Hearing: </span>
                  {voiceInput.interimTranscript}
                </div>
              )}
              {voiceInput.error && (
                <p className="mt-2 text-xs text-red-500 font-medium">{voiceInput.error}</p>
              )}
            </div>
            <div>
              <Label required>Service Type</Label>
              <p className="text-xs sm:text-sm text-slate-400 mb-3 -mt-1">Select all that apply</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {SERVICE_TYPES.map(st => {
                  const isSelected = form.service_types.includes(st.code);
                  return (
                    <button
                      key={st.code}
                      type="button"
                      onClick={() => {
                        const updated = isSelected
                          ? form.service_types.filter(s => s !== st.code)
                          : [...form.service_types, st.code];
                        updateForm({ service_types: updated });
                      }}
                      className={`flex items-center gap-3 px-4 py-3.5 sm:py-4 rounded-xl text-sm sm:text-base font-semibold border-2 transition-all duration-200 ${
                        isSelected
                          ? `bg-gradient-to-r ${st.gradient} text-white border-transparent shadow-lg`
                          : `bg-white ${st.lightBg} border-2 hover:shadow-md hover:scale-[1.02]`
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 ${
                        isSelected ? 'bg-white/20 text-white' : `bg-gradient-to-br ${st.gradient} text-white`
                      }`}>
                        {st.code.substring(0, 2)}
                      </div>
                      <span className="text-left leading-tight">{st.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>Est. / Quoted Price</Label>
              <InputField
                icon={DollarSign}
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.estimated_cost}
                onChange={e => updateForm({ estimated_cost: e.target.value })}
              />
            </div>
          </div>
        );

      // ── STEP 4: Equipment Requirements ────────────────────
      case 4:
        return (
          <div className="space-y-6">
            <div>
              <Label>Standard Equipment</Label>
              <p className="text-xs sm:text-sm text-slate-400 mb-3 -mt-1">Select Patriot equipment presets</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {EQUIPMENT_PRESETS.map(eq => {
                  const isSelected = form.equipment_needed.includes(eq.abbrev);
                  return (
                    <button
                      key={eq.abbrev}
                      type="button"
                      onClick={() => {
                        const updated = isSelected
                          ? form.equipment_needed.filter(e => e !== eq.abbrev)
                          : [...form.equipment_needed, eq.abbrev];
                        updateForm({ equipment_needed: updated });
                      }}
                      className={`flex flex-col items-center gap-2 px-4 py-4 sm:py-5 rounded-xl text-sm font-bold border-2 transition-all duration-200 ${
                        isSelected
                          ? `bg-gradient-to-br ${eq.gradient} text-white border-transparent shadow-lg shadow-purple-200/50`
                          : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:bg-purple-50/50 hover:shadow-md'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black ${
                        isSelected ? 'bg-white/20 text-white' : `bg-gradient-to-br ${eq.gradient} text-white shadow-sm`
                      }`}>
                        {eq.abbrev}
                      </div>
                      <span className="text-xs mt-0.5">{eq.full}</span>
                    </button>
                  );
                })}
              </div>

              {/* Selected equipment tags */}
              {form.equipment_needed.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {form.equipment_needed.map(eq => {
                    const preset = EQUIPMENT_PRESETS.find(p => p.abbrev === eq);
                    return (
                      <span key={eq} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-xs font-semibold">
                        {eq}{preset ? ` — ${preset.full}` : ''}
                        <button
                          type="button"
                          onClick={() => updateForm({ equipment_needed: form.equipment_needed.filter(e => e !== eq) })}
                          className="ml-0.5 text-purple-400 hover:text-purple-700 transition-colors"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Side-by-side: Custom Equipment + Rental Equipment ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Left: Add Custom Equipment */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
                    <Wrench size={16} className="text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">Add Custom Equipment</h3>
                </div>
                <div className="flex gap-2">
                  <InputField
                    icon={Wrench}
                    placeholder="Type custom equipment..."
                    value={form.custom_equipment_input}
                    onChange={e => updateForm({ custom_equipment_input: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomEquipment(); } }}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={addCustomEquipment}
                    className="px-4 py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md hover:shadow-lg"
                  >
                    Add
                  </button>
                </div>
                {/* Custom equipment added items (shown as part of equipment_needed above) */}
              </div>

              {/* Right: Add Rental Equipment */}
              <div className="bg-rose-50/50 border border-rose-200 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-sm">
                    <Truck size={16} className="text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">Add Rental Equipment</h3>
                </div>
                <div className="flex gap-2">
                  <InputField
                    icon={Truck}
                    placeholder="e.g., Scissor Lift, Boom Lift..."
                    value={form.rental_equipment_input}
                    onChange={e => updateForm({ rental_equipment_input: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRentalEquipment(); } }}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={addRentalEquipment}
                    className="px-4 py-3 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md hover:shadow-lg"
                  >
                    Add
                  </button>
                </div>

                {/* Rental equipment tags with pickup toggle */}
                {form.equipment_rentals.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {form.equipment_rentals.map((rental, idx) => (
                      <div key={idx} className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-rose-200 rounded-xl text-sm font-semibold shadow-sm">
                        <Truck size={14} className="text-rose-500 flex-shrink-0" />
                        <span className="text-rose-700">{rental.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = form.equipment_rentals.map((r, i) =>
                              i === idx ? { ...r, pickup_required: !r.pickup_required } : r
                            );
                            updateForm({ equipment_rentals: updated });
                          }}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                            rental.pickup_required
                              ? 'bg-amber-100 border-amber-300 text-amber-700'
                              : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-amber-50 hover:border-amber-200'
                          }`}
                        >
                          Pickup: {rental.pickup_required ? 'Yes' : 'No'}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateForm({ equipment_rentals: form.equipment_rentals.filter((_, i) => i !== idx) })}
                          className="text-rose-400 hover:text-rose-700 transition-colors font-bold text-base leading-none"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {form.equipment_rentals.length === 0 && (
                  <p className="mt-2 text-xs text-slate-400 italic">No rental equipment added yet</p>
                )}
              </div>
            </div>

            {/* Special Equipment Notes — below both cards */}
            <div>
              <Label>Special Equipment Notes</Label>
              <TextArea
                rows={3}
                placeholder="Any special equipment requirements..."
                value={form.special_equipment}
                onChange={e => updateForm({ special_equipment: e.target.value })}
              />
            </div>
          </div>
        );

      // ── STEP 5: Scheduling Details ────────────────────────
      case 5:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <Label required>Start Date</Label>
                <CalendarPicker
                  value={form.start_date}
                  onChange={(date) => updateForm({ start_date: date })}
                  minDate={new Date().toISOString().split('T')[0]}
                  icon={Calendar}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <CalendarPicker
                  value={form.end_date}
                  onChange={(date) => updateForm({ end_date: date })}
                  minDate={form.start_date || new Date().toISOString().split('T')[0]}
                  icon={Calendar}
                />
              </div>
            </div>

            <SectionCard>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Scheduling Flexibility</p>
              <Toggle
                checked={form.special_arrival}
                onChange={v => updateForm({ special_arrival: v })}
                label="Special Arrival Time?"
                icon={Clock}
              />
              {form.special_arrival && (
                <div className="pl-4 border-l-2 border-blue-200 ml-2 space-y-2">
                  <Label>Arrival Time</Label>
                  <InputField
                    icon={Clock}
                    type="time"
                    value={form.special_arrival_time}
                    onChange={e => updateForm({ special_arrival_time: e.target.value })}
                  />
                  {form.special_arrival_time && (
                    <p className="text-xs text-blue-600 font-medium">
                      Crew arrives at {(() => {
                        const [h, m] = form.special_arrival_time.split(':');
                        const hour = parseInt(h);
                        return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
                      })()}
                    </p>
                  )}
                </div>
              )}

              <Toggle
                checked={form.can_work_fridays}
                onChange={v => updateForm({ can_work_fridays: v })}
                label="Can Work Fridays?"
              />
              <Toggle
                checked={form.can_work_weekends}
                onChange={v => updateForm({ can_work_weekends: v })}
                label="Can Work Weekends?"
              />
              <Toggle
                checked={form.outside_hours}
                onChange={v => updateForm({ outside_hours: v })}
                label="Outside Hours?"
                icon={Clock}
              />
              {form.outside_hours && (
                <div className="pl-4 border-l-2 border-blue-200 ml-2">
                  <InputField
                    placeholder="Enter details (e.g. after 6 PM only)..."
                    value={form.outside_hours_details}
                    onChange={e => updateForm({ outside_hours_details: e.target.value })}
                  />
                </div>
              )}
            </SectionCard>
          </div>
        );

      // ── STEP 6: Site Access & Compliance ──────────────────
      case 6:
        return (
          <div className="space-y-6">
            <SectionCard>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Access Requirements</p>
              <Toggle
                checked={form.orientation_required}
                onChange={v => {
                  const updates: Partial<FormData> = { orientation_required: v };
                  // Auto-fill orientation date with start date when toggled ON
                  if (v && form.start_date && !form.orientation_datetime) {
                    updates.orientation_datetime = `${form.start_date}T08:00`;
                  }
                  updateForm(updates);
                }}
                label="Orientation Required?"
                icon={ShieldCheck}
              />
              {form.orientation_required && (
                <div className="pl-4 border-l-2 border-emerald-200 ml-2 space-y-3">
                  <Label>Orientation Date</Label>
                  <InputField
                    icon={Calendar}
                    type="date"
                    value={form.orientation_datetime ? form.orientation_datetime.split('T')[0] : ''}
                    onChange={e => {
                      const timepart = form.orientation_datetime?.includes('T')
                        ? form.orientation_datetime.split('T')[1]
                        : '08:00';
                      updateForm({ orientation_datetime: `${e.target.value}T${timepart}` });
                    }}
                  />
                  <Label>Orientation Time</Label>
                  <InputField
                    icon={Clock}
                    type="time"
                    value={form.orientation_datetime?.includes('T') ? form.orientation_datetime.split('T')[1] : ''}
                    onChange={e => {
                      const datepart = form.orientation_datetime?.includes('T')
                        ? form.orientation_datetime.split('T')[0]
                        : form.start_date || new Date().toISOString().split('T')[0];
                      updateForm({ orientation_datetime: `${datepart}T${e.target.value}` });
                    }}
                  />
                  {form.start_date && (
                    <p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                      <CheckCircle size={12} />
                      Auto-filled from start date: {new Date(form.start_date + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </div>
              )}

              <Toggle
                checked={form.badging_required}
                onChange={v => updateForm({ badging_required: v })}
                label="Badging Required?"
                icon={UserIcon}
              />
              {form.badging_required && (
                <div className="pl-4 border-l-2 border-emerald-200 ml-2 space-y-2">
                  <Label>Badge Type</Label>
                  <InputField
                    placeholder="e.g. TWIC, Site Badge, etc."
                    value={form.badging_type}
                    onChange={e => updateForm({ badging_type: e.target.value })}
                  />
                </div>
              )}
            </SectionCard>

            <div>
              <Label>Special Instructions</Label>
              <TextArea
                rows={5}
                placeholder="Any special site access instructions, parking, PPE requirements, etc."
                value={form.special_instructions}
                onChange={e => updateForm({ special_instructions: e.target.value })}
              />
            </div>
          </div>
        );

      // ── STEP 7: Job Difficulty & Notes ────────────────────
      case 7:
        return (
          <div className="space-y-6">
            <div>
              <Label>Job Difficulty Rating (1–10)</Label>
              <p className="text-xs text-slate-400 mb-4 -mt-1">1 = Routine &nbsp;|&nbsp; 5 = Moderate &nbsp;|&nbsp; 10 = Highly Complex</p>
              <div className="flex gap-2 sm:gap-2.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
                  const isActive = form.difficulty_rating === n;
                  const colorClass = n <= 3 ? 'emerald' : n <= 6 ? 'amber' : 'red';
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => updateForm({ difficulty_rating: n })}
                      className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl text-sm sm:text-base font-bold transition-all duration-200 ${
                        isActive
                          ? colorClass === 'emerald'
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200 scale-110'
                            : colorClass === 'amber'
                              ? 'bg-amber-500 text-white shadow-lg shadow-amber-200 scale-110'
                              : 'bg-red-600 text-white shadow-lg shadow-red-200 scale-110'
                          : 'bg-white border-2 border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-slate-400 px-1 font-medium">
                <span>Routine</span>
                <span>Moderate</span>
                <span>Complex</span>
              </div>
            </div>
            <div>
              <Label>Additional Notes</Label>
              <TextArea
                rows={6}
                placeholder="Any additional notes, special considerations, or comments..."
                value={form.additional_notes}
                onChange={e => updateForm({ additional_notes: e.target.value })}
              />
            </div>
          </div>
        );

      // ── STEP 8: Jobsite Conditions ────────────────────────
      case 8:
        return (
          <div className="space-y-6">
            {/* Utilities & Resources */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <Droplets size={14} className="text-white" />
                </div>
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Utilities & Resources</h3>
              </div>
              <div className="space-y-2.5">
                <ConditionCheck
                  checked={form.water_available} onChange={v => updateForm({ water_available: v })}
                  label="Water Available" icon={Droplets} showFt ftValue={form.water_available_ft}
                  onFtChange={v => updateForm({ water_available_ft: v })} accentColor="cyan"
                />
                <ConditionCheck
                  checked={form.water_control} onChange={v => updateForm({ water_control: v })}
                  label="Water Control" icon={Droplets} accentColor="teal"
                />
                <ConditionCheck
                  checked={form.electricity_available} onChange={v => updateForm({ electricity_available: v })}
                  label="Electricity Available" icon={Plug} showFt ftValue={form.electricity_available_ft}
                  onFtChange={v => updateForm({ electricity_available_ft: v })} accentColor="amber"
                />
                <ConditionCheck
                  checked={form.cord_480} onChange={v => updateForm({ cord_480: v })}
                  label="480 Cord" icon={Zap} showFt ftValue={form.cord_480_ft}
                  onFtChange={v => updateForm({ cord_480_ft: v })} accentColor="orange"
                />
              </div>
            </div>

            {/* Staffing & Equipment */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <UserIcon size={14} className="text-white" />
                </div>
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Staffing & Equipment</h3>
              </div>
              <div className="space-y-2.5">
                <ConditionCheck
                  checked={form.manpower_provided} onChange={v => updateForm({ manpower_provided: v })}
                  label="Manpower Provided" icon={UserIcon} accentColor="violet"
                />
                <ConditionCheck
                  checked={form.scaffolding_provided} onChange={v => updateForm({ scaffolding_provided: v })}
                  label="Scaffolding / Lift Provided" icon={Truck} accentColor="violet"
                />
                <ConditionCheck
                  checked={form.hyd_hose} onChange={v => updateForm({ hyd_hose: v })}
                  label="Hyd. Hose" icon={Wrench} showFt ftValue={form.hyd_hose_ft}
                  onFtChange={v => updateForm({ hyd_hose_ft: v })} accentColor="blue"
                />
              </div>
            </div>

            {/* Work Environment */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Wind size={14} className="text-white" />
                </div>
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Work Environment</h3>
              </div>
              <div className="space-y-2.5">
                {/* Inside / Outside toggle */}
                <div className="flex items-center gap-4 p-4 sm:p-5 rounded-xl border-2 border-slate-200 bg-white">
                  <Building2 size={20} className="text-slate-500 flex-shrink-0" />
                  <span className="text-base sm:text-lg text-slate-700 font-semibold flex-1">Inside / Outside:</span>
                  <div className="flex gap-1.5 bg-slate-100 rounded-xl p-1.5">
                    {(['inside', 'outside'] as const).map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateForm({ inside_outside: opt })}
                        className={`px-6 sm:px-8 py-2.5 sm:py-3 rounded-lg text-sm sm:text-base font-bold transition-all duration-200 capitalize ${
                          form.inside_outside === opt
                            ? opt === 'inside'
                              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                              : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-white'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <ConditionCheck
                  checked={form.proper_ventilation} onChange={v => updateForm({ proper_ventilation: v })}
                  label="Proper Ventilation (if inside)" icon={Wind} accentColor="emerald"
                />
                <ConditionCheck
                  checked={form.high_work} onChange={v => {
                    const updates: Partial<FormData> = { high_work: v };
                    if (!v) { updates.high_work_ft = ''; updates.high_work_access = ''; }
                    updateForm(updates);
                  }}
                  label="High Work" icon={Star} showFt ftValue={form.high_work_ft}
                  onFtChange={v => updateForm({ high_work_ft: v })} accentColor="rose"
                />

                {/* High Work Sub-options */}
                {form.high_work && (
                  <div className="ml-4 sm:ml-6 pl-4 sm:pl-5 border-l-3 border-rose-300 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <p className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-2">Height Access Method</p>

                    {/* Lift Provided */}
                    <button
                      type="button"
                      onClick={() => updateForm({ high_work_access: form.high_work_access === 'lift_provided' ? '' : 'lift_provided' })}
                      className={`flex items-center gap-3 w-full p-4 rounded-xl border-2 transition-all duration-200 ${
                        form.high_work_access === 'lift_provided'
                          ? 'bg-emerald-50 border-emerald-300 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                        form.high_work_access === 'lift_provided' ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 bg-white'
                      }`}>
                        {form.high_work_access === 'lift_provided' && <Check size={16} className="text-white" />}
                      </div>
                      <Truck size={18} className={form.high_work_access === 'lift_provided' ? 'text-emerald-600' : 'text-slate-400'} />
                      <span className={`text-base font-semibold ${form.high_work_access === 'lift_provided' ? 'text-emerald-800' : 'text-slate-600'}`}>
                        Lift Provided (by customer)
                      </span>
                      {form.high_work_access === 'lift_provided' && (
                        <span className="ml-auto text-xs font-bold text-emerald-600 bg-emerald-100 px-2.5 py-1 rounded-full">No rental needed</span>
                      )}
                    </button>

                    {/* We Are Providing (only if lift not provided) */}
                    {form.high_work_access !== 'lift_provided' && (
                      <button
                        type="button"
                        onClick={() => updateForm({ high_work_access: form.high_work_access === 'we_provide' ? '' : 'we_provide' })}
                        className={`flex items-center gap-3 w-full p-4 rounded-xl border-2 transition-all duration-200 ${
                          form.high_work_access === 'we_provide'
                            ? 'bg-blue-50 border-blue-300 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                          form.high_work_access === 'we_provide' ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'
                        }`}>
                          {form.high_work_access === 'we_provide' && <Check size={16} className="text-white" />}
                        </div>
                        <HardHat size={18} className={form.high_work_access === 'we_provide' ? 'text-blue-600' : 'text-slate-400'} />
                        <span className={`text-base font-semibold ${form.high_work_access === 'we_provide' ? 'text-blue-800' : 'text-slate-600'}`}>
                          We Are Providing (Patriot)
                        </span>
                        {form.high_work_access === 'we_provide' && (
                          <span className="ml-auto text-xs font-bold text-blue-600 bg-blue-100 px-2.5 py-1 rounded-full">Rental required</span>
                        )}
                      </button>
                    )}

                    {/* Using Ladder (only if lift not provided) */}
                    {form.high_work_access !== 'lift_provided' && (
                      <button
                        type="button"
                        onClick={() => updateForm({ high_work_access: form.high_work_access === 'ladder' ? '' : 'ladder' })}
                        className={`flex items-center gap-3 w-full p-4 rounded-xl border-2 transition-all duration-200 ${
                          form.high_work_access === 'ladder'
                            ? 'bg-amber-50 border-amber-300 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                          form.high_work_access === 'ladder' ? 'bg-amber-600 border-amber-600' : 'border-slate-300 bg-white'
                        }`}>
                          {form.high_work_access === 'ladder' && <Check size={16} className="text-white" />}
                        </div>
                        <Star size={18} className={form.high_work_access === 'ladder' ? 'text-amber-600' : 'text-slate-400'} />
                        <span className={`text-base font-semibold ${form.high_work_access === 'ladder' ? 'text-amber-800' : 'text-slate-600'}`}>
                          Using Ladder
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Job Specifications */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <Scissors size={14} className="text-white" />
                </div>
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Job Specifications</h3>
              </div>
              <div className="space-y-2.5">
                <ConditionCheck
                  checked={form.overcutting_allowed} onChange={v => updateForm({ overcutting_allowed: v })}
                  label="Overcutting Allowed" icon={Scissors} accentColor="amber"
                />
                <ConditionCheck
                  checked={form.clean_up_required} onChange={v => updateForm({ clean_up_required: v })}
                  label="Clean Up Required" icon={Clipboard} accentColor="orange"
                />
                <ConditionCheck
                  checked={form.plastic_needed} onChange={v => updateForm({ plastic_needed: v })}
                  label="Plastic Needed" icon={FileText} accentColor="teal"
                />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ══════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-[960px] mx-auto px-4 sm:px-8 h-16 sm:h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/admin"
              className="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <div className="h-6 w-px bg-slate-200" />
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${currentStepData.color} flex items-center justify-center shadow-sm transition-all duration-300`}>
                <ClipboardList size={16} className="text-white" />
              </div>
              <span className="hidden sm:inline">Schedule Form</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
              <span className="text-xs font-bold text-slate-500">STEP</span>
              <span className={`text-sm font-bold bg-gradient-to-r ${currentStepData.color} bg-clip-text text-transparent`}>
                {currentStep}/8
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[960px] mx-auto px-4 sm:px-8 py-6 sm:py-10">
        {/* ── Step Indicator ───────────────────────────── */}
        <div className="mb-8 sm:mb-10 overflow-x-auto pb-2 -mx-2 px-2">
          <div className="flex gap-1.5 sm:gap-2 min-w-max">
            {STEPS.map(step => {
              const StepIcon = step.icon;
              const isActive = currentStep === step.num;
              const isCompleted = currentStep > step.num;
              return (
                <button
                  key={step.num}
                  onClick={() => {
                    if (step.num < currentStep) {
                      setCurrentStep(step.num);
                      setError('');
                    }
                  }}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? `bg-gradient-to-r ${step.color} text-white shadow-lg`
                      : isCompleted
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer hover:bg-emerald-100 hover:shadow-sm'
                        : 'bg-white text-slate-400 border border-slate-200'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle size={16} />
                  ) : (
                    <StepIcon size={16} />
                  )}
                  <span className="hidden lg:inline">{step.title}</span>
                  <span className="lg:hidden">{step.num}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Step Content Card ─────────────────────────── */}
        <div ref={formRef} className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/60 shadow-lg overflow-hidden">
          {/* Step header */}
          <div className={`px-6 sm:px-8 py-6 sm:py-7 bg-gradient-to-r ${currentStepData.color} relative overflow-hidden`}>
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djZoLTZ2LTZNMTY2IDh2NmgtNnYtNk0xNiAzNHY2aC02di02TTE2IDIwdjZoLTZ2LTZNMzYgMjB2NmgtNnYtNk0zNiA4djZoLTZ2LTZNNTYgMzR2NmgtNnYtNk01NiAyMHY2aC02di02TTU2IDh2NmgtNnYtNk0xNiA0OHY2aC02di02TTM2IDQ4djZoLTZ2LTZNNTYgNDh2NmgtNnYtNiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
            <div className="relative flex items-center gap-4 sm:gap-5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                {(() => { const StepIcon = currentStepData.icon; return <StepIcon size={24} className="text-white" />; })()}
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white">
                  {currentStepData.title}
                </h2>
                <p className="text-white/70 text-xs sm:text-sm font-medium">
                  {currentStep === 1 && 'Enter request and submission details'}
                  {currentStep === 2 && 'Customer information and job location'}
                  {currentStep === 3 && 'Define the services needed for this job'}
                  {currentStep === 4 && 'Select equipment for this project'}
                  {currentStep === 5 && 'Set dates and scheduling flexibility'}
                  {currentStep === 6 && 'Site access and compliance requirements'}
                  {currentStep === 7 && 'Rate difficulty and add notes'}
                  {currentStep === 8 && 'Check all conditions that apply'}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8 lg:p-10">
            {/* Error message */}
            {error && (
              <div className="mb-6 flex items-center gap-3 px-5 py-4 bg-red-50 border border-red-200 rounded-xl text-sm sm:text-base text-red-700 animate-in fade-in slide-in-from-top-1 duration-200">
                <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            {renderStep()}
          </div>

          {/* ── Navigation ─────────────────────────────── */}
          <div className="px-6 sm:px-8 lg:px-10 py-5 sm:py-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <button
              onClick={goPrev}
              disabled={currentStep === 1}
              className={`flex items-center gap-2 px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl text-sm sm:text-base font-semibold transition-all duration-200 ${
                currentStep === 1
                  ? 'text-slate-300 cursor-not-allowed'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:shadow-md hover:border-slate-300'
              }`}
            >
              <ArrowLeft size={18} />
              Previous
            </button>

            {currentStep < 8 ? (
              <button
                onClick={goNext}
                className={`flex items-center gap-2 px-7 sm:px-8 py-3 sm:py-3.5 bg-gradient-to-r ${currentStepData.color} hover:shadow-lg text-white rounded-xl text-sm sm:text-base font-semibold transition-all duration-200 shadow-md`}
              >
                Next Step
                <ArrowRight size={18} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-7 sm:px-8 py-3 sm:py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-xl text-sm sm:text-base font-semibold transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Creating Job...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Submit Schedule Form
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* ── Progress bar ─────────────────────────────── */}
        <div className="mt-6 h-2 bg-slate-200/80 rounded-full overflow-hidden shadow-inner">
          <div
            className={`h-full bg-gradient-to-r ${currentStepData.color} rounded-full transition-all duration-500 ease-out`}
            style={{ width: `${(currentStep / 8) * 100}%` }}
          />
        </div>
        <p className="text-center text-xs text-slate-400 mt-2 font-medium">{Math.round((currentStep / 8) * 100)}% complete</p>
      </div>
    </div>
  );
}
