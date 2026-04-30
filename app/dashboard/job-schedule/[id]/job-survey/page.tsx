'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft,
  Home,
  ClipboardList,
  Users,
  Zap,
  MapPin,
  Wrench,
  MessageSquare,
  CheckCircle,
  Loader2,
  Drill,
  Scissors,
  Cable,
  Droplets,
  Truck,
  ListChecks,
} from 'lucide-react';
import { DarkModeIconToggle } from '@/components/ui/DarkModeToggle';

// Equipment category detection from work items
function getEquipmentCategories(items: any[]): string[] {
  const categories = new Set<string>();
  for (const item of items) {
    const name = (item.name || '').toUpperCase();
    if (name.includes('WALL SAW')) categories.add('wall_saw');
    if (name.includes('SLAB SAW') && !name.includes('ELECTRIC')) categories.add('track_saw');
    if (name.includes('ELECTRIC SLAB SAW')) categories.add('efs');
    if (name.includes('CORE DRILL') || name.includes('HYDRAULIC CORE DRILL')) categories.add('core_drill');
    if (name.includes('HAND SAW') || name.includes('FLUSH CUT') || name.includes('PUSH SAW')) categories.add('hand_saw');
    if (name.includes('CHAIN SAW')) categories.add('chain_saw');
    if (name.includes('WIRE SAW')) categories.add('wire_saw');
    if (name.includes('RING SAW')) categories.add('ring_saw');
  }
  // Group DFS/EFS together
  if (categories.has('track_saw') || categories.has('efs')) {
    categories.add('dfs_efs');
  }
  return Array.from(categories);
}

// Human-readable labels
const EQUIPMENT_LABELS: Record<string, string> = {
  wall_saw: 'Wall Saw',
  track_saw: 'Track Saw (Slab Saw)',
  efs: 'Electric Floor Saw',
  core_drill: 'Core Drill',
  hand_saw: 'Hand / Push Saw',
  chain_saw: 'Chain Saw',
  wire_saw: 'Wire Saw',
  ring_saw: 'Ring Saw',
  dfs_efs: 'Floor Sawing (DFS/EFS)',
};

// Lucide icon per equipment category (approximations)
const EQUIPMENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  wall_saw: Scissors,
  track_saw: Scissors,
  efs: Scissors,
  core_drill: Drill,
  hand_saw: Scissors,
  chain_saw: Scissors,
  wire_saw: Cable,
  ring_saw: Scissors,
  dfs_efs: Scissors,
};

type RatingTone = 'rose' | 'amber' | 'emerald';
function ratingTone(n: number): RatingTone {
  if (n <= 2) return 'rose';
  if (n <= 5) return 'amber';
  return 'emerald';
}
function ratingLabel(n: number): string {
  if (n >= 8) return 'Excellent';
  if (n >= 6) return 'Good';
  if (n >= 4) return 'Fair';
  if (n >= 1) return 'Needs Improvement';
  return '';
}

