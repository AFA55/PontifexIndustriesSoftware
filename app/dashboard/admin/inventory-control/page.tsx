'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Package, Truck, Search, Loader2, ChevronRight, History,
  LogOut as CheckoutIcon, LogIn as CheckinIcon, Filter, CheckCircle2,
  AlertTriangle, User as UserIcon, Briefcase, Wrench, Mic, MicOff, Sparkles, Plus,
  Volume2, RefreshCw,
} from 'lucide-react';
import NewInventoryModal from './_components/NewInventoryModal';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import { useModuleGate } from '@/components/ModuleGuard';
import NativeVoiceCheckout from '@/components/equipment/NativeVoiceCheckout';

const ALLOWED_ROLES = ['shop_manager','admin','super_admin','operations_manager','supervisor'];

type Tab = 'inventory' | 'checkout' | 'checkin' | 'history';

interface Equipment {
  id: string;
  asset_tag: string | null;
  kind: string | null;
  category: string | null;
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
  voice_note_url: string | null;
  blade_details: { serial_number: string | null; size: string | null; spec: string | null; photo_url: string | null } | null;
  equipment: { id: string; name: string; short_name: string | null; unit_number: string | null; asset_tag: string | null; category?: string | null } | null;
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
  const moduleGate = useModuleGate('inventory_control');
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

