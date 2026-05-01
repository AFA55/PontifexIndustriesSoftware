'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from 'react';
import nextDynamic from 'next/dynamic';
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
// Equipment presets no longer displayed as grid; now using SERVICE_EQUIPMENT config
import PhotoUploader from '@/components/PhotoUploader';
import SmartCombobox, { ContactCombobox } from '@/components/SmartCombobox';

// Dynamic-imported modals — only loaded when their state flag flips true.
// AISmartFillModal pulls in framer-motion; CustomerForm is a large dialog used for the new-customer flow.
const AISmartFillModal = nextDynamic(() => import('./_components/AISmartFillModal'), { ssr: false });
const CustomerForm = nextDynamic(() => import('../customers/_components/CustomerForm'), { ssr: false });
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
  { num: 4, title: 'Difficulty & Notes', icon: BarChart3, color: 'from-rose-500 to-red-600' },
  { num: 5, title: 'Equipment', icon: HardHat, color: 'from-amber-500 to-orange-600' },
  { num: 6, title: 'Scheduling', icon: Calendar, color: 'from-cyan-500 to-blue-600' },
  { num: 7, title: 'Site Compliance', icon: ShieldCheck, color: 'from-emerald-500 to-teal-600' },
  { num: 8, title: 'Jobsite Conditions', icon: Building2, color: 'from-orange-500 to-red-600' },
];

