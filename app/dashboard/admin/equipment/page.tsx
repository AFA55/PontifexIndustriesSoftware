'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Package, Plus, Search, Filter, Loader2, ArrowLeft, ChevronRight,
  Wrench, Truck, Hammer, Cable, Cog,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';

interface Equipment {
  id: string;
  asset_tag: string | null;
  kind: string | null;
  category: string | null;
  name: string;
  short_name: string | null;
  unit_number: string | null;
  power_source: string | null;
  status: string;
  location: string | null;
  photo_url: string | null;
  hour_meter: number | null;
  current_custodian: { id: string; full_name: string | null } | null;
  current_job: { id: string; job_number: string | null; customer_name: string | null } | null;
  open_checkout: { id: string; truck: { name: string | null; short_name: string | null; unit_number: string | null } | null } | null;
}

/**
 * Smart location: shows where the equipment IS RIGHT NOW.
 * - in_use → "with [operator] · truck #X" or "with [operator] · job JOB-..."
 * - reserved → "reserved for JOB-..."
 * - in_maintenance / out_of_service / pending_putaway → status reflects state
 * - else → home location (e.g. "Main shop")
 */
function smartLocation(eq: Equipment): string {
  if (eq.status === 'in_use') {
    const op = eq.current_custodian?.full_name?.split(' ')[0] ?? 'someone';
    const truck = eq.open_checkout?.truck;
    if (truck) {
      const truckLabel = truck.short_name && truck.unit_number
        ? `${truck.short_name} #${truck.unit_number}`
        : truck.name ?? 'truck';
      return `with ${op} · ${truckLabel}`;
    }
    if (eq.current_job?.job_number) return `with ${op} · ${eq.current_job.job_number}`;
    return `with ${op}`;
  }
  if (eq.status === 'reserved' && eq.current_job?.job_number) {
    return `reserved for ${eq.current_job.job_number}`;
  }
  if (eq.status === 'pending_putaway') return 'pending put-away';
  if (eq.status === 'in_maintenance' || eq.status === 'maintenance') return 'in maintenance';
  if (eq.status === 'out_of_service') return 'out of service';
  if (eq.status === 'retired') return 'retired';
  return eq.location || 'in shop';
}

const ALLOWED_ROLES = ['shop_manager','admin','super_admin','operations_manager','supervisor','salesman'];
const KIND_OPTIONS = [
  { value: '', label: 'All kinds' },
  { value: 'powered', label: 'Powered' },
  { value: 'hand_tool', label: 'Hand tools' },
  { value: 'accessory', label: 'Accessories' },
  { value: 'trailer', label: 'Trailers' },
];
const POWER_OPTIONS = [
  { value: '', label: 'All power' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'gas', label: 'Gas' },
  { value: 'hydraulic', label: 'Hydraulic' },
  { value: 'electric', label: 'Electric' },
  { value: 'pneumatic', label: 'Pneumatic' },
];
const STATUS_OPTIONS = [
  { value: '', label: 'All status' },
  { value: 'available', label: 'Available' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'in_use', label: 'In use' },
  { value: 'pending_putaway', label: 'Pending put-away' },
  { value: 'in_maintenance', label: 'In maintenance' },
  { value: 'out_of_service', label: 'Out of service' },
  { value: 'retired', label: 'Retired' },
];

const KIND_ICON: Record<string, React.ElementType> = {
  powered: Cog, hand_tool: Hammer, accessory: Cable, trailer: Truck, vehicle: Truck,
};
const STATUS_TONE: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  reserved: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  in_use: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  pending_putaway: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  in_maintenance: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  maintenance: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  out_of_service: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  retired: 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400',
  assigned: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
};

export default function EquipmentListPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [powerSource, setPowerSource] = useState('');
  const [status, setStatus] = useState('');
  const [excludeVehicles, setExcludeVehicles] = useState(true);

  useEffect(() => {
    const cu = getCurrentUser();
    if (!cu) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(cu.role)) { router.push('/dashboard/admin'); return; }
    setUser(cu);
    setAuthLoading(false);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      void fetchItems();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page, kind, powerSource, status, search, excludeVehicles]);

  async function fetchItems() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        ...(kind && { kind }),
        ...(powerSource && { power_source: powerSource }),
        ...(status && { status }),
        ...(search.trim() && { search: search.trim() }),
        ...(excludeVehicles && { exclude_vehicles: 'true' }),
      });
      const res = await fetch(`/api/admin/equipment?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setItems(json.data ?? []);
        setPages(json.pagination?.pages ?? 1);
        setTotal(json.pagination?.total ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  const filtersActive = !!(kind || powerSource || status || search);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
        <Link href="/dashboard/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300 hover:text-cyan-600">
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>

        {/* Hero */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Equipment Inventory</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400">{total} item{total === 1 ? '' : 's'}</p>
            </div>
          </div>
          <Link
            href="/dashboard/admin/equipment/new"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 hover:from-cyan-600 hover:to-sky-700 text-white text-sm font-semibold shadow-lg shadow-cyan-500/30 transition-all hover:-translate-y-0.5"
          >
            <Plus className="w-4 h-4" />
            New Equipment
          </Link>
        </div>

        {/* Search + filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, model, asset tag, unit number…"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <FilterSelect value={kind} onChange={(v) => { setKind(v); setPage(1); }} options={KIND_OPTIONS} />
            <FilterSelect value={powerSource} onChange={(v) => { setPowerSource(v); setPage(1); }} options={POWER_OPTIONS} />
            <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_OPTIONS} />
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={!excludeVehicles}
                onChange={(e) => { setExcludeVehicles(!e.target.checked); setPage(1); }}
                className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
              />
              Include vehicles
            </label>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700">
            <Package className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400 text-sm">
              {filtersActive ? 'No equipment matches your filters.' : 'No equipment yet.'}
            </p>
            {!filtersActive && (
              <Link href="/dashboard/admin/equipment/new" className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-cyan-600 hover:underline">
                <Plus className="w-4 h-4" /> Add your first piece
              </Link>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {items.map((it) => {
              const Icon = KIND_ICON[it.kind || ''] || Package;
              const display = it.short_name && it.unit_number
                ? `${it.short_name} #${it.unit_number}`
                : it.name;
              return (
                <Link
                  key={it.id}
                  href={`/dashboard/admin/equipment/${it.id}`}
                  className="group bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-4 hover:border-cyan-300 dark:hover:border-cyan-700 hover:shadow-md transition"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-cyan-50 dark:bg-cyan-900/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{display}</p>
                        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 group-hover:text-cyan-500 group-hover:translate-x-0.5 transition flex-shrink-0" />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{it.name}</p>
                      {/* Smart location — live status, not static home_location */}
                      <p className="text-[11px] font-medium text-cyan-700 dark:text-cyan-300 truncate mt-1">
                        📍 {smartLocation(it)}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {it.asset_tag && (
                          <span className="text-[10px] font-mono font-semibold text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                            {it.asset_tag}
                          </span>
                        )}
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_TONE[it.status] || STATUS_TONE.available}`}>
                          {(it.status || 'available').replace(/_/g, ' ')}
                        </span>
                        {it.power_source && (
                          <span className="text-[10px] font-medium text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-700/50 px-1.5 py-0.5 rounded">
                            {it.power_source}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500 dark:text-slate-400">
              Page {page} of {pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