  const [showNewModal, setShowNewModal] = useState(false);

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
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-12">
        <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
          {/* Back link */}
          <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          {/* Hero banner */}
          <div className="rounded-2xl bg-gray-200 dark:bg-gray-700 animate-pulse h-24 sm:h-28" />
          {/* Tab pills */}
          <div className="flex gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 w-28 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
            ))}
          </div>
          {/* Search bar */}
          <div className="h-10 w-full bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
          {/* Inventory cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-36 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                  <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                </div>
                <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-3 w-2/3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (moduleGate.blocked) return moduleGate.fallback;

  const currentMeta = TAB_META[tab];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-12">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link href="/dashboard/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300 hover:text-cyan-600 min-h-[44px] py-2">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
          <Link href="/dashboard/admin/equipment-by-operator" className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-700 dark:text-cyan-300 hover:text-cyan-800 min-h-[44px] py-2">
            <UserIcon className="w-4 h-4" /> View by Operator
          </Link>
        </div>

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
          <>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 text-white text-sm font-semibold shadow-lg shadow-cyan-500/30 transition"
              >
                <Plus className="w-4 h-4" />
                Add New Item
              </button>
            </div>
            <InventoryTab equipment={equipment} loading={equipmentLoading} />
          </>
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

      {showNewModal && (
        <NewInventoryModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => { void fetchEquipment(); }}
        />
      )}
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

  // ── Blade-specific manual entry (v1 — no OCR) ────────────────────────────
  // Only shown when the selected equipment is a blade/bit. Serial/size/spec
  // are free text; the sticker photo uploads immediately on capture to the
  // private blade-checkout-photos bucket and we hold onto the returned
  // storage PATH (not the preview URL) to persist on the checkout.
  const [bladeSerial, setBladeSerial] = useState('');
  const [bladeSize, setBladeSize] = useState('');
  const [bladeSpec, setBladeSpec] = useState('');
  const [bladePhotoPath, setBladePhotoPath] = useState('');
  const [bladePhotoPreviewUrl, setBladePhotoPreviewUrl] = useState('');
  const [bladePhotoUploading, setBladePhotoUploading] = useState(false);
  const bladePhotoInputRef = useRef<HTMLInputElement>(null);

  // ── Pending tray (voice drafts) ──────────────────────────────────────────
  // Voice creates DRAFTS in a tray instead of auto-filling the manual form.
  // User can speak multiple items, edit amber-tier matches, then Confirm All
  // to submit them in batch. The manual form below stays for one-off
  // single-piece checkouts.
  const [drafts, setDrafts] = useState<VoiceDraft[]>([]);
  const [submittingTray, setSubmittingTray] = useState(false);
  const [aliasPrompt, setAliasPrompt] = useState<{
    equipmentId: string;
    equipmentDisplay: string;
    phrase: string;
    count: number;
  } | null>(null);

  function addDraftFromVoice(result: VoiceParseResult, audioUrl: string | null) {
    const draft: VoiceDraft = {
      local_id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random()}`,
      result,
      audio_url: audioUrl,
      // Auto-pick green-tier matches
      equipment_id: result.equipment && result.equipment.score >= 0.85 ? result.equipment.id : '',
      truck_id: result.truck && result.truck.score >= 0.85 ? result.truck.id : '',
      operator_id: result.operator && result.operator.score >= 0.85 ? result.operator.id : '',
      mode: result.truck ? 'truck' : (result.operator ? 'handheld' : 'truck'),
    };
    setDrafts((cur) => [...cur, draft]);
  }
  function updateDraft(localId: string, patch: Partial<VoiceDraft>) {
    setDrafts((cur) => cur.map(d => d.local_id === localId ? { ...d, ...patch } : d));
  }
  function removeDraft(localId: string) {
    setDrafts((cur) => cur.filter(d => d.local_id !== localId));
  }

  /**
   * Submit every draft in the tray. For each successful checkout, post the
   * voice_corrections payload (spoken_text + normalized_phrase + resolved id
   * + confidence + was_corrected) so the repeat-phrase counter grows. After
   * the whole batch lands, look up alias suggestions for the equipment we
   * just checked out — if any phrase has crossed the threshold, surface the
   * first one as an alias-learning prompt.
   */
  async function confirmAllDrafts() {
    setMsg(null);
    if (drafts.length === 0) return;

    // Validate every draft before we start hitting the API. Cheaper to bail
    // here than to half-submit.
    for (const d of drafts) {
      if (!d.equipment_id) { setMsg({ type: 'error', text: `Draft "${d.result.phrase}" needs an equipment pick.` }); return; }
      if (d.mode === 'truck' && !d.truck_id) { setMsg({ type: 'error', text: `Draft "${d.result.phrase}" needs a truck pick.` }); return; }
      if (d.mode === 'handheld' && !d.operator_id) { setMsg({ type: 'error', text: `Draft "${d.result.phrase}" needs an operator pick.` }); return; }
    }

    setSubmittingTray(true);
    const succeeded: VoiceDraft[] = [];
    const failed: { draft: VoiceDraft; error: string }[] = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setMsg({ type: 'error', text: 'Session expired — sign back in.' }); return; }
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };

      for (const d of drafts) {
        // Build the voice_corrections payload for THIS draft — one entry per
        // slot that had a parse (equipment is required by validation above).
        // `was_corrected` = the user picked something different from what the
        // parser proposed at top-1.
        const corrections: any[] = [];
        const pushCorrection = (
          kind: 'equipment' | 'truck' | 'operator',
          slot: VoiceMatch | null,
          finalId: string,
          phraseSegment: string,
        ) => {
          if (!finalId || !slot) return;
          corrections.push({
            phrase: d.result.phrase,
            normalized: phraseSegment || d.result.normalized,
            kind,
            resolved_id: finalId,
            confidence: slot.score,
            was_corrected: slot.id !== finalId,
          });
        };
        pushCorrection('equipment', d.result.equipment, d.equipment_id, d.result.segments.equipment_phrase);
        if (d.mode === 'truck') {
          pushCorrection('truck', d.result.truck, d.truck_id, d.result.segments.truck_phrase || '');
        } else {
          pushCorrection('operator', d.result.operator, d.operator_id, d.result.segments.operator_phrase || '');
        }

        const body: Record<string, unknown> = {
          equipment_id: d.equipment_id,
          voice_corrections: corrections,
        };
        if (d.audio_url) body.voice_note_url = d.audio_url;
        if (d.mode === 'truck') {
          body.truck_equipment_id = d.truck_id;
          // If the truck has no driver, we need to send custodian_id too.
          // The picker UI in PendingTray sets operator_id in that case.
          if (d.operator_id) body.custodian_id = d.operator_id;
        } else {
          body.custodian_id = d.operator_id;
        }

        const res = await fetch('/api/admin/equipment-checkouts', {
          method: 'POST', headers, body: JSON.stringify(body),
        });
        if (res.ok) {
          succeeded.push(d);
        } else {
          const j = await res.json().catch(() => ({}));
          failed.push({ draft: d, error: j.error || j.details || `HTTP ${res.status}` });
        }
      }

      // Surface results.
      if (failed.length === 0) {
        setMsg({ type: 'success', text: `Checked out ${succeeded.length} item${succeeded.length === 1 ? '' : 's'}.` });
      } else if (succeeded.length === 0) {
        setMsg({ type: 'error', text: `All ${failed.length} drafts failed. First error: ${failed[0].error}` });
      } else {
        setMsg({ type: 'error', text: `${succeeded.length} succeeded, ${failed.length} failed. First failure: ${failed[0].error}` });
      }

      // Clear succeeded drafts from the tray; keep failures so user can retry.
      setDrafts((cur) => cur.filter(d => !succeeded.some(s => s.local_id === d.local_id)));

      // Refresh equipment + open checkouts so the form/state reflect reality.
      onSuccess();

      // Alias-learning: query suggestions for each piece of equipment that
      // just got checked out. Surface the first phrase that crossed threshold.
      // Fire-and-forget across drafts; user can decline / save on the modal.
      for (const d of succeeded) {
        try {
          const aliasRes = await fetch(`/api/admin/equipment/${d.equipment_id}/alias-suggestions`, { headers });
          if (!aliasRes.ok) continue;
          const aliasJson = await aliasRes.json();
          const top = aliasJson.suggestions?.[0];
          if (top) {
            setAliasPrompt({
              equipmentId: d.equipment_id,
              equipmentDisplay: d.result.equipment?.display || 'this equipment',
              phrase: top.normalized_phrase,
              count: top.count,
            });
            break; // one modal at a time
          }
        } catch { /* ignore — non-blocking */ }
      }
    } finally {
      setSubmittingTray(false);
    }
  }

  // Derive operator from selected truck (if truck has a current driver).
  const selectedTruck = useMemo(() => trucks.find(t => t.id === truckId) || null, [trucks, truckId]);
  const truckCurrentOperator = selectedTruck?.current_custodian?.full_name || null;
  const truckCurrentOperatorId = (selectedTruck as any)?.current_custodian?.id || null;
  const truckHasNoDriver = !!truckId && !truckCurrentOperatorId;

  // Blade/bit-specific manual entry appears when the picked equipment is one.
  const selectedEquipment = useMemo(() => availableEquipment.find(e => e.id === equipmentId) || null, [availableEquipment, equipmentId]);
  const isSelectedEquipmentBlade = selectedEquipment?.kind === 'blade' || selectedEquipment?.category === 'blade' || selectedEquipment?.category === 'bit';

  async function handleBladePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBladePhotoUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch('/api/admin/equipment-checkouts/blade-photo-upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setBladePhotoPath(json.path);
      setBladePhotoPreviewUrl(json.url || '');
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.message || 'Photo upload failed.' });
    } finally {
      setBladePhotoUploading(false);
      if (bladePhotoInputRef.current) bladePhotoInputRef.current.value = '';
    }
  }

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
      if (isSelectedEquipmentBlade && (bladeSerial.trim() || bladeSize.trim() || bladeSpec.trim() || bladePhotoPath)) {
        body.blade_details = {
          serial_number: bladeSerial.trim() || null,
          size: bladeSize.trim() || null,
          spec: bladeSpec.trim() || null,
          photo_url: bladePhotoPath || null,
        };
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
      setBladeSerial(''); setBladeSize(''); setBladeSpec(''); setBladePhotoPath(''); setBladePhotoPreviewUrl('');
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
      {/* Voice mic — each tap creates a DRAFT in the pending tray below.
          Speak many items, then hit Confirm All to submit in batch.
          Skipped silently if browser doesn't support Web Speech API. */}
      <VoiceMic onResult={(r, audioUrl) => addDraftFromVoice(r, audioUrl)} />

      {/* Native voice checkout — renders nothing on web/SSR (isNativeApp() gate
          inside the component). Multi-item, LLM-parsed, native on-device STT
          (the Web Speech API used by VoiceMic above does not work inside the
          iOS Capacitor WKWebView). See components/equipment/NativeVoiceCheckout.tsx. */}
      <NativeVoiceCheckout onCommitted={onSuccess} />

      {/* Pending tray — appears once at least one voice draft exists. */}
      {drafts.length > 0 && (
        <PendingTray
          drafts={drafts}
          availableEquipment={availableEquipment}
          trucks={trucks}
          operators={operators}
          submitting={submittingTray}
          onUpdate={updateDraft}
          onRemove={removeDraft}
          onClearAll={() => setDrafts([])}
          onConfirmAll={confirmAllDrafts}
        />
      )}

      {/* Alias-learning prompt — fires after Confirm All if a phrase has
          been used 3+ times for the same equipment and isn't an alias yet. */}
      {aliasPrompt && (
        <AliasPromptModal
          prompt={aliasPrompt}
          onClose={() => setAliasPrompt(null)}
          onSaved={() => setAliasPrompt(null)}
        />
      )}

      {/* Mode toggle: truck (default) vs handheld */}
      <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-slate-900 rounded-xl p-1 border border-gray-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setMode('truck')}
          className={`min-h-[44px] px-2 rounded-lg text-sm font-semibold transition ${
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
          className={`min-h-[44px] px-2 rounded-lg text-sm font-semibold transition leading-tight ${
            mode === 'handheld'
              ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/30'
              : 'text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          ✋ Handheld <span className="hidden sm:inline">(to operator directly)</span>
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

      {/* Blade/bit manual entry — serial, size, spec + sticker photo. Manual
          entry only (v1) — no OCR auto-extraction. */}
      {isSelectedEquipmentBlade && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
            Blade details (optional but recommended)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5 block">Serial Number</label>
              <input type="text" value={bladeSerial} onChange={(e) => setBladeSerial(e.target.value)} placeholder="e.g. SN-48213" className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5 block">Size</label>
              <input type="text" value={bladeSize} onChange={(e) => setBladeSize(e.target.value)} placeholder='e.g. 14"' className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5 block">Spec</label>
              <input type="text" value={bladeSpec} onChange={(e) => setBladeSpec(e.target.value)} placeholder="e.g. wet/segmented" className={inputClass} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5 block">Sticker photo</label>
            <input
              ref={bladePhotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleBladePhotoSelect}
              className="hidden"
            />
            {bladePhotoPreviewUrl && (
              <img src={bladePhotoPreviewUrl} alt="Blade sticker" className="w-20 h-20 rounded-lg object-cover border border-gray-200 dark:border-slate-600 mb-2" />
            )}
            <button
              type="button"
              onClick={() => bladePhotoInputRef.current?.click()}
              disabled={bladePhotoUploading}
              className="flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-800 hover:border-amber-400 text-sm text-amber-700 dark:text-amber-400 transition w-full justify-center"
            >
              {bladePhotoUploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
              ) : (
                <>📷 {bladePhotoPreviewUrl ? 'Retake photo' : 'Take photo of sticker'}</>
              )}
            </button>
          </div>
        </div>
      )}

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

