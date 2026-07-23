'use client';

export const dynamic = 'force-dynamic';

/**
 * Takeoffs — plan viewer + measuring.
 *
 * Architecture (docs/plans/TAKEOFFS_MODULE_PLAN.md):
 *  - pdf.js renders the current sheet to a canvas sized by zoom; the scroll
 *    container is the pan surface.
 *  - ONE SVG overlay with viewBox = PDF page space sits on the canvas; all
 *    geometry is stored/edited in page coordinates — the browser does the
 *    zoom math, measurements survive any renderer change.
 *  - Scale: calibrate-by-known-dimension is primary (title-block scales lie
 *    when sets print fit-to-page); named scales offered; measuring distances
 *    is blocked until the page has a scale.
 *  - Server recomputes every quantity on save.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Ruler, MousePointer2, Crosshair, Hash, Sparkles, Loader2,
  Trash2, Plus, ZoomIn, ZoomOut, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { takeoffsFetch, TAKEOFF_ROLES_CLIENT } from '@/components/takeoffs/api';
import {
  computeQuantity, feetPerPointFromScale, formatFeetInches, NAMED_SCALES,
  polylineLengthPt, snapToNamedScale, type TakeoffGeometry,
} from '@/lib/takeoffs/geometry';
import type { PDFDocumentProxy } from 'pdfjs-dist';

type Tool = 'select' | 'calibrate' | 'linear' | 'count';

interface PageRow {
  id: string; page_number: number; width_pt: number; height_pt: number;
  sheet_number: string | null; sheet_title: string | null; discipline: string | null;
  scale_feet_per_point: number | null; scale_label: string | null; ai_page_summary: string | null;
  user_unit: number;
}
interface ConditionRow {
  id: string; name: string; measure_type: 'count' | 'linear' | 'area'; unit: string;
  color: string; depth_in: number | null; core_diameter_in: number | null; surface: string | null;
}
interface MeasurementRow {
  id: string; condition_id: string; page_id: string; geometry: TakeoffGeometry;
  quantity: number; label: string | null;
}
interface DocPayload {
  document: { id: string; name: string; status: string; ai_scope_summary: any; ai_analyzed_at: string | null };
  pages: PageRow[];
  conditions: ConditionRow[];
  measurements: MeasurementRow[];
  fileUrl: string | null;
}

const MAX_CANVAS_PIXELS = 16_000_000;

export default function TakeoffViewerPage() {
  const params = useParams();
  const router = useRouter();
  const docId = params.id as string;

  const [payload, setPayload] = useState<DocPayload | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>('select');
  const [activeConditionId, setActiveConditionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [calibratePts, setCalibratePts] = useState<[number, number][]>([]);
  const [showCalibrateModal, setShowCalibrateModal] = useState(false);
  const [showConditionForm, setShowConditionForm] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cssSize, setCssSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Measured reactively — the container can be 0-wide in the commit where
  // the PDF lands (flex layout race), which produced negative canvas sizes.
  const [containerW, setContainerW] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [payload]);

  const page = payload?.pages[pageIdx] ?? null;
  const conditions = payload?.conditions ?? [];
  const activeCondition = conditions.find((c) => c.id === activeConditionId) ?? null;
  const pageMeasurements = useMemo(
    () => (payload && page ? payload.measurements.filter((m) => m.page_id === page.id) : []),
    [payload, page]
  );

  // ── Load document + PDF ──────────────────────────────────────────────────
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { router.push('/login'); return; }
    if (!TAKEOFF_ROLES_CLIENT.includes(user.role)) { router.push('/dashboard'); return; }
    (async () => {
      try {
        const data = await takeoffsFetch<DocPayload>(`/api/takeoffs/documents/${docId}`);
        setPayload(data);
        if (data.conditions.length > 0) setActiveConditionId(data.conditions[0].id);
        if (data.fileUrl) {
          const { loadPdf } = await import('@/lib/takeoffs/pdf-client');
          setPdf(await loadPdf(data.fileUrl));
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load document');
      }
    })();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // ── Render current sheet ─────────────────────────────────────────────────
  useEffect(() => {
    if (!pdf || !page || !canvasRef.current || containerW < 50) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfPage = await pdf.getPage(page.page_number);
        if (cancelled) return;
        const baseScale = (containerW - 16) / Number(page.width_pt);
        const scale = baseScale * zoom;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let renderScale = scale * dpr;
        const pixels = Number(page.width_pt) * Number(page.height_pt) * renderScale * renderScale;
        if (pixels > MAX_CANVAS_PIXELS) {
          renderScale = Math.sqrt(MAX_CANVAS_PIXELS / (Number(page.width_pt) * Number(page.height_pt)));
        }
        const viewport = pdfPage.getViewport({ scale: renderScale });
        const canvas = canvasRef.current!;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const cssW = Number(page.width_pt) * scale;
        const cssH = Number(page.height_pt) * scale;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        setCssSize({ w: cssW, h: cssH });
        renderTaskRef.current?.cancel?.();
        const task = pdfPage.render({ canvas, viewport } as any);
        renderTaskRef.current = task;
        await task.promise;
      } catch (e: any) {
        // RenderingCancelledException is normal on rapid zoom/page changes.
        if (e?.name !== 'RenderingCancelledException') {
          console.warn('[takeoff] render failed:', e?.message);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pdf, page, zoom, containerW]);

  // ── Pointer → page coordinates ───────────────────────────────────────────
  const toPageCoords = (e: React.MouseEvent): [number, number] | null => {
    if (!canvasRef.current || !page) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * Number(page.width_pt);
    const y = ((e.clientY - rect.top) / rect.height) * Number(page.height_pt);
    if (x < 0 || y < 0 || x > Number(page.width_pt) || y > Number(page.height_pt)) return null;
    return [x, y];
  };

  // ── Tool interactions ────────────────────────────────────────────────────
  const handleCanvasClick = async (e: React.MouseEvent) => {
    const pt = toPageCoords(e);
    if (!pt || !page) return;

    if (tool === 'calibrate') {
      const next = [...calibratePts, pt];
      setCalibratePts(next);
      if (next.length === 2) setShowCalibrateModal(true);
      return;
    }

    if (tool === 'linear') {
      if (!activeCondition || activeCondition.measure_type !== 'linear') {
        setError('Pick (or create) a LINEAR condition first — that is the bucket this measurement lands in.');
        return;
      }
      if (!page.scale_feet_per_point) {
        setError('This sheet has no scale yet. Use Calibrate first so distances are real.');
        setTool('calibrate');
        return;
      }
      setDraft((d) => [...d, pt]);
      return;
    }

    if (tool === 'count') {
      if (!activeCondition || activeCondition.measure_type !== 'count') {
        setError('Pick (or create) a COUNT condition first (e.g. "4in cores").');
        return;
      }
      const existing = pageMeasurements.find(
        (m) => m.condition_id === activeCondition.id && m.geometry.type === 'count'
      );
      try {
        setSaving(true);
        if (existing) {
          const geometry = { type: 'count' as const, points: [...existing.geometry.points, pt] };
          const updated = await takeoffsFetch<MeasurementRow>(`/api/takeoffs/measurements/${existing.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ geometry }),
          });
          setPayload((p) => p && { ...p, measurements: p.measurements.map((m) => (m.id === existing.id ? updated : m)) });
        } else {
          const created = await takeoffsFetch<MeasurementRow>('/api/takeoffs/measurements', {
            method: 'POST',
            body: JSON.stringify({
              condition_id: activeCondition.id,
              page_id: page.id,
              geometry: { type: 'count', points: [pt] },
            }),
          });
          setPayload((p) => p && { ...p, measurements: [...p.measurements, created] });
        }
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    setSelectedMeasurementId(null);
  };

  const finishLinear = async () => {
    if (!page || !activeCondition || draft.length < 2) { setDraft([]); return; }
    try {
      setSaving(true);
      const created = await takeoffsFetch<MeasurementRow>('/api/takeoffs/measurements', {
        method: 'POST',
        body: JSON.stringify({
          condition_id: activeCondition.id,
          page_id: page.id,
          geometry: { type: 'polyline', points: draft },
        }),
      });
      setPayload((p) => p && { ...p, measurements: [...p.measurements, created] });
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDraft([]);
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDraft([]); setCalibratePts([]); setSelectedMeasurementId(null); }
      if (e.key === 'Enter' && draft.length >= 2) finishLinear();
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMeasurementId) deleteMeasurement(selectedMeasurementId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, selectedMeasurementId, page?.id, activeConditionId]);

  const deleteMeasurement = async (id: string) => {
    try {
      await takeoffsFetch(`/api/takeoffs/measurements/${id}`, { method: 'DELETE' });
      setPayload((p) => p && { ...p, measurements: p.measurements.filter((m) => m.id !== id) });
      setSelectedMeasurementId(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ── Calibration ──────────────────────────────────────────────────────────
  const applyCalibration = async (feetPerPoint: number, label: string, applyToAll: boolean) => {
    if (!page || !payload) return;
    try {
      await takeoffsFetch(`/api/takeoffs/pages/${page.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ scale_feet_per_point: feetPerPoint, scale_label: label, apply_to_all: applyToAll }),
      });
      const data = await takeoffsFetch<DocPayload>(`/api/takeoffs/documents/${docId}`);
      setPayload(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCalibratePts([]);
      setShowCalibrateModal(false);
      setTool('select');
    }
  };

  // ── AI scope analysis ────────────────────────────────────────────────────
  const runAnalysis = async () => {
    setAnalyzing(true);
    setShowAiPanel(true);
    setError(null);
    try {
      await takeoffsFetch(`/api/takeoffs/documents/${docId}/analyze`, { method: 'POST' });
      pollRef.current = setInterval(async () => {
        try {
          const data = await takeoffsFetch<DocPayload>(`/api/takeoffs/documents/${docId}`);
          if (data.document.status === 'analyzed' || data.document.status === 'ready') {
            setPayload(data);
            if (data.document.status === 'analyzed') setAnalyzing(false);
            if (data.document.status === 'ready') { setAnalyzing(false); setError('Analysis did not finish — try again.'); }
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch { /* keep polling */ }
      }, 5000);
    } catch (e: any) {
      setAnalyzing(false);
      setError(e.message);
    }
  };

  const addSuggestedCondition = async (s: any) => {
    try {
      const created = await takeoffsFetch<ConditionRow>('/api/takeoffs/conditions', {
        method: 'POST',
        body: JSON.stringify({
          document_id: docId,
          name: s.name,
          measure_type: s.measure_type,
          surface: s.surface,
          depth_in: s.depth_in,
          core_diameter_in: s.core_diameter_in,
          color: s.measure_type === 'count' ? '#DC2626' : '#7C3AED',
        }),
      });
      setPayload((p) => p && { ...p, conditions: [...p.conditions, created] });
      setActiveConditionId(created.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ── Totals per condition ─────────────────────────────────────────────────
  const conditionTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const m of payload?.measurements ?? []) {
      totals[m.condition_id] = (totals[m.condition_id] ?? 0) + Number(m.quantity);
    }
    return totals;
  }, [payload?.measurements]);

  const draftLengthFt = page?.scale_feet_per_point && draft.length >= 2
    ? polylineLengthPt(cursor ? [...draft, cursor] : draft) * Number(page.scale_feet_per_point)
    : null;

  if (error && !payload) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <button onClick={() => router.push('/dashboard/takeoffs')} className="mt-4 text-violet-600 underline">
          Back to Takeoffs
        </button>
      </div>
    );
  }
  if (!payload) {
    return (
      <div className="p-20 text-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        <p className="mt-2 text-sm">Opening plan set…</p>
      </div>
    );
  }

  const doc = payload.document;
  const ai = doc.ai_scope_summary;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] min-h-0">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 flex-wrap">
        <button onClick={() => router.push('/dashboard/takeoffs')} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 min-h-[44px] min-w-[44px]" aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="font-semibold text-sm text-slate-900 dark:text-white truncate max-w-[200px]">{doc.name}</span>

        {/* Scale chip */}
        <button
          onClick={() => { setTool('calibrate'); setCalibratePts([]); }}
          className={`text-xs px-2.5 py-1.5 rounded-full font-medium border transition-colors ${
            page?.scale_feet_per_point
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300'
              : 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/40 dark:text-amber-300 animate-pulse'
          }`}
        >
          {page?.scale_feet_per_point ? (page.scale_label ?? 'Calibrated') : 'Scale not set — tap to calibrate'}
        </button>

        <div className="flex-1" />

        {/* Tools */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 rounded-xl p-1">
          {([
            { t: 'select' as Tool, icon: MousePointer2, label: 'Select' },
            { t: 'calibrate' as Tool, icon: Crosshair, label: 'Calibrate' },
            { t: 'linear' as Tool, icon: Ruler, label: 'Measure distance' },
            { t: 'count' as Tool, icon: Hash, label: 'Count' },
          ]).map(({ t, icon: Icon, label }) => (
            <button
              key={t}
              title={label}
              onClick={() => { setTool(t); setDraft([]); setCalibratePts([]); }}
              className={`p-2.5 rounded-lg min-h-[44px] min-w-[44px] transition-colors ${
                tool === t ? 'bg-violet-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-white/10'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 min-h-[44px] min-w-[44px]" aria-label="Zoom out"><ZoomOut className="w-4 h-4" /></button>
          <span className="text-xs text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(6, z * 1.25))} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 min-h-[44px] min-w-[44px]" aria-label="Zoom in"><ZoomIn className="w-4 h-4" /></button>
        </div>

        <button
          onClick={ai ? () => setShowAiPanel(true) : runAnalysis}
          disabled={analyzing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-semibold min-h-[44px] disabled:opacity-60"
        >
          {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {analyzing ? 'Analyzing…' : ai ? 'Scope analysis' : 'Analyze scope'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ── Pages sidebar ─────────────────────────────────────────────── */}
        <div className="w-44 shrink-0 border-r border-slate-200 dark:border-white/10 overflow-y-auto bg-white dark:bg-slate-900 hidden md:block">
          {payload.pages.map((p, i) => (
            <button
              key={p.id}
              onClick={() => { setPageIdx(i); setDraft([]); setSelectedMeasurementId(null); }}
              className={`w-full text-left px-3 py-2.5 border-b border-slate-100 dark:border-white/5 transition-colors ${
                i === pageIdx ? 'bg-violet-50 dark:bg-violet-500/10 border-l-2 border-l-violet-600' : 'hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                {p.sheet_number ?? `Page ${p.page_number}`}
              </p>
              {p.sheet_title && <p className="text-[10px] text-slate-500 truncate">{p.sheet_title}</p>}
              <p className="text-[10px] text-slate-400 mt-0.5">
                {p.scale_feet_per_point ? p.scale_label : 'no scale'}
              </p>
            </button>
          ))}
        </div>

        {/* ── Canvas ────────────────────────────────────────────────────── */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-slate-200 dark:bg-slate-950 p-2 relative">
          {/* Mobile page nav */}
          <div className="md:hidden flex items-center justify-center gap-3 mb-2">
            <button onClick={() => setPageIdx((i) => Math.max(0, i - 1))} className="p-2 bg-white rounded-lg min-h-[44px] min-w-[44px]" aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs text-slate-600 dark:text-slate-300">{pageIdx + 1} / {payload.pages.length}</span>
            <button onClick={() => setPageIdx((i) => Math.min(payload.pages.length - 1, i + 1))} className="p-2 bg-white rounded-lg min-h-[44px] min-w-[44px]" aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
          </div>

          <div className="relative inline-block shadow-xl" style={{ width: cssSize.w || undefined, height: cssSize.h || undefined }}>
            <canvas ref={canvasRef} className="block bg-white" />
            {page && cssSize.w > 0 && (
              <svg
                className="absolute inset-0"
                width={cssSize.w}
                height={cssSize.h}
                viewBox={`0 0 ${page.width_pt} ${page.height_pt}`}
                onClick={handleCanvasClick}
                onDoubleClick={(e) => { e.preventDefault(); if (tool === 'linear') finishLinear(); }}
                onMouseMove={(e) => { if (tool === 'linear' && draft.length > 0) setCursor(toPageCoords(e)); }}
                // pointerEvents 'all': an svg root is click-TRANSPARENT on empty
                // space by default (visiblePainted) — without this, every click
                // fell through to the canvas and no tool ever fired.
                style={{ cursor: tool === 'select' ? 'default' : 'crosshair', pointerEvents: 'all' }}
              >
                {/* Saved measurements */}
                {pageMeasurements.map((m) => {
                  const cond = conditions.find((c) => c.id === m.condition_id);
                  const color = cond?.color ?? '#7C3AED';
                  const selected = m.id === selectedMeasurementId;
                  if (m.geometry.type === 'polyline') {
                    const pts = m.geometry.points.map((p) => p.join(',')).join(' ');
                    return (
                      <g key={m.id}>
                        <polyline points={pts} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke' }}
                          onClick={(e) => { if (tool === 'select') { e.stopPropagation(); setSelectedMeasurementId(m.id); } }} />
                        <polyline points={pts} fill="none" stroke={selected ? '#0EA5E9' : color} strokeWidth={selected ? 4 : 2.5}
                          vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
                        {m.geometry.points.map((p, i) => (
                          <circle key={i} cx={p[0]} cy={p[1]} r={4} fill={selected ? '#0EA5E9' : color} pointerEvents="none" vectorEffect="non-scaling-stroke" />
                        ))}
                      </g>
                    );
                  }
                  return (
                    <g key={m.id}>
                      {m.geometry.points.map((p, i) => (
                        <g key={i} onClick={(e) => { if (tool === 'select') { e.stopPropagation(); setSelectedMeasurementId(m.id); } }} style={{ pointerEvents: 'all' }}>
                          <circle cx={p[0]} cy={p[1]} r={10} fill={color} opacity={selected ? 1 : 0.85} stroke="#fff" strokeWidth={2} />
                          <text x={p[0]} y={p[1] + 3.5} textAnchor="middle" fontSize={10} fill="#fff" fontWeight={700} pointerEvents="none">{i + 1}</text>
                        </g>
                      ))}
                    </g>
                  );
                })}

                {/* Draft polyline */}
                {draft.length > 0 && (
                  <g pointerEvents="none">
                    <polyline
                      points={(cursor ? [...draft, cursor] : draft).map((p) => p.join(',')).join(' ')}
                      fill="none" stroke={activeCondition?.color ?? '#0EA5E9'} strokeWidth={2.5}
                      strokeDasharray="6 4" vectorEffect="non-scaling-stroke"
                    />
                    {draft.map((p, i) => (
                      <circle key={i} cx={p[0]} cy={p[1]} r={4} fill={activeCondition?.color ?? '#0EA5E9'} />
                    ))}
                  </g>
                )}

                {/* Calibration points */}
                {calibratePts.map((p, i) => (
                  <g key={i} pointerEvents="none">
                    <circle cx={p[0]} cy={p[1]} r={7} fill="none" stroke="#F59E0B" strokeWidth={2.5} />
                    <circle cx={p[0]} cy={p[1]} r={1.8} fill="#F59E0B" />
                  </g>
                ))}
                {calibratePts.length === 2 && (
                  <line x1={calibratePts[0][0]} y1={calibratePts[0][1]} x2={calibratePts[1][0]} y2={calibratePts[1][1]}
                    stroke="#F59E0B" strokeWidth={2.5} strokeDasharray="8 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                )}
              </svg>
            )}
          </div>

          {/* Draft HUD */}
          {tool === 'linear' && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs px-4 py-2.5 rounded-full flex items-center gap-3 z-20">
              {draft.length === 0
                ? 'Tap along the cut line — Enter or double-tap to finish'
                : <>
                    <span className="font-bold">{draftLengthFt !== null ? formatFeetInches(draftLengthFt) : `${draft.length} pts`}</span>
                    <button onClick={finishLinear} disabled={draft.length < 2 || saving} className="bg-violet-600 px-3 py-1 rounded-full font-semibold disabled:opacity-50">Done</button>
                    <button onClick={() => setDraft([])} className="text-slate-300">Cancel</button>
                  </>}
            </div>
          )}
          {tool === 'calibrate' && calibratePts.length < 2 && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-xs px-4 py-2.5 rounded-full z-20">
              Tap the two ends of a printed dimension you trust ({calibratePts.length}/2)
            </div>
          )}
          {selectedMeasurementId && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs px-4 py-2 rounded-full flex items-center gap-3 z-20">
              Measurement selected
              <button onClick={() => deleteMeasurement(selectedMeasurementId)} className="bg-red-600 px-3 py-1 rounded-full font-semibold inline-flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          )}
        </div>

        {/* ── Conditions panel ──────────────────────────────────────────── */}
        <div className="w-64 shrink-0 border-l border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-y-auto hidden lg:flex lg:flex-col">
          <div className="px-3 py-2.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Scope buckets</span>
            <button onClick={() => setShowConditionForm(true)} className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10" aria-label="New condition">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {conditions.length === 0 && (
            <div className="p-4 text-center">
              <p className="text-xs text-slate-400 mb-2">No scope buckets yet.</p>
              <button onClick={() => setShowConditionForm(true)} className="text-xs text-violet-600 font-semibold">+ Create one (e.g. "Wall saw 12in")</button>
            </div>
          )}
          {conditions.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveConditionId(c.id)}
              className={`w-full text-left px-3 py-2.5 border-b border-slate-50 dark:border-white/5 ${
                c.id === activeConditionId ? 'bg-violet-50 dark:bg-violet-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="text-xs font-semibold text-slate-900 dark:text-white truncate flex-1">{c.name}</span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {c.measure_type === 'linear'
                    ? formatFeetInches(conditionTotals[c.id] ?? 0)
                    : `${Math.round(conditionTotals[c.id] ?? 0)} ${c.unit}`}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 ml-5">
                {c.measure_type}{c.surface ? ` · ${c.surface}` : ''}{c.depth_in ? ` · ${c.depth_in}" deep` : ''}{c.core_diameter_in ? ` · ${c.core_diameter_in}" dia` : ''}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Calibrate modal ─────────────────────────────────────────────── */}
      {showCalibrateModal && page && (
        <CalibrateModal
          userUnit={Number(page.user_unit) || 1}
          linePt={calibratePts.length === 2 ? polylineLengthPt(calibratePts as [number, number][]) : 0}
          onApply={applyCalibration}
          onClose={() => { setShowCalibrateModal(false); setCalibratePts([]); setTool('select'); }}
        />
      )}

      {/* ── New condition modal ─────────────────────────────────────────── */}
      {showConditionForm && (
        <ConditionForm
          onClose={() => setShowConditionForm(false)}
          onCreate={async (form) => {
            try {
              const created = await takeoffsFetch<ConditionRow>('/api/takeoffs/conditions', {
                method: 'POST',
                body: JSON.stringify({ document_id: docId, ...form }),
              });
              setPayload((p) => p && { ...p, conditions: [...p.conditions, created] });
              setActiveConditionId(created.id);
              setShowConditionForm(false);
            } catch (e: any) {
              setError(e.message);
            }
          }}
        />
      )}

      {/* ── AI panel ────────────────────────────────────────────────────── */}
      {showAiPanel && (
        <div className="fixed inset-0 bg-black/50 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={() => setShowAiPanel(false)}>
          <div className="bg-white dark:bg-slate-900 w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" /> Scope analysis
              </h3>
              <button onClick={() => setShowAiPanel(false)} className="p-2 min-h-[44px] min-w-[44px]" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            {analyzing && (
              <div className="py-10 text-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                <p className="text-sm">Reading every sheet for cutting &amp; coring scope…</p>
              </div>
            )}
            {!analyzing && ai && (
              <div className="space-y-5">
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{ai.documentSummary}</p>
                {Array.isArray(ai.keySheets) && ai.keySheets.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">Open these sheets first</p>
                    <div className="space-y-1.5">
                      {ai.keySheets.map((k: any, i: number) => {
                        const idx = payload.pages.findIndex((p) => p.page_number === k.page_number);
                        return (
                          <button key={i} onClick={() => { if (idx >= 0) { setPageIdx(idx); setShowAiPanel(false); } }}
                            className="w-full text-left px-3 py-2 rounded-xl bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 text-xs">
                            <span className="font-bold text-violet-700 dark:text-violet-300">
                              {payload.pages[idx]?.sheet_number ?? `Page ${k.page_number}`}
                            </span>
                            <span className="text-slate-600 dark:text-slate-300"> — {k.reason}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {Array.isArray(ai.suggestedConditions) && ai.suggestedConditions.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">Suggested scope buckets</p>
                    <div className="space-y-1.5">
                      {ai.suggestedConditions.map((s: any, i: number) => {
                        const exists = conditions.some((c) => c.name.toLowerCase() === (s.name ?? '').toLowerCase());
                        return (
                          <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-900 dark:text-white">{s.name} <span className="text-slate-400 font-normal">({s.measure_type})</span></p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{s.evidence}</p>
                            </div>
                            <button
                              onClick={() => addSuggestedCondition(s)}
                              disabled={exists}
                              className="text-xs font-semibold text-violet-600 disabled:text-slate-300 shrink-0 min-h-[44px] px-2"
                            >
                              {exists ? 'Added' : '+ Add'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-slate-400">
                  AI reads the sheets&apos; text to point you at scope — it never measures or counts for you. Verify everything on the drawing.
                </p>
              </div>
            )}
            {!analyzing && !ai && <p className="text-sm text-slate-500 py-6 text-center">No analysis yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Calibrate modal ──────────────────────────────────────────────────────────
function CalibrateModal({
  userUnit, linePt, onApply, onClose,
}: {
  userUnit: number;
  linePt: number;
  onApply: (feetPerPoint: number, label: string, applyToAll: boolean) => void;
  onClose: () => void;
}) {
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [namedIdx, setNamedIdx] = useState<number | ''>('');
  const [applyToAll, setApplyToAll] = useState(true);

  const knownFt = (parseFloat(feet) || 0) + (parseFloat(inches) || 0) / 12;
  const fromLine = linePt > 0 && knownFt > 0 ? knownFt / linePt : null;
  const snap = fromLine ? snapToNamedScale(fromLine, userUnit) : null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[95] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6">
        <h3 className="font-bold text-slate-900 dark:text-white mb-1">Set the sheet scale</h3>
        <p className="text-xs text-slate-500 mb-4">
          {linePt > 0
            ? 'Enter the real length of the dimension you just traced.'
            : 'Pick a named scale (or close and trace a printed dimension — more reliable).'}
        </p>

        {linePt > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <input type="number" min="0" inputMode="decimal" value={feet} onChange={(e) => setFeet(e.target.value)} placeholder="ft"
              className="w-20 px-3 py-3 rounded-xl border border-slate-300 dark:border-white/20 bg-transparent text-slate-900 dark:text-white text-base" />
            <span className="text-slate-400">ft</span>
            <input type="number" min="0" max="11" inputMode="decimal" value={inches} onChange={(e) => setInches(e.target.value)} placeholder="in"
              className="w-20 px-3 py-3 rounded-xl border border-slate-300 dark:border-white/20 bg-transparent text-slate-900 dark:text-white text-base" />
            <span className="text-slate-400">in</span>
          </div>
        )}
        {snap && (
          <p className="text-xs text-emerald-600 mb-3">Matches {snap.label} — will snap to it.</p>
        )}

        <div className="mb-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Or a named scale</p>
          <select
            value={namedIdx}
            onChange={(e) => setNamedIdx(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full px-3 py-3 rounded-xl border border-slate-300 dark:border-white/20 bg-transparent text-slate-900 dark:text-white text-sm"
          >
            <option value="">— select —</option>
            {NAMED_SCALES.map((s, i) => (
              <option key={s.label} value={i}>{s.label}</option>
            ))}
          </select>
          <p className="text-[10px] text-amber-600 mt-1">Named scales are only right when the set printed at 100% — tracing a dimension is safer.</p>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 mb-4 min-h-[44px]">
          <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} className="w-4 h-4" />
          Apply to all sheets in this set
        </label>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-3 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white text-sm font-semibold min-h-[48px]">Cancel</button>
          <button
            disabled={!(fromLine || namedIdx !== '')}
            onClick={() => {
              if (fromLine) {
                const final = snap ?? { label: 'Calibrated', feetPerPoint: fromLine };
                onApply(final.feetPerPoint, final.label, applyToAll);
              } else if (namedIdx !== '') {
                const s = NAMED_SCALES[namedIdx];
                onApply(feetPerPointFromScale(s.paperInches, s.realFeet, userUnit), s.label, applyToAll);
              }
            }}
            className="flex-1 px-4 py-3 rounded-xl bg-violet-600 text-white text-sm font-semibold min-h-[48px] disabled:opacity-50"
          >
            Set scale
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New condition form ───────────────────────────────────────────────────────
function ConditionForm({
  onClose, onCreate,
}: {
  onClose: () => void;
  onCreate: (form: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState('');
  const [measureType, setMeasureType] = useState<'linear' | 'count'>('linear');
  const [surface, setSurface] = useState<string>('');
  const [depthIn, setDepthIn] = useState('');
  const [coreDiaIn, setCoreDiaIn] = useState('');
  const [color, setColor] = useState('#7C3AED');

  return (
    <div className="fixed inset-0 bg-black/60 z-[95] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6">
        <h3 className="font-bold text-slate-900 dark:text-white mb-4">New scope bucket</h3>
        <input
          value={name} onChange={(e) => setName(e.target.value)} placeholder={measureType === 'count' ? 'e.g. 4in cores — 8in slab' : 'e.g. Wall saw — 12in'}
          className="w-full px-3 py-3 rounded-xl border border-slate-300 dark:border-white/20 bg-transparent text-slate-900 dark:text-white text-base mb-3"
        />
        <div className="grid grid-cols-2 gap-2 mb-3">
          {(['linear', 'count'] as const).map((t) => (
            <button key={t} onClick={() => setMeasureType(t)}
              className={`px-3 py-3 rounded-xl text-sm font-semibold min-h-[48px] border ${measureType === t ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-300 dark:border-white/20 text-slate-600 dark:text-slate-300'}`}>
              {t === 'linear' ? 'Distance (LF)' : 'Count (EA)'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <select value={surface} onChange={(e) => setSurface(e.target.value)}
            className="px-3 py-3 rounded-xl border border-slate-300 dark:border-white/20 bg-transparent text-sm text-slate-900 dark:text-white">
            <option value="">Surface…</option>
            <option value="slab">Slab</option>
            <option value="wall">Wall</option>
            <option value="curb">Curb</option>
            <option value="other">Other</option>
          </select>
          <input type="number" min="0" inputMode="decimal" value={depthIn} onChange={(e) => setDepthIn(e.target.value)} placeholder='Depth (in)'
            className="px-3 py-3 rounded-xl border border-slate-300 dark:border-white/20 bg-transparent text-sm text-slate-900 dark:text-white" />
        </div>
        {measureType === 'count' && (
          <input type="number" min="0" inputMode="decimal" value={coreDiaIn} onChange={(e) => setCoreDiaIn(e.target.value)} placeholder='Core diameter (in)'
            className="w-full px-3 py-3 rounded-xl border border-slate-300 dark:border-white/20 bg-transparent text-sm text-slate-900 dark:text-white mb-3" />
        )}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-slate-500">Color</span>
          {['#7C3AED', '#DC2626', '#0EA5E9', '#059669', '#D97706', '#DB2777'].map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={`color ${c}`}
              className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-slate-900 dark:border-white' : 'border-transparent'}`} style={{ background: c }} />
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-3 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white text-sm font-semibold min-h-[48px]">Cancel</button>
          <button
            disabled={!name.trim()}
            onClick={() => onCreate({
              name: name.trim(),
              measure_type: measureType,
              surface: surface || undefined,
              depth_in: depthIn ? Number(depthIn) : undefined,
              core_diameter_in: coreDiaIn ? Number(coreDiaIn) : undefined,
              color,
            })}
            className="flex-1 px-4 py-3 rounded-xl bg-violet-600 text-white text-sm font-semibold min-h-[48px] disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