const SERVICE_TYPES = [
  { code: 'ECD', label: 'Electric Core Drilling', gradient: 'from-pink-500 to-rose-600', lightBg: 'bg-pink-50 border-pink-200 text-pink-700' },
  { code: 'HFCD', label: 'High Frequency Core Drilling', gradient: 'from-blue-500 to-indigo-600', lightBg: 'bg-blue-50 border-blue-200 text-blue-700' },
  { code: 'HCD', label: 'Hydraulic Core Drilling', gradient: 'from-teal-500 to-cyan-600', lightBg: 'bg-teal-50 border-teal-200 text-teal-700' },
  { code: 'DFS', label: 'Diesel Floor Sawing', gradient: 'from-violet-500 to-purple-600', lightBg: 'bg-violet-50 border-violet-200 text-violet-700' },
  { code: 'EFS', label: 'Electric Floor Sawing', gradient: 'from-green-500 to-emerald-600', lightBg: 'bg-green-50 border-green-200 text-green-700' },
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
const FLEXIBLE_SCOPE_TYPES = ['WS/TS', 'DFS', 'EFS', 'HHS/PS'];

const PPE_ITEMS = [
  { key: 'safety_harness', label: 'Safety Harness', icon: '🦺' },
  { key: 'safety_glasses', label: 'Safety Glasses', icon: '🥽' },
  { key: 'ear_plugs', label: 'Ear Plugs', icon: '🔇' },
  { key: 'face_mask', label: 'Face Mask', icon: '😷' },
  { key: 'face_shield', label: 'Face Shield', icon: '🛡️' },
] as const;

const GLOVE_CUT_LEVELS = [3, 4, 5] as const;

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
  'EFS': {
    label: 'Electric Floor Sawing Details',
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

// ── Sawing Linear-Ft Calculator (DFS / EFS / HHS/PS Areas mode) ──
// Computes total linear feet for a single area:
//   perimeter = 2 * (length + width), doubled if overcut not allowed
//   plus interior cross-cuts at the given spacing
// Verified: 10×10 @ 2×2 cross-cuts, overcut allowed → 120 lf
interface SawingAreaLF {
  perimeterLF: number;       // perimeter contribution (already x2 if no overcut)
  crossCutLF: number;        // interior cross-cut contribution
  totalLF: number;           // (perimeter + cross-cuts) * qty
  doubled: boolean;          // whether perimeter was doubled
}
function computeSawingAreaLinearFt(area: {
  length?: string | number;
  width?: string | number;
  qty?: string | number;
  cross_cut_lengthwise_ft?: string | number;
  cross_cut_widthwise_ft?: string | number;
  overcut_allowed?: boolean;
}): SawingAreaLF | null {
  const length = typeof area.length === 'number' ? area.length : parseFloat(String(area.length ?? ''));
  const width = typeof area.width === 'number' ? area.width : parseFloat(String(area.width ?? ''));
  const qtyRaw = typeof area.qty === 'number' ? area.qty : parseInt(String(area.qty ?? ''), 10);
  if (!isFinite(length) || !isFinite(width) || length <= 0 || width <= 0) return null;
  const qty = isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;

  const lengthSpacing = typeof area.cross_cut_lengthwise_ft === 'number'
    ? area.cross_cut_lengthwise_ft
    : parseFloat(String(area.cross_cut_lengthwise_ft ?? '')) || 0;
  const widthSpacing = typeof area.cross_cut_widthwise_ft === 'number'
    ? area.cross_cut_widthwise_ft
    : parseFloat(String(area.cross_cut_widthwise_ft ?? '')) || 0;

  const perimeter = 2 * (length + width);
  const lengthwiseCuts = lengthSpacing > 0 ? Math.max(0, Math.floor(length / lengthSpacing) - 1) : 0;
  const widthwiseCuts = widthSpacing > 0 ? Math.max(0, Math.floor(width / widthSpacing) - 1) : 0;
  const crossCutPerUnit = (lengthwiseCuts * width) + (widthwiseCuts * length);

  const doubled = area.overcut_allowed === false;
  const perimeterPerUnit = perimeter * (doubled ? 2 : 1);

  const perimeterLF = perimeterPerUnit * qty;
  const crossCutLF = crossCutPerUnit * qty;
  return {
    perimeterLF,
    crossCutLF,
    totalLF: perimeterLF + crossCutLF,
    doubled,
  };
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
  'EFS': {
    items: [
      { id: 'slurry_drums', label: 'Slurry Drums', type: 'qty' },
      { id: 'extra_vacuum_head', label: 'Extra Vacuum Head', type: 'toggle' },
      { id: 'backup_saw', label: 'Backup Saw', type: 'toggle' },
      { id: 'chalk_line', label: 'Chalk Line', type: 'toggle' },
      { id: 'clear_spray', label: 'Clear Spray', type: 'toggle' },
      { id: 'extension_cord', label: 'Extension Cord', type: 'toggle' },
      { id: 'gfci', label: 'GFCI', type: 'toggle' },
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
  'Brokk': {
    items: [
      { id: 'brokk_480_cable', label: '480 Cable', type: 'toggle' },
      { id: 'brokk_pigtail', label: 'Pigtail / Adapter', type: 'toggle' },
      { id: 'brokk_waterbomb', label: 'Waterbomb', type: 'toggle' },
      { id: 'brokk_hepa_fans', label: 'HEPA Fans', type: 'toggle' },
      { id: 'brokk_generator', label: 'Generator', type: 'toggle' },
      { id: 'brokk_mist_water', label: 'Mist Water Attachment', type: 'toggle' },
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
  equipment_rental_flags: Record<string, boolean>;
  equipment_details: Record<string, EquipmentDetail>;
  equipment_selections: Record<string, Record<string, string>>; // per service type: { _sub: 'pentruder', item_id: 'qty_or_yes', ... }
  special_equipment: string;
  custom_equipment_input: string;
  equipment_rentals: { name: string; pickup_required: boolean }[];
  rental_equipment_input: string;
  ppe_required: string[];
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
  equipment_rental_flags: {},
  equipment_details: {},
  equipment_selections: {},
  special_equipment: '',
  custom_equipment_input: '',
  equipment_rentals: [],
  rental_equipment_input: '',
  ppe_required: [],
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
    <label className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-500 dark:text-white/40 uppercase tracking-wider mb-2.5">
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
        className={`w-full ${Icon ? 'pl-12' : 'pl-4'} pr-4 py-3.5 sm:py-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-base text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30
          focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-violet-500/20 focus:border-blue-500 dark:focus:border-violet-400 focus:shadow-sm
          hover:border-slate-300 dark:hover:border-white/20 transition-all duration-200 ${props.className || ''}`}
      />
    </div>
  );
}

function TextArea({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full px-4 py-3.5 sm:py-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-base text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30
        focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-violet-500/20 focus:border-blue-500 dark:focus:border-violet-400 focus:shadow-sm
        hover:border-slate-300 dark:hover:border-white/20 transition-all duration-200 resize-none ${props.className || ''}`}
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
          ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-400/30 shadow-sm'
          : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/8'
      }`}
    >
      <div className={`relative w-12 h-7 rounded-full transition-all duration-200 flex-shrink-0 ${checked ? 'bg-blue-600 shadow-inner' : 'bg-slate-300 dark:bg-white/20'}`}>
        <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-200 ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </div>
      {Icon && <Icon size={18} className={`flex-shrink-0 ${checked ? 'text-blue-600' : 'text-slate-400 dark:text-white/40'}`} />}
      <span className={`text-base font-medium ${checked ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-white/60'}`}>{label}</span>
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
      checked ? `${c.bg} ${c.border} shadow-sm` : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50/50 dark:hover:bg-white/8'
    }`}>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`flex-shrink-0 w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
          checked ? `${c.check} shadow-sm` : 'border-slate-300 dark:border-white/20 bg-white dark:bg-transparent hover:border-blue-400'
        }`}
      >
        {checked && <Check size={18} className="text-white" />}
      </button>
      {Icon && <Icon size={20} className={`flex-shrink-0 ${checked ? c.icon : 'text-slate-400 dark:text-white/40'}`} />}
      <span className={`text-base sm:text-lg flex-1 ${checked ? `${c.text} font-semibold` : 'text-slate-600 dark:text-white/60'}`}>{label}</span>
      {showFt && checked && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={ftValue || ''}
            onChange={(e) => onFtChange?.(e.target.value)}
            placeholder="0"
            className={`w-24 sm:w-28 px-4 py-2.5 sm:py-3 border-2 ${c.ftBorder} ${c.ftBg} rounded-xl text-base sm:text-lg font-bold text-slate-800 dark:text-white text-center ${c.ftRing} focus:ring-2 focus:outline-none transition-all`}
          />
          <span className="text-sm sm:text-base text-slate-600 dark:text-white/60 font-bold">ft.</span>
        </div>
      )}
    </div>
  );
}

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-50/80 dark:bg-white/3 border border-slate-200/60 dark:border-white/10 rounded-2xl p-5 sm:p-6 space-y-4 ${className}`}>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ── Create Facility Modal ─────────────────────────────────────
function CreateFacilityModal({ onClose, onSaved }: { onClose: () => void; onSaved: (data: { name: string; address?: string; city?: string; state?: string; zip?: string; special_requirements?: string; orientation_required?: boolean; badging_required?: boolean; notes?: string }) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [facilityForm, setFacilityForm] = useState({
    name: '', address: '', city: '', state: '', zip: '',
    special_requirements: '', orientation_required: false, badging_required: false, notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityForm.name.trim()) { setError('Facility name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await onSaved(facilityForm);
      onClose();
    } catch {
      setError('Failed to create facility');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
        <div className="bg-white dark:bg-[#12082a] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-transparent dark:border-white/10">
          <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-white/10">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-600 dark:text-violet-400" />
              Add Facility
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors">
              <X className="w-5 h-5 text-gray-400 dark:text-white/40" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-400/30 rounded-xl p-3 text-sm text-red-700 dark:text-red-300">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-white/60 mb-1">Facility Name *</label>
              <input type="text" value={facilityForm.name} onChange={e => setFacilityForm({ ...facilityForm, name: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30" placeholder="e.g., Intel D1X Fab" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-white/60 mb-1">Address</label>
              <input type="text" value={facilityForm.address} onChange={e => setFacilityForm({ ...facilityForm, address: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30" placeholder="Street address" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white/60 mb-1">City</label>
                <input type="text" value={facilityForm.city} onChange={e => setFacilityForm({ ...facilityForm, city: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white/60 mb-1">State</label>
                <input type="text" value={facilityForm.state} onChange={e => setFacilityForm({ ...facilityForm, state: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30" maxLength={2} placeholder="OR" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white/60 mb-1">ZIP</label>
                <input type="text" value={facilityForm.zip} onChange={e => setFacilityForm({ ...facilityForm, zip: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30" maxLength={10} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-white/60 mb-1">Special Requirements</label>
              <textarea value={facilityForm.special_requirements} onChange={e => setFacilityForm({ ...facilityForm, special_requirements: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30" rows={2}
                placeholder="PPE requirements, site rules, etc." />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => setFacilityForm({ ...facilityForm, orientation_required: !facilityForm.orientation_required })}
                  className={`relative w-10 h-6 rounded-full transition-colors ${facilityForm.orientation_required ? 'bg-purple-600' : 'bg-gray-300 dark:bg-white/20'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${facilityForm.orientation_required ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-700 dark:text-white/70">Orientation Required</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => setFacilityForm({ ...facilityForm, badging_required: !facilityForm.badging_required })}
                  className={`relative w-10 h-6 rounded-full transition-colors ${facilityForm.badging_required ? 'bg-purple-600' : 'bg-gray-300 dark:bg-white/20'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${facilityForm.badging_required ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-700 dark:text-white/70">Badging Required</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-white/60 mb-1">Notes</label>
              <textarea value={facilityForm.notes} onChange={e => setFacilityForm({ ...facilityForm, notes: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30" rows={2} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Creating...' : 'Create Facility'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

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
  const [customerSiteAddresses, setCustomerSiteAddresses] = useState<Array<{
    id: string;
    address: string;
    location_name: string | null;
    use_count: number;
    last_used_at: string;
  }>>([]);
  const [customerProjectNames, setCustomerProjectNames] = useState<Array<{
    project_name: string;
    last_used: string;
    job_count: number;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Schedule preview state
  const [showSchedulePreview, setShowSchedulePreview] = useState(false);
  const [schedulePreviewLoading, setSchedulePreviewLoading] = useState(false);
  const [schedulePreviewDate, setSchedulePreviewDate] = useState('');
  const [schedulePreviewWeek, setSchedulePreviewWeek] = useState<any | null>(null);
  const [schedulePreviewSelectedDay, setSchedulePreviewSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (!isAdmin()) {
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

      const [poRes, contactRes, siteAddrRes, projectNamesRes] = await Promise.all([
        fetch(`/api/admin/customers/${customerId}/po-numbers`, { headers }),
        fetch(`/api/admin/customers/${customerId}/site-contacts`, { headers }),
        fetch(`/api/admin/customers/${customerId}/site-addresses`, { headers }),
        fetch(`/api/admin/customers/${customerId}/project-names`, { headers }),
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
      if (siteAddrRes.ok) {
        const json = await siteAddrRes.json();
        setCustomerSiteAddresses(json.data || []);
      }
      if (projectNamesRes.ok) {
        const json = await projectNamesRes.json();
        setCustomerProjectNames(json.data || []);
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

  // Pre-fill from customer page "Add Job" button
  useEffect(() => {
    const raw = localStorage.getItem('schedule-form-customer-prefill');
    if (!raw) return;
    try {
      const prefill = JSON.parse(raw) as {
        customer_id?: string;
        customer_name?: string;
        project_name?: string;
        address?: string;
        location?: string;
        contact_name?: string;
        contact_phone?: string;
        equipment_needed?: string[];
        ppe_required?: string[];
      };
      localStorage.removeItem('schedule-form-customer-prefill');

      const updates: Record<string, unknown> = {};
      if (prefill.customer_name) updates.contractor_name = prefill.customer_name;
      if (prefill.customer_id) updates.customer_id = prefill.customer_id;
      if (prefill.project_name) updates.project_name = prefill.project_name;
      if (prefill.address) updates.site_address = prefill.address;
      if (prefill.location) updates.location_name = prefill.location;
      if (prefill.contact_name) updates.site_contact = prefill.contact_name;
      if (prefill.contact_phone) updates.contact_phone = prefill.contact_phone;
      if (prefill.equipment_needed?.length) updates.equipment_needed = prefill.equipment_needed;
      if (prefill.ppe_required?.length) updates.ppe_required = prefill.ppe_required;

      updateForm(updates as Partial<FormData>);

      if (prefill.customer_id) {
        fetchCustomerHistory(prefill.customer_id);
      }
    } catch {
      // Ignore parse errors
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      site_contact: '',
      contact_phone: '',
    });
    setShowCustomerDropdown(false);
    // Clear and fetch customer history (PO numbers + site contacts + site addresses + project names from past jobs)
    setCustomerPONumbers([]);
    setCustomerContacts([]);
    setCustomerSiteAddresses([]);
    setCustomerProjectNames([]);
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
      });
      // New customer has no history yet — clear any stale history state
      setCustomerPONumbers([]);
      setCustomerContacts([]);
      setCustomerSiteAddresses([]);
      setCustomerProjectNames([]);
      setShowNewCustomerModal(false);
    } else {
      throw new Error(result.error || 'Failed to create customer');
    }
  };

  // ── Create facility handler ──────────────────────────────────
  const handleCreateFacility = async (facilityData: { name: string; address?: string; city?: string; state?: string; zip?: string; special_requirements?: string; orientation_required?: boolean; badging_required?: boolean; notes?: string }) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      const res = await fetch('/api/admin/facilities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify(facilityData),
      });
      const result = await res.json();
      if (res.ok && result.data) {
        setFacilities(prev => [...prev, result.data]);
        updateForm({ facility_id: result.data.id, facility_name: facilityData.name });
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
      setCurrentStep(6); // Scheduling
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
      case 6:
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

      const params = new URLSearchParams({ start: previewDate });
      if (form.service_types.length > 0) {
        params.set('serviceType', form.service_types.join(','));
      }
      if (form.difficulty_rating) {
        params.set('difficulty', String(form.difficulty_rating));
      }

      const res = await fetch(`/api/admin/schedule-board/week-capacity?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const json = await res.json();
        setSchedulePreviewWeek(json.data || null);
        // Keep selection in-week if still valid, else clear
        setSchedulePreviewSelectedDay(prev => {
          if (!prev) return null;
          const inWeek = (json.data?.days || []).some((d: any) => d.date === prev);
          return inWeek ? prev : null;
        });
      } else {
        setSchedulePreviewWeek(null);
      }
    } catch (err) {
      console.error('Error fetching schedule preview:', err);
      setSchedulePreviewWeek(null);
    } finally {
      setSchedulePreviewLoading(false);
    }
  };

  const openSchedulePreview = () => {
    setShowSchedulePreview(true);
    setSchedulePreviewSelectedDay(null);
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
        equipment_rental_flags: Object.keys(form.equipment_rental_flags).length > 0 ? form.equipment_rental_flags : undefined,
        equipment_details: Object.keys(form.equipment_details).length > 0 ? form.equipment_details : undefined,
        equipment_selections: Object.keys(form.equipment_selections).length > 0 ? form.equipment_selections : undefined,
        special_equipment: form.special_equipment || null,
        ppe_required: form.ppe_required,
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

      // Fire-and-forget: save site address to customer history
      if (form.customer_id && form.site_address) {
        fetch(`/api/admin/customers/${form.customer_id}/site-addresses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionData.session.access_token}` },
          body: JSON.stringify({ address: form.site_address }),
        }).catch(() => {});
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-[#0b0618] dark:via-[#0e0720] dark:to-[#0b0618] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 relative">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100 dark:border-white/10"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-sm text-slate-500 dark:text-white/40 font-medium">Loading Schedule Form...</p>
        </div>
      </div>
    );
  }

  // ── Success screen ─────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 dark:from-[#0b0618] dark:via-[#0e0720] dark:to-[#0b0618] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-white/5 rounded-3xl shadow-xl border border-slate-200/60 dark:border-white/10 p-10 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-200">
            <CheckCircle size={40} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Job Created!</h2>
          <p className="text-sm text-slate-500 dark:text-white/40 mb-1">Job Number</p>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mb-1">{createdJobNumber}</p>
          <p className="text-sm text-slate-500 dark:text-white/40 mb-8">
            Customer: <span className="font-semibold text-slate-700 dark:text-white/80">{form.contractor_name}</span>
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
              className="flex-1 px-5 py-3 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-white/80 rounded-xl text-sm font-semibold transition-all"
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
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/80 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white">
                {(user?.name || '').split(' ').map(n => n[0]).join('')}
              </div>
              <span className="text-sm text-slate-600 dark:text-white/60">Submitted by <span className="font-semibold text-slate-800 dark:text-white">{user?.name}</span> on {new Date().toLocaleDateString()}</span>
            </div>

            {/* Selected customer badge */}
            {form.customer_id && form.contractor_name && (
              <div className="flex items-center gap-3 px-5 py-4 bg-emerald-50 dark:bg-emerald-500/10 border-2 border-emerald-200 dark:border-emerald-400/30 rounded-xl">
                <CheckCircle size={22} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-base font-bold text-emerald-800 dark:text-emerald-300">{form.contractor_name}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Customer selected — click Next Step to continue</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateForm({ contractor_name: '', customer_id: '', save_as_customer: false })}
                  className="px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
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
                    <div className="text-center py-8 text-slate-400 dark:text-white/40">
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
                    <div className="text-center py-8 text-slate-400 dark:text-white/40">
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
                  {filteredCrmCustomers.map(c => {
                    // Snapshot the customer object at render time so the click
                    // handler always selects the customer displayed on THIS
                    // tile, regardless of any concurrent list mutation (search
                    // filtering, re-fetch, optimistic new-customer prepend,
                    // etc.). Previously the closure captured `c` by reference
                    // which — combined with list reordering — could cause a
                    // tap on "tile 2" to select a different customer than the
                    // label showed.
                    const customerSnapshot = {
                      id: c.id,
                      company_name: c.company_name,
                      primary_contact_name: c.primary_contact_name,
                      primary_contact_phone: c.primary_contact_phone,
                      address: c.address,
                    };
                    return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        selectCrmCustomer(customerSnapshot);
                        setCustomerSearch('');
                      }}
                      className="w-full flex items-center gap-4 px-5 py-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-blue-50/50 dark:hover:bg-blue-500/10 hover:shadow-sm transition-all text-left group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-white/10 dark:to-white/5 group-hover:from-blue-100 group-hover:to-blue-200 dark:group-hover:from-blue-500/20 dark:group-hover:to-blue-500/10 flex items-center justify-center text-sm font-bold text-slate-500 dark:text-white/50 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                        {c.company_name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold text-slate-800 dark:text-white truncate">{c.company_name}</p>
                        <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-white/40 mt-0.5">
                          {c.primary_contact_name && <span>{c.primary_contact_name}</span>}
                          {c.address && <span className="truncate">{c.address}</span>}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 dark:text-white/20 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
                    </button>
                    );
                  })}
                </div>

                {/* Or type freely */}
                <div className="border-t border-slate-200 dark:border-white/10 pt-4">
                  <p className="text-xs text-slate-400 dark:text-white/30 mb-2 font-medium">Or type a customer name directly:</p>
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
                        className="w-3.5 h-3.5 rounded border-slate-300 dark:border-white/20 text-blue-600 focus:ring-blue-500 dark:bg-white/5"
                      />
                      <span className="text-xs text-slate-500 dark:text-white/40">Save as new customer on submit</span>
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
              <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-400/30 rounded-xl">
                <UserIcon size={16} className="text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">Customer: {form.contractor_name}</span>
                {form.customer_id && <CheckCircle size={14} className="text-emerald-500 dark:text-emerald-400 ml-auto" />}
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
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-400/30 rounded-xl">
                  <p className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1">Found existing job with this PO</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Customer: <span className="font-semibold">{poMatch.customer_name}</span></p>
                  {poMatch.address && <p className="text-xs text-blue-600 dark:text-blue-400">Address: {poMatch.address}</p>}
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
              <SmartCombobox
                label="Project Name"
                placeholder="Select or enter project name"
                options={customerProjectNames.map(p => ({
                  value: p.project_name,
                  label: p.project_name,
                  sublabel: `Used ${p.job_count} time${p.job_count !== 1 ? 's' : ''}`,
                }))}
                value={form.project_name}
                onChange={(val) => updateForm({ project_name: val })}
                onAddNew={(val) => updateForm({ project_name: val })}
                loading={historyLoading}
              />
              <p className="text-xs text-slate-400 dark:text-white/30 mt-1">Groups multiple jobs at the same site. If existing project, it will auto-populate address.</p>
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
              {customerSiteAddresses.length > 0 && (
                <SmartCombobox
                  label=""
                  placeholder="Select a past site address..."
                  options={customerSiteAddresses.map(sa => ({
                    value: sa.address,
                    label: sa.address,
                    sublabel: sa.location_name ? `${sa.location_name} · Used ${sa.use_count}×` : `Used ${sa.use_count}×`,
                  }))}
                  value={form.site_address}
                  onChange={(val) => updateForm({ site_address: val })}
                  className="mb-2"
                />
              )}
              <GoogleAddressAutocomplete
                value={form.site_address}
                onChange={(address) => updateForm({ site_address: address })}
                placeholder="Or type a new address..."
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
                          : `bg-white dark:bg-white/5 ${st.lightBg} dark:border-white/10 dark:text-white/70 border-2 hover:shadow-md hover:scale-[1.02]`
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
                    <div key={code} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black bg-gradient-to-br ${st?.gradient || 'from-gray-500 to-gray-600'} text-white shadow-md`}>
                            {code.substring(0, 2)}
                          </div>
                          <h4 className="text-base font-bold text-slate-800 dark:text-white">{config.label}</h4>
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
                                : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/50 hover:bg-slate-200 dark:hover:bg-white/15 hover:text-slate-600 dark:hover:text-white/70'
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
                                : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/50 hover:bg-slate-200 dark:hover:bg-white/15 hover:text-slate-600 dark:hover:text-white/70'
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
                                <div key={idx} className={`${idx > 0 ? 'pt-3 border-t border-slate-100 dark:border-white/5' : ''}`}>
                                  {idx === 0 && (
                                    <div className="grid grid-cols-3 gap-3 mb-1.5">
                                      <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest"># of Holes</label>
                                      <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">Bit Size</label>
                                      <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">Depth</label>
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
                                        className="w-full px-3 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-lg font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
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
                                          className="w-full px-3 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-lg font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 dark:text-white/30">&quot;</span>
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
                                          className="w-full px-3 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-lg font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 dark:text-white/30">in.</span>
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
                                <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                                  <span className="text-xs font-bold text-slate-500 dark:text-white/40 uppercase tracking-wider">Total:</span>
                                  <span className="text-sm font-bold text-slate-800 dark:text-white">{totalHoles} hole{totalHoles !== 1 ? 's' : ''}</span>
                                  {uniqueSizes.length > 0 && (
                                    <span className="text-xs text-slate-400 dark:text-white/30">Sizes: {uniqueSizes.map(s => `${s}"`).join(', ')}</span>
                                  )}
                                </div>
                              )}

                              {/* Work Location */}
                              <div className="pt-3 border-t border-slate-100 dark:border-white/10">
                                <p className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest mb-2">Work Location</p>
                                <div className="grid grid-cols-3 gap-2">
                                  {([
                                    { value: 'elevated_slab', label: 'Elevated Slab' },
                                    { value: 'slab_on_grade', label: 'Slab on Grade' },
                                    { value: 'on_wall', label: 'On Wall' },
                                  ] as const).map(opt => {
                                    const selected = form.scope_details[code]?.work_location === opt.value;
                                    return (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => updateScopeDetail(code, 'work_location', selected ? '' : opt.value)}
                                        className={`px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                                          selected
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                            : 'bg-white dark:bg-white/5 text-slate-600 dark:text-white/60 border-slate-200 dark:border-white/10 hover:border-blue-300 hover:text-blue-600'
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* On Wall follow-up */}
                                {form.scope_details[code]?.work_location === 'on_wall' && (
                                  <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-xl">
                                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
                                      Is a lift or ladder onsite?
                                    </p>
                                    <div className="flex gap-2">
                                      {(['yes', 'no'] as const).map(opt => {
                                        const selected = form.scope_details[code]?.lift_or_ladder_onsite === opt;
                                        return (
                                          <button
                                            key={opt}
                                            type="button"
                                            onClick={() => updateScopeDetail(code, 'lift_or_ladder_onsite', selected ? '' : opt)}
                                            className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all capitalize ${
                                              selected
                                                ? opt === 'yes'
                                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                                  : 'bg-rose-600 text-white border-rose-600 shadow-sm'
                                                : 'bg-white dark:bg-white/5 text-slate-600 dark:text-white/60 border-slate-200 dark:border-white/10 hover:border-amber-400 hover:text-amber-700'
                                            }`}
                                          >
                                            {opt === 'yes' ? '✓ Yes' : '✗ No'}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
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
                                <div key={idx} className={`${idx > 0 ? 'pt-3 border-t border-slate-100 dark:border-white/5' : ''}`}>
                                  {idx === 0 && (
                                    <div className="grid grid-cols-3 gap-3 mb-1.5">
                                      <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">Linear Feet</label>
                                      <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">Cut Depth</label>
                                      <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest"># of Cuts</label>
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
                                          className="w-full px-3 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-lg font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 dark:text-white/30">ft</span>
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
                                          className="w-full px-3 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-lg font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 dark:text-white/30">in.</span>
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
                                        className="w-full px-3 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-lg font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
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
                                <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                                  <span className="text-xs font-bold text-slate-500 dark:text-white/40 uppercase tracking-wider">Total:</span>
                                  {totalLF > 0 && <span className="text-sm font-bold text-slate-800 dark:text-white">{totalLF.toLocaleString()} linear ft</span>}
                                  {totalCuts > 0 && <span className="text-xs text-slate-400 dark:text-white/30">{totalCuts} cut{totalCuts !== 1 ? 's' : ''}</span>}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : config.hasDynamicAreas && (isFlexible ? currentMode === 'areas' : true) ? (
                        // ── Dynamic Areas Builder (L × W × Thickness × Qty) ──
                        (() => {
                          // Sawing-specific calculator only for floor/handheld saws
                          const isSawingScope = code === 'DFS' || code === 'EFS' || code === 'HHS/PS';
                          type AreaRow = {
                            length: string;
                            width: string;
                            thickness: string;
                            qty: string;
                            overcut_allowed?: boolean;
                            cross_cut_lengthwise_ft?: string;
                            cross_cut_widthwise_ft?: string;
                          };
                          const areasRaw = form.scope_details[code]?.areas;
                          const areas: AreaRow[] = areasRaw
                            ? (() => { try { return JSON.parse(areasRaw); } catch { return [{ length: '', width: '', thickness: '', qty: '' }]; } })()
                            : [{ length: '', width: '', thickness: '', qty: '' }];

                          const updateAreas = (newAreas: AreaRow[]) => {
                            updateScopeDetail(code, 'areas', JSON.stringify(newAreas));
                          };

                          const totalSqFt = areas.reduce((sum, a) => {
                            const l = parseFloat(a.length) || 0;
                            const w = parseFloat(a.width) || 0;
                            const q = parseInt(a.qty) || 1;
                            return sum + (l * w * q);
                          }, 0);
                          const totalAreaCount = areas.reduce((sum, a) => sum + (parseInt(a.qty) || 0), 0);

                          // Resolve per-area overcut: explicit boolean wins, else fall back to top-level form default
                          const resolveOvercut = (a: AreaRow): boolean =>
                            typeof a.overcut_allowed === 'boolean' ? a.overcut_allowed : form.overcutting_allowed;
                          const grandTotalLinearFt = isSawingScope
                            ? areas.reduce((sum, a) => {
                                const r = computeSawingAreaLinearFt({
                                  length: a.length,
                                  width: a.width,
                                  qty: a.qty,
                                  cross_cut_lengthwise_ft: a.cross_cut_lengthwise_ft,
                                  cross_cut_widthwise_ft: a.cross_cut_widthwise_ft,
                                  overcut_allowed: resolveOvercut(a),
                                });
                                return sum + (r ? r.totalLF : 0);
                              }, 0)
                            : 0;

                          return (
                            <div className="space-y-3">
                              {areas.map((area, idx) => (
                                <div key={idx} className={`${idx > 0 ? 'pt-3 border-t border-slate-100 dark:border-white/5' : ''}`}>
                                  {idx === 0 && (
                                    <div className="grid grid-cols-4 gap-3 mb-1.5">
                                      <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">Length</label>
                                      <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">Width</label>
                                      <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">Thickness</label>
                                      <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">Qty</label>
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
                                          className="w-full px-3 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-lg font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 dark:text-white/30">ft</span>
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
                                          className="w-full px-3 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-lg font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 dark:text-white/30">ft</span>
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
                                          className="w-full px-3 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-lg font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 dark:text-white/30">in.</span>
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
                                        className="w-full px-3 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-lg font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
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
                                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 px-2 py-0.5 rounded-lg">
                                        {((parseFloat(area.length) || 0) * (parseFloat(area.width) || 0)).toFixed(0)} sq ft{parseInt(area.qty) > 1 ? ` x ${area.qty} = ${((parseFloat(area.length) || 0) * (parseFloat(area.width) || 0) * (parseInt(area.qty) || 1)).toFixed(0)} sq ft` : ''}
                                      </span>
                                    </div>
                                  )}

                                  {/* ── Sawing-specific: overcut + cross-cuts + per-area linear ft ── */}
                                  {isSawingScope && (() => {
                                    const overcut = resolveOvercut(area);
                                    const lf = computeSawingAreaLinearFt({
                                      length: area.length,
                                      width: area.width,
                                      qty: area.qty,
                                      cross_cut_lengthwise_ft: area.cross_cut_lengthwise_ft,
                                      cross_cut_widthwise_ft: area.cross_cut_widthwise_ft,
                                      overcut_allowed: overcut,
                                    });
                                    const breakdownTitle = lf
                                      ? `Perimeter ${lf.perimeterLF.toFixed(1)} ft${lf.doubled ? ' (doubled — no overcut)' : ''} + Cross-cuts ${lf.crossCutLF.toFixed(1)} ft`
                                      : 'Enter length, width, and qty to calculate';
                                    return (
                                      <div className="mt-3 rounded-xl border border-violet-200 dark:border-violet-500/20 bg-gradient-to-br from-violet-50/60 to-sky-50/60 dark:from-violet-500/5 dark:to-sky-500/5 p-3 space-y-3">
                                        {/* Overcut toggle */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...areas];
                                            updated[idx] = { ...updated[idx], overcut_allowed: !overcut };
                                            updateAreas(updated);
                                          }}
                                          className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border transition-all text-left ${
                                            overcut
                                              ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/30 text-sky-800 dark:text-sky-200'
                                              : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-200'
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <Scissors size={14} className="shrink-0" />
                                            <span className="text-xs font-semibold truncate">
                                              {overcut
                                                ? 'Overcut allowed (perimeter cut once)'
                                                : 'No overcut — double-cut perimeter (×2)'}
                                            </span>
                                          </div>
                                          <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${overcut ? 'bg-sky-500' : 'bg-rose-400'}`}>
                                            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${overcut ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                          </span>
                                        </button>

                                        {/* Cross-cut spacing inputs */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                          <div>
                                            <label
                                              className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest mb-1 block"
                                              title="Spacing between cuts running across the width."
                                            >
                                              Cross-cut length-wise (ft)
                                            </label>
                                            <div className="relative">
                                              <input
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                placeholder="e.g., 2 = cut every 2 ft along length"
                                                value={area.cross_cut_lengthwise_ft ?? ''}
                                                onChange={e => {
                                                  const updated = [...areas];
                                                  updated[idx] = { ...updated[idx], cross_cut_lengthwise_ft: e.target.value };
                                                  updateAreas(updated);
                                                }}
                                                className="w-full px-3 py-2.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
                                              />
                                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 dark:text-white/30">ft</span>
                                            </div>
                                          </div>
                                          <div>
                                            <label
                                              className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest mb-1 block"
                                              title="Spacing between cuts running along the length."
                                            >
                                              Cross-cut width-wise (ft)
                                            </label>
                                            <div className="relative">
                                              <input
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                placeholder="e.g., 2 = cut every 2 ft along width"
                                                value={area.cross_cut_widthwise_ft ?? ''}
                                                onChange={e => {
                                                  const updated = [...areas];
                                                  updated[idx] = { ...updated[idx], cross_cut_widthwise_ft: e.target.value };
                                                  updateAreas(updated);
                                                }}
                                                className="w-full px-3 py-2.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
                                              />
                                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 dark:text-white/30">ft</span>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Per-area linear-ft pill */}
                                        <div
                                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 dark:bg-white/5 border border-violet-200 dark:border-violet-500/30 text-violet-800 dark:text-violet-200 cursor-help"
                                          title={breakdownTitle}
                                        >
                                          <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">Total</span>
                                          <span className="text-sm font-bold">
                                            {lf ? `${lf.totalLF.toLocaleString(undefined, { maximumFractionDigits: 1 })} linear ft` : '— linear ft'}
                                          </span>
                                          {lf && lf.doubled && (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-200">×2 perimeter</span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })()}
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
                                <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                                  <span className="text-xs font-bold text-slate-500 dark:text-white/40 uppercase tracking-wider">Total:</span>
                                  <span className="text-sm font-bold text-slate-800 dark:text-white">{totalSqFt.toLocaleString()} sq ft</span>
                                  {totalAreaCount > 0 && <span className="text-xs text-slate-400 dark:text-white/30">({totalAreaCount} area{totalAreaCount !== 1 ? 's' : ''})</span>}
                                </div>
                              )}

                              {isSawingScope && grandTotalLinearFt > 0 && (
                                <div className="flex items-center gap-3 px-3 py-2 bg-gradient-to-r from-violet-50 to-sky-50 dark:from-violet-500/10 dark:to-sky-500/10 rounded-xl border border-violet-200 dark:border-violet-500/30">
                                  <span className="text-xs font-bold text-violet-700 dark:text-violet-200 uppercase tracking-wider">Total Linear Feet:</span>
                                  <span className="text-sm font-bold text-violet-900 dark:text-white">
                                    {grandTotalLinearFt.toLocaleString(undefined, { maximumFractionDigits: 1 })} ft
                                  </span>
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
                              <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest mb-1.5 block">{field.label}</label>
                              {field.type === 'textarea' ? (
                                <textarea
                                  rows={3}
                                  placeholder={field.placeholder}
                                  value={form.scope_details[code]?.[field.key] || ''}
                                  onChange={e => updateScopeDetail(code, field.key, e.target.value)}
                                  className="w-full px-4 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-base font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
                                />
                              ) : (
                                <div className="relative">
                                  <input
                                    type={field.type}
                                    placeholder={field.placeholder}
                                    value={form.scope_details[code]?.[field.key] || ''}
                                    onChange={e => updateScopeDetail(code, field.key, e.target.value)}
                                    className="w-full px-4 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-lg font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
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
                <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-red-500 to-red-700 text-white shadow-md">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-slate-800 dark:text-white">Material Removal</h4>
                        <p className="text-xs text-slate-400 dark:text-white/40">Are we removing material from the site?</p>
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
                        <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest mb-2 block">Removal Method</label>
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
                                  : 'bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-white/70 border-2 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 hover:border-slate-300 dark:hover:border-white/20'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Removal Equipment Type */}
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest mb-2 block">Equipment for Removal</label>
                        <p className="text-xs text-slate-400 dark:text-white/30 mb-2">Select all that apply</p>
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
                                    : 'bg-white dark:bg-white/5 text-slate-600 dark:text-white/70 border-2 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 hover:border-slate-300 dark:hover:border-white/20'
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
                <div className="mt-2 px-4 py-3 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-400/30 rounded-xl text-sm text-orange-700 dark:text-orange-300 italic">
                  <span className="font-semibold text-orange-600 dark:text-orange-400">Hearing: </span>
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

      // ── STEP 5: Equipment Requirements ────────────────────
      case 5: {
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
                  <div key={code} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black bg-gradient-to-br ${st?.gradient || 'from-gray-500 to-gray-600'} text-white shadow-md`}>
                        {code.substring(0, 2)}
                      </div>
                      <h4 className="text-base font-bold text-slate-800 dark:text-white">{st?.label || code} Equipment</h4>
                    </div>

                    {/* Sub-option selector (e.g., Pentruder vs PBG) */}
                    {config.subOption && (
                      <div className="mb-4">
                        <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest mb-2 block">{config.subOption.label}</label>
                        <div className="flex gap-2">
                          {config.subOption.choices.map(choice => (
                            <button
                              key={choice.value}
                              type="button"
                              onClick={() => setEquipVal(code, '_sub', subVal === choice.value ? '' : choice.value)}
                              className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                                subVal === choice.value
                                  ? 'bg-blue-600 text-white border-2 border-blue-500 shadow-lg'
                                  : 'bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-white/70 border-2 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 hover:border-slate-300 dark:hover:border-white/20'
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
                                  : 'bg-white dark:bg-white/5 text-slate-600 dark:text-white/70 border-2 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 hover:border-slate-300 dark:hover:border-white/20'
                              }`}
                            >
                              {item.label}
                            </button>
                          );
                        }

                        if (item.type === 'qty') {
                          return (
                            <div key={item.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 transition-all ${
                              isActive ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5'
                            }`}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isActive) { setEquipVal(code, item.id, ''); }
                                  else { setEquipVal(code, item.id, '1'); }
                                }}
                                className={`text-sm font-semibold transition-colors ${isActive ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/80'}`}
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
                                    className="w-16 px-2 py-1.5 bg-white dark:bg-white/5 border border-blue-300 dark:border-blue-400/40 rounded-lg text-sm font-bold text-slate-800 dark:text-white text-center focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
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
                              isActive ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5'
                            }`}>
                              <span className={`text-sm font-semibold ${isActive ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-white/50'}`}>{item.label}</span>
                              <div className="flex gap-1">
                                {item.options.map(opt => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setEquipVal(code, item.id, val === opt ? '' : opt)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                      val === opt
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/50 hover:bg-slate-200 dark:hover:bg-white/15'
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
                              <label className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest mb-2 block">Recommended Core Bits</label>
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
              <div className="bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/10 rounded-2xl p-6 text-center">
                <p className="text-sm text-slate-500 dark:text-white/40">Select service types in Step 3 to see recommended equipment</p>
              </div>
            )}

            {/* ── Custom & Rental Equipment ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/10 rounded-2xl p-4 sm:p-5">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3">Add Custom Equipment</h3>
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
                      <div key={eq} className="flex items-center gap-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 px-2 py-1.5 rounded-xl text-sm shadow-sm">
                        <span className="text-slate-700 dark:text-white/80 font-semibold text-xs">{eq}</span>
                        <button
                          type="button"
                          onClick={() => updateForm({
                            equipment_rental_flags: { ...form.equipment_rental_flags, [eq]: !form.equipment_rental_flags[eq] }
                          })}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                            form.equipment_rental_flags[eq]
                              ? 'bg-purple-500 text-white'
                              : 'bg-slate-200 text-slate-500 hover:bg-purple-100 hover:text-purple-700'
                          }`}
                          title="Toggle rental"
                        >
                          {form.equipment_rental_flags[eq] ? '+ Rental' : 'Rental?'}
                        </button>
                        <button type="button" onClick={() => {
                          const flags = { ...form.equipment_rental_flags };
                          delete flags[eq];
                          updateForm({
                            equipment_needed: form.equipment_needed.filter(e => e !== eq),
                            equipment_rental_flags: flags
                          });
                        }} className="ml-0.5 text-slate-400 hover:text-slate-700">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-rose-50/50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-400/20 rounded-2xl p-4 sm:p-5">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3">Add Rental Equipment</h3>
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
                      <div key={idx} className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-white/5 border border-rose-200 dark:border-rose-400/20 rounded-xl text-sm font-semibold shadow-sm">
                        <span className="text-rose-700 dark:text-rose-300">{rental.name}</span>
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
                              : 'bg-slate-100 dark:bg-white/10 border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/40 hover:bg-amber-50 dark:hover:bg-amber-500/10'
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

            {/* ── PPE Required ── */}
            <div className="bg-white dark:bg-white/5 rounded-2xl ring-1 ring-slate-200 dark:ring-white/10 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md">
                  ⚠️
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">PPE Required</h3>
                  <p className="text-[11px] text-slate-500 dark:text-white/40">Select personal protective equipment required for this job</p>
                </div>
              </div>

              {/* Standard PPE toggles */}
              <div className="flex flex-wrap gap-2 mb-4">
                {PPE_ITEMS.map(item => {
                  const active = form.ppe_required.includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        const next = active
                          ? form.ppe_required.filter(k => k !== item.key)
                          : [...form.ppe_required, item.key];
                        updateForm({ ppe_required: next });
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                        active
                          ? 'bg-orange-500 border-orange-500 text-white shadow-md'
                          : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60 hover:border-orange-300 dark:hover:border-orange-400/40 hover:text-orange-600 dark:hover:text-orange-400'
                      }`}
                    >
                      <span>{item.icon}</span>
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {/* Gloves — cut level selector */}
              <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 border border-slate-200 dark:border-white/10">
                <p className="text-xs font-bold text-slate-700 dark:text-white/70 mb-2">Gloves — Cut Level</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-500 dark:text-white/40">Required level:</span>
                  {GLOVE_CUT_LEVELS.map(level => {
                    const key = `gloves_cut_${level}`;
                    const active = form.ppe_required.includes(key);
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => {
                          // Only one glove level at a time
                          const withoutGloves = form.ppe_required.filter(k => !k.startsWith('gloves_cut_'));
                          const next = active ? withoutGloves : [...withoutGloves, key];
                          updateForm({ ppe_required: next });
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                          active
                            ? 'bg-orange-500 border-orange-500 text-white'
                            : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60 hover:border-orange-300 dark:hover:border-orange-400/40 hover:text-orange-600 dark:hover:text-orange-400'
                        }`}
                      >
                        Level {level}
                      </button>
                    );
                  })}
                  {form.ppe_required.some(k => k.startsWith('gloves_cut_')) && (
                    <button
                      type="button"
                      onClick={() => updateForm({ ppe_required: form.ppe_required.filter(k => !k.startsWith('gloves_cut_')) })}
                      className="text-[10px] text-slate-400 hover:text-red-500 transition-colors px-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Summary chip strip */}
              {form.ppe_required.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {form.ppe_required.map(key => {
                    const item = PPE_ITEMS.find(p => p.key === key);
                    const gloveMatch = key.match(/^gloves_cut_(\d)$/);
                    const label = item ? `${item.icon} ${item.label}` : gloveMatch ? `🧤 Gloves Cut ${gloveMatch[1]}` : key;
                    return (
                      <span key={key} className="inline-flex items-center gap-1 bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-400/30 rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      }

      // ── STEP 6: Scheduling Details ────────────────────────
      case 6:
        return (
          <div className="space-y-6">
            {/* View Schedule Button */}
            <button
              type="button"
              onClick={openSchedulePreview}
              className="w-full flex items-center justify-center gap-3 px-5 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-500/10 dark:to-indigo-500/10 border-2 border-blue-200 dark:border-blue-400/30 rounded-2xl text-blue-700 dark:text-blue-300 font-bold hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-500/15 dark:hover:to-indigo-500/15 hover:border-blue-300 dark:hover:border-blue-400/50 hover:shadow-md transition-all active:scale-[0.99]"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-sm">
                <Eye size={18} className="text-white" />
              </div>
              <div className="text-left">
                <span className="text-base">View Current Schedule</span>
                <p className="text-xs font-medium text-blue-500 dark:text-blue-400">Check operator availability before picking a date</p>
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
              <p className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">Scheduling Flexibility</p>
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

      // ── STEP 7: Site Access & Compliance ──────────────────
      case 7:
        return (
          <div className="space-y-6">
            <SectionCard>
              <p className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">Access Requirements</p>
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
                  <p className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">Badge Type Required</p>
                  <div className="flex flex-wrap gap-2">
                    {(['GE', 'BMW', 'M3', 'Other'] as const).map(badge => {
                      const isOther = badge === 'Other';
                      const isKnown = ['GE', 'BMW', 'M3'].includes(form.badging_type);
                      const selected = isOther
                        ? !!form.badging_type && !isKnown
                        : form.badging_type === badge;
                      return (
                        <button
                          key={badge}
                          type="button"
                          onClick={() => {
                            if (isOther) {
                              updateForm({ badging_type: selected ? '' : ' ' });
                            } else {
                              updateForm({ badging_type: selected ? '' : badge });
                            }
                          }}
                          className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                            selected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-white dark:bg-white/5 text-slate-600 dark:text-white/60 border-slate-200 dark:border-white/10 hover:border-blue-300'
                          }`}
                        >
                          {badge}
                        </button>
                      );
                    })}
                  </div>
                  {!!form.badging_type && !['GE', 'BMW', 'M3'].includes(form.badging_type) && (
                    <input
                      type="text"
                      placeholder="Specify badge type..."
                      value={form.badging_type.trim()}
                      onChange={e => updateForm({ badging_type: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                    />
                  )}
                </div>
              )}
            </SectionCard>

            {/* ── Permits Required ────────────── */}
            <SectionCard>
              <p className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">Permits</p>
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
                  <p className="text-xs text-slate-500 dark:text-white/40">Select all permits required for this job:</p>
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
                              : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-500 dark:text-white/50 hover:border-slate-300 dark:hover:border-white/20'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                            isSelected ? 'border-current bg-current' : 'border-slate-300 dark:border-white/20'
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
                      <p className="text-xs text-slate-400 dark:text-white/30 font-semibold">Permit Details (optional)</p>
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
              <p className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">Compliance Documents</p>
              <p className="text-xs text-slate-400 dark:text-white/30 -mt-2">Create or select facility compliance requirements</p>

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
                    className="w-full px-4 py-3.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-base text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all dark:[color-scheme:dark]"
                  >
                    <option value="">— None —</option>
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name}{f.address ? ` — ${f.address}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {form.facility_id && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-400/30 rounded-xl">
                  <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                    {form.facility_name}
                  </p>
                  {form.facility_requirements && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">{form.facility_requirements}</p>
                  )}
                </div>
              )}

              {/* Create new facility */}
              {!showCreateFacility && (
                <button
                  type="button"
                  onClick={() => setShowCreateFacility(true)}
                  className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-blue-600 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl border border-dashed border-blue-300 dark:border-blue-400/30 transition-all w-full justify-center"
                >
                  <Plus size={16} />
                  Create New Facility Compliance Document
                </button>
              )}
            </SectionCard>

            {/* ── Forms & Signatures ────────────── */}
            <SectionCard>
              <p className="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">Forms & Signatures</p>
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
                  <p className="text-xs text-slate-400 dark:text-white/30 font-semibold">Assign Form Templates</p>
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
                            ? 'border-purple-400 bg-purple-50 dark:bg-violet-500/15 text-purple-800 dark:text-violet-200 ring-2 ring-offset-1 ring-purple-300 dark:ring-violet-400/30'
                            : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-white/60 hover:border-slate-300 dark:hover:border-white/20'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isSelected ? 'border-purple-500 bg-purple-500' : 'border-slate-300 dark:border-white/20'
                        }`}>
                          {isSelected && <Check size={12} className="text-white" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{t.name}</p>
                          <p className="text-xs text-slate-400 dark:text-white/30">{typeLabel}{t.description ? ` — ${t.description}` : ''}</p>
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

      // ── STEP 4: Job Difficulty & Notes ────────────────────
      case 4:
        return (
          <div className="space-y-6">
            <div>
              <Label>Job Difficulty Rating (1–10)</Label>
              <p className="text-xs text-slate-400 dark:text-white/30 mb-4 -mt-1">1 = Routine &nbsp;|&nbsp; 5 = Moderate &nbsp;|&nbsp; 10 = Highly Complex</p>
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
                          : 'bg-white dark:bg-white/5 border-2 border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/40 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/8'
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
                <h3 className="text-sm font-bold text-slate-700 dark:text-white/70 uppercase tracking-wider">Utilities & Resources</h3>
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
                <h3 className="text-sm font-bold text-slate-700 dark:text-white/70 uppercase tracking-wider">Staffing & Equipment</h3>
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
                <h3 className="text-sm font-bold text-slate-700 dark:text-white/70 uppercase tracking-wider">Work Environment</h3>
              </div>
              <div className="space-y-2.5">
                {/* Inside / Outside toggle */}
                <div className="flex items-center gap-4 p-4 sm:p-5 rounded-xl border-2 border-slate-200 dark:border-white/10 bg-white dark:bg-white/5">
                  <Building2 size={20} className="text-slate-500 dark:text-white/40 flex-shrink-0" />
                  <span className="text-base sm:text-lg text-slate-700 dark:text-white/80 font-semibold flex-1">Inside / Outside:</span>
                  <div className="flex gap-1.5 bg-slate-100 dark:bg-white/10 rounded-xl p-1.5">
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
                            : 'text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70 hover:bg-white dark:hover:bg-white/15'
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
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-400/30 shadow-sm'
                          : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50/50 dark:hover:bg-white/8'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                        form.high_work_access === 'lift_provided' ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 dark:border-white/20 bg-white dark:bg-transparent'
                      }`}>
                        {form.high_work_access === 'lift_provided' && <Check size={16} className="text-white" />}
                      </div>
                      <Truck size={18} className={form.high_work_access === 'lift_provided' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-white/30'} />
                      <span className={`text-base font-semibold ${form.high_work_access === 'lift_provided' ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-600 dark:text-white/60'}`}>
                        Lift Provided (by customer)
                      </span>
                      {form.high_work_access === 'lift_provided' && (
                        <span className="ml-auto text-xs font-bold text-emerald-600 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/15 px-2.5 py-1 rounded-full">No rental needed</span>
                      )}
                    </button>

                    {/* We Are Providing (only if lift not provided) */}
                    {form.high_work_access !== 'lift_provided' && (
                      <button
                        type="button"
                        onClick={() => updateForm({ high_work_access: form.high_work_access === 'we_provide' ? '' : 'we_provide' })}
                        className={`flex items-center gap-3 w-full p-4 rounded-xl border-2 transition-all duration-200 ${
                          form.high_work_access === 'we_provide'
                            ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-400/30 shadow-sm'
                            : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50/50 dark:hover:bg-white/8'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                          form.high_work_access === 'we_provide' ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-white/20 bg-white dark:bg-transparent'
                        }`}>
                          {form.high_work_access === 'we_provide' && <Check size={16} className="text-white" />}
                        </div>
                        <HardHat size={18} className={form.high_work_access === 'we_provide' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-white/30'} />
                        <span className={`text-base font-semibold ${form.high_work_access === 'we_provide' ? 'text-blue-800 dark:text-blue-300' : 'text-slate-600 dark:text-white/60'}`}>
                          We Are Providing (Patriot)
                        </span>
                        {form.high_work_access === 'we_provide' && (
                          <span className="ml-auto text-xs font-bold text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-500/15 px-2.5 py-1 rounded-full">Rental required</span>
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
                            ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-400/30 shadow-sm'
                            : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50/50 dark:hover:bg-white/8'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                          form.high_work_access === 'ladder' ? 'bg-amber-600 border-amber-600' : 'border-slate-300 dark:border-white/20 bg-white dark:bg-transparent'
                        }`}>
                          {form.high_work_access === 'ladder' && <Check size={16} className="text-white" />}
                        </div>
                        <Star size={18} className={form.high_work_access === 'ladder' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-white/30'} />
                        <span className={`text-base font-semibold ${form.high_work_access === 'ladder' ? 'text-amber-800 dark:text-amber-300' : 'text-slate-600 dark:text-white/60'}`}>
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
                <h3 className="text-sm font-bold text-slate-700 dark:text-white/70 uppercase tracking-wider">Job Specifications</h3>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-[#0b0618] dark:via-[#0e0720] dark:to-[#0b0618]">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#0b0618]/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-white/10 shadow-sm">
        <div className="max-w-[960px] mx-auto px-4 sm:px-8 h-16 sm:h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/admin"
              className="flex items-center gap-2 px-3 py-1.5 text-slate-500 dark:text-white/60 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-all text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <div className="h-6 w-px bg-slate-200 dark:bg-white/10" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${currentStepData.color} flex items-center justify-center shadow-sm transition-all duration-300`}>
                <ClipboardList size={16} className="text-white" />
              </div>
              <span className="hidden sm:inline">Schedule Form</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/admin/schedule-form-history"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-slate-500 dark:text-white/60 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-all text-xs font-semibold">
              <FileText size={14} />
              Previous Forms
            </Link>
            <button onClick={handleSaveAndExit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-400/30 text-emerald-700 dark:text-emerald-300 rounded-lg transition-all text-xs font-bold">
              {draftSaved ? <CheckCircle size={14} /> : <ArrowLeft size={14} />}
              {draftSaved ? 'Saved!' : 'Save & Exit'}
            </button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-white/10 rounded-lg">
              <span className="text-xs font-bold text-slate-500 dark:text-white/40">STEP</span>
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
                        ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-400/30 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-500/25 hover:shadow-sm'
                        : 'bg-white dark:bg-white/5 text-slate-400 dark:text-white/30 border border-slate-200 dark:border-white/10'
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
        <div ref={formRef} className="bg-white dark:bg-[#12082a] rounded-2xl sm:rounded-3xl border border-slate-200/60 dark:border-white/10 shadow-lg overflow-hidden">
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
                  {currentStep === 4 && 'Rate difficulty and add notes'}
                  {currentStep === 5 && 'Select equipment for this project'}
                  {currentStep === 6 && 'Set dates and scheduling flexibility'}
                  {currentStep === 7 && 'Site access and compliance requirements'}
                  {currentStep === 8 && 'Check all conditions that apply'}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8 lg:p-10">
            {/* Error message */}
            {error && (
              <div className="mb-6 flex items-center gap-3 px-5 py-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-400/30 rounded-xl text-sm sm:text-base text-red-700 dark:text-red-300 animate-in fade-in slide-in-from-top-1 duration-200">
                <AlertTriangle size={20} className="text-red-500 dark:text-red-400 flex-shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            {renderStep()}
          </div>

          {/* ── Navigation ─────────────────────────────── */}
          <div className="px-6 sm:px-8 lg:px-10 py-5 sm:py-6 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/3 flex items-center justify-between">
            <button
              onClick={goPrev}
              disabled={currentStep === 1}
              className={`flex items-center gap-2 px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl text-sm sm:text-base font-semibold transition-all duration-200 ${
                currentStep === 1
                  ? 'text-slate-300 dark:text-white/20 cursor-not-allowed'
                  : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/80 hover:bg-slate-50 dark:hover:bg-white/10 hover:shadow-md hover:border-slate-300 dark:hover:border-white/20'
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
        <div className="mt-6 h-2 bg-slate-200/80 dark:bg-white/10 rounded-full overflow-hidden shadow-inner">
          <div
            className={`h-full bg-gradient-to-r ${currentStepData.color} rounded-full transition-all duration-500 ease-out`}
            style={{ width: `${(currentStep / 8) * 100}%` }}
          />
        </div>
        <p className="text-center text-xs text-slate-400 dark:text-white/30 mt-2 font-medium">{Math.round((currentStep / 8) * 100)}% complete</p>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* DRAFT PICKER MODAL                                          */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showDraftPicker && savedDrafts.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleStartNew} />
          <div className="relative bg-white dark:bg-[#12082a] rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-200 overflow-hidden border border-transparent dark:border-white/10">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <FileText size={20} /> Continue a Draft?
              </h2>
              <p className="text-blue-200 text-sm mt-0.5">You have saved schedule forms in progress</p>
            </div>
            <div className="max-h-[40vh] overflow-y-auto divide-y divide-gray-100 dark:divide-white/5">
              {savedDrafts.map(draft => (
                <div key={draft.id} className="flex items-center gap-3 px-6 py-3 hover:bg-blue-50 dark:hover:bg-white/5 transition-colors">
                  <button onClick={() => handleLoadDraft(draft.id)} className="flex-1 text-left">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{draft.customer}</p>
                    <p className="text-xs text-gray-500 dark:text-white/40">Step {draft.step}/8 · Saved {new Date(draft.date).toLocaleDateString()} {new Date(draft.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </button>
                  <button onClick={() => handleLoadDraft(draft.id)}
                    className="px-3 py-1.5 bg-blue-100 dark:bg-blue-500/20 hover:bg-blue-200 dark:hover:bg-blue-500/30 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold transition-colors">
                    Resume
                  </button>
                  <button onClick={() => handleDeleteDraft(draft.id)}
                    className="p-1.5 text-gray-400 dark:text-white/30 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 dark:border-white/10 px-6 py-3 flex justify-end">
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
          <div className="relative mt-8 sm:mt-16 mx-4 w-full max-w-4xl max-h-[85vh] bg-white dark:bg-[#12082a] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
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
            <div className="px-6 py-3 bg-slate-50 dark:bg-white/3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between flex-shrink-0">
              <button
                onClick={() => {
                  const d = new Date(schedulePreviewDate);
                  d.setDate(d.getDate() - 7);
                  const newDate = d.toISOString().split('T')[0];
                  setSchedulePreviewDate(newDate);
                  fetchSchedulePreview(newDate);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 rounded-lg border border-slate-200 dark:border-white/10 transition-all"
              >
                <ArrowLeft size={14} />
                Prev Week
              </button>
              <div className="text-sm font-bold text-slate-700 dark:text-white">
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 rounded-lg border border-slate-200 dark:border-white/10 transition-all"
              >
                Next Week
                <ArrowRight size={14} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {schedulePreviewLoading ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-7 gap-2">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/5 min-h-[140px] animate-pulse" />
                    ))}
                  </div>
                  <div className="h-24 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl animate-pulse" />
                </div>
              ) : !schedulePreviewWeek ? (
                <div className="text-center py-10 text-sm text-slate-400">Unable to load schedule data.</div>
              ) : (
                <>
                  {/* ── Required skill banner ────────────────── */}
                  {schedulePreviewWeek.required_service_codes?.length > 0 && (
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-400/30 rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
                        <HardHat size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold uppercase text-indigo-500 dark:text-indigo-400 tracking-wider">Required Skill</p>
                        <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200 truncate">
                          {(schedulePreviewWeek.required_service_labels || []).join(' · ')}
                          {schedulePreviewWeek.required_difficulty ? ` · Difficulty ${schedulePreviewWeek.required_difficulty}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase text-indigo-500 dark:text-indigo-400">Qualified Crew</p>
                        <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                          {schedulePreviewWeek.operators?.filter((o: any) => o.is_qualified).length || 0} of {schedulePreviewWeek.total_operators}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── Week Grid ─────────────────────────────── */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                      <Calendar size={15} className="text-blue-600" />
                      Week View — Click a day to inspect
                    </h4>
                    <div className="grid grid-cols-7 gap-2">
                      {(schedulePreviewWeek.days || []).map((d: any) => {
                        const dayDate = new Date(d.date + 'T00:00:00');
                        const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
                        const isToday = d.date === new Date().toISOString().split('T')[0];
                        const isSelected = schedulePreviewSelectedDay === d.date;
                        const hasRequiredSkill = (schedulePreviewWeek.required_service_codes || []).length > 0;
                        const noQualifiedFree = hasRequiredSkill && d.qualified_free_count === 0;
                        const tightCapacity = d.free_count <= 1 && d.free_count >= 0;

                        let tone = 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5';
                        if (isSelected) tone = 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-500/15 ring-2 ring-blue-300 dark:ring-blue-400/30';
                        else if (noQualifiedFree) tone = 'border-red-300 dark:border-red-400/30 bg-red-50/70 dark:bg-red-500/10';
                        else if (hasRequiredSkill && d.qualified_free_count === 1) tone = 'border-amber-300 dark:border-amber-400/30 bg-amber-50/70 dark:bg-amber-500/10';
                        else if (tightCapacity) tone = 'border-amber-300 dark:border-amber-400/30 bg-amber-50/60 dark:bg-amber-500/8';
                        else if (isWeekend) tone = 'border-slate-200 dark:border-white/8 bg-slate-50/60 dark:bg-white/3';
                        else if (isToday && !isSelected) tone = 'border-blue-300 dark:border-blue-400/30 bg-blue-50/40 dark:bg-blue-500/8';

                        return (
                          <button
                            key={d.date}
                            type="button"
                            onClick={() => setSchedulePreviewSelectedDay(prev => prev === d.date ? null : d.date)}
                            className={`text-left rounded-xl border p-2 min-h-[140px] transition-all hover:shadow-md ${tone}`}
                          >
                            <div className="text-center mb-1.5">
                              <p className={`text-[10px] font-bold uppercase ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-white/30'}`}>
                                {dayDate.toLocaleDateString('en-US', { weekday: 'short' })}
                              </p>
                              <p className={`text-lg font-bold ${isSelected ? 'text-blue-700 dark:text-blue-300' : isToday ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-white'}`}>
                                {dayDate.getDate()}
                              </p>
                            </div>

                            {/* Capacity */}
                            <div className="mb-1">
                              <p className="text-[10px] font-bold text-slate-500 dark:text-white/40 text-center">
                                {d.free_count} <span className="text-slate-400 dark:text-white/25 font-semibold">of</span> {d.total_operators}
                              </p>
                              <p className="text-[9px] text-slate-400 dark:text-white/25 text-center uppercase tracking-wide">free</p>
                            </div>

                            {/* Skill chip */}
                            {hasRequiredSkill && (
                              <div className={`text-center rounded-md py-0.5 mb-1 text-[9px] font-bold ${
                                noQualifiedFree
                                  ? 'bg-red-100 text-red-700'
                                  : d.qualified_free_count === 1
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                {noQualifiedFree ? (
                                  <span className="inline-flex items-center gap-0.5"><AlertTriangle size={9} /> 0 qualified</span>
                                ) : (
                                  `${d.qualified_free_count} qualified`
                                )}
                              </div>
                            )}

                            {/* Jobs */}
                            {d.jobs.length === 0 ? (
                              <p className="text-[9px] text-emerald-500 font-semibold text-center">Open</p>
                            ) : (
                              <div className="space-y-0.5">
                                {d.jobs.slice(0, 2).map((j: any) => (
                                  <div
                                    key={j.id}
                                    className="px-1.5 py-0.5 rounded bg-slate-700 text-[9px] text-white font-medium truncate"
                                    title={`${j.customer_name || 'Job'} — ${j.job_type || ''}`}
                                  >
                                    {j.customer_name?.split(' ')[0] || 'Job'}
                                  </div>
                                ))}
                                {d.jobs.length > 2 && (
                                  <p className="text-[9px] text-slate-500 text-center font-semibold">+{d.jobs.length - 2}</p>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Expanded day panel ────────────────────── */}
                  {schedulePreviewSelectedDay && (() => {
                    const d = (schedulePreviewWeek.days || []).find((x: any) => x.date === schedulePreviewSelectedDay);
                    if (!d) return null;
                    const dDate = new Date(d.date + 'T00:00:00');
                    const hasRequiredSkill = (schedulePreviewWeek.required_service_codes || []).length > 0;
                    const noQualifiedFree = hasRequiredSkill && d.qualified_free_count === 0;
                    const operatorsById: Record<string, any> = {};
                    for (const o of schedulePreviewWeek.operators || []) operatorsById[o.id] = o;
                    const freeOps = (d.free_operator_ids || []).map((id: string) => operatorsById[id]).filter(Boolean);
                    const bookedOps = (d.booked_operator_ids || []).map((id: string) => operatorsById[id]).filter(Boolean);
                    const offSet = new Set<string>(d.time_off_operator_ids || []);

                    return (
                      <div className={`rounded-2xl border-2 p-4 space-y-4 ${
                        noQualifiedFree ? 'border-red-300 dark:border-red-400/30 bg-red-50/30 dark:bg-red-500/5' : 'border-blue-200 dark:border-blue-400/20 bg-blue-50/20 dark:bg-blue-500/5'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40">Selected Day</p>
                            <h5 className="text-base font-bold text-slate-800 dark:text-white">
                              {dDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                            </h5>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-700 dark:text-white/70">
                              {d.booked_count} booked · {d.free_count} free
                            </span>
                            {hasRequiredSkill && (
                              <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                                noQualifiedFree ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                              }`}>
                                {noQualifiedFree
                                  ? `No ${schedulePreviewWeek.required_skill_label || 'qualified'} free`
                                  : `${d.qualified_free_count} qualified free`}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Warning banner */}
                        {noQualifiedFree && (
                          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-100 dark:bg-red-500/15 border border-red-300 dark:border-red-400/30 rounded-lg">
                            <AlertTriangle size={16} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-red-800 dark:text-red-300 font-semibold leading-snug">
                              No {schedulePreviewWeek.required_skill_label || 'qualified operator'} is free this day.
                              You can still schedule, but dispatch will need to reassign work or pull from another day.
                            </p>
                          </div>
                        )}

                        {/* Jobs on this day */}
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-2">
                            Jobs Scheduled ({d.jobs.length})
                          </p>
                          {d.jobs.length === 0 ? (
                            <p className="text-xs text-slate-400 dark:text-white/30 italic">No jobs on the board for this day.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {d.jobs.map((j: any) => (
                                <div key={j.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold text-slate-800 dark:text-white truncate">
                                      {j.job_number && <span className="text-slate-500 dark:text-white/40 font-mono mr-2">{j.job_number}</span>}
                                      {j.customer_name || 'Unnamed customer'}
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-white/40 truncate">
                                      {j.job_type || '—'}
                                      {j.difficulty ? ` · Diff ${j.difficulty}` : ''}
                                      {j.arrival_time ? ` · ${j.arrival_time}` : ''}
                                    </p>
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-500 dark:text-white/40 bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded">
                                    {j.operator_ids?.length || 0} op{(j.operator_ids?.length || 0) === 1 ? '' : 's'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Operator occupancy mini-grid */}
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-2">
                            Operator Occupancy — {d.booked_count} of {d.total_operators} booked
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                            {(schedulePreviewWeek.operators || []).map((op: any) => {
                              const isFree = (d.free_operator_ids || []).includes(op.id);
                              const isOff = offSet.has(op.id);
                              return (
                                <div
                                  key={op.id}
                                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-[11px] ${
                                    isOff
                                      ? 'bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-500 dark:text-white/40'
                                      : isFree
                                        ? (op.is_qualified ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-400/20 text-emerald-800 dark:text-emerald-300' : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60')
                                        : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-400/20 text-red-700 dark:text-red-300'
                                  }`}
                                  title={
                                    isOff ? 'Time off'
                                    : isFree
                                      ? (op.is_qualified ? 'Free · Qualified' : 'Free · Not qualified for this skill')
                                      : 'Already booked'
                                  }
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    isOff ? 'bg-slate-400' : isFree ? (op.is_qualified ? 'bg-emerald-500' : 'bg-slate-400') : 'bg-red-500'
                                  }`} />
                                  <span className="font-semibold truncate flex-1">{op.full_name}</span>
                                  {hasRequiredSkill && op.is_qualified && (
                                    <CheckCircle size={10} className="text-emerald-500 flex-shrink-0" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Skill roster */}
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-2">
                            Skill Roster — Free Today
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {(d.skill_roster || [])
                              .filter((r: any) => r.isPriority || r.freeCount > 0)
                              .slice(0, 10)
                              .map((r: any) => (
                                <span
                                  key={r.family}
                                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                    r.isPriority && r.freeCount === 0
                                      ? 'bg-red-100 dark:bg-red-500/15 border-red-300 dark:border-red-400/30 text-red-700 dark:text-red-300'
                                      : r.isPriority
                                        ? 'bg-indigo-100 dark:bg-indigo-500/15 border-indigo-300 dark:border-indigo-400/30 text-indigo-800 dark:text-indigo-300'
                                        : r.freeCount === 0
                                          ? 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/30'
                                          : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-white/70'
                                  }`}
                                >
                                  {r.isPriority && <span className="mr-1">★</span>}
                                  {r.label}: {r.freeCount} free
                                </span>
                              ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
                          <button
                            type="button"
                            onClick={() => { updateForm({ start_date: d.date }); setShowSchedulePreview(false); }}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all active:scale-[0.98] ${
                              noQualifiedFree
                                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-700 hover:shadow-lg text-white'
                            }`}
                          >
                            {noQualifiedFree
                              ? `Pick anyway — ${dDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                              : `Pick ${dDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Summary Stats ──────────────────────────── */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-3 text-center border border-blue-200 dark:border-blue-400/20">
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                        {(schedulePreviewWeek.days || []).reduce((sum: number, d: any) => sum + d.jobs.length, 0)}
                      </p>
                      <p className="text-[10px] font-semibold text-blue-500 dark:text-blue-400 uppercase">Job-Days This Week</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-3 text-center border border-emerald-200 dark:border-emerald-400/20">
                      <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                        {(schedulePreviewWeek.days || []).filter((d: any) => {
                          const needsSkill = (schedulePreviewWeek.required_service_codes || []).length > 0;
                          return needsSkill ? d.qualified_free_count > 0 : d.free_count > 0;
                        }).length}
                      </p>
                      <p className="text-[10px] font-semibold text-emerald-500 dark:text-emerald-400 uppercase">
                        {(schedulePreviewWeek.required_service_codes || []).length > 0 ? 'Days With Qualified Crew' : 'Days With Free Crew'}
                      </p>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 text-center border border-slate-200 dark:border-white/10">
                      <p className="text-2xl font-bold text-slate-700 dark:text-white">{schedulePreviewWeek.total_operators}</p>
                      <p className="text-[10px] font-semibold text-slate-500 dark:text-white/40 uppercase">Total Crew</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-white/3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between flex-shrink-0 gap-3">
              <p className="text-xs text-slate-400 dark:text-white/30 hidden sm:block">Click a day to inspect capacity & skill coverage</p>
              {(() => {
                const selected = schedulePreviewSelectedDay
                  ? (schedulePreviewWeek?.days || []).find((x: any) => x.date === schedulePreviewSelectedDay)
                  : null;
                const hasRequiredSkill = (schedulePreviewWeek?.required_service_codes || []).length > 0;
                const isRisky = selected && hasRequiredSkill && selected.qualified_free_count === 0;

                if (!selected) {
                  return (
                    <button
                      onClick={() => setShowSchedulePreview(false)}
                      className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-bold text-sm rounded-xl hover:shadow-lg transition-all active:scale-[0.98]"
                    >
                      Close
                    </button>
                  );
                }

                if (isRisky) {
                  return (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSchedulePreviewSelectedDay(null)}
                        className="px-4 py-2.5 bg-white dark:bg-white/5 text-slate-700 dark:text-white/80 font-bold text-sm rounded-xl border border-slate-300 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-all"
                      >
                        Choose Different Day
                      </button>
                      <button
                        onClick={() => { updateForm({ start_date: selected.date }); setShowSchedulePreview(false); }}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-xl transition-all active:scale-[0.98]"
                        title={`No ${schedulePreviewWeek.required_skill_label || 'qualified operator'} is free — pick anyway and reassign later`}
                      >
                        <AlertTriangle size={14} />
                        Pick Anyway
                      </button>
                    </div>
                  );
                }

                return (
                  <button
                    onClick={() => { updateForm({ start_date: selected.date }); setShowSchedulePreview(false); }}
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-bold text-sm rounded-xl hover:shadow-lg transition-all active:scale-[0.98]"
                  >
                    Close & Pick {new Date(selected.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </button>
                );
              })()}
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

      {/* ═══ CREATE FACILITY MODAL ═══ */}
      {showCreateFacility && (
        <CreateFacilityModal
          onClose={() => setShowCreateFacility(false)}
          onSaved={handleCreateFacility}
        />
      )}
    </div>
  );
}