// ─── Voice Note Player (with auto re-sign on 404) ───────────────────────────
function VoiceNotePlayer({ checkoutId, initialUrl }: { checkoutId: string; initialUrl: string }) {
  const [src, setSrc] = useState(initialUrl);
  const [status, setStatus] = useState<'idle' | 'refreshing' | 'error'>('idle');

  async function resign() {
    setStatus('refreshing');
    try {
      const res = await fetch(`/api/admin/equipment-checkouts/${checkoutId}/voice-note`);
      if (!res.ok) throw new Error('re-sign failed');
      const json = await res.json();
      setSrc(json.url);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Volume2 className="w-3.5 h-3.5 text-brand flex-shrink-0" />
        <span className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">Voice note</span>
        <button
          onClick={resign}
          disabled={status === 'refreshing'}
          className="ml-auto inline-flex items-center gap-1 text-[10px] text-brand dark:text-brand hover:underline disabled:opacity-50"
          title="Reload audio if it fails to play"
        >
          <RefreshCw className={`w-3 h-3 ${status === 'refreshing' ? 'animate-spin' : ''}`} />
          Reload
        </button>
      </div>
      {status === 'error' ? (
        <p className="text-[10px] text-rose-500">Could not refresh audio link. Try again later.</p>
      ) : (
        <audio
          key={src}
          controls
          src={src}
          className="w-full h-8"
          onError={() => {
            // Auto-retry once on error (handles expired signed URLs silently)
            if (status === 'idle') void resign();
          }}
        />
      )}
    </div>
  );
}

// ─── Blade Details Summary (History tab) ───────────────────────────────────
// Renders the manual-entry blade fields captured at checkout + a click-to-view
// sticker photo. photo_url is a bare storage PATH (not a URL) — re-signed on
// demand via the blade-photo route, same lazy pattern as VoiceNotePlayer.
function BladeDetailsSummary({
  checkoutId, details,
}: {
  checkoutId: string;
  details: { serial_number: string | null; size: string | null; spec: string | null; photo_url: string | null };
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);

  async function loadPhoto() {
    if (photoUrl) { setShowPhoto(v => !v); return; }
    if (!details.photo_url) { setShowPhoto(true); return; }
    setLoadingPhoto(true);
    try {
      const res = await fetch(`/api/admin/equipment-checkouts/${checkoutId}/blade-photo`);
      if (res.ok) {
        const json = await res.json();
        setPhotoUrl(json.url);
      }
    } finally {
      setLoadingPhoto(false);
      setShowPhoto(true);
    }
  }

  return (
    <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-2 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {details.serial_number && <span><strong>S/N:</strong> {details.serial_number}</span>}
        {details.size && <span><strong>Size:</strong> {details.size}</span>}
        {details.spec && <span><strong>Spec:</strong> {details.spec}</span>}
      </div>
      {details.photo_url && (
        <button
          type="button"
          onClick={loadPhoto}
          disabled={loadingPhoto}
          className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 hover:underline disabled:opacity-50"
        >
          {loadingPhoto ? 'Loading…' : showPhoto ? 'Hide sticker photo' : '📷 View sticker photo'}
        </button>
      )}
      {showPhoto && photoUrl && (
        <img src={photoUrl} alt="Blade sticker" className="mt-1 w-24 h-24 rounded-lg object-cover border border-amber-200 dark:border-amber-800" />
      )}
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
                {co.blade_details && (co.blade_details.serial_number || co.blade_details.size || co.blade_details.spec || co.blade_details.photo_url) && (
                  <BladeDetailsSummary checkoutId={co.id} details={co.blade_details} />
                )}
                {co.voice_note_url && (
                  <VoiceNotePlayer checkoutId={co.id} initialUrl={co.voice_note_url} />
                )}
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
  return (
    <div className="space-y-3 py-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-4 flex items-center gap-3 shadow-sm">
          <div className="h-10 w-10 bg-gray-200 dark:bg-gray-600 rounded-xl animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
            <div className="h-3 w-24 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
          </div>
          <div className="h-6 w-16 bg-gray-200 dark:bg-gray-600 rounded-full animate-pulse" />
          <div className="h-8 w-8 bg-gray-200 dark:bg-gray-600 rounded-lg animate-pulse" />
        </div>
      ))}
    </div>
  );
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

