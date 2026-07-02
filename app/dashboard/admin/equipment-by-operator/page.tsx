'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Search, Truck, User as UserIcon, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import { useModuleGate } from '@/components/ModuleGuard';
import {
  PageHeader, Card, EmptyState, StatCard, StatusBadge, Spinner,
} from '@/components/ui';

const ALLOWED_ROLES = ['shop_manager', 'admin', 'super_admin', 'operations_manager', 'supervisor'];

interface CheckoutRow {
  id: string;
  equipment_id: string;
  custodian_id: string | null;
  truck_equipment_id: string | null;
  checked_out_at: string;
  notes: string | null;
  blade_details: { serial_number: string | null; size: string | null; spec: string | null; photo_url: string | null } | null;
  equipment: { id: string; name: string; short_name: string | null; unit_number: string | null; asset_tag: string | null; kind?: string | null; category?: string | null } | null;
  truck: { id: string; name: string; short_name: string | null; unit_number: string | null } | null;
  custodian: { id: string; full_name: string; email: string } | null;
  job: { id: string; job_number: string | null; customer_name: string | null } | null;
}

interface OperatorGroup {
  operatorId: string;
  operatorName: string;
  truckNumber: string | null;
  items: CheckoutRow[];
}

/**
 * "Checked Out Equipment — By Operator"
 *
 * Read-only rollup of open equipment_checkouts (checked_in_at IS NULL) grouped
 * by custodian. Reuses the same /api/admin/equipment-checkouts?open=true
 * endpoint that drives the Check-In tab on Inventory Control — no new backend
 * needed for the grouping itself. Cross-references profiles.truck_number so a
 * shop manager can see "who has what, and which truck they're running" in one
 * screen without hopping between Team Profiles and Inventory Control.
 */
export default function EquipmentByOperatorPage() {
  const moduleGate = useModuleGate('inventory_control');
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [rows, setRows] = useState<CheckoutRow[]>([]);
  const [truckByOperator, setTruckByOperator] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const cu = getCurrentUser();
    if (!cu) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(cu.role)) { router.push('/dashboard/admin'); return; }
    setUser(cu);
    setAuthLoading(false);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const headers = { Authorization: `Bearer ${session.access_token}` };

      const [checkoutsRes, profilesRes] = await Promise.all([
        fetch('/api/admin/equipment-checkouts?open=true&limit=500', { headers }),
        fetch('/api/admin/profiles', { headers }),
      ]);

      if (checkoutsRes.ok) {
        const json = await checkoutsRes.json();
        setRows(json.data ?? []);
      }
      if (profilesRes.ok) {
        const json = await profilesRes.json();
        const map: Record<string, string | null> = {};
        for (const p of json.data ?? []) map[p.id] = p.truck_number ?? null;
        setTruckByOperator(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) void load(); }, [user, load]);

  const groups = useMemo<OperatorGroup[]>(() => {
    const byOperator = new Map<string, OperatorGroup>();
    for (const row of rows) {
      const opId = row.custodian?.id || row.custodian_id || 'unassigned';
      const opName = row.custodian?.full_name || 'Unassigned';
      if (!byOperator.has(opId)) {
        byOperator.set(opId, {
          operatorId: opId,
          operatorName: opName,
          truckNumber: truckByOperator[opId] ?? null,
          items: [],
        });
      }
      byOperator.get(opId)!.items.push(row);
    }
    return Array.from(byOperator.values()).sort((a, b) => a.operatorName.localeCompare(b.operatorName));
  }, [rows, truckByOperator]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const s = search.toLowerCase();
    return groups
      .map(g => ({
        ...g,
        items: g.items.filter(row => {
          const eq = row.equipment;
          const truckLabel = row.truck?.short_name && row.truck?.unit_number
            ? `${row.truck.short_name} #${row.truck.unit_number}` : row.truck?.name;
          const fields = [
            g.operatorName, g.truckNumber, eq?.name, eq?.short_name, eq?.unit_number, eq?.asset_tag, truckLabel,
          ];
          return fields.some(f => typeof f === 'string' && f.toLowerCase().includes(s));
        }),
      }))
      .filter(g => g.items.length > 0 || g.operatorName.toLowerCase().includes(s));
  }, [groups, search]);

  const totalItemsOut = rows.length;
  const operatorsWithGear = groups.filter(g => g.items.length > 0).length;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (moduleGate.blocked) return moduleGate.fallback;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-12">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <PageHeader
          title="Checked-Out Equipment — By Operator"
          subtitle="Who has what right now, grouped by custodian."
          backHref="/dashboard/admin/inventory-control"
          backLabel="Inventory Control"
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard label="Items Checked Out" value={totalItemsOut} icon={Package} />
          <StatCard label="Operators Holding Gear" value={operatorsWithGear} icon={UserIcon} />
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by operator, truck, equipment, or asset tag…"
            className="w-full pl-10 pr-4 py-3 min-h-[44px] rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand text-sm"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : filteredGroups.length === 0 ? (
          <Card noPadding>
            <EmptyState
              icon={Package}
              title="Nothing checked out"
              description="Once equipment is checked out to an operator or truck, it will show up here grouped by who has it."
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map(group => (
              <Card
                key={group.operatorId}
                title={group.operatorName}
                subtitle={group.truckNumber ? `Truck #${group.truckNumber}` : undefined}
                action={<StatusBadge variant="brand">{group.items.length} item{group.items.length === 1 ? '' : 's'}</StatusBadge>}
                noPadding
              >
                <div className="divide-y divide-gray-100 dark:divide-white/10">
                  {group.items.map(row => {
                    const eq = row.equipment;
                    const isBlade = eq?.kind === 'blade' || (eq as any)?.category === 'blade';
                    const display = eq?.short_name && eq?.unit_number ? `${eq.short_name} #${eq.unit_number}` : eq?.name ?? 'Unknown item';
                    const truckLabel = row.truck?.short_name && row.truck?.unit_number
                      ? `${row.truck.short_name} #${row.truck.unit_number}` : row.truck?.name;
                    return (
                      <div key={row.id} className="flex items-start gap-3 px-5 sm:px-6 py-3">
                        <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0">
                          {isBlade ? <Wrench className="w-4 h-4 text-brand" /> : <Package className="w-4 h-4 text-brand" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{display}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-1">
                            <span className="text-xs text-gray-500 dark:text-white/50">
                              Out since {new Date(row.checked_out_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                            {truckLabel && (
                              <span className="text-xs inline-flex items-center gap-1 text-gray-500 dark:text-white/50">
                                <Truck className="w-3 h-3" />{truckLabel}
                              </span>
                            )}
                            {row.job?.job_number && (
                              <StatusBadge variant="neutral">{row.job.job_number}</StatusBadge>
                            )}
                          </div>
                          {row.notes && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-white/50 italic truncate">&quot;{row.notes}&quot;</p>
                          )}
                          {row.blade_details && (row.blade_details.serial_number || row.blade_details.size || row.blade_details.spec) && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-white/50">
                              {[row.blade_details.serial_number && `S/N ${row.blade_details.serial_number}`, row.blade_details.size, row.blade_details.spec].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
