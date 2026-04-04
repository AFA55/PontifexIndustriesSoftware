'use client';

export const dynamic = 'force-dynamic';

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
  Clipboard, Star, Droplets, Plug, Wind, Scissors, Truck, Mic, Plus, Trash2,
  Eye, X, Users, Brain,
} from 'lucide-react';
import { CalendarPicker } from '@/components/ui/CalendarPicker';
import { CustomerAutocomplete } from '@/components/ui/CustomerAutocomplete';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { VoiceMicButton } from '@/components/ui/VoiceMicButton';
import AISmartFillModal from './_components/AISmartFillModal';
import CustomerForm from '../customers/_components/CustomerForm';
// Equipment presets no longer displayed as grid; now using SERVICE_EQUIPMENT config
import PhotoUploader from '@/components/PhotoUploader';
import SmartCombobox, { ContactCombobox } from '@/components/SmartCombobox';
// Equipment detail type (inline after equipment-recommendations removal)
interface EquipmentDetail {
  selected: boolean;
  quantity?: number;
  value?: string;
  selections?: string[];
}

// ── Constants ─────────────────────────────────────────────────
const STEPS = [
  { num: 1, title: 'Customer', icon: UserIcon, color: 'from-blue-500 to-blue-600' },
  { num: 2, title: 'Project & Contact', icon: MapPin, color: 'from-indigo-500 to-purple-600' },
  { num: 3, title: 'Scope of Work', icon: Wrench, color: 'from-violet-500 to-purple-600' },
  { num: 4, title: 'Equipment', icon: HardHat, color: 'from-amber-500 to-orange-600' },
  { num: 5, title: 'Scheduling', icon: Calendar, color: 'from-cyan-500 to-blue-600' },
  { num: 6, title: 'Site Compliance', icon: ShieldCheck, color: 'from-emerald-500 to-teal-600' },
  { num: 7, title: 'Difficulty & Notes', icon: BarChart3, color: 'from-rose-500 to-red-600' },
  { num: 8, title: 'Jobsite Conditions', icon: Building2, color: 'from-orange-500 to-red-600' },
];