// ─── Voice types + components ──────────────────────────────────────────────

interface VoiceMatch {
  id: string;
  display: string;
  score: number;
  exact_match: boolean;
  source: string;
}
interface VoiceParseResult {
  phrase: string;
  normalized: string;
  segments: { equipment_phrase: string; truck_phrase: string | null; operator_phrase: string | null };
  equipment: VoiceMatch | null;
  truck: VoiceMatch | null;
  operator: VoiceMatch | null;
  alternatives: { equipment: VoiceMatch[]; truck: VoiceMatch[]; operator: VoiceMatch[] };
}

/**
 * VoiceDraft — one row in the pending tray.
 *
 * Each tap of the mic produces a draft. Greens (≥0.85) pre-select the matched
 * id; amber/red leave the slot empty so the user picks from `result.alternatives`.
 * `Confirm All` submits the whole tray in sequence, then queries for alias
 * suggestions on the equipment that got checked out.
 */
interface VoiceDraft {
  local_id: string;             // client-side uuid for React keys / removal
  result: VoiceParseResult;     // raw parse for amber pickers + corrections log
  audio_url: string | null;     // wired up in Part 4 (audio recording)
  equipment_id: string;         // empty until user/amber picks
  truck_id: string;
  operator_id: string;
  mode: 'truck' | 'handheld';
}

