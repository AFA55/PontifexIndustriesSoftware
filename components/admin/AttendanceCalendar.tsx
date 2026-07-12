'use client';

/**
 * AttendanceCalendar — the founder's paper attendance tracker, live.
 * Rows = field crew, columns = days of the month. Each cell can carry ONE
 * attendance code (EA/UA/NCNS/... — lib/attendance-codes.ts) set by an admin
 * via the click popover. AUTO overlays come free from existing data:
 * worked (green underline), late (amber ring + auto "T" hint), approved
 * time off (blue fill). Weekends shaded like the paper sheet.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ATTENDANCE_CODES, attendanceCodeColor } from '@/lib/attendance-codes';

interface RosterRow { id: string; full_name: string; role: string }
interface CalData {
  month: string;
  roster: RosterRow[];
  events: Record<string, Record<string, { code: string; note: string | null }>>;
  auto: Record<string, Record<string, { worked?: boolean; late?: boolean; lateMinutes?: number; timeOff?: string }>>;
}

async function authed(input: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  return fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  });
}

const fmtMonth = (ym: string) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export default function AttendanceCalendar() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [data, setData] = useState<CalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState<{ userId: string; date: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const res = await authed(`/api/admin/attendance?month=${m}`);
      const json = await res.json();
      if (res.ok && json?.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(month); }, [month, load]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const setCode = async (code: string | null) => {
    if (!picker) return;
    setSaving(true);
    try {
      if (code) {
        await authed('/api/admin/attendance', { method: 'POST', body: JSON.stringify({ userId: picker.userId, date: picker.date, code }) });
      } else {
        await authed('/api/admin/attendance', { method: 'DELETE', body: JSON.stringify({ userId: picker.userId, date: picker.date }) });
      }
      setPicker(null);
      load(month);
    } finally {
      setSaving(false);
    }
  };

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const isWeekend = (day: number) => {
    const dow = new Date(y, m - 1, day).getDay();
    return dow === 0 || dow === 6;
  };
  const iso = (day: number) => `${month}-${String(day).padStart(2, '0')}`;

  return (
    <div>
      {/* Month nav + legend */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[160px] text-center text-sm font-bold text-gray-800 dark:text-white">{fmtMonth(month)}</span>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-gray-500 dark:text-white/50">
          {ATTENDANCE_CODES.slice(0, 8).map((c) => (
            <span key={c.code} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />{c.code}
            </span>
          ))}
          <span className="text-gray-400">· click any cell to mark</span>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-gray-300" /></div>
      ) : !data || data.roster.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">No active field crew found.</p>
      ) : (
        <div ref={gridRef} className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <table className="border-collapse text-xs" style={{ minWidth: 56 * daysInMonth + 160 }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-left font-bold text-gray-600 dark:border-white/10 dark:bg-[#131a2b] dark:text-white/70">
                  Employee
                </th>
                {days.map((d) => (
                  <th key={d} className={`border-b border-gray-200 px-1 py-2 text-center font-semibold dark:border-white/10 ${isWeekend(d) ? 'bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-white/30' : 'text-gray-500 dark:text-white/50'}`}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.roster.map((p) => (
                <tr key={p.id}>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-800 dark:border-white/10 dark:bg-[#0d1424] dark:text-white/85">
                    {p.full_name}
                  </td>
                  {days.map((d) => {
                    const dateIso = iso(d);
                    const ev = data.events[p.id]?.[dateIso];
                    const au = data.auto[p.id]?.[dateIso];
                    const weekend = isWeekend(d);
                    return (
                      <td key={d} className={`border-b border-gray-100 p-0 dark:border-white/5 ${weekend ? 'bg-gray-50 dark:bg-white/[0.04]' : ''}`}>
                        <button
                          type="button"
                          onClick={() => setPicker({ userId: p.id, date: dateIso, name: p.full_name })}
                          title={[
                            ev ? `${ev.code}${ev.note ? ` — ${ev.note}` : ''}` : null,
                            au?.late ? `Late ${au.lateMinutes ?? ''}m` : null,
                            au?.timeOff ? `Time off (${au.timeOff})` : null,
                            au?.worked ? 'Worked' : null,
                          ].filter(Boolean).join(' · ') || 'Mark attendance'}
                          className={`relative mx-auto flex h-9 w-full min-w-[52px] items-center justify-center transition-colors hover:bg-sky-50 dark:hover:bg-white/[0.06] ${au?.late && !ev ? 'ring-1 ring-inset ring-amber-400/70' : ''}`}
                        >
                          {ev ? (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-black text-white" style={{ background: attendanceCodeColor(ev.code) }}>
                              {ev.code}
                            </span>
                          ) : au?.timeOff ? (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-sky-700 bg-sky-100 dark:bg-sky-500/20 dark:text-sky-300">V</span>
                          ) : au?.late ? (
                            <span className="text-[10px] font-bold text-amber-600">T</span>
                          ) : null}
                          {au?.worked && <span className="absolute bottom-0.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded bg-emerald-400/70" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Code picker */}
      {picker && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setPicker(null)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 dark:bg-[#0d1424] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{picker.name}</p>
                <p className="text-xs text-gray-500 dark:text-white/50">
                  {new Date(`${picker.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <button type="button" onClick={() => setPicker(null)} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {ATTENDANCE_CODES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  disabled={saving}
                  onClick={() => setCode(c.code)}
                  className="flex min-h-[40px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-white/75 dark:hover:bg-white/[0.06]"
                >
                  <span className="inline-flex h-6 w-9 shrink-0 items-center justify-center rounded text-[10px] font-black text-white" style={{ background: c.color }}>
                    {c.code}
                  </span>
                  <span className="truncate">{c.label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => setCode(null)}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/[0.06]"
            >
              Clear this day
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
