'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Truck, Plus, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import { useModuleGate } from '@/components/ModuleGuard';
import { PageHeader, Button, EmptyState, Spinner, StatusBadge } from '@/components/ui';

interface VehicleRow {
  id: string;
  asset_tag: string | null;
  name: string;
  short_name: string | null;
  unit_number: string | null;
  make: string | null;
  model: string | null;
  status: string;
  location: string | null;
  vehicle: {
    license_plate: string | null;
    year: number | null;
    odometer: number | null;
    registration_expiry: string | null;
    insurance_expiry: string | null;
  } | null;
}

const ALLOWED_ROLES = ['shop_manager','admin','super_admin','operations_manager','supervisor','salesman'];
const STATUS_TONE: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-700',
  in_use: 'bg-sky-100 text-sky-700',
  in_maintenance: 'bg-orange-100 text-orange-700',
  maintenance: 'bg-orange-100 text-orange-700',
  out_of_service: 'bg-rose-100 text-rose-700',
  retired: 'bg-gray-100 text-gray-500',
  reserved: 'bg-amber-100 text-amber-700',
  pending_putaway: 'bg-teal-100 text-teal-700',
  assigned: 'bg-indigo-100 text-indigo-700',
};

function isExpiring(dateStr: string | null | undefined, days = 30): boolean {
  if (!dateStr) return false;
  const dt = new Date(dateStr).getTime();
  return dt - Date.now() < days * 86400_000;
}

export default function FleetListPage() {
  const moduleGate = useModuleGate('equipment_fleet');
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [items, setItems] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cu = getCurrentUser();
    if (!cu) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(cu.role)) { router.push('/dashboard/admin'); return; }
    setUser(cu);
    setAuthLoading(false);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    void fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchItems() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/fleet', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setItems(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900"><Spinner size="lg" brand /></div>;
  }

  if (moduleGate.blocked) return moduleGate.fallback;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
        <PageHeader
          backHref="/dashboard/admin"
          backLabel="Dashboard"
          title="Fleet"
          subtitle={`${items.length} vehicle${items.length === 1 ? '' : 's'}`}
          action={
            <Button href="/dashboard/admin/fleet/new" leftIcon={<Plus className="w-4 h-4" />}>
              New Vehicle
            </Button>
          }
        />

        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner size="lg" brand /></div>
        ) : items.length === 0 ? (
          <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/10">
            <EmptyState
              icon={Truck}
              title="No vehicles yet"
              description="Add your fleet to track registration, insurance, and status."
              action={
                <Button href="/dashboard/admin/fleet/new" variant="secondary" leftIcon={<Plus className="w-4 h-4" />}>
                  Add your first vehicle
                </Button>
              }
            />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {items.map((it) => {
              const display = it.short_name && it.unit_number ? `${it.short_name} #${it.unit_number}` : it.name;
              const regSoon = isExpiring(it.vehicle?.registration_expiry);
              const insSoon = isExpiring(it.vehicle?.insurance_expiry);
              return (
                <Link
                  key={it.id}
                  href={`/dashboard/admin/fleet/${it.id}`}
                  className="group bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-4 hover:border-blue-300 hover:shadow-md transition"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                      <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{display}</p>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition flex-shrink-0" />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                        {[it.vehicle?.year, it.make, it.model].filter(Boolean).join(' ') || it.name}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {it.vehicle?.license_plate && (
                          <span className="text-[10px] font-mono font-semibold text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                            {it.vehicle.license_plate}
                          </span>
                        )}
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_TONE[it.status] || STATUS_TONE.available}`}>
                          {(it.status || 'available').replace(/_/g, ' ')}
                        </span>
                        {(regSoon || insSoon) && (
                          <StatusBadge variant="warning" className="text-[10px] px-1.5 py-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {regSoon && insSoon ? 'reg + ins exp' : regSoon ? 'reg soon' : 'ins soon'}
                          </StatusBadge>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
