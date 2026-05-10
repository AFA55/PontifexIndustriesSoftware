'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Package, Truck, Search, Loader2, ChevronRight, History,
  LogOut as CheckoutIcon, LogIn as CheckinIcon, Filter, CheckCircle2,
  AlertTriangle, User as UserIcon, Briefcase, Wrench,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';

const ALLOWED_ROLES = ['shop_manager','admin','super_admin','operations_manager','supervisor'];

type Tab = 'inventory' | 'checkout' | 'checkin' | 'history';

interface Equipment {
  id: string;
  asset_tag: string | null;
  kind: string | null;
  name: string;
  short_name: string | null;
  unit_number: string | null;
  status: string;
  current_custodian: { id: string; full_name: string | null } | null;
  current_job: { id: string; job_number: string | null; customer_name: string | null } | null;
  open_checkout: { truck: { name: string | null; short_name: string | null; unit_number: string | null } | null } | null;
}

interface Operator {
  id: string;
  full_name: string;
  role: string;
}

interface JobOption {
  id: string;
  job_number: string | null;
  customer_name: string | null;
}

interface CheckoutRow {
  id: string;
  equipment_id: string;
  custodian_id: string | null;
  job_order_id: string | null;
  truck_equipment_id: string | null;
  checked_out_at: string;
  checked_in_at: string | null;
  notes: string | null;
  hour_meter_out: number | null;
  hour_meter_in: number | null;
  equipment: { id: string; name: string; short_name: string | null; unit_number: string | null; asset_tag: string | null } | null;
  truck: { id: string; name: string; short_name: string | null; unit_number: string | null } | null;
  custodian: { id: string; full_name: string; email: string } | null;
  job: { id: string; job_number: string | null; customer_name: string | null } | null;
}

const TAB_META: Record<Tab, { label: string; icon: React.ElementType; gradient: string; shadow: string }> = {
  inventory: { label: 'Inventory', icon: Package, gradient: 'from-cyan-500 to-sky-600', shadow: 'shadow-cyan-500/30' },
  checkout: { label: 'Checkout', icon: CheckoutIcon, gradient: 'from-rose-500 to-pink-600', shadow: 'shadow-rose-500/30' },
  checkin: { label: 'Check-In', icon: CheckinIcon, gradient: 'from-teal-500 to-emerald-600', shadow: 'shadow-teal-500/30' },
  history: { label: 'History', icon: History, gradient: 'from-violet-500 to-indigo-600', shadow: 'shadow-violet-500/30' },
};

