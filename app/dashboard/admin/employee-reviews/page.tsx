'use client';

export const dynamic = 'force-dynamic';

/**
 * /dashboard/admin/employee-reviews — "Previous Reviews".
 *
 * A read-only per-employee review history for the office AND for salespeople:
 * pick a person, see every grade they've received (supervisor walkthroughs,
 * customer surveys, crew feedback) plus their composite standing.
 *
 * Why its own page rather than bolting sales onto Operator Profiles: that page
 * shows date of birth, phone numbers and emergency contacts. Salespeople need
 * the REVIEWS, not the personnel file. This surface carries names + reviews and
 * nothing else, so read access can be granted without leaking PII.
 *
 * Server-side, GET /api/employee-reviews/[id] is the real gate — this guard is
 * only about not showing a dead page.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Award, Search, Loader2, Users, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import EmployeeReviews from '@/components/reviews/EmployeeReviews';

const ALLOWED_ROLES = ['admin', 'super_admin', 'operations_manager', 'salesman'];

interface PersonOpt {
  id: string;
  name: string;
  role: 'operator' | 'apprentice';
}

export default function EmployeeReviewsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [people, setPeople] = useState<PersonOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const cu = getCurrentUser();
    if (!cu) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(cu.role)) { router.push('/dashboard'); return; }
    setUser(cu);
    setAuthLoading(false);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/admin/schedule-board/operators', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = await res.json();
          const operators = (json.data?.operators ?? []) as Array<{ id: string; name?: string; full_name?: string }>;
          const helpers = (json.data?.helpers ?? []) as Array<{ id: string; name?: string; full_name?: string }>;
          setPeople(
            [
              ...operators.map((o) => ({ id: o.id, name: o.name || o.full_name || 'Operator', role: 'operator' as const })),
              ...helpers.map((h) => ({ id: h.id, name: h.name || h.full_name || 'Helper', role: 'apprentice' as const })),
            ].sort((a, b) => a.name.localeCompare(b.name))
          );
        }
      } catch {
        /* leave the list empty — the empty state explains it */
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.name.toLowerCase().includes(q));
  }, [people, search]);

  const selected = people.find((p) => p.id === selectedId) ?? null;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-gray-600 dark:text-slate-300 hover:text-brand"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand to-brand-secondary flex items-center justify-center shadow-lg shadow-brand/30">
            <Award className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Previous Reviews</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Every grade an employee has received — supervisor walkthroughs, customer surveys and crew feedback.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] gap-5 items-start">
          {/* People picker */}
          <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find an employee…"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-base sm:text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-brand"
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400 dark:text-slate-500">
                <Users className="w-8 h-8 mx-auto mb-2 text-gray-200 dark:text-slate-600" />
                {people.length === 0 ? 'No employees found.' : 'No one matches that search.'}
              </div>
            ) : (
              <div className="space-y-1 max-h-[60vh] overflow-y-auto -mx-1 px-1">
                {filtered.map((p) => {
                  const active = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={`w-full min-h-[44px] flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition ${
                        active
                          ? 'bg-brand/10 dark:bg-brand/20 text-brand font-semibold'
                          : 'text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="truncate">
                        {p.name}
                        {p.role === 'apprentice' && (
                          <span className="ml-1.5 text-[11px] font-normal text-gray-400 dark:text-slate-500">Helper</span>
                        )}
                      </span>
                      <ChevronRight className={`w-4 h-4 flex-shrink-0 ${active ? 'text-brand' : 'text-gray-300 dark:text-slate-600'}`} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Review history */}
          {selected ? (
            <EmployeeReviews key={selected.id} employeeId={selected.id} variant="management" />
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 dark:border-slate-700 bg-white/50 dark:bg-slate-800/40 p-10 text-center">
              <Award className="w-10 h-10 mx-auto mb-3 text-gray-200 dark:text-slate-600" />
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Pick an employee to see their review history and overall standing.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