export default function JobSurveyPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [jobNumber, setJobNumber] = useState('');

  // Work items from localStorage
  const [workItems, setWorkItems] = useState<any[]>([]);
  const [equipmentCategories, setEquipmentCategories] = useState<string[]>([]);

  // Helper rating
  const [helperRating, setHelperRating] = useState<number>(0);
  const [helperNotes, setHelperNotes] = useState('');

  // Universal questions
  const [powerDistanceFt, setPowerDistanceFt] = useState('');
  const [accessibilityRating, setAccessibilityRating] = useState<number>(0);

  // Equipment-specific questions
  const [equipmentQuestions, setEquipmentQuestions] = useState<Record<string, any>>({});

  // Additional notes
  const [additionalNotes, setAdditionalNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load work performed from localStorage
      const stored = localStorage.getItem(`work-performed-${jobId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        setWorkItems(parsed.items || []);
        const cats = getEquipmentCategories(parsed.items || []);
        setEquipmentCategories(cats);
        // Initialize equipment questions for each category
        const initial: Record<string, any> = {};
        for (const cat of cats) {
          initial[cat] = {};
        }
        setEquipmentQuestions(initial);
      }

      // Get job number
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const res = await fetch(`/api/job-orders/${jobId}/survey`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data?.job_number) setJobNumber(json.data.job_number);
        // If survey already submitted, prefill
        if (json.data?.job_survey) {
          const s = json.data.job_survey;
          if (s.helper_rating) setHelperRating(s.helper_rating);
          if (s.helper_notes) setHelperNotes(s.helper_notes);
          if (s.power_distance_ft) setPowerDistanceFt(String(s.power_distance_ft));
          if (s.accessibility_rating) setAccessibilityRating(s.accessibility_rating);
          if (s.equipment_questions) setEquipmentQuestions(s.equipment_questions);
          if (s.additional_notes) setAdditionalNotes(s.additional_notes);
        }
      }
    } catch (err) {
      console.error('Error loading survey data:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateEquipmentField = (category: string, field: string, value: any) => {
    setEquipmentQuestions(prev => ({
      ...prev,
      [category]: { ...prev[category], [field]: value },
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired. Please log in.');
        return;
      }

      const surveyPayload = {
        helper_rating: helperRating || null,
        helper_notes: helperNotes || null,
        power_distance_ft: powerDistanceFt ? parseFloat(powerDistanceFt) : null,
        accessibility_rating: accessibilityRating || null,
        equipment_questions: equipmentQuestions,
        additional_notes: additionalNotes || null,
        work_items_used: workItems.map(i => i.name),
      };

      // Save survey via API
      const res = await fetch(`/api/job-orders/${jobId}/survey`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(surveyPayload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Error saving survey: ${err.error || 'Unknown error'}`);
        setSubmitting(false);
        return;
      }

      // Mark job as completed
      try {
        await fetch(`/api/job-orders/${jobId}/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ status: 'completed' }),
        });
      } catch (completeErr) {
        // silent
      }

      // Navigate to my-jobs
      router.push('/dashboard/my-jobs');
    } catch (error) {
      console.error('Error submitting survey:', error);
      alert('Failed to submit survey. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Determine which equipment-specific sections to show
  const hasWallSaw = equipmentCategories.includes('wall_saw');
  const hasTrackSaw = equipmentCategories.includes('track_saw');
  const hasCoreDrill = equipmentCategories.includes('core_drill');
  const hasHandSaw = equipmentCategories.includes('hand_saw') || equipmentCategories.includes('chain_saw');
  const hasDfsEfs = equipmentCategories.includes('dfs_efs');
  const hasWireSaw = equipmentCategories.includes('wire_saw');

  // ─── Section completion (for progress indicator) ─────────────────────────
  // Equipment section: a category counts as "filled" if any of its fields has a value
  const equipmentSectionFilled = useMemo(() => {
    if (equipmentCategories.length === 0) return false;
    // count "core" categories shown in UI (avoid double counting hand/chain shown together)
    const shown = [
      hasWallSaw && 'wall_saw',
      hasTrackSaw && 'track_saw',
      hasCoreDrill && 'core_drill',
      hasHandSaw && 'hand_saw',
      hasDfsEfs && 'dfs_efs',
      hasWireSaw && 'wire_saw',
    ].filter(Boolean) as string[];
    if (shown.length === 0) return false;
    return shown.every(cat => {
      const obj = equipmentQuestions[cat] || {};
      return Object.values(obj).some(v => v !== undefined && v !== '' && v !== null);
    });
  }, [equipmentCategories, equipmentQuestions, hasWallSaw, hasTrackSaw, hasCoreDrill, hasHandSaw, hasDfsEfs, hasWireSaw]);

  const sections = useMemo(() => {
    const list: { key: string; label: string; filled: boolean }[] = [
      { key: 'helper', label: 'Helper Rating', filled: helperRating > 0 },
      {
        key: 'general',
        label: 'General Jobsite',
        filled: !!powerDistanceFt && accessibilityRating > 0,
      },
    ];
    if (equipmentCategories.length > 0) {
      list.push({ key: 'equipment', label: 'Equipment Details', filled: equipmentSectionFilled });
    }
    list.push({ key: 'notes', label: 'Additional Notes', filled: additionalNotes.trim().length > 0 });
    return list;
  }, [helperRating, powerDistanceFt, accessibilityRating, equipmentCategories.length, equipmentSectionFilled, additionalNotes]);

  const filledCount = sections.filter(s => s.filled).length;
  const totalSections = sections.length;
  const progressPct = Math.round((filledCount / totalSections) * 100);

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 dark:text-purple-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-white/60 font-medium">Loading survey...</p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618]">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-white/[0.03] border-b border-gray-200 dark:border-white/10 shadow-sm">
        {/* Violet→Indigo accent stripe */}
        <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-600" />
        <div className="container mx-auto px-4 py-3 max-w-lg">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/job-schedule/${jobId}/work-performed`}
              className="p-2 bg-gray-100 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-all"
              aria-label="Back to Work Performed"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-white" />
            </Link>
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              title="Dashboard"
              aria-label="Go to dashboard"
            >
              <Home className="w-5 h-5 text-gray-600 dark:text-white" />
            </button>
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">Job Survey</h1>
              <p className="text-gray-500 dark:text-white/50 text-xs truncate">
                {jobNumber ? `Job #${jobNumber}` : 'Complete before finishing'}
              </p>
            </div>
            <div className="flex-shrink-0">
              <DarkModeIconToggle />
            </div>
          </div>

          {/* Progress indicator */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-white/50">
                Progress
              </span>
              <span className="text-xs font-bold text-gray-700 dark:text-white/80">
                {filledCount} / {totalSections} {filledCount === totalSections ? 'complete' : 'sections'}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-600 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="container mx-auto px-4 py-5 max-w-lg space-y-4 pb-32">

        {/* ─── Section: Helper Rating ─────────────────────────────────────── */}
        <section className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Rate Your Helper</h2>
              <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">How did your team member perform today?</p>
            </div>
            {helperRating > 0 && (
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${
                ratingTone(helperRating) === 'rose'
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                  : ratingTone(helperRating) === 'amber'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
              }`}>
                {helperRating}/10 · {ratingLabel(helperRating)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-5 gap-1.5 mb-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
              const selected = helperRating === n;
              const tone = ratingTone(n);
              const selectedClass =
                tone === 'rose'
                  ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg ring-2 ring-rose-300 dark:ring-rose-400/40'
                  : tone === 'amber'
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg ring-2 ring-amber-300 dark:ring-amber-400/40'
                  : 'bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg ring-2 ring-emerald-300 dark:ring-emerald-400/40';
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setHelperRating(n)}
                  className={`min-h-[44px] rounded-xl text-sm font-bold transition-all ${
                    selected
                      ? selectedClass
                      : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/70 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300 border border-gray-200 dark:border-white/10'
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <textarea
            value={helperNotes}
            onChange={(e) => setHelperNotes(e.target.value)}
            placeholder="Optional notes about helper performance..."
            className="w-full px-3 py-3 border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none resize-none transition"
            rows={2}
          />
        </section>

        {/* ─── Section: General Jobsite Info ──────────────────────────────── */}
        <section className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-5 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">General Jobsite Info</h2>
              <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">Universal questions for any jobsite</p>
            </div>
          </div>

          {/* Power Distance */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-white/70 mb-2 uppercase tracking-wide">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              How far was power? (ft)
            </label>
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={powerDistanceFt}
                onChange={(e) => setPowerDistanceFt(e.target.value)}
                placeholder="e.g., 50"
                className="w-full min-h-[48px] px-4 pr-12 border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] rounded-xl text-base text-gray-900 dark:text-white font-semibold placeholder-gray-400 dark:placeholder-white/40 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 dark:text-white/40 pointer-events-none">
                ft
              </span>
            </div>
          </div>

          {/* Accessibility Rating */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700 dark:text-white/70 uppercase tracking-wide">
                Job Accessibility
              </label>
              {accessibilityRating > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  // For accessibility, low = easy (good), high = difficult (bad)
                  accessibilityRating <= 3
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : accessibilityRating <= 6
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                }`}>
                  {accessibilityRating}/10
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-white/40 mb-2">1 = easy access, 10 = very difficult</p>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
                const selected = accessibilityRating === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setAccessibilityRating(n)}
                    className={`min-h-[44px] rounded-xl text-sm font-bold transition-all ${
                      selected
                        ? 'bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg ring-2 ring-sky-300 dark:ring-sky-400/40'
                        : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/70 hover:bg-sky-50 dark:hover:bg-sky-500/10 hover:text-sky-700 dark:hover:text-sky-300 border border-gray-200 dark:border-white/10'
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Section: Equipment-Specific Details ────────────────────────── */}
        {equipmentCategories.length > 0 && (
          <section className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300 flex items-center justify-center flex-shrink-0">
                <Wrench className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Equipment Details</h2>
                <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">Based on the work you performed</p>
              </div>
            </div>

            {/* Equipment thumbnails (detected categories) */}
            <div className="flex flex-wrap gap-2 mb-5">
              {equipmentCategories.map((cat) => {
                const Icon = EQUIPMENT_ICONS[cat] || Wrench;
                return (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30 text-violet-700 dark:text-violet-300 text-[11px] font-semibold"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {EQUIPMENT_LABELS[cat] || cat}
                  </span>
                );
              })}
            </div>

            <div className="space-y-4">
              {/* Wall Saw */}
              {hasWallSaw && (
                <EquipmentCard
                  title="Wall Saw"
                  Icon={EQUIPMENT_ICONS.wall_saw || Wrench}
                  tone="violet"
                >
                  <NumberField
                    label="480 cord used (ft)"
                    suffix="ft"
                    tone="violet"
                    value={equipmentQuestions.wall_saw?.cord_480_ft ?? ''}
                    onChange={(v) => updateEquipmentField('wall_saw', 'cord_480_ft', v)}
                    placeholder="e.g., 100"
                  />
                  <NumberField
                    label="Water distance (ft)"
                    suffix="ft"
                    tone="violet"
                    value={equipmentQuestions.wall_saw?.water_distance_ft ?? ''}
                    onChange={(v) => updateEquipmentField('wall_saw', 'water_distance_ft', v)}
                    placeholder="e.g., 30"
                  />
                  <WaterSourceField
                    tone="violet"
                    value={equipmentQuestions.wall_saw?.water_source}
                    onChange={(v) => updateEquipmentField('wall_saw', 'water_source', v)}
                  />
                </EquipmentCard>
              )}

              {/* Track Saw (Slab Saw) */}
              {hasTrackSaw && (
                <EquipmentCard
                  title="Track Saw (Slab Saw)"
                  Icon={EQUIPMENT_ICONS.track_saw || Wrench}
                  tone="sky"
                >
                  <NumberField
                    label="Hydraulic hose used (ft)"
                    suffix="ft"
                    tone="sky"
                    value={equipmentQuestions.track_saw?.hydraulic_hose_ft ?? ''}
                    onChange={(v) => updateEquipmentField('track_saw', 'hydraulic_hose_ft', v)}
                    placeholder="e.g., 50"
                  />
                  <NumberField
                    label="Water distance (ft)"
                    suffix="ft"
                    tone="sky"
                    value={equipmentQuestions.track_saw?.water_distance_ft ?? ''}
                    onChange={(v) => updateEquipmentField('track_saw', 'water_distance_ft', v)}
                    placeholder="e.g., 30"
                  />
                  <WaterSourceField
                    tone="sky"
                    value={equipmentQuestions.track_saw?.water_source}
                    onChange={(v) => updateEquipmentField('track_saw', 'water_source', v)}
                  />
                </EquipmentCard>
              )}

              {/* Core Drill */}
              {hasCoreDrill && (
                <EquipmentCard
                  title="Core Drill"
                  Icon={EQUIPMENT_ICONS.core_drill || Drill}
                  tone="amber"
                >
                  <YesNoField
                    label="Did you use a pump can?"
                    tone="amber"
                    value={equipmentQuestions.core_drill?.pump_can_used}
                    onChange={(v) => updateEquipmentField('core_drill', 'pump_can_used', v)}
                  />
                  {equipmentQuestions.core_drill?.pump_can_used === false && (
                    <>
                      <NumberField
                        label="Water distance (ft)"
                        suffix="ft"
                        tone="amber"
                        value={equipmentQuestions.core_drill?.water_distance_ft ?? ''}
                        onChange={(v) => updateEquipmentField('core_drill', 'water_distance_ft', v)}
                        placeholder="e.g., 20"
                      />
                      <WaterSourceField
                        tone="amber"
                        value={equipmentQuestions.core_drill?.water_source}
                        onChange={(v) => updateEquipmentField('core_drill', 'water_source', v)}
                      />
                    </>
                  )}
                </EquipmentCard>
              )}

              {/* Hand Saw / Push Saw / Chain Saw */}
              {hasHandSaw && (
                <EquipmentCard
                  title="Hand / Push / Chain Saw"
                  Icon={EQUIPMENT_ICONS.hand_saw || Scissors}
                  tone="rose"
                >
                  <NumberField
                    label="Hydraulic hose used (ft)"
                    suffix="ft"
                    tone="rose"
                    value={equipmentQuestions.hand_saw?.hydraulic_hose_ft ?? ''}
                    onChange={(v) => updateEquipmentField('hand_saw', 'hydraulic_hose_ft', v)}
                    placeholder="e.g., 25"
                  />
                </EquipmentCard>
              )}

              {/* DFS / EFS */}
              {hasDfsEfs && (
                <EquipmentCard
                  title="Floor Sawing (DFS/EFS)"
                  Icon={EQUIPMENT_ICONS.dfs_efs || Scissors}
                  tone="teal"
                >
                  <NumberField
                    label="Water hose ran (ft)"
                    suffix="ft"
                    tone="teal"
                    value={equipmentQuestions.dfs_efs?.water_hose_ft ?? ''}
                    onChange={(v) => updateEquipmentField('dfs_efs', 'water_hose_ft', v)}
                    placeholder="e.g., 40"
                  />
                </EquipmentCard>
              )}

              {/* Wire Saw */}
              {hasWireSaw && (
                <EquipmentCard
                  title="Wire Saw"
                  Icon={EQUIPMENT_ICONS.wire_saw || Cable}
                  tone="indigo"
                >
                  <NumberField
                    label="Water distance (ft)"
                    suffix="ft"
                    tone="indigo"
                    value={equipmentQuestions.wire_saw?.water_distance_ft ?? ''}
                    onChange={(v) => updateEquipmentField('wire_saw', 'water_distance_ft', v)}
                    placeholder="e.g., 30"
                  />
                  <WaterSourceField
                    tone="indigo"
                    value={equipmentQuestions.wire_saw?.water_source}
                    onChange={(v) => updateEquipmentField('wire_saw', 'water_source', v)}
                  />
                </EquipmentCard>
              )}
            </div>
          </section>
        )}

        {/* ─── Section: Additional Notes ──────────────────────────────────── */}
        <section className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Additional Notes</h2>
              <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">Anything else worth flagging?</p>
            </div>
          </div>
          <textarea
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            placeholder="Any other notes about the job..."
            className="w-full px-3 py-3 border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none resize-none transition"
            rows={3}
          />
        </section>

        {/* ─── Summary card (review before submit) ────────────────────────── */}
        <section className="bg-gradient-to-br from-violet-50 via-white to-indigo-50 dark:from-violet-500/10 dark:via-white/[0.03] dark:to-indigo-500/10 rounded-2xl shadow-sm border border-violet-200/60 dark:border-violet-500/20 p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow">
              <ListChecks className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Review Your Survey</h2>
              <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">Quick summary before you submit</p>
            </div>
          </div>

          <dl className="space-y-2 text-sm">
            <SummaryRow
              label="Helper rating"
              value={helperRating > 0 ? `${helperRating}/10 · ${ratingLabel(helperRating)}` : 'Not rated'}
              filled={helperRating > 0}
            />
            <SummaryRow
              label="Power distance"
              value={powerDistanceFt ? `${powerDistanceFt} ft` : 'Not set'}
              filled={!!powerDistanceFt}
            />
            <SummaryRow
              label="Accessibility"
              value={accessibilityRating > 0 ? `${accessibilityRating}/10` : 'Not rated'}
              filled={accessibilityRating > 0}
            />
            <SummaryRow
              label="Equipment categories"
              value={
                equipmentCategories.length > 0
                  ? equipmentCategories.map(c => EQUIPMENT_LABELS[c] || c).join(', ')
                  : 'None detected'
              }
              filled={equipmentCategories.length > 0}
            />
            <SummaryRow
              label="Additional notes"
              value={additionalNotes.trim() ? `${additionalNotes.trim().length} chars` : 'None'}
              filled={additionalNotes.trim().length > 0}
            />
          </dl>
        </section>
      </div>

      {/* Fixed Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-[#0b0618]/95 backdrop-blur-lg border-t border-gray-200 dark:border-white/10 p-4 pb-6 z-50">
        <div className="container mx-auto max-w-lg flex gap-3">
          <button
            onClick={() => router.push(`/dashboard/job-schedule/${jobId}/work-performed`)}
            className="flex-shrink-0 min-h-[48px] px-5 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-all font-semibold text-sm border border-gray-200 dark:border-white/10"
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`flex-1 min-h-[48px] rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${
              submitting
                ? 'bg-gray-300 dark:bg-white/10 text-gray-500 dark:text-white/40 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white hover:shadow-xl'
            }`}
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Complete Job &amp; Submit
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   Local helper components (defined below the page component for readability)
   ────────────────────────────────────────────────────────────────────────────── */

type Tone = 'violet' | 'sky' | 'amber' | 'rose' | 'teal' | 'indigo';

const TONE_STYLES: Record<Tone, {
  cardBg: string;
  cardBorder: string;
  iconWrap: string;
  title: string;
  inputFocus: string;
  selectedBtn: string;
}> = {
  violet: {
    cardBg: 'bg-violet-50/60 dark:bg-violet-500/[0.07]',
    cardBorder: 'border-violet-200 dark:border-violet-500/30',
    iconWrap: 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300',
    title: 'text-violet-800 dark:text-violet-200',
    inputFocus: 'focus:border-violet-500 focus:ring-violet-500/20',
    selectedBtn: 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow ring-2 ring-violet-300 dark:ring-violet-400/40',
  },
  sky: {
    cardBg: 'bg-sky-50/60 dark:bg-sky-500/[0.07]',
    cardBorder: 'border-sky-200 dark:border-sky-500/30',
    iconWrap: 'bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300',
    title: 'text-sky-800 dark:text-sky-200',
    inputFocus: 'focus:border-sky-500 focus:ring-sky-500/20',
    selectedBtn: 'bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow ring-2 ring-sky-300 dark:ring-sky-400/40',
  },
  amber: {
    cardBg: 'bg-amber-50/60 dark:bg-amber-500/[0.07]',
    cardBorder: 'border-amber-200 dark:border-amber-500/30',
    iconWrap: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300',
    title: 'text-amber-800 dark:text-amber-200',
    inputFocus: 'focus:border-amber-500 focus:ring-amber-500/20',
    selectedBtn: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow ring-2 ring-amber-300 dark:ring-amber-400/40',
  },
  rose: {
    cardBg: 'bg-rose-50/60 dark:bg-rose-500/[0.07]',
    cardBorder: 'border-rose-200 dark:border-rose-500/30',
    iconWrap: 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300',
    title: 'text-rose-800 dark:text-rose-200',
    inputFocus: 'focus:border-rose-500 focus:ring-rose-500/20',
    selectedBtn: 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow ring-2 ring-rose-300 dark:ring-rose-400/40',
  },
  teal: {
    cardBg: 'bg-teal-50/60 dark:bg-teal-500/[0.07]',
    cardBorder: 'border-teal-200 dark:border-teal-500/30',
    iconWrap: 'bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-300',
    title: 'text-teal-800 dark:text-teal-200',
    inputFocus: 'focus:border-teal-500 focus:ring-teal-500/20',
    selectedBtn: 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow ring-2 ring-teal-300 dark:ring-teal-400/40',
  },
  indigo: {
    cardBg: 'bg-indigo-50/60 dark:bg-indigo-500/[0.07]',
    cardBorder: 'border-indigo-200 dark:border-indigo-500/30',
    iconWrap: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300',
    title: 'text-indigo-800 dark:text-indigo-200',
    inputFocus: 'focus:border-indigo-500 focus:ring-indigo-500/20',
    selectedBtn: 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow ring-2 ring-indigo-300 dark:ring-indigo-400/40',
  },
};

function EquipmentCard({
  title,
  Icon,
  tone,
  children,
}: {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  children: React.ReactNode;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div className={`rounded-xl border ${t.cardBorder} ${t.cardBg} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-7 h-7 rounded-lg ${t.iconWrap} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-4 h-4" />
        </span>
        <h3 className={`text-sm font-bold ${t.title}`}>{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  tone,
}: {
  label: string;
  value: number | string;
  onChange: (v: number) => void;
  placeholder?: string;
  suffix?: string;
  tone: Tone;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 dark:text-white/70 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          min="0"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={`w-full min-h-[48px] px-3 ${suffix ? 'pr-10' : ''} border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] rounded-xl text-base text-gray-900 dark:text-white font-semibold placeholder-gray-400 dark:placeholder-white/40 ${t.inputFocus} focus:ring-2 focus:outline-none transition`}
          placeholder={placeholder}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 dark:text-white/40 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function YesNoField({
  label,
  value,
  onChange,
  tone,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  tone: Tone;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 dark:text-white/70 mb-1.5">{label}</label>
      <div className="flex gap-2">
        {[true, false].map(opt => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            className={`flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-all ${
              value === opt
                ? t.selectedBtn
                : 'bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
          >
            {opt ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  );
}

function WaterSourceField({
  value,
  onChange,
  tone,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  tone: Tone;
}) {
  const t = TONE_STYLES[tone];
  const options: { val: string; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { val: 'onsite', label: 'Onsite Water', Icon: Droplets },
    { val: 'truck', label: 'From Truck', Icon: Truck },
  ];
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 dark:text-white/70 mb-1.5">Water source</label>
      <div className="flex gap-2">
        {options.map(({ val, label, Icon }) => (
          <button
            key={val}
            type="button"
            onClick={() => onChange(val)}
            className={`flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
              value === val
                ? t.selectedBtn
                : 'bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  filled,
}: {
  label: string;
  value: string;
  filled: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-violet-200/40 dark:border-white/5 last:border-b-0">
      <dt className="text-xs font-semibold text-gray-500 dark:text-white/50 flex-shrink-0">{label}</dt>
      <dd className={`text-xs font-semibold text-right ${filled ? 'text-gray-800 dark:text-white' : 'text-gray-400 dark:text-white/40 italic'}`}>
        {value}
      </dd>
    </div>
  );
}
