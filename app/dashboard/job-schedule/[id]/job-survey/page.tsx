'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

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
        console.log('Job completion status update error:', completeErr);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 animate-spin border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading survey...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 text-white sticky top-0 z-50 shadow-2xl">
        <div className="container mx-auto px-4 py-4 max-w-lg">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/job-schedule/${jobId}/work-performed`}
              className="p-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/20 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold">Job Survey</h1>
              <p className="text-blue-200 text-xs">{jobNumber ? `Job #${jobNumber}` : 'Complete before finishing'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 max-w-lg space-y-4 pb-28">

        {/* Section A: Helper Rating */}
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-6 h-6 bg-emerald-500 text-white rounded-lg flex items-center justify-center text-xs font-bold">A</span>
            Rate Your Helper
          </h3>
          <p className="text-xs text-gray-500 mb-3">How did your team member perform today?</p>
          <div className="grid grid-cols-5 gap-1.5 mb-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                onClick={() => setHelperRating(n)}
                className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                  helperRating === n
                    ? 'bg-emerald-500 text-white shadow-lg scale-105'
                    : 'bg-gray-100 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {helperRating > 0 && (
            <p className="text-xs text-center mb-3 font-semibold text-emerald-600">
              {helperRating >= 8 ? 'Excellent' : helperRating >= 6 ? 'Good' : helperRating >= 4 ? 'Fair' : 'Needs Improvement'}
            </p>
          )}
          <textarea
            value={helperNotes}
            onChange={(e) => setHelperNotes(e.target.value)}
            placeholder="Optional notes about helper performance..."
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:border-emerald-500 focus:outline-none resize-none"
            rows={2}
          />
        </div>

        {/* Section B: Universal Questions */}
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-500 text-white rounded-lg flex items-center justify-center text-xs font-bold">B</span>
            General Jobsite Info
          </h3>

          <div className="space-y-4">
            {/* Power Distance */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">How far was power? (ft)</label>
              <input
                type="number"
                min="0"
                value={powerDistanceFt}
                onChange={(e) => setPowerDistanceFt(e.target.value)}
                placeholder="e.g., 50"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 font-semibold focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Accessibility Rating */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Job Accessibility (1 = easy, 10 = very difficult)</label>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => setAccessibilityRating(n)}
                    className={`py-2 rounded-xl text-sm font-bold transition-all ${
                      accessibilityRating === n
                        ? 'bg-blue-500 text-white shadow-lg scale-105'
                        : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section C: Equipment-Specific Questions */}
        {equipmentCategories.length > 0 && (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-purple-500 text-white rounded-lg flex items-center justify-center text-xs font-bold">C</span>
              Equipment Details
            </h3>
            <p className="text-xs text-gray-500 mb-4">Based on the work you performed</p>

            <div className="space-y-5">
              {/* Wall Saw */}
              {hasWallSaw && (
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-200">
                  <h4 className="text-sm font-bold text-purple-800 mb-3">🔧 Wall Saw</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">480 cord used (ft)</label>
                      <input
                        type="number" min="0"
                        value={equipmentQuestions.wall_saw?.cord_480_ft || ''}
                        onChange={(e) => updateEquipmentField('wall_saw', 'cord_480_ft', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-purple-500 focus:outline-none"
                        placeholder="e.g., 100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Water distance (ft)</label>
                      <input
                        type="number" min="0"
                        value={equipmentQuestions.wall_saw?.water_distance_ft || ''}
                        onChange={(e) => updateEquipmentField('wall_saw', 'water_distance_ft', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-purple-500 focus:outline-none"
                        placeholder="e.g., 30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Water source</label>
                      <div className="flex gap-2">
                        {['onsite', 'truck'].map(opt => (
                          <button
                            key={opt}
                            onClick={() => updateEquipmentField('wall_saw', 'water_source', opt)}
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                              equipmentQuestions.wall_saw?.water_source === opt
                                ? 'bg-purple-500 text-white' : 'bg-white border border-gray-200 text-gray-700'
                            }`}
                          >
                            {opt === 'onsite' ? 'Onsite Water' : 'From Truck'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Track Saw (Slab Saw) */}
              {hasTrackSaw && (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <h4 className="text-sm font-bold text-blue-800 mb-3">🔧 Track Saw (Slab Saw)</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Hydraulic hose used (ft)</label>
                      <input
                        type="number" min="0"
                        value={equipmentQuestions.track_saw?.hydraulic_hose_ft || ''}
                        onChange={(e) => updateEquipmentField('track_saw', 'hydraulic_hose_ft', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                        placeholder="e.g., 50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Water distance (ft)</label>
                      <input
                        type="number" min="0"
                        value={equipmentQuestions.track_saw?.water_distance_ft || ''}
                        onChange={(e) => updateEquipmentField('track_saw', 'water_distance_ft', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                        placeholder="e.g., 30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Water source</label>
                      <div className="flex gap-2">
                        {['onsite', 'truck'].map(opt => (
                          <button
                            key={opt}
                            onClick={() => updateEquipmentField('track_saw', 'water_source', opt)}
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                              equipmentQuestions.track_saw?.water_source === opt
                                ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200 text-gray-700'
                            }`}
                          >
                            {opt === 'onsite' ? 'Onsite Water' : 'From Truck'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Core Drill */}
              {hasCoreDrill && (
                <div className="p-3 bg-orange-50 rounded-xl border border-orange-200">
                  <h4 className="text-sm font-bold text-orange-800 mb-3">🔧 Core Drill</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Did you use a pump can?</label>
                      <div className="flex gap-2">
                        {[true, false].map(opt => (
                          <button
                            key={String(opt)}
                            onClick={() => updateEquipmentField('core_drill', 'pump_can_used', opt)}
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                              equipmentQuestions.core_drill?.pump_can_used === opt
                                ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-700'
                            }`}
                          >
                            {opt ? 'Yes' : 'No'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {equipmentQuestions.core_drill?.pump_can_used === false && (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Water distance (ft)</label>
                          <input
                            type="number" min="0"
                            value={equipmentQuestions.core_drill?.water_distance_ft || ''}
                            onChange={(e) => updateEquipmentField('core_drill', 'water_distance_ft', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-orange-500 focus:outline-none"
                            placeholder="e.g., 20"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Water source</label>
                          <div className="flex gap-2">
                            {['onsite', 'truck'].map(opt => (
                              <button
                                key={opt}
                                onClick={() => updateEquipmentField('core_drill', 'water_source', opt)}
                                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                                  equipmentQuestions.core_drill?.water_source === opt
                                    ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-700'
                                }`}
                              >
                                {opt === 'onsite' ? 'Onsite Water' : 'From Truck'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Hand Saw / Push Saw / Chain Saw */}
              {hasHandSaw && (
                <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                  <h4 className="text-sm font-bold text-red-800 mb-3">🔧 Hand / Push / Chain Saw</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Hydraulic hose used (ft)</label>
                      <input
                        type="number" min="0"
                        value={equipmentQuestions.hand_saw?.hydraulic_hose_ft || ''}
                        onChange={(e) => updateEquipmentField('hand_saw', 'hydraulic_hose_ft', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-red-500 focus:outline-none"
                        placeholder="e.g., 25"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* DFS / EFS */}
              {hasDfsEfs && (
                <div className="p-3 bg-teal-50 rounded-xl border border-teal-200">
                  <h4 className="text-sm font-bold text-teal-800 mb-3">🔧 Floor Sawing (DFS/EFS)</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Water hose ran (ft)</label>
                      <input
                        type="number" min="0"
                        value={equipmentQuestions.dfs_efs?.water_hose_ft || ''}
                        onChange={(e) => updateEquipmentField('dfs_efs', 'water_hose_ft', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-teal-500 focus:outline-none"
                        placeholder="e.g., 40"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Wire Saw */}
              {hasWireSaw && (
                <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
                  <h4 className="text-sm font-bold text-indigo-800 mb-3">🔧 Wire Saw</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Water distance (ft)</label>
                      <input
                        type="number" min="0"
                        value={equipmentQuestions.wire_saw?.water_distance_ft || ''}
                        onChange={(e) => updateEquipmentField('wire_saw', 'water_distance_ft', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
                        placeholder="e.g., 30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Water source</label>
                      <div className="flex gap-2">
                        {['onsite', 'truck'].map(opt => (
                          <button
                            key={opt}
                            onClick={() => updateEquipmentField('wire_saw', 'water_source', opt)}
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                              equipmentQuestions.wire_saw?.water_source === opt
                                ? 'bg-indigo-500 text-white' : 'bg-white border border-gray-200 text-gray-700'
                            }`}
                          >
                            {opt === 'onsite' ? 'Onsite Water' : 'From Truck'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section D: Additional Notes */}
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-6 h-6 bg-gray-600 text-white rounded-lg flex items-center justify-center text-xs font-bold">D</span>
            Additional Notes
          </h3>
          <textarea
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            placeholder="Any other notes about the job..."
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:border-gray-500 focus:outline-none resize-none"
            rows={3}
          />
        </div>
      </div>

      {/* Fixed Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-gray-200 p-4 z-50">
        <div className="container mx-auto max-w-lg flex gap-3">
          <button
            onClick={() => router.push(`/dashboard/job-schedule/${jobId}/work-performed`)}
            className="flex-shrink-0 px-5 py-3.5 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold text-sm"
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${
              submitting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'
            }`}
          >
            {submitting ? (
              <>
                <div className="w-5 h-5 animate-spin border-2 border-white border-t-transparent rounded-full" />
                Submitting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Complete Job & Submit Survey
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