/**
 * VoiceMic — hold-to-talk button using the browser's Web Speech API.
 *
 * Flow:
 *   1. User taps & holds mic button (or clicks once to toggle on/off)
 *   2. SpeechRecognition transcribes inline
 *   3. On stop, transcript is POSTed to /api/admin/equipment-checkouts/voice-parse
 *   4. Parent receives the parsed result via onResult callback
 *
 * Browser support: Chrome, Edge, Safari (iOS 14.5+ with HTTPS or localhost).
 * Firefox: not supported. We render a friendly message.
 */
function VoiceMic({ onResult }: { onResult: (r: VoiceParseResult, audioUrl: string | null) => void }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  // Mirror transcript in a ref because the SpeechRecognition `onend` callback
  // closes over the initial `transcript` value (stale-closure problem). Using
  // a ref lets us read the latest text synchronously when the recognizer ends.
  const transcriptRef = useRef('');

  // ── Audio capture (Part 4) ──────────────────────────────────────────────
  // Run a MediaRecorder in parallel with SpeechRecognition. Chunks accumulate
  // into a Blob; on stop, we upload it to the voice-checkouts bucket and pass
  // the signed URL to the parent via onResult so it lands on the equipment
  // checkout row's voice_note_url column for forensic replay.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Detect support once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SpeechRecognition);
  }, []);

  // Cleanup any open stream on unmount (mic indicator should disappear).
  useEffect(() => {
    return () => {
      audioStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  async function start() {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    setError(null);
    setTranscript('');
    transcriptRef.current = '';
    audioChunksRef.current = [];

    // Kick off audio capture in parallel. If the browser doesn't support
    // MediaRecorder (or the user denies the second permission prompt), we
    // still proceed with speech recognition — audio is nice-to-have.
    try {
      if (typeof MediaRecorder !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;
        // Pick the most compatible MIME the browser supports. Chrome picks
        // webm/opus; Safari falls back to mp4/aac. We just try and use the
        // default if our preferred isn't available.
        const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg'];
        const supportedMime = preferred.find(m => (MediaRecorder as any).isTypeSupported?.(m)) || '';
        const mr = supportedMime ? new MediaRecorder(stream, { mimeType: supportedMime }) : new MediaRecorder(stream);
        mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data); };
        mr.start(250); // ~250ms chunks; small enough for tight stop latency
        mediaRecorderRef.current = mr;
      }
    } catch (err) {
      console.warn('Audio capture unavailable:', err);
      // Silently degrade — voice still works, just no replay audio.
    }

    const recog = new SpeechRecognition();
    recog.continuous = false;          // one phrase per tap
    recog.interimResults = true;
    recog.lang = 'en-US';
    recog.maxAlternatives = 1;

    recog.onresult = (e: any) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      transcriptRef.current = text;
      setTranscript(text);
    };
    recog.onerror = (e: any) => {
      setError(e.error === 'not-allowed' ? 'Microphone access denied. Allow it in browser settings.' : `Voice error: ${e.error}`);
      setListening(false);
      stopAudio();
    };
    recog.onend = async () => {
      setListening(false);
      const finalText = transcriptRef.current.trim();
      // Stop audio recording. Wait for the last `dataavailable` chunk by
      // listening for the `stop` event on the recorder before parsing — that
      // way the audio upload can run in parallel with the phrase parse.
      const audioBlob = await stopAudioAndFlush();
      if (!finalText) return;
      await parseAndUpload(finalText, audioBlob);
    };

    recognitionRef.current = recog;
    recog.start();
    setListening(true);
  }

  function stop() {
    try { recognitionRef.current?.stop(); } catch { /* */ }
  }

  function stopAudio() {
    try { mediaRecorderRef.current?.stop(); } catch { /* */ }
    audioStreamRef.current?.getTracks().forEach(t => t.stop());
    audioStreamRef.current = null;
  }

  // Stop the recorder and resolve once the final chunk has landed.
  function stopAudioAndFlush(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') {
        stopAudio();
        resolve(null);
        return;
      }
      mr.onstop = () => {
        const mime = mr.mimeType || 'audio/webm';
        const blob = audioChunksRef.current.length > 0
          ? new Blob(audioChunksRef.current, { type: mime })
          : null;
        audioStreamRef.current?.getTracks().forEach(t => t.stop());
        audioStreamRef.current = null;
        resolve(blob);
      };
      try { mr.stop(); } catch { resolve(null); }
    });
  }

  async function parseAndUpload(phrase: string, audioBlob: Blob | null) {
    setParsing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Session expired'); return; }
      const headers = { Authorization: `Bearer ${session.access_token}` };

      // Fire parse + upload in parallel.
      const parsePromise = fetch('/api/admin/equipment-checkouts/voice-parse', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase }),
      });
      const uploadPromise: Promise<string | null> = audioBlob
        ? (async () => {
            try {
              const form = new FormData();
              form.append('audio', audioBlob, `voice-${Date.now()}.webm`);
              const res = await fetch('/api/admin/equipment-checkouts/voice-note-upload', {
                method: 'POST', headers, body: form,
              });
              if (!res.ok) return null;
              const j = await res.json();
              return j.url || null;
            } catch { return null; }
          })()
        : Promise.resolve(null);

      const [parseRes, audioUrl] = await Promise.all([parsePromise, uploadPromise]);
      if (!parseRes.ok) {
        const j = await parseRes.json().catch(() => ({}));
        setError(j.error || 'Failed to parse voice input');
        return;
      }
      const result = await parseRes.json();
      onResult(result, audioUrl);
    } catch (err: any) {
      setError(err.message || 'Voice parse failed');
    } finally {
      setParsing(false);
    }
  }

  if (supported === null) return null; // mounting
  if (supported === false) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 p-3 text-xs text-gray-500 dark:text-slate-400 flex items-center gap-2">
        <MicOff className="w-4 h-4" />
        Voice checkout requires Chrome, Edge, or Safari. Firefox isn't supported yet.
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 transition-all ${
      listening
        ? 'bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg shadow-rose-500/40 text-white'
        : 'bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20 border-2 border-rose-200 dark:border-rose-900/50'
    }`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => listening ? stop() : start()}
          disabled={parsing}
          className={`relative flex items-center justify-center w-14 h-14 rounded-full transition-all flex-shrink-0 ${
            listening
              ? 'bg-white text-rose-600 shadow-xl ring-4 ring-white/40'
              : 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/30 hover:scale-105'
          } disabled:opacity-50`}
          aria-label={listening ? 'Stop recording' : 'Start voice checkout'}
        >
          {parsing ? <Loader2 className="w-6 h-6 animate-spin" /> : listening ? <Mic className="w-6 h-6 animate-pulse" /> : <Mic className="w-6 h-6" />}
          {listening && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold flex items-center gap-1 ${listening ? 'text-white' : 'text-rose-700 dark:text-rose-300'}`}>
            <Sparkles className="w-3.5 h-3.5" />
            {listening ? 'Listening…' : parsing ? 'Parsing…' : 'Voice checkout'}
          </p>
          {transcript ? (
            <p className={`text-xs mt-0.5 italic truncate ${listening ? 'text-white/90' : 'text-rose-700/80 dark:text-rose-300/80'}`}>"{transcript}"</p>
          ) : (
            <p className={`text-[11px] mt-0.5 ${listening ? 'text-white/80' : 'text-rose-700/70 dark:text-rose-300/70'}`}>
              Tap mic and say e.g. "FS5000 number 5 to truck 3" or "DFS-5 going with Carlos"
            </p>
          )}
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs text-rose-700 dark:text-rose-300 bg-white/80 dark:bg-slate-800/80 rounded p-2">⚠ {error}</p>
      )}
    </div>
  );
}