const SERVICE_TYPES = [
  { code: 'ECD', label: 'Electric Core Drilling', gradient: 'from-pink-500 to-rose-600', lightBg: 'bg-pink-50 border-pink-200 text-pink-700' },
  { code: 'HFCD', label: 'High Frequency Core Drilling', gradient: 'from-blue-500 to-indigo-600', lightBg: 'bg-blue-50 border-blue-200 text-blue-700' },
  { code: 'HCD', label: 'Hydraulic Core Drilling', gradient: 'from-teal-500 to-cyan-600', lightBg: 'bg-teal-50 border-teal-200 text-teal-700' },
  { code: 'DFS', label: 'Diesel Floor Sawing', gradient: 'from-violet-500 to-purple-600', lightBg: 'bg-violet-50 border-violet-200 text-violet-700' },
  { code: 'WS/TS', label: 'Wall/Track Sawing', gradient: 'from-orange-500 to-red-500', lightBg: 'bg-orange-50 border-orange-200 text-orange-700' },
  { code: 'CS', label: 'Chain Sawing', gradient: 'from-amber-500 to-orange-600', lightBg: 'bg-amber-50 border-amber-200 text-amber-700' },
  { code: 'HHS/PS', label: 'Handheld / Push Sawing', gradient: 'from-emerald-500 to-teal-600', lightBg: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  { code: 'WireSaw', label: 'Wire Sawing', gradient: 'from-cyan-500 to-blue-600', lightBg: 'bg-cyan-50 border-cyan-200 text-cyan-700' },
  { code: 'GPR', label: 'GPR Scanning', gradient: 'from-rose-500 to-pink-600', lightBg: 'bg-rose-50 border-rose-200 text-rose-700' },
  { code: 'Demo', label: 'Selective Demo', gradient: 'from-slate-600 to-slate-800', lightBg: 'bg-slate-50 border-slate-300 text-slate-700' },
  { code: 'Brokk', label: 'Brokk', gradient: 'from-stone-500 to-stone-700', lightBg: 'bg-stone-50 border-stone-300 text-stone-700' },
  { code: 'Other', label: 'Other', gradient: 'from-gray-500 to-gray-700', lightBg: 'bg-gray-50 border-gray-200 text-gray-700' },
];

// Service types that support flexible input modes (linear vs areas)
const FLEXIBLE_SCOPE_TYPES = ['WS/TS', 'DFS', 'HHS/PS'];

// Equipment presets config moved to SERVICE_EQUIPMENT

// ── Scope fields per service type (quantity inputs for Step 3) ──
interface ScopeField { key: string; label: string; placeholder: string; type: string; suffix?: string; fullWidth?: boolean }
interface ScopeConfig {
  label: string;
  fields: ScopeField[];
  altFields?: ScopeField[];
  altLabel?: string;
  hasDynamicHoles?: boolean; // Core drilling: dynamic qty + bit size + depth rows
  hasDynamicCuts?: boolean;  // Sawing linear mode: dynamic LF + depth + # cuts rows
  hasDynamicAreas?: boolean; // Sawing areas mode: dynamic L×W×thickness×qty rows
}
const SCOPE_FIELDS: Record<string, ScopeConfig> = {
  'ECD': {
    label: 'Electric Core Drilling Details',
    hasDynamicHoles: true,
    fields: [],
  },
  'HFCD': {
    label: 'High Frequency Core Drilling Details',
    hasDynamicHoles: true,
    fields: [],
  },
  'HCD': {
    label: 'Hydraulic Core Drilling Details',
    hasDynamicHoles: true,
    fields: [],
  },
  'DFS': {
    label: 'Floor Sawing Details',
    hasDynamicCuts: true,
    hasDynamicAreas: true,
    fields: [],
    altLabel: 'Areas + Thickness',
    altFields: [],
  },
  'WS/TS': {
    label: 'Wall/Track Sawing Details',
    hasDynamicCuts: true,
    hasDynamicAreas: true,
    fields: [],
    altLabel: 'Areas + Thickness',
    altFields: [],
  },
  'CS': {
    label: 'Chain Sawing Details',
    hasDynamicCuts: true,
    fields: [],
  },
  'HHS/PS': {
    label: 'Handheld / Push Sawing Details',
    hasDynamicCuts: true,
    hasDynamicAreas: true,
    fields: [],
    altLabel: 'Areas + Thickness',
    altFields: [],
  },
  'WireSaw': {
    label: 'Wire Sawing Details',
    hasDynamicCuts: true,
    fields: [],
  },
  'GPR': {
    label: 'GPR Scanning Details',
    fields: [
      { key: 'area_sqft', label: 'Area', placeholder: '0', type: 'number', suffix: 'sq ft' },
      { key: 'num_scans', label: 'Number of Scans', placeholder: '0', type: 'number' },
    ],
  },
  'Demo': {
    label: 'Selective Demo Details',
    fields: [
      { key: 'description', label: 'Description of Demo Work', placeholder: 'Describe the selective demolition work...', type: 'textarea', fullWidth: true },
    ],
  },
  'Brokk': {
    label: 'Brokk Details',
    hasDynamicAreas: true,
    fields: [],
  },
};

// ── Smart Equipment Recommendations per Service Type (Step 4) ──
interface EquipItem {
  id: string;
  label: string;
  type: 'toggle' | 'qty' | 'option';
  qtyUnit?: string;
  options?: string[];
  showWhen?: string; // sub-option value filter
}
interface ServiceEquipConfig {
  subOption?: { label: string; choices: { value: string; label: string }[] };
  items: EquipItem[];
  getDynamicItems?: (scopeData: Record<string, string>) => EquipItem[];
}

// Helper: extract unique bit sizes from scope holes JSON, add +/- 1" recommendations
function getCoreBitItems(scopeData: Record<string, string>): EquipItem[] {
  const holesRaw = scopeData?.holes;
  if (!holesRaw) return [];
  let holes: { qty: string; bit_size: string; depth: string }[] = [];
  try { holes = JSON.parse(holesRaw); } catch { return []; }

  // Collect unique numeric bit sizes
  const rawSizes = holes.map(h => parseFloat(h.bit_size)).filter(n => !isNaN(n) && n > 0);
  if (rawSizes.length === 0) return [];

  // Build expanded set: each size + 1" above + 1" below
  const allSizes = new Set<number>();
  for (const size of rawSizes) {
    if (size - 1 > 0) allSizes.add(size - 1);
    allSizes.add(size);
    allSizes.add(size + 1);
  }
  const sorted = [...allSizes].sort((a, b) => a - b);

  return sorted.map(size => ({
    id: `core_bit_${size}`,
    label: `${size}" Core Bit`,
    type: 'qty' as const,
  }));
}

const SERVICE_EQUIPMENT: Record<string, ServiceEquipConfig> = {
  'ECD': {
    items: [
      { id: 'ecd_machine', label: 'ECD', type: 'toggle' },
      { id: 'pump_can', label: 'Pump Can', type: 'toggle' },
      { id: 'slurry_ring', label: 'Slurry Ring', type: 'toggle' },
    ],
    getDynamicItems: getCoreBitItems,
  },
  'HFCD': {
    items: [
      { id: 'hfcd_machine', label: 'HFCD', type: 'toggle' },
      { id: 'pump_can', label: 'Pump Can', type: 'toggle' },
      { id: 'slurry_ring', label: 'Slurry Ring', type: 'toggle' },
    ],
    getDynamicItems: getCoreBitItems,
  },
  'HCD': {
    items: [
      { id: 'hydraulic_hose', label: 'Hydraulic Hose', type: 'qty' },
      { id: 'dpp', label: 'Diesel Power Pack', type: 'toggle' },
      { id: 'hcd_stand', label: 'HCD Stand', type: 'toggle' },
    ],
    getDynamicItems: getCoreBitItems,
  },
  'DFS': {
    items: [
      { id: 'slurry_drums', label: 'Slurry Drums', type: 'qty' },
      { id: 'extra_vacuum_head', label: 'Extra Vacuum Head', type: 'toggle' },
      { id: 'backup_saw', label: 'Backup Saw', type: 'toggle' },
      { id: 'chalk_line', label: 'Chalk Line', type: 'toggle' },
      { id: 'clear_spray', label: 'Clear Spray', type: 'toggle' },
    ],
  },
  'WS/TS': {
    subOption: {
      label: 'System Type',
      choices: [
        { value: 'pentruder', label: 'Pentruder' },
        { value: 'pbg', label: 'Track Saw (PBG)' },
      ],
    },
    items: [
      // Pentruder-specific
      { id: '480_cord', label: '480 Cord', type: 'qty', showWhen: 'pentruder' },
      { id: '32_guard', label: '32" Guard', type: 'toggle', showWhen: 'pentruder' },
      { id: '42_guard', label: '42" Guard', type: 'toggle', showWhen: 'pentruder' },
      { id: '63_backup', label: '63 Backup System', type: 'toggle', showWhen: 'pentruder' },
      { id: 'dpp', label: 'Diesel Power Pack', type: 'toggle', showWhen: 'pentruder' },
      { id: 'track_pent', label: 'Track', type: 'qty', qtyUnit: 'ft', showWhen: 'pentruder' },
      { id: 'boots_pent', label: 'Boots', type: 'qty', showWhen: 'pentruder' },
      // PBG-specific
      { id: 'generator', label: 'Generator', type: 'toggle', showWhen: 'pbg' },
      { id: 'hydraulic_hose', label: 'Hydraulic Hose', type: 'qty', showWhen: 'pbg' },
      { id: 'backup_track_saw', label: 'Backup Track Saw', type: 'toggle', showWhen: 'pbg' },
      { id: 'track_pbg', label: 'Track', type: 'qty', qtyUnit: 'ft', showWhen: 'pbg' },
      { id: 'guards_pbg', label: 'Guards', type: 'toggle', showWhen: 'pbg' },
      { id: 'boots_pbg', label: 'Boots', type: 'qty', showWhen: 'pbg' },
      { id: 'slurry_drums_pbg', label: 'Slurry Drums', type: 'qty', showWhen: 'pbg' },
      // Common items (both)
      { id: 'plastic', label: 'Plastic', type: 'toggle' },
      { id: 'duct_tape', label: 'Duct Tape', type: 'toggle' },
      { id: 'clear_spray', label: 'Clear Spray', type: 'toggle' },
      { id: 'chalk_line', label: 'Chalk Line', type: 'toggle' },
      { id: 'apron', label: 'Apron', type: 'toggle' },
      { id: 'chain_saw', label: 'Chain Saw', type: 'option', options: ["15'", "20'"] },
      { id: 'spray_paint', label: 'Spray Paint', type: 'toggle' },
    ],
  },
  'CS': {
    items: [
      { id: '15_bar_chain', label: '15" Bar & Chain', type: 'toggle' },
      { id: '20_bar_chain', label: '20" Bar & Chain', type: 'toggle' },
      { id: 'hydraulic_hose', label: 'Hydraulic Hose', type: 'qty' },
    ],
  },
  'HHS/PS': {
    items: [
      { id: 'hydraulic_hose', label: 'Hydraulic Hose', type: 'qty', qtyUnit: 'ft' },
      { id: 'gas_power_pack', label: 'Gas Power Pack', type: 'toggle' },
      { id: 'chalk_line', label: 'Chalk Line', type: 'toggle' },
      { id: 'clear_spray', label: 'Clear Spray', type: 'toggle' },
      { id: 'tape', label: 'Tape', type: 'toggle' },
      { id: 'plastic', label: 'Plastic', type: 'toggle' },
      { id: 'handsaw_20', label: '20" Handsaw', type: 'toggle' },
      { id: 'handsaw_24', label: '24" Handsaw', type: 'toggle' },
      { id: 'push_saw', label: 'Push Saw', type: 'toggle' },
    ],
  },
};

// ── Form state type ──────────────────────────────────────────
interface FormData {
  // Step 1
  submitted_by: string;
  date_submitted: string;
  po_number: string;
  // Step 1 (Customer)
  contractor_name: string;
  customer_id: string;
  save_as_customer: boolean;
  // Step 2 (Project & Contact)
  site_contact: string;
  site_address: string;
  contact_phone: string;
  location_name: string;
  project_name: string;
  po_number_step2: string; // PO moved to step 2
  jobsite_photo_urls: string[];
  // Step 3
  description: string;
  service_types: string[];
  estimated_cost: string;
  scope_details: Record<string, Record<string, string>>;
  scope_input_modes: Record<string, 'linear' | 'areas'>;
  removal_needed: boolean;
  removal_method: 'dumpster_on_site' | 'our_dump_truck' | '';
  removal_equipment: string[];
  scope_photo_urls: string[];
  // Step 4
  equipment_needed: string[];
  equipment_details: Record<string, EquipmentDetail>;
  equipment_selections: Record<string, Record<string, string>>; // per service type: { _sub: 'pentruder', item_id: 'qty_or_yes', ... }
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
  compliance_attachment_urls: string[];
  permit_required: boolean;
  permits: { type: string; details: string }[];
  permit_other_text: string;
  // Step 6 — Compliance Docs
  facility_id: string;
  facility_name: string;
  facility_requirements: string;
  // Step 6 — Forms & Signatures
  require_waiver_signature: boolean;
  require_completion_signature: boolean;
  assigned_form_template_ids: string[];
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
  customer_id: '',
  save_as_customer: false,
  site_contact: '',
  site_address: '',
  contact_phone: '',
  location_name: '',
  project_name: '',
  po_number_step2: '',
  jobsite_photo_urls: [],
  description: '',
  service_types: [],
  estimated_cost: '',
  scope_details: {},
  scope_input_modes: {},
  removal_needed: false,
  removal_method: '',
  removal_equipment: [],
  scope_photo_urls: [],
  equipment_needed: [],
  equipment_details: {},
  equipment_selections: {},
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
  compliance_attachment_urls: [],
  permit_required: false,
  permits: [],
  permit_other_text: '',
  facility_id: '',
  facility_name: '',
  facility_requirements: '',
  require_waiver_signature: false,
  require_completion_signature: false,
  assigned_form_template_ids: [],
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
  // Customer/contact autocomplete state
  const [customerSuggestions, setCustomerSuggestions] = useState<string[]>([]);
  const [contactSuggestions, setContactSuggestions] = useState<{ contact_name: string; contact_phone: string; role?: string; is_primary?: boolean }[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [allCustomers, setAllCustomers] = useState<string[]>([]);
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const contactDropdownRef = useRef<HTMLDivElement>(null);

  // AI Smart Fill state
  const [showAISmartFill, setShowAISmartFill] = useState(false);

  // New Customer modal state
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomerDefaultName, setNewCustomerDefaultName] = useState('');
  // CRM customers list (for step 1 selection)
  const [crmCustomers, setCrmCustomers] = useState<{ id: string; company_name: string; primary_contact_name: string | null; primary_contact_phone: string | null; address: string | null }[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  // Facilities list for step 6
  const [facilities, setFacilities] = useState<{ id: string; name: string; address: string; special_requirements: string }[]>([]);
  const [showCreateFacility, setShowCreateFacility] = useState(false);
  // Form templates for step 6
  const [formTemplates, setFormTemplates] = useState<{ id: string; name: string; form_type: string; description: string }[]>([]);

  // Draft state
  const [draftId, setDraftId] = useState<string | null>(null);
  const [showDraftPicker, setShowDraftPicker] = useState(false);
  const [savedDrafts, setSavedDrafts] = useState<{ id: string; customer: string; step: number; date: string }[]>([]);
  const [draftSaved, setDraftSaved] = useState(false);

  // PO lookup state
  const [poMatch, setPoMatch] = useState<{
    customer_name: string; address: string; location: string;
    customer_contact: string; site_contact_phone: string;
  } | null>(null);
  const [poLookupLoading, setPoLookupLoading] = useState(false);
  const poLookupTimer = useRef<NodeJS.Timeout | null>(null);

  // Customer history state (PO numbers + site contacts from past jobs)
  const [customerPONumbers, setCustomerPONumbers] = useState<Array<{
    po_number: string;
    last_used: string;
    job_count: number;
    last_job_number: string;
  }>>([]);
  const [customerContacts, setCustomerContacts] = useState<Array<{
    name: string;
    phone: string | null;
    email: string | null;
    job_count: number;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Schedule preview state
  const [showSchedulePreview, setShowSchedulePreview] = useState(false);
  const [schedulePreviewData, setSchedulePreviewData] = useState<any[]>([]);
  const [schedulePreviewOperators, setSchedulePreviewOperators] = useState<any[]>([]);
  const [schedulePreviewLoading, setSchedulePreviewLoading] = useState(false);
  const [schedulePreviewDate, setSchedulePreviewDate] = useState('');

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || !isAdmin()) {
      router.push('/dashboard');
      return;
    }
    setUser(currentUser);
    // Auto-fill submitted_by with logged-in user's name
    setForm(f => ({ ...f, submitted_by: currentUser.name }));

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

    // Load CRM customers for step 1 customer selection
    const loadCrmCustomers = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      try {
        const res = await fetch('/api/admin/customers?limit=500', {
          headers: { 'Authorization': `Bearer ${session.session.access_token}` },
        });
        const data = await res.json();
        if (data.data) setCrmCustomers(data.data.map((c: any) => ({
          id: c.id,
          company_name: c.company_name || c.name || '',
          primary_contact_name: c.primary_contact_name || c.contact_persons?.[0]?.name || null,
          primary_contact_phone: c.primary_contact_phone || c.phone || null,
          address: c.address || null,
        })));
      } catch {}
    };
    loadCrmCustomers();

    // Load facilities for step 6
    const loadFacilities = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      try {
        const res = await fetch('/api/admin/facilities', {
          headers: { 'Authorization': `Bearer ${session.session.access_token}` },
        });
        const data = await res.json();
        if (data.data) setFacilities(data.data);
      } catch {}
    };
    loadFacilities();

    // Load form templates for step 6
    const loadFormTemplates = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      try {
        const res = await fetch('/api/admin/form-templates?is_active=true', {
          headers: { 'Authorization': `Bearer ${session.session.access_token}` },
        });
        const data = await res.json();
        if (data.data) setFormTemplates(data.data);
      } catch {}
    };
    loadFormTemplates();

    // Load saved drafts from localStorage
    try {
      const draftsRaw = localStorage.getItem('schedule_form_drafts');
      if (draftsRaw) {
        const drafts = JSON.parse(draftsRaw) as Record<string, { form: FormData; step: number; savedAt: string }>;
        const draftList = Object.entries(drafts).map(([id, d]) => ({
          id,
          customer: d.form.contractor_name || 'Untitled',
          step: d.step,
          date: d.savedAt,
        })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        if (draftList.length > 0) {
          setSavedDrafts(draftList);
          setShowDraftPicker(true);
        }
      }
    } catch {}
  }, [router]);

  // Auto-save draft on form or step changes
  useEffect(() => {
    if (!user || submitted) return;
    // Don't save if form is still at initial state with no customer
    if (!form.contractor_name && currentStep === 1) return;

    const id = draftId || `draft-${Date.now()}`;
    if (!draftId) setDraftId(id);

    try {
      const draftsRaw = localStorage.getItem('schedule_form_drafts');
      const drafts = draftsRaw ? JSON.parse(draftsRaw) : {};
      drafts[id] = { form, step: currentStep, savedAt: new Date().toISOString() };
      localStorage.setItem('schedule_form_drafts', JSON.stringify(drafts));
    } catch {}
  }, [form, currentStep, user, submitted, draftId]);

  const handleSaveAndExit = () => {
    const id = draftId || `draft-${Date.now()}`;
    try {
      const draftsRaw = localStorage.getItem('schedule_form_drafts');
      const drafts = draftsRaw ? JSON.parse(draftsRaw) : {};
      drafts[id] = { form, step: currentStep, savedAt: new Date().toISOString() };
      localStorage.setItem('schedule_form_drafts', JSON.stringify(drafts));
    } catch {}
    setDraftSaved(true);
    setTimeout(() => router.push('/dashboard/admin'), 800);
  };

  const handleLoadDraft = (id: string) => {
    try {
      const draftsRaw = localStorage.getItem('schedule_form_drafts');
      if (draftsRaw) {
        const drafts = JSON.parse(draftsRaw);
        const draft = drafts[id];
        if (draft) {
          setForm(draft.form);
          setCurrentStep(draft.step);
          setDraftId(id);
        }
      }
    } catch {}
    setShowDraftPicker(false);
  };

  const handleDeleteDraft = (id: string) => {
    try {
      const draftsRaw = localStorage.getItem('schedule_form_drafts');
      if (draftsRaw) {
        const drafts = JSON.parse(draftsRaw);
        delete drafts[id];
        localStorage.setItem('schedule_form_drafts', JSON.stringify(drafts));
        setSavedDrafts(prev => prev.filter(d => d.id !== id));
      }
    } catch {}
  };

  const handleStartNew = () => {
    setDraftId(null);
    setForm({ ...initialFormData, submitted_by: user?.name || '' });
    setCurrentStep(1);
    setShowDraftPicker(false);
  };

  // Fetch PO number and site contact history for selected customer
  const fetchCustomerHistory = useCallback(async (customerId: string) => {
    if (!customerId) return;
    setHistoryLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const headers = { Authorization: `Bearer ${session.access_token}` };

      const [poRes, contactRes] = await Promise.all([
        fetch(`/api/admin/customers/${customerId}/po-numbers`, { headers }),
        fetch(`/api/admin/customers/${customerId}/site-contacts`, { headers }),
      ]);

      if (poRes.ok) {
        const json = await poRes.json();
        setCustomerPONumbers(json.data || []);
      }
      if (contactRes.ok) {
        const json = await contactRes.json();
        setCustomerContacts((json.data || []).map((c: any) => ({
          name: c.name,
          phone: c.phone || null,
          email: c.email || null,
          job_count: c.job_count || 0,
        })));
      }
    } catch {
      // silently fail — dropdowns just show empty
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
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

  // When a customer is selected from CRM autocomplete
  const selectCrmCustomer = useCallback(async (customer: { id: string; company_name: string; primary_contact_name: string | null; primary_contact_phone: string | null; address: string | null }) => {
    // Set customer info first (contact will be set conditionally after fetching contacts)
    updateForm({
      contractor_name: customer.company_name,
      customer_id: customer.id,
      site_address: customer.address || '',
      site_contact: '',
      contact_phone: '',
    });
    setShowCustomerDropdown(false);
    // Clear and fetch customer history (PO numbers + site contacts from past jobs)
    setCustomerPONumbers([]);
    setCustomerContacts([]);
    fetchCustomerHistory(customer.id);
    // Fetch CRM contacts for this customer
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}/contacts`, {
        headers: { 'Authorization': `Bearer ${session.session.access_token}` },
      });
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        const contacts = data.data.map((c: any) => ({
          contact_name: c.name,
          contact_phone: c.phone || '',
          role: c.role || (c.is_primary ? 'Primary' : ''),
          is_primary: c.is_primary || false,
        }));
        setContactSuggestions(contacts);

        if (contacts.length === 1) {
          // Only 1 contact: auto-fill (current behavior)
          updateForm({
            site_contact: contacts[0].contact_name,
            contact_phone: contacts[0].contact_phone,
          });
        } else {
          // Multiple contacts: leave empty so user must choose, show dropdown
          setShowContactDropdown(true);
        }
      } else {
        // No contacts: fallback to primary_contact from customer record
        setContactSuggestions([]);
        if (customer.primary_contact_name) {
          updateForm({
            site_contact: customer.primary_contact_name,
            contact_phone: customer.primary_contact_phone || '',
          });
        }
      }
    } catch {
      // On error, fallback to customer primary contact
      setContactSuggestions([]);
      if (customer.primary_contact_name) {
        updateForm({
          site_contact: customer.primary_contact_name,
          contact_phone: customer.primary_contact_phone || '',
        });
      }
    }
  }, [updateForm]);

  // When a customer is selected from legacy suggestions, load their contacts
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
    if (contactSuggestions.length > 0) {
      // Show dropdown if there are suggestions — even with empty input, show all
      if (value.trim().length === 0) {
        setShowContactDropdown(true);
      } else {
        const filtered = contactSuggestions.filter(c =>
          c.contact_name?.toLowerCase().includes(value.toLowerCase())
        );
        setShowContactDropdown(filtered.length > 0);
      }
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

  // ── Create new customer handler ────────────────────────────
  // Accepts the data object from CustomerForm's onSubmit callback
  const handleCreateCustomer = async (data: Record<string, any>) => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) throw new Error('Not authenticated');
    const res = await fetch('/api/admin/customers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.session.access_token}`,
      },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (res.ok && result.data) {
      const created = result.data;
      // Add to CRM list
      setCrmCustomers(prev => [{
        id: created.id,
        company_name: created.company_name || created.name || data.company_name,
        primary_contact_name: created.primary_contact_name || data.primary_contact_name || null,
        primary_contact_phone: created.primary_contact_phone || data.primary_contact_phone || null,
        address: created.address || data.address || null,
      }, ...prev]);
      // Select the new customer
      updateForm({
        contractor_name: created.company_name || created.name || data.company_name,
        customer_id: created.id,
        site_contact: data.primary_contact_name || '',
        contact_phone: data.primary_contact_phone || '',
        site_address: data.address ? `${data.address}${data.city ? ', ' + data.city : ''}${data.state ? ', ' + data.state : ''}${data.zip ? ' ' + data.zip : ''}` : '',
      });
      // New customer has no history yet — clear any stale history state
      setCustomerPONumbers([]);
      setCustomerContacts([]);
      setShowNewCustomerModal(false);
    } else {
      throw new Error(result.error || 'Failed to create customer');
    }
  };

  // ── Create facility handler ──────────────────────────────────
  const handleCreateFacility = async () => {
    if (!form.facility_name.trim()) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      const res = await fetch('/api/admin/facilities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({
          name: form.facility_name.trim(),
          special_requirements: form.facility_requirements || null,
        }),
      });
      const result = await res.json();
      if (res.ok && result.data) {
        setFacilities(prev => [...prev, result.data]);
        updateForm({ facility_id: result.data.id });
        setShowCreateFacility(false);
      }
    } catch {}
  };

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

  // ── AI Smart Fill handler ──────────────────────────────────
  const handleAISmartFill = useCallback((fields: Record<string, unknown>) => {
    setForm(prev => {
      const updated = { ...prev };

      // Apply each parsed field
      for (const [key, value] of Object.entries(fields)) {
        if (key === 'service_types' && Array.isArray(value)) {
          updated.service_types = [...new Set([...prev.service_types, ...value as string[]])];
        } else if (key === 'scope_details' && typeof value === 'object' && value !== null) {
          updated.scope_details = { ...prev.scope_details, ...value as Record<string, Record<string, string>> };
        } else if (key in updated) {
          (updated as any)[key] = value;
        }
      }

      return updated;
    });

    // Jump to appropriate step based on what was filled
    if (fields.service_types || fields.scope_details || fields.description) {
      setCurrentStep(3); // Scope of work
    } else if (fields.contractor_name || fields.site_address) {
      setCurrentStep(2); // Customer & location
    } else if (fields.start_date) {
      setCurrentStep(5); // Scheduling
    }
  }, []);

  // ── PO number auto-populate ──────────────────────────────────
  const handlePoChange = useCallback((value: string) => {
    updateForm({ po_number: value });
    setPoMatch(null);

    // Clear previous timer
    if (poLookupTimer.current) clearTimeout(poLookupTimer.current);

    if (!value.trim() || value.trim().length < 2) return;

    // Debounce the API call by 600ms
    poLookupTimer.current = setTimeout(async () => {
      setPoLookupLoading(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return;
        const res = await fetch(`/api/admin/po-lookup?po=${encodeURIComponent(value.trim())}`, {
          headers: { 'Authorization': `Bearer ${session.session.access_token}` },
        });
        const data = await res.json();
        if (res.ok && data.match) {
          setPoMatch(data.match);
        }
      } catch {} finally {
        setPoLookupLoading(false);
      }
    }, 600);
  }, [updateForm]);

  const applyPoAutofill = useCallback(() => {
    if (!poMatch) return;
    updateForm({
      contractor_name: poMatch.customer_name || '',
      site_address: poMatch.address || '',
      location_name: poMatch.location || '',
      site_contact: poMatch.customer_contact || '',
      contact_phone: poMatch.site_contact_phone || '',
    });
    setPoMatch(null);
  }, [poMatch, updateForm]);

  // ── Scope details helper ──────────────────────────────────────
  const updateScopeDetail = useCallback((serviceCode: string, fieldKey: string, value: string) => {
    setForm(f => ({
      ...f,
      scope_details: {
        ...f.scope_details,
        [serviceCode]: {
          ...(f.scope_details[serviceCode] || {}),
          [fieldKey]: value,
        },
      },
    }));
  }, []);

  // ── Validation per step ────────────────────────────────────
  const validateStep = (step: number): string | null => {
    switch (step) {
      case 1:
        if (!form.contractor_name.trim()) return 'Please select or create a customer.';
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

  // ── Schedule Preview ───────────────────────────────────────
  const fetchSchedulePreview = async (date?: string) => {
    setSchedulePreviewLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const previewDate = date || form.start_date || new Date().toISOString().split('T')[0];
      setSchedulePreviewDate(previewDate);

      // Fetch a week of schedule data starting from the target date
      const startDate = previewDate;
      const endObj = new Date(previewDate);
      endObj.setDate(endObj.getDate() + 6);
      const endDate = endObj.toISOString().split('T')[0];

      const res = await fetch(`/api/admin/schedule-board?startDate=${startDate}&endDate=${endDate}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const data = await res.json();
        // API returns { assigned, unassigned, pending, willCall } — flatten into one array
        const d = data.data || {};
        const allJobs = [
          ...(d.assigned || []),
          ...(d.unassigned || []),
          ...(d.pending || []),
          ...(d.willCall || []),
        ];
        setSchedulePreviewData(allJobs);
      }

      // Fetch all operators
      const { data: operators } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['operator', 'apprentice'])
        .order('full_name');

      setSchedulePreviewOperators(operators || []);
    } catch (err) {
      console.error('Error fetching schedule preview:', err);
    } finally {
      setSchedulePreviewLoading(false);
    }
  };

  const openSchedulePreview = () => {
    setShowSchedulePreview(true);
    fetchSchedulePreview();
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
        // Step 1 (Customer)
        submitted_by: form.submitted_by || null,
        date_submitted: form.date_submitted,
        customer_name: form.contractor_name.trim(),
        customer_id: form.customer_id || null,
        save_as_customer: form.save_as_customer || false,
        // Step 2 (Project & Contact)
        po_number: form.po_number || form.po_number_step2 || null,
        site_contact: form.site_contact || null,
        contact_phone: form.contact_phone || null,
        address: form.site_address || null,
        location_name: form.location_name || null,
        project_name: form.project_name || null,
        jobsite_photo_urls: form.jobsite_photo_urls.length > 0 ? form.jobsite_photo_urls : [],
        // Step 3
        description: form.description || null,
        job_type: form.service_types.join(', '),
        estimated_cost: form.estimated_cost ? parseFloat(form.estimated_cost) : null,
        scope_details: {
          ...(form.scope_details || {}),
          ...(form.removal_needed ? { _removal: { needed: 'true', method: form.removal_method, equipment: form.removal_equipment } } : {}),
        },
        scope_photo_urls: form.scope_photo_urls.length > 0 ? form.scope_photo_urls : [],
        // Step 4
        equipment_needed: form.equipment_needed,
        equipment_details: Object.keys(form.equipment_details).length > 0 ? form.equipment_details : undefined,
        equipment_selections: Object.keys(form.equipment_selections).length > 0 ? form.equipment_selections : undefined,
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
          attachment_urls: form.compliance_attachment_urls.length > 0 ? form.compliance_attachment_urls : undefined,
          facility_id: form.facility_id || null,
          facility_name: form.facility_name || null,
          facility_requirements: form.facility_requirements || null,
        },
        facility_id: form.facility_id || null,
        permit_required: form.permit_required,
        permits: form.permits.length > 0 ? form.permits : undefined,
        require_waiver_signature: form.require_waiver_signature,
        require_completion_signature: form.require_completion_signature,
        assigned_form_template_ids: form.assigned_form_template_ids.length > 0 ? form.assigned_form_template_ids : undefined,
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

      // Clean up draft on successful submit
      if (draftId) {
        try {
          const draftsRaw = localStorage.getItem('schedule_form_drafts');
          if (draftsRaw) {
            const drafts = JSON.parse(draftsRaw);
            delete drafts[draftId];
            localStorage.setItem('schedule_form_drafts', JSON.stringify(drafts));
          }
        } catch {}
      }

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

          // Fire-and-forget: auto-save new contact to CRM customer_contacts if applicable
          if (form.customer_id && form.site_contact?.trim()) {
            const contactName = form.site_contact.trim();
            const isExisting = contactSuggestions.some(
              c => c.contact_name?.toLowerCase() === contactName.toLowerCase()
            );
            if (!isExisting) {
              fetch(`/api/admin/customers/${form.customer_id}/contacts`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${sessionForContacts.session.access_token}`,
                },
                body: JSON.stringify({
                  name: contactName,
                  phone: form.contact_phone?.trim() || null,
                }),
              }).catch(() => {}); // ignore errors — non-critical
            }
          }
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
      // ── STEP 1: Customer Selection ──────────────────────────
      case 1: {
        const filteredCrmCustomers = customerSearch.trim()
          ? crmCustomers.filter(c => c.company_name.toLowerCase().includes(customerSearch.toLowerCase()))
          : crmCustomers;
        return (
          <div className="space-y-6">
            {/* Submitted By (compact) */}
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white">
                {(user?.name || '').split(' ').map(n => n[0]).join('')}
              </div>
              <span className="text-sm text-slate-600">Submitted by <span className="font-semibold text-slate-800">{user?.name}</span> on {new Date().toLocaleDateString()}</span>
            </div>

            {/* Selected customer badge */}
            {form.customer_id && form.contractor_name && (
              <div className="flex items-center gap-3 px-5 py-4 bg-emerald-50 border-2 border-emerald-200 rounded-xl">
                <CheckCircle size={22} className="text-emerald-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-base font-bold text-emerald-800">{form.contractor_name}</p>
                  <p className="text-xs text-emerald-600">Customer selected — click Next Step to continue</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateForm({ contractor_name: '', customer_id: '', save_as_customer: false })}
                  className="px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                >
                  Change
                </button>
              </div>
            )}

            {/* Search + Add New */}
            {!form.customer_id && (
              <>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <InputField
                      icon={UserIcon}
                      placeholder="Search existing customers..."
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerModal(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm transition-all shadow-sm whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    New Customer
                  </button>
                </div>

                {/* Customer list */}
                <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1">
                  {filteredCrmCustomers.length === 0 && customerSearch.trim() && (
                    <div className="text-center py-8 text-slate-400">
                      <p className="text-sm font-medium">No customers matching &quot;{customerSearch}&quot;</p>
                      <button
                        type="button"
                        onClick={() => {
                          setNewCustomerDefaultName(customerSearch);
                          setShowNewCustomerModal(true);
                        }}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-semibold"
                      >
                        + Create &quot;{customerSearch}&quot; as new customer
                      </button>
                    </div>
                  )}
                  {filteredCrmCustomers.length === 0 && !customerSearch.trim() && (
                    <div className="text-center py-8 text-slate-400">
                      <p className="text-sm">No customers in database yet.</p>
                      <button
                        type="button"
                        onClick={() => setShowNewCustomerModal(true)}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-semibold"
                      >
                        + Create your first customer
                      </button>
                    </div>
                  )}
                  {filteredCrmCustomers.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        selectCrmCustomer(c);
                        setCustomerSearch('');
                      }}
                      className="w-full flex items-center gap-4 px-5 py-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm transition-all text-left group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 group-hover:from-blue-100 group-hover:to-blue-200 flex items-center justify-center text-sm font-bold text-slate-500 group-hover:text-blue-600 transition-colors">
                        {c.company_name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold text-slate-800 truncate">{c.company_name}</p>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                          {c.primary_contact_name && <span>{c.primary_contact_name}</span>}
                          {c.address && <span className="truncate">{c.address}</span>}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                    </button>
                  ))}
                </div>

                {/* Or type freely */}
                <div className="border-t border-slate-200 pt-4">
                  <p className="text-xs text-slate-400 mb-2 font-medium">Or type a customer name directly:</p>
                  <CustomerAutocomplete
                    value={form.contractor_name}
                    onChange={(value) => {
                      handleCustomerChange(value);
                      if (form.customer_id) updateForm({ customer_id: '' });
                    }}
                    onSelect={(customer) => selectCrmCustomer(customer)}
                    onCreateNew={() => setShowNewCustomerModal(true)}
                  />
                  {form.contractor_name.trim() && !form.customer_id && (
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.save_as_customer}
                        onChange={e => updateForm({ save_as_customer: e.target.checked })}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-500">Save as new customer on submit</span>
                    </label>
                  )}
                </div>
              </>
            )}
          </div>
        );
      }

      // ── STEP 2: Project & Contact ─────────────────────────
      case 2:
        return (
          <div className="space-y-6">
            {/* Customer auto-populated from Step 1 */}
            {form.contractor_name && (
              <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
                <UserIcon size={16} className="text-blue-600" />
                <span className="text-sm font-semibold text-blue-800">Customer: {form.contractor_name}</span>
                {form.customer_id && <CheckCircle size={14} className="text-emerald-500 ml-auto" />}
              </div>
            )}

            {/* PO Number (moved from old step 1) */}
            <div>
              <SmartCombobox
                label="PO Number"
                placeholder="Select or enter PO number"
                options={customerPONumbers.map(po => ({
                  value: po.po_number,
                  label: po.po_number,
                  sublabel: `Used ${po.job_count} time${po.job_count !== 1 ? 's' : ''}`,
                  meta: `Last: ${po.last_job_number}`,
                }))}
                value={form.po_number || form.po_number_step2 || ''}
                onChange={(val) => {
                  handlePoChange(val);
                  updateForm({ po_number_step2: val });
                }}
                onAddNew={(val) => {
                  handlePoChange(val);
                  updateForm({ po_number_step2: val });
                }}
                loading={historyLoading}
                addNewLabel="Use new PO number"
              />
              {poLookupLoading && (
                <p className="mt-1.5 text-xs text-blue-500 font-medium flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Looking up PO...
                </p>
              )}
              {poMatch && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="text-xs font-bold text-blue-700 mb-1">Found existing job with this PO</p>
                  <p className="text-xs text-blue-600">Customer: <span className="font-semibold">{poMatch.customer_name}</span></p>
                  {poMatch.address && <p className="text-xs text-blue-600">Address: {poMatch.address}</p>}
                  <button
                    type="button"
                    onClick={applyPoAutofill}
                    className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all"
                  >
                    Auto-fill Details
                  </button>
                </div>
              )}
            </div>

            {/* Project Name (replaces location name as primary) */}
            <div>
              <Label>Project Name</Label>
              <InputField
                icon={Clipboard}
                placeholder="e.g. Building A Renovation, Phase 2 Demo..."
                value={form.project_name}
                onChange={e => updateForm({ project_name: e.target.value })}
              />
              <p className="text-xs text-slate-400 mt-1">Groups multiple jobs at the same site. If existing project, it will auto-populate address.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Site Contact with Smart History Dropdown */}
              <div ref={contactDropdownRef} className="relative">
                <ContactCombobox
                  label="Site Contact Name"
                  placeholder="Select or enter contact name"
                  options={customerContacts.length > 0
                    ? customerContacts
                    : contactSuggestions.map(c => ({
                        name: c.contact_name,
                        phone: c.contact_phone || null,
                        email: null,
                        job_count: 0,
                      }))
                  }
                  value={form.site_contact}
                  onChange={(name, phone) => {
                    updateForm({
                      site_contact: name,
                      ...(phone ? { contact_phone: phone } : {}),
                    });
                  }}
                  onAddNew={(name) => updateForm({ site_contact: name })}
                  loading={historyLoading}
                />
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

            {/* Site Address */}
            <div>
              <Label>Site Address</Label>
              <GoogleAddressAutocomplete
                value={form.site_address}
                onChange={(address) => updateForm({ site_address: address })}
                placeholder="Start typing an address..."
              />
            </div>

            {/* Location Name (secondary) */}
            <div>
              <Label>Location Details</Label>
              <InputField
                icon={MapPin}
                placeholder="Building name, floor, area, etc. (optional)"
                value={form.location_name}
                onChange={e => updateForm({ location_name: e.target.value })}
              />
            </div>

            {/* Jobsite Area Photos */}
            <div>
              <Label>Jobsite Area Photos / Documents</Label>
              <p className="text-xs sm:text-sm text-slate-400 mb-3 -mt-1">Optional — upload photos or docs so operators can navigate to the jobsite</p>
              <PhotoUploader
                bucket="jobsite-area-docs"
                pathPrefix="jobsite"
                photos={form.jobsite_photo_urls}
                onPhotosChange={(urls) => updateForm({ jobsite_photo_urls: urls })}
                maxPhotos={5}
                label="Add Area Photos"
                lightMode
              />
            </div>
          </div>
        );

      // ── STEP 3: Scope of Work ─────────────────────────────
      case 3:
        return (
          <div className="space-y-6">
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

            {/* ── Per-service scope detail fields ────────────── */}
            {form.service_types.length > 0 && (
              <div className="space-y-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Scope Quantities</p>
                {form.service_types.map(code => {
                  const config = SCOPE_FIELDS[code];
                  if (!config) return null;
                  const st = SERVICE_TYPES.find(s => s.code === code);
                  const isFlexible = FLEXIBLE_SCOPE_TYPES.includes(code);
                  const currentMode = form.scope_input_modes[code] || 'linear';
                  const activeFields = (isFlexible && currentMode === 'areas' && config.altFields) ? config.altFields : config.fields;
                  return (
                    <div key={code} className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black bg-gradient-to-br ${st?.gradient || 'from-gray-500 to-gray-600'} text-white shadow-md`}>
                            {code.substring(0, 2)}
                          </div>
                          <h4 className="text-base font-bold text-slate-800">{config.label}</h4>
                        </div>
                        {/* Scope type badge */}
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r ${st?.gradient || 'from-gray-500 to-gray-600'} text-white shadow-sm`}>
                          {code}
                        </span>
                      </div>

                      {/* Flexible input mode toggle */}
                      {isFlexible && config.altFields && (
                        <div className="flex gap-2 mb-4">
                          <button
                            type="button"
                            onClick={() => updateForm({ scope_input_modes: { ...form.scope_input_modes, [code]: 'linear' } })}
                            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                              currentMode === 'linear'
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-600'
                            }`}
                          >
                            Linear Ft + Cut Depth
                          </button>
                          <button
                            type="button"
                            onClick={() => updateForm({ scope_input_modes: { ...form.scope_input_modes, [code]: 'areas' } })}
                            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                              currentMode === 'areas'
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-600'
                            }`}
                          >
                            {config.altLabel || 'Areas + Thickness'}
                          </button>
                        </div>
                      )}

                      {/* Field inputs */}
                      {config.hasDynamicHoles ? (
                        // ── Dynamic Holes Builder (core drilling) ──
                        (() => {
                          const holesRaw = form.scope_details[code]?.holes;
                          const holes: { qty: string; bit_size: string; depth: string }[] = holesRaw
                            ? (() => { try { return JSON.parse(holesRaw); } catch { return [{ qty: '', bit_size: '', depth: '' }]; } })()
                            : [{ qty: '', bit_size: '', depth: '' }];

                          const updateHoles = (newHoles: { qty: string; bit_size: string; depth: string }[]) => {
                            updateScopeDetail(code, 'holes', JSON.stringify(newHoles));
                          };

                          // Compute totals
                          const totalHoles = holes.reduce((sum, h) => sum + (parseInt(h.qty) || 0), 0);
                          const uniqueSizes = [...new Set(holes.map(h => h.bit_size).filter(Boolean))];

                          return (
                            <div className="space-y-3">
                              {holes.map((hole, idx) => (
                                <div key={idx} className={`${idx > 0 ? 'pt-3 border-t border-slate-100' : ''}`}>
                                  {idx === 0 && (
                                    <div className="grid grid-cols-3 gap-3 mb-1.5">
                                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest"># of Holes</label>
                                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Bit Size</label>
                                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Depth</label>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <div className="grid grid-cols-3 gap-3 flex-1">
                                      <input
                                        type="number"
                                        placeholder="0"
                                        value={hole.qty}
                                        onChange={e => {
                                          const updated = [...holes];
                                          updated[idx] = { ...updated[idx], qty: e.target.value };
                                          updateHoles(updated);
                                        }}
                                        className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-lg font-semibold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                      />
                                      <div className="relative">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder='e.g. 4'
                                          value={hole.bit_size}
                                          onChange={e => {
                                            const updated = [...holes];
                                            updated[idx] = { ...updated[idx], bit_size: e.target.value };
                                            updateHoles(updated);
                                          }}
                                          className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-lg font-semibold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">&quot;</span>
                                      </div>
                                      <div className="relative">
                                        <input
                                          type="number"
                                          placeholder="0"
                                          value={hole.depth}
                                          onChange={e => {
                                            const updated = [...holes];
                                            updated[idx] = { ...updated[idx], depth: e.target.value };
                                            updateHoles(updated);
                                          }}
                                          className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-lg font-semibold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">in.</span>
                                      </div>
                                    </div>
                                    {holes.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => updateHoles(holes.filter((_, i) => i !== idx))}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-all shrink-0"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}

                              {/* Add more holes button */}
                              <button
                                type="button"
                                onClick={() => updateHoles([...holes, { qty: '', bit_size: '', depth: '' }])}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all"
                              >
                                <Plus size={16} />
                                Add Different Holes
                              </button>

                              {/* Summary */}
                              {totalHoles > 0 && (
                                <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total:</span>
                                  <span className="text-sm font-bold text-slate-800">{totalHoles} hole{totalHoles !== 1 ? 's' : ''}</span>
                                  {uniqueSizes.length > 0 && (
                                    <span className="text-xs text-slate-400">Sizes: {uniqueSizes.map(s => `${s}"`).join(', ')}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : config.hasDynamicCuts && (!isFlexible || currentMode === 'linear') ? (
                        // ── Dynamic Cuts Builder (sawing linear mode) ──
                        (() => {
                          const cutsRaw = form.scope_details[code]?.cuts;
                          const cuts: { linear_feet: string; depth: string; num_cuts: string }[] = cutsRaw
                            ? (() => { try { return JSON.parse(cutsRaw); } catch { return [{ linear_feet: '', depth: '', num_cuts: '' }]; } })()
                            : [{ linear_feet: '', depth: '', num_cuts: '' }];

                          const updateCuts = (newCuts: { linear_feet: string; depth: string; num_cuts: string }[]) => {
                            updateScopeDetail(code, 'cuts', JSON.stringify(newCuts));
                          };

                          const totalLF = cuts.reduce((sum, c) => sum + (parseFloat(c.linear_feet) || 0), 0);
                          const totalCuts = cuts.reduce((sum, c) => sum + (parseInt(c.num_cuts) || 0), 0);

                          return (
                            <div className="space-y-3">
                              {cuts.map((cut, idx) => (
                                <div key={idx} className={`${idx > 0 ? 'pt-3 border-t border-slate-100' : ''}`}>
                                  {idx === 0 && (
                                    <div className="grid grid-cols-3 gap-3 mb-1.5">
                                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Linear Feet</label>
                                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Cut Depth</label>
                                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest"># of Cuts</label>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <div className="grid grid-cols-3 gap-3 flex-1">
                                      <div className="relative">
                                        <input
                                          type="number"
                                          placeholder="0"
                                          value={cut.linear_feet}
                                          onChange={e => {
                                            const updated = [...cuts];
                                            updated[idx] = { ...updated[idx], linear_feet: e.target.value };
                                            updateCuts(updated);
                                          }}
                                          className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-lg font-semibold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">ft</span>
                                      </div>
                                      <div className="relative">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder='0'
                                          value={cut.depth}
                                          onChange={e => {
                                            const updated = [...cuts];
                                            updated[idx] = { ...updated[idx], depth: e.target.value };
                                            updateCuts(updated);
                                          }}
                                          className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-lg font-semibold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">in.</span>
                                      </div>
                                      <input
                                        type="number"
                                        placeholder="0"
                                        value={cut.num_cuts}
                                        onChange={e => {
                                          const updated = [...cuts];
                                          updated[idx] = { ...updated[idx], num_cuts: e.target.value };
                                          updateCuts(updated);
                                        }}
                                        className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-lg font-semibold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                      />
                                    </div>
                                    {cuts.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => updateCuts(cuts.filter((_, i) => i !== idx))}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-all shrink-0"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}

                              <button
                                type="button"
                                onClick={() => updateCuts([...cuts, { linear_feet: '', depth: '', num_cuts: '' }])}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all"
                              >
                                <Plus size={16} />
                                Add Cut
                              </button>

                              {(totalLF > 0 || totalCuts > 0) && (
                                <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total:</span>
                                  {totalLF > 0 && <span className="text-sm font-bold text-slate-800">{totalLF.toLocaleString()} linear ft</span>}
                                  {totalCuts > 0 && <span className="text-xs text-slate-400">{totalCuts} cut{totalCuts !== 1 ? 's' : ''}</span>}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : config.hasDynamicAreas && (isFlexible ? currentMode === 'areas' : true) ? (
                        // ── Dynamic Areas Builder (L × W × Thickness × Qty) ──
                        (() => {
                          const areasRaw = form.scope_details[code]?.areas;
                          const areas: { length: string; width: string; thickness: string; qty: string }[] = areasRaw
                            ? (() => { try { return JSON.parse(areasRaw); } catch { return [{ length: '', width: '', thickness: '', qty: '' }]; } })()
                            : [{ length: '', width: '', thickness: '', qty: '' }];

                          const updateAreas = (newAreas: { length: string; width: string; thickness: string; qty: string }[]) => {
                            updateScopeDetail(code, 'areas', JSON.stringify(newAreas));
                          };

                          const totalSqFt = areas.reduce((sum, a) => {
                            const l = parseFloat(a.length) || 0;
                            const w = parseFloat(a.width) || 0;
                            const q = parseInt(a.qty) || 1;
                            return sum + (l * w * q);
                          }, 0);
                          const totalAreaCount = areas.reduce((sum, a) => sum + (parseInt(a.qty) || 0), 0);

                          return (
                            <div className="space-y-3">
                              {areas.map((area, idx) => (
                                <div key={idx} className={`${idx > 0 ? 'pt-3 border-t border-slate-100' : ''}`}>
                                  {idx === 0 && (
                                    <div className="grid grid-cols-4 gap-3 mb-1.5">
                                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Length</label>
                                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Width</label>
                                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Thickness</label>
                                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Qty</label>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <div className="grid grid-cols-4 gap-3 flex-1">
                                      <div className="relative">
                                        <input
                                          type="number"
                                          placeholder="0"
                                          value={area.length}
                                          onChange={e => {
                                            const updated = [...areas];
                                            updated[idx] = { ...updated[idx], length: e.target.value };
                                            updateAreas(updated);
                                          }}
                                          className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-lg font-semibold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">ft</span>
                                      </div>
                                      <div className="relative">
                                        <input
                                          type="number"
                                          placeholder="0"
                                          value={area.width}
                                          onChange={e => {
                                            const updated = [...areas];
                                            updated[idx] = { ...updated[idx], width: e.target.value };
                                            updateAreas(updated);
                                          }}
                                          className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-lg font-semibold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">ft</span>
                                      </div>
                                      <div className="relative">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder="0"
                                          value={area.thickness}
                                          onChange={e => {
                                            const updated = [...areas];
                                            updated[idx] = { ...updated[idx], thickness: e.target.value };
                                            updateAreas(updated);
                                          }}
                                          className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-lg font-semibold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">in.</span>
                                      </div>
                                      <input
                                        type="number"
                                        placeholder="1"
                                        value={area.qty}
                                        onChange={e => {
                                          const updated = [...areas];
                                          updated[idx] = { ...updated[idx], qty: e.target.value };
                                          updateAreas(updated);
                                        }}
                                        className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-lg font-semibold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                      />
                                    </div>
                                    {areas.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => updateAreas(areas.filter((_, i) => i !== idx))}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-all shrink-0"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    )}
                                  </div>
                                  {/* Per-row area calculation */}
                                  {area.length && area.width && (
                                    <div className="mt-1 ml-1">
                                      <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">
                                        {((parseFloat(area.length) || 0) * (parseFloat(area.width) || 0)).toFixed(0)} sq ft{parseInt(area.qty) > 1 ? ` x ${area.qty} = ${((parseFloat(area.length) || 0) * (parseFloat(area.width) || 0) * (parseInt(area.qty) || 1)).toFixed(0)} sq ft` : ''}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ))}

                              <button
                                type="button"
                                onClick={() => updateAreas([...areas, { length: '', width: '', thickness: '', qty: '' }])}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all"
                              >
                                <Plus size={16} />
                                Add Area
                              </button>

                              {totalSqFt > 0 && (
                                <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total:</span>
                                  <span className="text-sm font-bold text-slate-800">{totalSqFt.toLocaleString()} sq ft</span>
                                  {totalAreaCount > 0 && <span className="text-xs text-slate-400">({totalAreaCount} area{totalAreaCount !== 1 ? 's' : ''})</span>}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : activeFields.length > 0 ? (
                        // ── Standard field inputs (GPR, Demo, etc.) ──
                        <div className={activeFields.some(f => f.fullWidth) ? 'space-y-3' : 'grid grid-cols-2 sm:grid-cols-3 gap-4'}>
                          {activeFields.map(field => (
                            <div key={field.key} className={field.fullWidth ? 'col-span-full' : ''}>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{field.label}</label>
                              {field.type === 'textarea' ? (
                                <textarea
                                  rows={3}
                                  placeholder={field.placeholder}
                                  value={form.scope_details[code]?.[field.key] || ''}
                                  onChange={e => updateScopeDetail(code, field.key, e.target.value)}
                                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-base font-semibold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
                                />
                              ) : (
                                <div className="relative">
                                  <input
                                    type={field.type}
                                    placeholder={field.placeholder}
                                    value={form.scope_details[code]?.[field.key] || ''}
                                    onChange={e => updateScopeDetail(code, field.key, e.target.value)}
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-lg font-semibold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                  />
                                  {field.suffix && (
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">{field.suffix}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {/* ── Removal Section ────────────── */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-red-500 to-red-700 text-white shadow-md">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-slate-800">Material Removal</h4>
                        <p className="text-xs text-slate-400">Are we removing material from the site?</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateForm({ removal_needed: !form.removal_needed, removal_method: '', removal_equipment: [] })}
                      className={`relative w-14 h-7 rounded-full transition-all duration-200 ${
                        form.removal_needed ? 'bg-red-500' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-200 ${
                        form.removal_needed ? 'translate-x-7' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                  {form.removal_needed && (
                    <div className="mt-4 space-y-4">
                      {/* Removal Method */}
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Removal Method</label>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { value: 'dumpster_on_site', label: 'Dumpster on Site' },
                            { value: 'our_dump_truck', label: 'Our Dump Truck' },
                          ].map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => updateForm({ removal_method: opt.value as typeof form.removal_method })}
                              className={`px-4 py-3.5 rounded-xl text-sm font-bold transition-all ${
                                form.removal_method === opt.value
                                  ? 'bg-red-500 text-white border-2 border-red-400 shadow-lg'
                                  : 'bg-slate-50 text-slate-600 border-2 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Removal Equipment Type */}
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Equipment for Removal</label>
                        <p className="text-xs text-slate-400 mb-2">Select all that apply</p>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: 'forklift', label: 'Forklift' },
                            { value: 'skidsteer', label: 'Skidsteer' },
                            { value: 'lull', label: 'Lull' },
                            { value: 'dingo', label: 'Dingo' },
                            { value: 'sherpa', label: 'Sherpa' },
                            { value: 'mini_excavator', label: 'Mini Excavator' },
                          ].map(equip => {
                            const isSelected = form.removal_equipment.includes(equip.value);
                            return (
                              <button
                                key={equip.value}
                                type="button"
                                onClick={() => {
                                  const updated = isSelected
                                    ? form.removal_equipment.filter(e => e !== equip.value)
                                    : [...form.removal_equipment, equip.value];
                                  updateForm({ removal_equipment: updated });
                                }}
                                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                  isSelected
                                    ? 'bg-orange-500 text-white border-2 border-orange-400 shadow-md'
                                    : 'bg-white text-slate-600 border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                }`}
                              >
                                {equip.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Description of Work ────────────── */}
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

            {/* ── Scope Reference Photos ────────────── */}
            <div>
              <Label>Scope Photos</Label>
              <p className="text-xs sm:text-sm text-slate-400 mb-3 -mt-1">Add reference photos for the operator</p>
              <PhotoUploader
                bucket="scope-photos"
                pathPrefix="scope"
                photos={form.scope_photo_urls}
                onPhotosChange={(urls) => updateForm({ scope_photo_urls: urls })}
                maxPhotos={10}
                label="Add Scope Photos"
                lightMode
              />
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
      case 4: {
        // Helper to get/set equipment selection values
        const getEquipVal = (serviceCode: string, itemId: string): string =>
          form.equipment_selections[serviceCode]?.[itemId] || '';
        const setEquipVal = (serviceCode: string, itemId: string, value: string) => {
          const svc = { ...(form.equipment_selections[serviceCode] || {}) };
          if (value) { svc[itemId] = value; } else { delete svc[itemId]; }
          updateForm({ equipment_selections: { ...form.equipment_selections, [serviceCode]: svc } });
        };
        const toggleEquipItem = (serviceCode: string, itemId: string) => {
          const current = getEquipVal(serviceCode, itemId);
          setEquipVal(serviceCode, itemId, current ? '' : 'yes');
        };

        // Service types that have equipment configs
        const serviceCodesWithEquip = form.service_types.filter(code => SERVICE_EQUIPMENT[code]);

        return (
          <div className="space-y-6">
            {/* ── Smart Equipment per Service Type ─── */}
            {serviceCodesWithEquip.length > 0 ? (
              serviceCodesWithEquip.map(code => {
                const config = SERVICE_EQUIPMENT[code];
                const st = SERVICE_TYPES.find(s => s.code === code);
                const subVal = getEquipVal(code, '_sub');

                // Get dynamic items from scope data (e.g., core bit sizes)
                const dynamicItems = config.getDynamicItems
                  ? config.getDynamicItems(form.scope_details[code] || {})
                  : [];

                // Filter static items by sub-option
                const visibleItems = [...config.items, ...dynamicItems].filter(item => {
                  if (!item.showWhen) return true;
                  if (!config.subOption) return true;
                  return item.showWhen === subVal;
                });

                // Only show items if sub-option is selected (when sub-options exist)
                const showItems = config.subOption ? (subVal ? visibleItems : []) : visibleItems;

                return (
                  <div key={code} className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black bg-gradient-to-br ${st?.gradient || 'from-gray-500 to-gray-600'} text-white shadow-md`}>
                        {code.substring(0, 2)}
                      </div>
                      <h4 className="text-base font-bold text-slate-800">{st?.label || code} Equipment</h4>
                    </div>

                    {/* Sub-option selector (e.g., Pentruder vs PBG) */}
                    {config.subOption && (
                      <div className="mb-4">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">{config.subOption.label}</label>
                        <div className="flex gap-2">
                          {config.subOption.choices.map(choice => (
                            <button
                              key={choice.value}
                              type="button"
                              onClick={() => setEquipVal(code, '_sub', subVal === choice.value ? '' : choice.value)}
                              className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                                subVal === choice.value
                                  ? 'bg-blue-600 text-white border-2 border-blue-500 shadow-lg'
                                  : 'bg-slate-50 text-slate-600 border-2 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                              }`}
                            >
                              {choice.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Equipment items */}
                    {showItems.length > 0 && (() => {
                      const staticItems = showItems.filter(i => !i.id.startsWith('core_bit_'));
                      const coreBitItems = showItems.filter(i => i.id.startsWith('core_bit_'));

                      const renderItem = (item: EquipItem) => {
                        const val = getEquipVal(code, item.id);
                        const isActive = !!val;

                        if (item.type === 'toggle') {
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleEquipItem(code, item.id)}
                              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                isActive
                                  ? 'bg-blue-600 text-white border-2 border-blue-500 shadow-md'
                                  : 'bg-white text-slate-600 border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                              }`}
                            >
                              {item.label}
                            </button>
                          );
                        }

                        if (item.type === 'qty') {
                          return (
                            <div key={item.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 transition-all ${
                              isActive ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'
                            }`}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isActive) { setEquipVal(code, item.id, ''); }
                                  else { setEquipVal(code, item.id, '1'); }
                                }}
                                className={`text-sm font-semibold transition-colors ${isActive ? 'text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
                              >
                                {item.label}
                              </button>
                              {isActive && (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="1"
                                    value={val === 'yes' ? '' : val}
                                    placeholder="Qty"
                                    onChange={e => setEquipVal(code, item.id, e.target.value || '1')}
                                    className="w-16 px-2 py-1.5 bg-white border border-blue-300 rounded-lg text-sm font-bold text-slate-800 text-center focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                                  />
                                  {item.qtyUnit && <span className="text-xs font-bold text-slate-400">{item.qtyUnit}</span>}
                                </div>
                              )}
                            </div>
                          );
                        }

                        if (item.type === 'option' && item.options) {
                          return (
                            <div key={item.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 transition-all ${
                              isActive ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'
                            }`}>
                              <span className={`text-sm font-semibold ${isActive ? 'text-blue-700' : 'text-slate-500'}`}>{item.label}</span>
                              <div className="flex gap-1">
                                {item.options.map(opt => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setEquipVal(code, item.id, val === opt ? '' : opt)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                      val === opt
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        }

                        return null;
                      };

                      return (
                        <div className="space-y-3">
                          {/* Static equipment items */}
                          {staticItems.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {staticItems.map(renderItem)}
                            </div>
                          )}

                          {/* Core Bit recommendations from scope */}
                          {coreBitItems.length > 0 && (
                            <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Recommended Core Bits</label>
                              <div className="flex flex-wrap gap-2">
                                {coreBitItems.map(renderItem)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center">
                <p className="text-sm text-slate-500">Select service types in Step 3 to see recommended equipment</p>
              </div>
            )}

            {/* ── Custom & Rental Equipment ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5">
                <h3 className="text-sm font-bold text-slate-800 mb-3">Add Custom Equipment</h3>
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
                {form.equipment_needed.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {form.equipment_needed.map(eq => (
                      <span key={eq} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-full text-xs font-semibold">
                        {eq}
                        <button type="button" onClick={() => updateForm({ equipment_needed: form.equipment_needed.filter(e => e !== eq) })} className="ml-0.5 text-slate-400 hover:text-slate-700">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-rose-50/50 border border-rose-200 rounded-2xl p-4 sm:p-5">
                <h3 className="text-sm font-bold text-slate-800 mb-3">Add Rental Equipment</h3>
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
                {form.equipment_rentals.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {form.equipment_rentals.map((rental, idx) => (
                      <div key={idx} className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-rose-200 rounded-xl text-sm font-semibold shadow-sm">
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
                              : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-amber-50'
                          }`}
                        >
                          Pickup: {rental.pickup_required ? 'Yes' : 'No'}
                        </button>
                        <button type="button" onClick={() => updateForm({ equipment_rentals: form.equipment_rentals.filter((_, i) => i !== idx) })} className="text-rose-400 hover:text-rose-700 font-bold">×</button>
                      </div>
                    ))}
                  </div>
                )}
                {form.equipment_rentals.length === 0 && (
                  <p className="mt-2 text-xs text-slate-400 italic">No rental equipment added yet</p>
                )}
              </div>
            </div>

            {/* Special Equipment Notes */}
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
      }

      // ── STEP 5: Scheduling Details ────────────────────────
      case 5:
        return (
          <div className="space-y-6">
            {/* View Schedule Button */}
            <button
              type="button"
              onClick={openSchedulePreview}
              className="w-full flex items-center justify-center gap-3 px-5 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl text-blue-700 font-bold hover:from-blue-100 hover:to-indigo-100 hover:border-blue-300 hover:shadow-md transition-all active:scale-[0.99]"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-sm">
                <Eye size={18} className="text-white" />
              </div>
              <div className="text-left">
                <span className="text-base">View Current Schedule</span>
                <p className="text-xs font-medium text-blue-500">Check operator availability before picking a date</p>
              </div>
              <ChevronRight size={20} className="text-blue-400 ml-auto" />
            </button>

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

            {/* ── Permits Required ────────────── */}
            <SectionCard>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Permits</p>
              <Toggle
                checked={form.permit_required}
                onChange={v => {
                  const updates: Partial<FormData> = { permit_required: v };
                  if (!v) updates.permits = [];
                  updateForm(updates);
                }}
                label="Permits Required?"
                icon={ShieldCheck}
              />
              {form.permit_required && (
                <div className="pl-4 border-l-2 border-amber-200 ml-2 space-y-3">
                  <p className="text-xs text-slate-500">Select all permits required for this job:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { type: 'work_permit', label: 'Work Permit', color: 'border-blue-300 bg-blue-50 text-blue-800' },
                      { type: 'hot_work', label: 'Hot Work Permit', color: 'border-red-300 bg-red-50 text-red-800' },
                      { type: 'excavation', label: 'Excavation Permit', color: 'border-amber-300 bg-amber-50 text-amber-800' },
                      { type: 'confined_space', label: 'Confined Space Permit', color: 'border-purple-300 bg-purple-50 text-purple-800' },
                    ].map(p => {
                      const isSelected = form.permits.some(fp => fp.type === p.type);
                      return (
                        <button
                          key={p.type}
                          type="button"
                          onClick={() => {
                            const current = [...form.permits];
                            if (isSelected) {
                              updateForm({ permits: current.filter(fp => fp.type !== p.type) });
                            } else {
                              updateForm({ permits: [...current, { type: p.type, details: '' }] });
                            }
                          }}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                            isSelected
                              ? `${p.color} ring-2 ring-offset-1 ring-current`
                              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                            isSelected ? 'border-current bg-current' : 'border-slate-300'
                          }`}>
                            {isSelected && <CheckCircle size={10} className="text-white" />}
                          </div>
                          {p.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Other permit - free text */}
                  <div className="mt-2">
                    <Label>Other Permit (specify)</Label>
                    <InputField
                      placeholder="e.g. Noise permit, Environmental permit..."
                      value={form.permit_other_text}
                      onChange={e => {
                        updateForm({ permit_other_text: e.target.value });
                        // Add/update "other" permit in array
                        if (e.target.value.trim()) {
                          const current = form.permits.filter(p => p.type !== 'other');
                          updateForm({ permits: [...current, { type: 'other', details: e.target.value.trim() }] });
                        } else {
                          updateForm({ permits: form.permits.filter(p => p.type !== 'other') });
                        }
                      }}
                    />
                  </div>

                  {/* Permit details per selected type */}
                  {form.permits.filter(p => p.type !== 'other').length > 0 && (
                    <div className="space-y-2 mt-2">
                      <p className="text-xs text-slate-400 font-semibold">Permit Details (optional)</p>
                      {form.permits.filter(p => p.type !== 'other').map(p => (
                        <InputField
                          key={p.type}
                          placeholder={`${p.type.replace(/_/g, ' ')} details (permit #, expiry, etc.)`}
                          value={p.details}
                          onChange={e => {
                            const updated = form.permits.map(fp =>
                              fp.type === p.type ? { ...fp, details: e.target.value } : fp
                            );
                            updateForm({ permits: updated });
                          }}
                        />
                      ))}
                    </div>
                  )}
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

            {/* ── Create Compliance Documents ────────────── */}
            <SectionCard>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Compliance Documents</p>
              <p className="text-xs text-slate-400 -mt-2">Create or select facility compliance requirements</p>

              {/* Select existing facility */}
              {facilities.length > 0 && !showCreateFacility && (
                <div>
                  <Label>Select Facility</Label>
                  <select
                    value={form.facility_id}
                    onChange={e => {
                      const fac = facilities.find(f => f.id === e.target.value);
                      updateForm({
                        facility_id: e.target.value,
                        facility_name: fac?.name || '',
                        facility_requirements: fac?.special_requirements || '',
                      });
                    }}
                    className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-base text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  >
                    <option value="">— None —</option>
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name}{f.address ? ` — ${f.address}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {form.facility_id && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <p className="text-sm font-bold text-emerald-800">
                    {form.facility_name}
                  </p>
                  {form.facility_requirements && (
                    <p className="text-xs text-emerald-700 mt-1">{form.facility_requirements}</p>
                  )}
                </div>
              )}

              {/* Create new facility */}
              {!showCreateFacility ? (
                <button
                  type="button"
                  onClick={() => setShowCreateFacility(true)}
                  className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl border border-dashed border-blue-300 transition-all w-full justify-center"
                >
                  <Plus size={16} />
                  Create New Facility Compliance Document
                </button>
              ) : (
                <div className="space-y-3 p-4 bg-blue-50/50 border border-blue-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-blue-800">New Facility</p>
                    <button type="button" onClick={() => setShowCreateFacility(false)} className="text-slate-400 hover:text-slate-600">
                      <X size={16} />
                    </button>
                  </div>
                  <div>
                    <Label required>Facility Name</Label>
                    <InputField
                      icon={Building2}
                      placeholder="e.g. Intel Chandler Campus"
                      value={form.facility_name}
                      onChange={e => updateForm({ facility_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Special Requirements</Label>
                    <TextArea
                      rows={4}
                      placeholder="e.g. TWIC badge required, must complete 4-hour safety orientation, no cell phones past gate 3..."
                      value={form.facility_requirements}
                      onChange={e => updateForm({ facility_requirements: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateFacility}
                    disabled={!form.facility_name.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-all"
                  >
                    <Check size={16} />
                    Save Facility
                  </button>
                </div>
              )}
            </SectionCard>

            {/* ── Forms & Signatures ────────────── */}
            <SectionCard>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Forms & Signatures</p>
              <Toggle
                checked={form.require_waiver_signature}
                onChange={v => updateForm({ require_waiver_signature: v })}
                label="Require utility waiver signature"
                icon={FileText}
              />
              <Toggle
                checked={form.require_completion_signature}
                onChange={v => updateForm({ require_completion_signature: v })}
                label="Require work completion signature"
                icon={FileText}
              />

              {formTemplates.length > 0 && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-slate-400 font-semibold">Assign Form Templates</p>
                  {formTemplates.map(t => {
                    const isSelected = form.assigned_form_template_ids.includes(t.id);
                    const typeLabel = t.form_type === 'pre_work' ? 'Pre-Work' : t.form_type === 'post_work' ? 'Post-Work' : 'Custom';
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            updateForm({ assigned_form_template_ids: form.assigned_form_template_ids.filter(id => id !== t.id) });
                          } else {
                            updateForm({ assigned_form_template_ids: [...form.assigned_form_template_ids, t.id] });
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                          isSelected
                            ? 'border-purple-400 bg-purple-50 text-purple-800 ring-2 ring-offset-1 ring-purple-300'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isSelected ? 'border-purple-500 bg-purple-500' : 'border-slate-300'
                        }`}>
                          {isSelected && <Check size={12} className="text-white" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{t.name}</p>
                          <p className="text-xs text-slate-400">{typeLabel}{t.description ? ` — ${t.description}` : ''}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {/* ── Compliance Attachments ────────────── */}
            <div>
              <Label>Upload Compliance Documents</Label>
              <p className="text-xs sm:text-sm text-slate-400 mb-3 -mt-1">Upload any site certs, permits, or compliance docs</p>
              <PhotoUploader
                bucket="site-compliance-docs"
                pathPrefix="compliance"
                photos={form.compliance_attachment_urls}
                onPhotosChange={(urls) => updateForm({ compliance_attachment_urls: urls })}
                maxPhotos={10}
                label="Add Documents"
                lightMode
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
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
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
          <div className="flex items-center gap-2">
            <Link href="/dashboard/admin/schedule-form-history"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all text-xs font-semibold">
              <FileText size={14} />
              Previous Forms
            </Link>
            <button onClick={handleSaveAndExit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg transition-all text-xs font-bold">
              {draftSaved ? <CheckCircle size={14} /> : <ArrowLeft size={14} />}
              {draftSaved ? 'Saved!' : 'Save & Exit'}
            </button>
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
                  {currentStep === 1 && 'Select an existing customer or create a new one'}
                  {currentStep === 2 && 'Project details, contacts, and site information'}
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

      {/* ══════════════════════════════════════════════════════════ */}
      {/* DRAFT PICKER MODAL                                          */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showDraftPicker && savedDrafts.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleStartNew} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <FileText size={20} /> Continue a Draft?
              </h2>
              <p className="text-blue-200 text-sm mt-0.5">You have saved schedule forms in progress</p>
            </div>
            <div className="max-h-[40vh] overflow-y-auto divide-y divide-gray-100">
              {savedDrafts.map(draft => (
                <div key={draft.id} className="flex items-center gap-3 px-6 py-3 hover:bg-blue-50 transition-colors">
                  <button onClick={() => handleLoadDraft(draft.id)} className="flex-1 text-left">
                    <p className="text-sm font-semibold text-gray-900">{draft.customer}</p>
                    <p className="text-xs text-gray-500">Step {draft.step}/8 · Saved {new Date(draft.date).toLocaleDateString()} {new Date(draft.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </button>
                  <button onClick={() => handleLoadDraft(draft.id)}
                    className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-xs font-bold transition-colors">
                    Resume
                  </button>
                  <button onClick={() => handleDeleteDraft(draft.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 px-6 py-3 flex justify-end">
              <button onClick={handleStartNew}
                className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-md">
                <Plus size={14} className="inline mr-1.5" /> Start New Form
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* NEW CUSTOMER MODAL                                          */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showNewCustomerModal && (
        <CustomerForm
          onSubmit={handleCreateCustomer}
          onClose={() => { setShowNewCustomerModal(false); setNewCustomerDefaultName(''); }}
          showAdditionalContacts={true}
          defaultCompanyName={newCustomerDefaultName}
        />
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* SCHEDULE PREVIEW MODAL                                     */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showSchedulePreview && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowSchedulePreview(false)}
          />

          {/* Modal */}
          <div className="relative mt-8 sm:mt-16 mx-4 w-full max-w-4xl max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Calendar size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Schedule Preview</h3>
                  <p className="text-xs text-blue-200">Check operator availability & talent pool</p>
                </div>
              </div>
              <button
                onClick={() => setShowSchedulePreview(false)}
                className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-white" />
              </button>
            </div>

            {/* Date Navigation */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <button
                onClick={() => {
                  const d = new Date(schedulePreviewDate);
                  d.setDate(d.getDate() - 7);
                  const newDate = d.toISOString().split('T')[0];
                  setSchedulePreviewDate(newDate);
                  fetchSchedulePreview(newDate);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg border border-slate-200 transition-all"
              >
                <ArrowLeft size={14} />
                Prev Week
              </button>
              <div className="text-sm font-bold text-slate-700">
                {schedulePreviewDate && (() => {
                  const start = new Date(schedulePreviewDate + 'T00:00:00');
                  const end = new Date(start);
                  end.setDate(end.getDate() + 6);
                  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                })()}
              </div>
              <button
                onClick={() => {
                  const d = new Date(schedulePreviewDate);
                  d.setDate(d.getDate() + 7);
                  const newDate = d.toISOString().split('T')[0];
                  setSchedulePreviewDate(newDate);
                  fetchSchedulePreview(newDate);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg border border-slate-200 transition-all"
              >
                Next Week
                <ArrowRight size={14} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {schedulePreviewLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 size={32} className="animate-spin text-blue-500" />
                  <p className="text-sm text-slate-500 font-medium">Loading schedule...</p>
                </div>
              ) : (
                <>
                  {/* ── Week Grid ─────────────────────────────── */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <Calendar size={15} className="text-blue-600" />
                      Week View — Jobs Scheduled
                    </h4>
                    <div className="grid grid-cols-7 gap-2">
                      {Array.from({ length: 7 }).map((_, i) => {
                        const day = new Date(schedulePreviewDate + 'T00:00:00');
                        day.setDate(day.getDate() + i);
                        const dayStr = day.toISOString().split('T')[0];
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                        const dayJobs = schedulePreviewData.filter(j => {
                          const jStart = j.scheduled_date?.split('T')[0];
                          const jEnd = j.end_date?.split('T')[0] || jStart;
                          return dayStr >= jStart && dayStr <= jEnd;
                        });
                        const isToday = dayStr === new Date().toISOString().split('T')[0];

                        return (
                          <div
                            key={dayStr}
                            className={`rounded-xl border p-2 min-h-[100px] transition-all ${
                              isToday
                                ? 'border-blue-400 bg-blue-50/50 shadow-sm'
                                : isWeekend
                                  ? 'border-slate-200 bg-slate-50/50'
                                  : 'border-slate-200 bg-white'
                            }`}
                          >
                            <div className="text-center mb-1.5">
                              <p className={`text-[10px] font-bold uppercase ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>
                                {day.toLocaleDateString('en-US', { weekday: 'short' })}
                              </p>
                              <p className={`text-lg font-bold ${isToday ? 'text-blue-700' : 'text-slate-800'}`}>
                                {day.getDate()}
                              </p>
                            </div>
                            {dayJobs.length === 0 ? (
                              <div className="text-center py-1">
                                <p className="text-[10px] text-emerald-500 font-semibold">Available</p>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {dayJobs.slice(0, 3).map((job: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="px-1.5 py-1 rounded-md bg-gradient-to-r from-slate-700 to-slate-800 text-[9px] text-white font-medium truncate"
                                    title={`${job.customer_name || 'Job'} — ${job.job_type || ''}`}
                                  >
                                    {job.customer_name?.split(' ')[0] || 'Job'}
                                  </div>
                                ))}
                                {dayJobs.length > 3 && (
                                  <p className="text-[9px] text-slate-500 text-center font-semibold">+{dayJobs.length - 3} more</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Talent Pool ────────────────────────────── */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <Users size={15} className="text-indigo-600" />
                      Talent Pool — Operator Availability
                    </h4>
                    {schedulePreviewOperators.length === 0 ? (
                      <p className="text-sm text-slate-400 italic">No operators found.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {schedulePreviewOperators.map((op: any) => {
                          // Count how many jobs this operator is assigned to in the preview week
                          const assignedJobs = schedulePreviewData.filter(j =>
                            j.assigned_operators?.some((a: any) =>
                              a.operator_id === op.id || a.id === op.id
                            )
                          );
                          const assignedCount = assignedJobs.length;
                          const isFree = assignedCount === 0;

                          return (
                            <div
                              key={op.id}
                              className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                                isFree
                                  ? 'bg-emerald-50/60 border-emerald-200'
                                  : assignedCount >= 5
                                    ? 'bg-red-50/60 border-red-200'
                                    : 'bg-amber-50/60 border-amber-200'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white ${
                                  isFree
                                    ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                                    : assignedCount >= 5
                                      ? 'bg-gradient-to-br from-red-500 to-rose-600'
                                      : 'bg-gradient-to-br from-amber-500 to-orange-600'
                                }`}>
                                  {op.full_name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{op.full_name || 'Unknown'}</p>
                                  <p className="text-[10px] text-slate-500 uppercase font-semibold">{op.role}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                {isFree ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                                    <CheckCircle size={12} />
                                    Available
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                                    assignedCount >= 5
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}>
                                    {assignedCount} job{assignedCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ── Summary Stats ──────────────────────────── */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-200">
                      <p className="text-2xl font-bold text-blue-700">{schedulePreviewData.length}</p>
                      <p className="text-[10px] font-semibold text-blue-500 uppercase">Jobs This Week</p>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-200">
                      <p className="text-2xl font-bold text-emerald-700">
                        {schedulePreviewOperators.filter(op =>
                          !schedulePreviewData.some(j =>
                            j.assigned_operators?.some((a: any) => a.operator_id === op.id || a.id === op.id)
                          )
                        ).length}
                      </p>
                      <p className="text-[10px] font-semibold text-emerald-500 uppercase">Available Operators</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
                      <p className="text-2xl font-bold text-slate-700">{schedulePreviewOperators.length}</p>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Total Crew</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
              <p className="text-xs text-slate-400">Use this preview to pick the best date for your job</p>
              <button
                onClick={() => setShowSchedulePreview(false)}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-bold text-sm rounded-xl hover:shadow-lg transition-all active:scale-[0.98]"
              >
                Close & Pick Date
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ AI SMART FILL FLOATING BUTTON ═══ */}
      {!submitted && currentStep <= 8 && (
        <button
          onClick={() => setShowAISmartFill(true)}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 px-4 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-2xl shadow-xl hover:shadow-2xl transition-all flex items-center gap-2 font-bold text-sm group"
        >
          <Brain className="w-5 h-5 group-hover:scale-110 transition-transform" />
          <span className="hidden sm:inline">AI Smart Fill</span>
        </button>
      )}

      {/* ═══ AI SMART FILL MODAL ═══ */}
      {showAISmartFill && (
        <AISmartFillModal
          onApply={handleAISmartFill}
          onClose={() => setShowAISmartFill(false)}
        />
      )}
    </div>
  );
}