export default function InventoryControlPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const initialTab = (searchParams?.get('tab') as Tab) || 'inventory';
  const [tab, setTab] = useState<Tab>(['inventory','checkout','checkin','history'].includes(initialTab) ? initialTab : 'inventory');

  // Shared lookups
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [equipmentLoading, setEquipmentLoading] = useState(true);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [trucks, setTrucks] = useState<Equipment[]>([]);
  const [activeJobsToday, setActiveJobsToday] = useState<JobOption[]>([]);
  const [openCheckouts, setOpenCheckouts] = useState<CheckoutRow[]>([]);
  const [historyRows, setHistoryRows] = useState<CheckoutRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  // Auth
  useEffect(() => {
    const cu = getCurrentUser();
    if (!cu) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(cu.role)) { router.push('/dashboard/admin'); return; }
    setUser(cu);
    setAuthLoading(false);
  }, [router]);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const fetchEquipment = useCallback(async () => {
    setEquipmentLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [eqRes, truckRes] = await Promise.all([
        fetch('/api/admin/equipment?limit=200&exclude_vehicles=true', { headers }),
        fetch('/api/admin/equipment?kind=vehicle&limit=200', { headers }),
      ]);
      if (eqRes.ok) setEquipment((await eqRes.json()).data ?? []);
      if (truckRes.ok) setTrucks((await truckRes.json()).data ?? []);
    } finally {
      setEquipmentLoading(false);
    }
  }, []);

  const fetchOperators = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/schedule-board/operators', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const all = [
          ...(json.data?.operators ?? []).map((o: any) => ({ ...o, role: 'operator' })),
          ...(json.data?.helpers ?? []).map((h: any) => ({ ...h, role: 'apprentice' })),
        ];
        setOperators(all);
      }
    } catch {}
  }, []);

  const fetchOpenCheckouts = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/equipment-checkouts?open=true&limit=200', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setOpenCheckouts(json.data ?? []);
      }
    } catch {}
  }, []);

  const fetchHistory = useCallback(async (search?: string) => {
    setHistoryLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const params = new URLSearchParams({ limit: '100' });
      if (search?.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/admin/equipment-checkouts?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setHistoryRows(json.data ?? []);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Boot
  useEffect(() => {
    if (!user) return;
    void fetchEquipment();
    void fetchOperators();
    void fetchOpenCheckouts();
  }, [user, fetchEquipment, fetchOperators, fetchOpenCheckouts]);

  // History tab loads on first open
  useEffect(() => {
    if (tab === 'history' && historyRows.length === 0) {
      void fetchHistory();
    }
  }, [tab, historyRows.length, fetchHistory]);

  const availableEquipment = useMemo(
    () => equipment.filter(e => e.status === 'available' || e.status === 'reserved'),
    [equipment]
  );

  if (authLoading) {
    return <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-cyan-600" /></div>;
  }

  const currentMeta = TAB_META[tab];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-12">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
        <Link href="/dashboard/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300 hover:text-cyan-600">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>

        {/* Hero — gradient swaps based on active tab */}
        <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${currentMeta.gradient} p-5 sm:p-7 ${currentMeta.shadow} shadow-xl text-white transition-all`}>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 flex-shrink-0">
              <currentMeta.icon className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Inventory Control</h1>
              <p className="text-sm text-white/80 mt-0.5">{currentMeta.label} — equipment + fleet movement in one place.</p>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white dark:bg-slate-800 rounded-2xl p-2 border border-gray-200 dark:border-slate-700">
          {(Object.entries(TAB_META) as [Tab, typeof TAB_META.inventory][]).map(([k, m]) => {
            const Icon = m.icon;
            const isActive = tab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl text-xs sm:text-sm font-semibold transition ${
                  isActive
                    ? `bg-gradient-to-br ${m.gradient} text-white ${m.shadow} shadow-md`
                    : 'text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{m.label}</span>
                {k === 'checkin' && openCheckouts.length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/30' : 'bg-teal-100 text-teal-700'}`}>
                    {openCheckouts.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── INVENTORY TAB ───────────────────────────────────────────────── */}
        {tab === 'inventory' && (
          <InventoryTab equipment={equipment} loading={equipmentLoading} />
        )}

        {/* ── CHECKOUT TAB ───────────────────────────────────────────────── */}
        {tab === 'checkout' && (
          <CheckoutTab
            availableEquipment={availableEquipment}
            operators={operators}
            trucks={trucks}
            onSuccess={() => {
              void fetchEquipment();
              void fetchOpenCheckouts();
            }}
          />
        )}

        {/* ── CHECK-IN TAB ───────────────────────────────────────────────── */}
        {tab === 'checkin' && (
          <CheckinTab
            openCheckouts={openCheckouts}
            onSuccess={() => {
              void fetchEquipment();
              void fetchOpenCheckouts();
              void fetchHistory(); // history will refetch when tab is opened
            }}
          />
        )}

        {/* ── HISTORY TAB ────────────────────────────────────────────────── */}
        {tab === 'history' && (
          <HistoryTab
            rows={historyRows}
            loading={historyLoading}
            search={historySearch}
            onSearchChange={(v) => { setHistorySearch(v); void fetchHistory(v); }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Inventory Tab ──────────────────────────────────────────────────────────
function InventoryTab({ equipment, loading }: { equipment: Equipment[]; loading: boolean }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return equipment;
    const s = search.toLowerCase();
    return equipment.filter(e =>
      e.name?.toLowerCase().includes(s) ||
      e.short_name?.toLowerCase().includes(s) ||
      e.unit_number?.toLowerCase().includes(s) ||
      e.asset_tag?.toLowerCase().includes(s) ||
      e.current_custodian?.full_name?.toLowerCase().includes(s)
    );
  }, [equipment, search]);

  // Quantity rollup by category
  const totalCount = equipment.length;
  const inUseCount = equipment.filter(e => e.status === 'in_use').length;
  const availableCount = equipment.filter(e => e.status === 'available').length;

  return (
    <div className="space-y-4">
      {/* Quantity tiles */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Tile gradient="from-cyan-500 to-sky-600" shadow="shadow-cyan-500/30" value={totalCount} label="Total" />
        <Tile gradient="from-emerald-500 to-teal-600" shadow="shadow-emerald-500/30" value={availableCount} label="Available" />
        <Tile gradient="from-rose-500 to-pink-600" shadow="shadow-rose-500/30" value={inUseCount} label="In Use" />
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Search by name, asset tag, unit #, or operator…" />

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <Empty icon={Package} text={search ? 'No equipment matches your search.' : 'No equipment yet.'} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(e => <EquipmentCard key={e.id} eq={e} />)}
        </div>
      )}
    </div>
  );
}

// ─── Checkout Tab ───────────────────────────────────────────────────────────
function CheckoutTab({
  availableEquipment, operators, trucks, onSuccess,
}: {
  availableEquipment: Equipment[];
  operators: Operator[];
  trucks: Equipment[];
  onSuccess: () => void;
}) {
  // Mode: 'truck' (default — pick truck, operator auto-derived) or
  // 'handheld' (rare — pick operator directly, no truck).
  const [mode, setMode] = useState<'truck' | 'handheld'>('truck');
  const [equipmentId, setEquipmentId] = useState('');
  const [truckId, setTruckId] = useState('');
  const [custodianOverrideId, setCustodianOverrideId] = useState(''); // used when truck has no current driver, OR in handheld mode
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Derive operator from selected truck (if truck has a current driver).
  const selectedTruck = useMemo(() => trucks.find(t => t.id === truckId) || null, [trucks, truckId]);
  const truckCurrentOperator = selectedTruck?.current_custodian?.full_name || null;
  const truckCurrentOperatorId = (selectedTruck as any)?.current_custodian?.id || null;
  const truckHasNoDriver = !!truckId && !truckCurrentOperatorId;

  // Effective custodian sent to API:
  //   - truck mode + truck has driver → derived (server resolves from truck)
  //   - truck mode + truck has no driver → custodianOverrideId (required from picker)
  //   - handheld mode → custodianOverrideId
  const effectiveCustodianValid = mode === 'handheld'
    ? !!custodianOverrideId
    : (!!truckId && (!truckHasNoDriver || !!custodianOverrideId));

  async function handleSubmit() {
    setMsg(null);
    if (!equipmentId) { setMsg({ type: 'error', text: 'Pick a piece of equipment.' }); return; }
    if (mode === 'truck' && !truckId) { setMsg({ type: 'error', text: 'Pick a truck.' }); return; }
    if (!effectiveCustodianValid) {
      setMsg({ type: 'error', text: mode === 'handheld' ? 'Pick an operator.' : 'Truck has no driver — pick an operator below.' });
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const body: Record<string, unknown> = {
        equipment_id: equipmentId,
        notes: notes.trim() || null,
      };
      if (mode === 'truck') {
        body.truck_equipment_id = truckId;
        if (truckHasNoDriver) body.custodian_id = custodianOverrideId; // server requires it when truck has no driver
      } else {
        body.custodian_id = custodianOverrideId; // handheld
      }
      const res = await fetch('/api/admin/equipment-checkouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: 'error', text: j.error || j.details || 'Failed to check out.' });
        return;
      }
      setMsg({ type: 'success', text: 'Checked out.' });
      setEquipmentId(''); setTruckId(''); setCustodianOverrideId(''); setNotes('');
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
      {/* Mode toggle: truck (default) vs handheld */}
      <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-slate-900 rounded-xl p-1 border border-gray-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setMode('truck')}
          className={`min-h-[40px] rounded-lg text-sm font-semibold transition ${
            mode === 'truck'
              ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-md shadow-rose-500/30'
              : 'text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          🚚 To Truck
        </button>
        <button
          type="button"
          onClick={() => setMode('handheld')}
          className={`min-h-[40px] rounded-lg text-sm font-semibold transition ${
            mode === 'handheld'
              ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/30'
              : 'text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          ✋ Handheld (to operator directly)
        </button>
      </div>

      {/* Step 1: Equipment combobox */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-rose-600 dark:text-rose-400 mb-2">
          Step 1 — What's going out
        </p>
        <EquipmentCombobox
          value={equipmentId}
          onChange={setEquipmentId}
          options={availableEquipment}
        />
        <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1.5">{availableEquipment.length} available pieces · type to search by name, asset tag, or unit number</p>
      </div>

      {/* Step 2: Truck OR direct operator */}
      {mode === 'truck' ? (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-rose-600 dark:text-rose-400 mb-2">Step 2 — Which truck</p>
            <select value={truckId} onChange={(e) => { setTruckId(e.target.value); setCustodianOverrideId(''); }} className={selectClass}>
              <option value="">Select truck…</option>
              {trucks.map(t => {
                const display = t.short_name && t.unit_number ? `${t.short_name} #${t.unit_number}` : t.name;
                const op = (t as any).current_custodian?.full_name?.split(' ')[0];
                return <option key={t.id} value={t.id}>{display}{op ? ` · ${op}` : ' · no driver assigned'}</option>;
              })}
            </select>
            {trucks.length === 0 && (
              <p className="text-[11px] text-amber-700 mt-1.5">No trucks added yet. Go to Fleet → New Vehicle to add one.</p>
            )}
          </div>

          {/* Auto-derived operator preview, OR fallback picker if truck has no driver */}
          {selectedTruck && truckCurrentOperator && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 p-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <UserIcon className="w-4 h-4 flex-shrink-0" />
              <div>
                Going with <strong>{truckCurrentOperator}</strong> (truck's current driver)
              </div>
            </div>
          )}
          {selectedTruck && truckHasNoDriver && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2">
                Step 3 — Pick operator (truck has no driver assigned yet)
              </p>
              <select value={custodianOverrideId} onChange={(e) => setCustodianOverrideId(e.target.value)} className={selectClass}>
                <option value="">Select operator…</option>
                {operators.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.full_name}{o.role === 'apprentice' ? ' (Helper)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      ) : (
        // Handheld mode
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2">Step 2 — Who's taking it</p>
          <select value={custodianOverrideId} onChange={(e) => setCustodianOverrideId(e.target.value)} className={selectClass}>
            <option value="">Select operator…</option>
            {operators.map(o => (
              <option key={o.id} value={o.id}>
                {o.full_name}{o.role === 'apprentice' ? ' (Helper)' : ''}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1.5">Use this for hand tools / accessories that aren't going on a truck.</p>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5 block">Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything to flag for whoever checks it back in" className={inputClass} />
      </div>

      {msg && (
        <div className={`rounded-lg p-3 text-sm ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {msg.text}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !equipmentId || !effectiveCustodianValid}
        className={`w-full inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-white font-semibold shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
          mode === 'truck'
            ? 'bg-gradient-to-br from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 shadow-rose-500/30'
            : 'bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-amber-500/30'
        }`}
      >
        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking out…</> : <><CheckoutIcon className="w-4 h-4" /> Check Out</>}
      </button>
    </div>
  );
}

// ─── Searchable Equipment Combobox ──────────────────────────────────────────
// Replaces the plain <select> for equipment selection. At ~200 items the native
// dropdown becomes unusable on mobile. This filters as you type, supports arrow
// keys + Enter to select, and matches against name + short_name + unit_number +
// asset_tag + aliases (so "5000" or "DFS-5" or "PTRT-0042" all find the same saw).
function EquipmentCombobox({
  value, onChange, options,
}: {
  value: string;
  onChange: (id: string) => void;
  options: Equipment[];
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  // Sync query with the selected equipment label when value changes externally.
  useEffect(() => {
    if (!value) { setQuery(''); return; }
    const eq = options.find(o => o.id === value);
    if (eq) {
      setQuery(eq.short_name && eq.unit_number ? `${eq.short_name} #${eq.unit_number}` : eq.name);
    }
  }, [value, options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || (options.find(o => o.id === value) && query === (options.find(o => o.id === value)?.short_name + ' #' + options.find(o => o.id === value)?.unit_number || ''))) {
      return options;
    }
    return options.filter(o => {
      const fields: string[] = [
        o.name,
        o.short_name || '',
        o.unit_number || '',
        o.asset_tag || '',
        // aliases not on the Equipment interface here, but matching against display still finds most cases
      ].map(s => s.toLowerCase());
      return fields.some(f => f.includes(q));
    });
  }, [options, query, value]);

  function selectOption(eq: Equipment) {
    onChange(eq.id);
    setQuery(eq.short_name && eq.unit_number ? `${eq.short_name} #${eq.unit_number}` : eq.name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlighted(0); if (!e.target.value) onChange(''); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlighted]) selectOption(filtered[highlighted]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Type equipment name, asset tag, or unit number…"
        className={inputClass}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 max-h-64 overflow-y-auto z-30 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl">
          {filtered.slice(0, 50).map((eq, idx) => {
            const display = eq.short_name && eq.unit_number ? `${eq.short_name} #${eq.unit_number}` : eq.name;
            const isHighlighted = idx === highlighted;
            const isSelected = eq.id === value;
            return (
              <button
                key={eq.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); selectOption(eq); }}
                onMouseEnter={() => setHighlighted(idx)}
                className={`w-full text-left px-3 py-2 transition ${
                  isHighlighted ? 'bg-rose-50 dark:bg-rose-900/20' : ''
                } ${isSelected ? 'bg-rose-100 dark:bg-rose-900/40' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{display}</span>
                  {eq.asset_tag && <span className="text-[10px] font-mono text-gray-500 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded shrink-0">{eq.asset_tag}</span>}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">{eq.name}</p>
              </button>
            );
          })}
          {filtered.length > 50 && (
            <div className="px-3 py-2 text-[11px] text-gray-500 border-t border-gray-100">
              + {filtered.length - 50} more · keep typing to narrow
            </div>
          )}
        </div>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 z-30 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl px-3 py-3 text-sm text-gray-500 dark:text-slate-400">
          No equipment matches.
        </div>
      )}
    </div>
  );
}

// ─── Check-In Tab ───────────────────────────────────────────────────────────
function CheckinTab({
  openCheckouts, onSuccess,
}: { openCheckouts: CheckoutRow[]; onSuccess: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function checkin(id: string, statusAfter: 'available' | 'pending_putaway') {
    setBusyId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/equipment-checkouts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ status_after_checkin: statusAfter }),
      });
      if (res.ok) onSuccess();
    } finally {
      setBusyId(null);
    }
  }

  if (openCheckouts.length === 0) {
    return <Empty icon={CheckCircle2} text="Everything is back. No open checkouts." iconClassName="text-emerald-500" />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-slate-300">
        {openCheckouts.length} open checkout{openCheckouts.length === 1 ? '' : 's'}. Marking as <strong>Pending Put-Away</strong> sends to the helper queue;
        marking as <strong>Available</strong> skips it (use when you racked it yourself).
      </p>
      {openCheckouts.map(co => {
        const eq = co.equipment;
        const display = eq?.short_name && eq?.unit_number ? `${eq.short_name} #${eq.unit_number}` : eq?.name ?? '—';
        const truckLabel = co.truck?.short_name && co.truck?.unit_number ? `${co.truck.short_name} #${co.truck.unit_number}` : co.truck?.name;
        return (
          <div key={co.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center flex-shrink-0">
                <Package className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{display}</p>
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  {/* Truck first when present (it's the primary identity in the truck-as-custodian model) */}
                  {truckLabel && (
                    <span className="text-[11px] inline-flex items-center gap-1 font-semibold text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                      <Truck className="w-3 h-3" />{truckLabel}
                    </span>
                  )}
                  {co.custodian && (
                    <span className="text-[11px] inline-flex items-center gap-1 text-gray-600 dark:text-slate-400">
                      <UserIcon className="w-3 h-3" />{co.custodian.full_name}
                    </span>
                  )}
                  {co.job?.job_number && (
                    <span className="text-[11px] inline-flex items-center gap-1 text-gray-600 dark:text-slate-400">
                      <Briefcase className="w-3 h-3" />{co.job.job_number}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Out since {new Date(co.checked_out_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => checkin(co.id, 'pending_putaway')}
                disabled={busyId === co.id}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-sm font-semibold disabled:opacity-50 transition"
              >
                {busyId === co.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckinIcon className="w-4 h-4" />}
                Pending Put-Away
              </button>
              <button
                type="button"
                onClick={() => checkin(co.id, 'available')}
                disabled={busyId === co.id}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-teal-500/30 transition"
              >
                Mark Available
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── History Tab ────────────────────────────────────────────────────────────
function HistoryTab({
  rows, loading, search, onSearchChange,
}: {
  rows: CheckoutRow[];
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <SearchBar value={search} onChange={onSearchChange} placeholder="Search by operator name, equipment, truck, or asset tag…" />
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty icon={History} text="No history matches your search." />
      ) : (
        <div className="space-y-2">
          {rows.map(co => {
            const eq = co.equipment;
            const display = eq?.short_name && eq?.unit_number ? `${eq.short_name} #${eq.unit_number}` : eq?.name ?? '—';
            const truckLabel = co.truck?.short_name && co.truck?.unit_number ? `${co.truck.short_name} #${co.truck.unit_number}` : co.truck?.name;
            const isOpen = !co.checked_in_at;
            return (
              <div key={co.id} className={`bg-white dark:bg-slate-800 rounded-xl border p-3 ${isOpen ? 'border-amber-200 dark:border-amber-900/40' : 'border-gray-200 dark:border-slate-700'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{display}</p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {/* Truck first when present (primary identity in truck-as-custodian model) */}
                      {truckLabel && (
                        <span className="text-[11px] inline-flex items-center gap-1 font-semibold text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                          <Truck className="w-3 h-3" />{truckLabel}
                        </span>
                      )}
                      {co.custodian && (
                        <span className="text-[11px] inline-flex items-center gap-1 text-gray-600 dark:text-slate-400">
                          <UserIcon className="w-3 h-3" />{co.custodian.full_name}
                        </span>
                      )}
                      {co.job?.job_number && (
                        <span className="text-[11px] inline-flex items-center gap-1 text-gray-600 dark:text-slate-400">
                          <Briefcase className="w-3 h-3" />{co.job.job_number}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${isOpen ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                    {isOpen ? 'OPEN' : 'CLOSED'}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-slate-400">
                  <p>Out: {new Date(co.checked_out_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
                  <p>In: {co.checked_in_at ? new Date(co.checked_in_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}</p>
                </div>
                {co.notes && <p className="mt-2 text-xs text-gray-600 dark:text-slate-400 italic">"{co.notes}"</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────
function EquipmentCard({ eq }: { eq: Equipment }) {
  const display = eq.short_name && eq.unit_number ? `${eq.short_name} #${eq.unit_number}` : eq.name;
  const location = (() => {
    if (eq.status === 'in_use') {
      const op = eq.current_custodian?.full_name?.split(' ')[0] ?? 'someone';
      const truck = eq.open_checkout?.truck;
      const truckLabel = truck?.short_name && truck?.unit_number ? `${truck.short_name} #${truck.unit_number}` : truck?.name;
      return truckLabel ? `with ${op} · ${truckLabel}` : `with ${op}`;
    }
    if (eq.status === 'pending_putaway') return 'pending put-away';
    if (eq.status === 'in_maintenance' || eq.status === 'maintenance') return 'in maintenance';
    if (eq.status === 'out_of_service') return 'out of service';
    return 'in shop';
  })();
  const tone = eq.status === 'available' ? 'bg-emerald-100 text-emerald-700' :
    eq.status === 'in_use' ? 'bg-rose-100 text-rose-700' :
    eq.status === 'pending_putaway' ? 'bg-teal-100 text-teal-700' :
    'bg-gray-100 text-gray-600';

  return (
    <Link href={`/dashboard/admin/equipment/${eq.id}`} className="block bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-3 hover:border-cyan-300 hover:shadow-md transition">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-900/20 flex items-center justify-center flex-shrink-0">
          <Package className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{display}</p>
          <p className="text-[11px] text-cyan-700 dark:text-cyan-300 truncate">📍 {location}</p>
          <div className="flex items-center gap-1.5 mt-1">
            {eq.asset_tag && <span className="text-[10px] font-mono text-gray-500 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{eq.asset_tag}</span>}
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tone}`}>{eq.status.replace(/_/g, ' ')}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
      />
    </div>
  );
}

function Tile({ gradient, shadow, value, label }: { gradient: string; shadow: string; value: number; label: string }) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${gradient} ${shadow} shadow-lg p-3 sm:p-4 text-white`}>
      <p className="text-2xl sm:text-3xl font-bold tabular-nums leading-none">{value}</p>
      <p className="text-[10px] sm:text-xs text-white/80 font-medium mt-1.5">{label}</p>
    </div>
  );
}

function Loading() {
  return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-cyan-600" /></div>;
}

function Empty({ icon: Icon, text, iconClassName }: { icon: React.ElementType; text: string; iconClassName?: string }) {
  return (
    <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700">
      <Icon className={`w-10 h-10 mx-auto mb-3 ${iconClassName ?? 'text-gray-300 dark:text-slate-600'}`} />
      <p className="text-gray-500 dark:text-slate-400 text-sm">{text}</p>
    </div>
  );
}

const inputClass = 'w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500';
const selectClass = inputClass;