// VoiceMatchSummary (single-shot summary) was replaced by PendingTray's
// inline per-draft pickers in the C(ii)-b polish. Removed from this file
// because it's no longer rendered; the equivalent UX lives in DraftRow +
// AltChips below.

// ─── Pending Tray ──────────────────────────────────────────────────────────
/**
 * Multi-item voice draft tray. Speak many phrases, edit each draft inline,
 * then "Confirm All" submits them in sequence.
 *
 * Each draft row gets:
 *   - Heard phrase (italic, top)
 *   - Equipment picker (combobox; pre-filled on green-tier matches)
 *   - Mode toggle (truck vs handheld)
 *   - Truck OR operator picker depending on mode (with amber alternatives
 *     shown as chips for quick correction)
 *   - Remove button
 */
function PendingTray({
  drafts, availableEquipment, trucks, operators,
  submitting, onUpdate, onRemove, onClearAll, onConfirmAll,
}: {
  drafts: VoiceDraft[];
  availableEquipment: Equipment[];
  trucks: Equipment[];
  operators: Operator[];
  submitting: boolean;
  onUpdate: (localId: string, patch: Partial<VoiceDraft>) => void;
  onRemove: (localId: string) => void;
  onClearAll: () => void;
  onConfirmAll: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-900/10 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-rose-700 dark:text-rose-300">
          Pending checkouts · {drafts.length}
        </p>
        <button
          type="button"
          onClick={onClearAll}
          disabled={submitting}
          className="text-xs font-semibold text-rose-700 dark:text-rose-300 hover:underline disabled:opacity-50 px-2 min-h-[44px] flex-shrink-0"
        >
          Clear all
        </button>
      </div>

      <div className="space-y-2">
        {drafts.map((d) => (
          <DraftRow
            key={d.local_id}
            draft={d}
            availableEquipment={availableEquipment}
            trucks={trucks}
            operators={operators}
            onUpdate={(patch) => onUpdate(d.local_id, patch)}
            onRemove={() => onRemove(d.local_id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onConfirmAll}
        disabled={submitting || drafts.length === 0}
        className="w-full inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-semibold shadow-lg shadow-rose-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><CheckCircle2 className="w-4 h-4" /> Confirm All ({drafts.length})</>}
      </button>
    </div>
  );
}

function DraftRow({
  draft, availableEquipment, trucks, operators,
  onUpdate, onRemove,
}: {
  draft: VoiceDraft;
  availableEquipment: Equipment[];
  trucks: Equipment[];
  operators: Operator[];
  onUpdate: (patch: Partial<VoiceDraft>) => void;
  onRemove: () => void;
}) {
  const r = draft.result;
  const selectedTruck = useMemo(() => trucks.find(t => t.id === draft.truck_id) || null, [trucks, draft.truck_id]);
  const truckHasNoDriver = !!draft.truck_id && !selectedTruck?.current_custodian?.id;
  const truckDriverName = selectedTruck?.current_custodian?.full_name || null;

  // Display helpers for the equipment combobox.
  const equipmentDisplay = (eq: Equipment) =>
    eq.short_name && eq.unit_number ? `${eq.short_name} #${eq.unit_number}` : eq.name;

  return (
    <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-slate-800 p-3 space-y-2.5">
      {/* Heard line + remove */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-widest text-rose-700 dark:text-rose-300 font-bold">Heard</p>
          <p className="text-sm text-gray-700 dark:text-slate-200 italic truncate">"{r.phrase}"</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-semibold text-gray-500 hover:text-rose-600 px-3 min-h-[44px] rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/20 transition flex-shrink-0"
        >
          Remove
        </button>
      </div>

      {/* Equipment slot */}
      <SlotLabel label="Equipment" match={r.equipment} pickedId={draft.equipment_id} />
      <EquipmentCombobox
        value={draft.equipment_id}
        onChange={(id) => onUpdate({ equipment_id: id })}
        options={availableEquipment}
      />
      {/* Amber/red equipment alternatives — quick-pick chips below combobox */}
      {r.equipment && r.equipment.score < 0.85 && r.alternatives.equipment.length > 0 && (
        <AltChips
          tier={r.equipment.score < 0.6 ? 'red' : 'amber'}
          alternatives={r.alternatives.equipment}
          pickedId={draft.equipment_id}
          onPick={(id) => onUpdate({ equipment_id: id })}
        />
      )}

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-1.5 bg-gray-50 dark:bg-slate-900 rounded-lg p-1 border border-gray-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => onUpdate({ mode: 'truck' })}
          className={`min-h-[44px] rounded-md text-sm font-semibold transition ${
            draft.mode === 'truck'
              ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow shadow-rose-500/30'
              : 'text-gray-600 dark:text-slate-300'
          }`}
        >
          🚚 Truck
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ mode: 'handheld' })}
          className={`min-h-[44px] rounded-md text-sm font-semibold transition ${
            draft.mode === 'handheld'
              ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow shadow-amber-500/30'
              : 'text-gray-600 dark:text-slate-300'
          }`}
        >
          ✋ Handheld
        </button>
      </div>

      {/* Truck OR direct operator */}
      {draft.mode === 'truck' ? (
        <>
          <SlotLabel label="Truck" match={r.truck} pickedId={draft.truck_id} />
          <select
            value={draft.truck_id}
            onChange={(e) => onUpdate({ truck_id: e.target.value, operator_id: '' })}
            className={selectClass}
          >
            <option value="">Select truck…</option>
            {trucks.map(t => {
              const display = t.short_name && t.unit_number ? `${t.short_name} #${t.unit_number}` : t.name;
              const op = (t as any).current_custodian?.full_name?.split(' ')[0];
              return <option key={t.id} value={t.id}>{display}{op ? ` · ${op}` : ' · no driver'}</option>;
            })}
          </select>
          {r.truck && r.truck.score < 0.85 && r.alternatives.truck.length > 0 && (
            <AltChips
              tier={r.truck.score < 0.6 ? 'red' : 'amber'}
              alternatives={r.alternatives.truck}
              pickedId={draft.truck_id}
              onPick={(id) => onUpdate({ truck_id: id, operator_id: '' })}
            />
          )}
          {truckDriverName && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
              <UserIcon className="w-3 h-3" /> Going with <strong>{truckDriverName}</strong>
            </p>
          )}
          {truckHasNoDriver && (
            <>
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Truck has no driver — pick operator:</p>
              <select
                value={draft.operator_id}
                onChange={(e) => onUpdate({ operator_id: e.target.value })}
                className={selectClass}
              >
                <option value="">Select operator…</option>
                {operators.map(o => (
                  <option key={o.id} value={o.id}>{o.full_name}{o.role === 'apprentice' ? ' (Helper)' : ''}</option>
                ))}
              </select>
            </>
          )}
        </>
      ) : (
        <>
          <SlotLabel label="Operator" match={r.operator} pickedId={draft.operator_id} />
          <select
            value={draft.operator_id}
            onChange={(e) => onUpdate({ operator_id: e.target.value })}
            className={selectClass}
          >
            <option value="">Select operator…</option>
            {operators.map(o => (
              <option key={o.id} value={o.id}>{o.full_name}{o.role === 'apprentice' ? ' (Helper)' : ''}</option>
            ))}
          </select>
          {r.operator && r.operator.score < 0.85 && r.alternatives.operator.length > 0 && (
            <AltChips
              tier={r.operator.score < 0.6 ? 'red' : 'amber'}
              alternatives={r.alternatives.operator}
              pickedId={draft.operator_id}
              onPick={(id) => onUpdate({ operator_id: id })}
            />
          )}
        </>
      )}
    </div>
  );
}

