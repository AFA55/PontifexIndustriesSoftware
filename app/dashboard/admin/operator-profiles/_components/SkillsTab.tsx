'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Save, Plus, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';

interface SkillEntry {
  category_id: string;
  category_name: string;
  category_slug: string;
  is_default: boolean;
  display_order: number;
  rating_id: string | null;
  rating: number | null;
  notes: string | null;
  rated_at: string | null;
  updated_at: string | null;
  rated_by: string | null;
  rated_by_name: string | null;
}

interface SkillsTabProps {
  operatorId: string;
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}

function RatingBar({ value }: { value: number | null }) {
  if (value === null) return <div className="h-2 bg-gray-100 rounded-full" />;
  const pct = (value / 10) * 100;
  const color =
    value >= 8 ? 'from-violet-500 to-purple-600' :
    value >= 5 ? 'from-blue-400 to-violet-500' :
    'from-amber-400 to-orange-500';
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function RatingInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`w-7 h-7 rounded-md text-xs font-bold transition-all ${
            value === n
              ? 'bg-purple-600 text-white shadow-md scale-110'
              : value !== null && n <= value
              ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export default function SkillsTab({ operatorId, apiFetch }: SkillsTabProps) {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingRating, setPendingRating] = useState<number | null>(null);
  const [pendingNotes, setPendingNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Add custom category state
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [addCategoryError, setAddCategoryError] = useState('');

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/operators/${operatorId}/skills`);
      if (res.ok) {
        const json = await res.json();
        setSkills(json.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    } finally {
      setLoading(false);
    }
  }, [operatorId, apiFetch]);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  const startEdit = (skill: SkillEntry) => {
    setEditingId(skill.category_id);
    setPendingRating(skill.rating);
    setPendingNotes(skill.notes ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setPendingRating(null);
    setPendingNotes('');
  };

  const saveRating = async (categoryId: string) => {
    if (pendingRating === null) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/operators/${operatorId}/skills`, {
        method: 'POST',
        body: JSON.stringify({
          category_id: categoryId,
          rating: pendingRating,
          notes: pendingNotes.trim() || null,
        }),
      });
      if (res.ok) {
        setSavedId(categoryId);
        setTimeout(() => setSavedId(null), 2000);
        cancelEdit();
        fetchSkills();
      }
    } catch (err) {
      console.error('Failed to save rating:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    setAddingCategory(true);
    setAddCategoryError('');
    try {
      const res = await apiFetch('/api/admin/skill-categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      const json = await res.json();
      if (res.ok) {
        setNewCategoryName('');
        setShowAddCategory(false);
        fetchSkills();
      } else {
        setAddCategoryError(json.error || 'Failed to add category');
      }
    } catch (err) {
      setAddCategoryError('Failed to add category');
    } finally {
      setAddingCategory(false);
    }
  };

  const ratedCount = skills.filter(s => s.rating !== null).length;
  const avgRating = ratedCount > 0
    ? (skills.reduce((sum, s) => sum + (s.rating ?? 0), 0) / ratedCount).toFixed(1)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">
            {ratedCount} / {skills.length} rated
          </span>
          {avgRating && (
            <span className="px-2.5 py-1 bg-purple-50 rounded-full text-xs font-bold text-purple-700">
              Avg: {avgRating} / 10
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAddCategory(v => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 hover:text-purple-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Category
          {showAddCategory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Add category form */}
      {showAddCategory && (
        <div className="bg-purple-50 rounded-xl border border-purple-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider">New Skill Category</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={e => { setNewCategoryName(e.target.value); setAddCategoryError(''); }}
              placeholder="e.g. Flat Sawing"
              className="flex-1 px-3 py-1.5 border border-purple-300 rounded-lg text-sm text-gray-900 focus:border-purple-500 focus:ring-1 focus:ring-purple-200 bg-white transition-all"
              onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }}
            />
            <button
              onClick={handleAddCategory}
              disabled={addingCategory || !newCategoryName.trim()}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {addingCategory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
          </div>
          {addCategoryError && (
            <p className="text-xs text-red-600">{addCategoryError}</p>
          )}
        </div>
      )}

      {/* Skills list */}
      <div className="space-y-3">
        {skills.map(skill => {
          const isEditing = editingId === skill.category_id;
          const justSaved = savedId === skill.category_id;

          return (
            <div
              key={skill.category_id}
              className={`bg-white rounded-xl border transition-all ${
                isEditing
                  ? 'border-purple-300 shadow-md'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Row header */}
              <div className="p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{skill.category_name}</span>
                    {!skill.is_default && (
                      <span className="px-1.5 py-0.5 bg-purple-50 rounded-full text-[10px] font-semibold text-purple-600">custom</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {justSaved && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                    {skill.rating !== null && !isEditing && (
                      <span className="text-sm font-bold text-gray-700 min-w-[32px] text-right">
                        {skill.rating}<span className="text-xs text-gray-400">/10</span>
                      </span>
                    )}
                    {skill.rating === null && !isEditing && (
                      <span className="text-xs text-gray-400">--</span>
                    )}
                    <button
                      onClick={() => isEditing ? cancelEdit() : startEdit(skill)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        isEditing
                          ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                      }`}
                    >
                      {isEditing ? 'Cancel' : skill.rating !== null ? 'Edit' : 'Rate'}
                    </button>
                  </div>
                </div>

                {/* Rating bar (non-editing) */}
                {!isEditing && <RatingBar value={skill.rating} />}

                {/* Notes preview */}
                {!isEditing && skill.notes && (
                  <p className="text-xs text-gray-500 mt-1.5 italic">&ldquo;{skill.notes}&rdquo;</p>
                )}

                {/* Rater info */}
                {!isEditing && skill.rated_by_name && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Rated by {skill.rated_by_name} &middot; {skill.updated_at ? new Date(skill.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                  </p>
                )}
              </div>

              {/* Editing form */}
              {isEditing && (
                <div className="px-3.5 pb-3.5 border-t border-purple-100 pt-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Rating (1–10)</p>
                    <RatingInput value={pendingRating} onChange={setPendingRating} />
                    {pendingRating !== null && (
                      <div className="mt-2">
                        <RatingBar value={pendingRating} />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Notes (optional)</p>
                    <textarea
                      value={pendingNotes}
                      onChange={e => setPendingNotes(e.target.value)}
                      rows={2}
                      placeholder="Any observations about this skill..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:border-purple-400 focus:ring-1 focus:ring-purple-200 resize-none transition-all"
                    />
                  </div>
                  <button
                    onClick={() => saveRating(skill.category_id)}
                    disabled={saving || pendingRating === null}
                    className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {saving ? 'Saving...' : 'Save Rating'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {skills.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <p className="text-sm">No skill categories found</p>
        </div>
      )}
    </div>
  );
}