function SlotLabel({ label, match, pickedId }: { label: string; match: VoiceMatch | null; pickedId: string }) {
  // Green dot if we have a high-confidence match AND user hasn't deviated from it.
  // Amber dot if low-confidence match exists. Red if no match at all. Gray if user picked manually.
  let tone = 'bg-gray-300';
  let hint = '';
  if (!match) {
    tone = pickedId ? 'bg-gray-400' : 'bg-rose-500';
    hint = pickedId ? '' : '· no match';
  } else if (match.score >= 0.85 && (match.id === pickedId || !pickedId)) {
    tone = 'bg-emerald-500';
    hint = `· ${Math.round(match.score * 100)}%`;
  } else if (match.score >= 0.6) {
    tone = 'bg-amber-500';
    hint = `· ${Math.round(match.score * 100)}% — verify`;
  } else {
    tone = 'bg-rose-500';
    hint = '· low confidence';
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${tone}`} aria-hidden />
      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300">
        {label} <span className="text-gray-400 normal-case font-normal">{hint}</span>
      </p>
    </div>
  );
}

function AltChips({
  tier, alternatives, pickedId, onPick,
}: {
  tier: 'amber' | 'red';
  alternatives: VoiceMatch[];
  pickedId: string;
  onPick: (id: string) => void;
}) {
  const isRed = tier === 'red';
  return (
    <div className="flex flex-wrap gap-1.5">
      {alternatives.slice(0, 3).map(alt => {
        const isPicked = alt.id === pickedId;
        return (
          <button
            key={alt.id}
            type="button"
            onClick={() => onPick(alt.id)}
            className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition ${
              isPicked
                ? (isRed ? 'bg-rose-200 text-rose-900 border-rose-300' : 'bg-amber-200 text-amber-900 border-amber-300')
                : (isRed
                    ? 'bg-white hover:bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-white hover:bg-amber-50 text-amber-800 border-amber-200')
            }`}
          >
            {alt.display} <span className="opacity-60 ml-0.5">({Math.round(alt.score * 100)}%)</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Alias-Learning Prompt ─────────────────────────────────────────────────
/**
 * After Confirm All, if a normalized phrase has been used 3+ times for the
 * same equipment and isn't already in its `aliases` array, surface this
 * modal asking the shop manager whether to permanently save it. Saved
 * aliases hit the alias index in the next voice parse → instant green-tier
 * match instead of trigram-degraded amber.
 */
function AliasPromptModal({
  prompt, onClose, onSaved,
}: {
  prompt: { equipmentId: string; equipmentDisplay: string; phrase: string; count: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Session expired.'); return; }
      // Fetch current aliases first so we don't blow them away.
      const getRes = await fetch(`/api/admin/equipment/${prompt.equipmentId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!getRes.ok) { setError('Could not load equipment.'); return; }
      const eqJson = await getRes.json();
      const existing: string[] = Array.isArray(eqJson.data?.aliases) ? eqJson.data.aliases : [];
      const next = Array.from(new Set([...existing.map(s => String(s)), prompt.phrase]));

      const patchRes = await fetch(`/api/admin/equipment/${prompt.equipmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ aliases: next }),
      });
      if (!patchRes.ok) {
        const j = await patchRes.json().catch(() => ({}));
        setError(j.error || 'Could not save alias.');
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-rose-600" />
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Save voice alias?</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-slate-300">
          The shop has said <strong className="text-rose-700 dark:text-rose-300">"{prompt.phrase}"</strong> {prompt.count}×
          to mean <strong>{prompt.equipmentDisplay}</strong>. Save it as an alias so it auto-matches next time?
        </p>
        {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">⚠ {error}</p>}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-[44px] rounded-xl border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 transition"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="min-h-[44px] rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-semibold shadow-lg shadow-rose-500/30 disabled:opacity-50 transition inline-flex items-center justify-center gap-1.5"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <>Save alias</>}
          </button>
        </div>
      </div>
    </div>
  );
}
