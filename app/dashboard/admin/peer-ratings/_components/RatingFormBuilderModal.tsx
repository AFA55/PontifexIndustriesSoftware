'use client';

import { useState, useCallback } from 'react';
import {
  X, Plus, Trash2, ChevronUp, ChevronDown, Loader2, Save,
  Star, BarChart2, CheckSquare, AlignLeft, Eye,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Question {
  id: string;
  text: string;
  type: 'rating_5' | 'rating_10' | 'yes_no' | 'text';
  required: boolean;
}

interface RatingForm {
  id: string;
  title: string;
  description: string | null;
  target_roles: string[];
  rater_roles: string[];
  questions: Question[];
  question_count: number;
  is_active: boolean;
  created_at: string;
}

interface Props {
  editForm?: RatingForm | null;
  onClose: () => void;
  onSaved: (form: RatingForm) => void;
}

const ALL_ROLES = [
  { value: 'operator', label: 'Operator' },
  { value: 'apprentice', label: 'Team Member' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Admin' },
  { value: 'operations_manager', label: 'Ops Manager' },
  { value: 'super_admin', label: 'Owner' },
  { value: 'shop_manager', label: 'Shop Manager' },
  { value: 'shop_help', label: 'Shop Helper' },
];

const QUESTION_TYPES = [
  { value: 'rating_5', label: 'Rating 1–5', icon: Star, description: 'Star rating out of 5' },
  { value: 'rating_10', label: 'Rating 1–10', icon: BarChart2, description: 'Numeric scale out of 10' },
  { value: 'yes_no', label: 'Yes / No', icon: CheckSquare, description: 'Two-option response' },
  { value: 'text', label: 'Text', icon: AlignLeft, description: 'Free text response' },
] as const;

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export default function RatingFormBuilderModal({ editForm, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(editForm?.title ?? '');
  const [description, setDescription] = useState(editForm?.description ?? '');
  const [targetRoles, setTargetRoles] = useState<string[]>(editForm?.target_roles ?? ['operator', 'apprentice']);
  const [raterRoles, setRaterRoles] = useState<string[]>(editForm?.rater_roles ?? ['operator', 'apprentice', 'supervisor']);
  const [questions, setQuestions] = useState<Question[]>(
    editForm?.questions?.map((q: any) => ({
      id: q.id || generateId(),
      text: q.text || '',
      type: q.type || 'rating_5',
      required: q.required !== undefined ? q.required : true,
    })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewMode, setPreviewMode] = useState(false);

  const toggleRole = (arr: string[], setArr: (v: string[]) => void, role: string) => {
    setArr(arr.includes(role) ? arr.filter((r) => r !== role) : [...arr, role]);
  };

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      { id: generateId(), text: '', type: 'rating_5', required: true },
    ]);
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, ...updates } : q));
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newArr = [...questions];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newArr.length) return;
    [newArr[index], newArr[swapIdx]] = [newArr[swapIdx], newArr[index]];
    setQuestions(newArr);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (targetRoles.length === 0) errs.target_roles = 'Select at least one role to be rated';
    if (raterRoles.length === 0) errs.rater_roles = 'Select at least one rater role';
    questions.forEach((q, i) => {
      if (!q.text.trim()) errs[`q_${i}`] = 'Question text is required';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        target_roles: targetRoles,
        rater_roles: raterRoles,
        questions,
      };

      const url = editForm ? `/api/admin/rating-forms/${editForm.id}` : '/api/admin/rating-forms';
      const method = editForm ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        setErrors({ general: json.error || 'Failed to save form' });
        return;
      }

      onSaved(json.data);
    } catch {
      setErrors({ general: 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, targetRoles, raterRoles, questions, editForm, onSaved]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[95vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Star className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-900">{editForm ? 'Edit Rating Form' : 'New Rating Form'}</h2>
            <p className="text-xs text-gray-500">Build a peer review form for your team</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPreviewMode((p) => !p)}
              className={`p-2.5 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${previewMode ? 'bg-purple-100 text-purple-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
              title="Preview"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {errors.general && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {errors.general}
            </div>
          )}

          {!previewMode ? (
            <>
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">Form Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Field Performance Review"
                  className={`w-full px-3 py-2.5 border rounded-xl text-sm text-gray-900 outline-none focus:ring-2 focus:ring-amber-200 ${errors.title ? 'border-red-400' : 'border-gray-200 focus:border-amber-400'}`}
                />
                {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief explanation of when/why to use this form"
                  rows={2}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 resize-none"
                />
              </div>

              {/* Target Roles */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">Who Can Be Rated With This Form? *</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => toggleRole(targetRoles, setTargetRoles, r.value)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all min-h-[36px] ${
                        targetRoles.includes(r.value)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                {errors.target_roles && <p className="text-xs text-red-500 mt-1">{errors.target_roles}</p>}
              </div>

              {/* Rater Roles */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">Who Can Submit This Form? *</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => toggleRole(raterRoles, setRaterRoles, r.value)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all min-h-[36px] ${
                        raterRoles.includes(r.value)
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                {errors.rater_roles && <p className="text-xs text-red-500 mt-1">{errors.rater_roles}</p>}
              </div>

              {/* Questions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Questions ({questions.length})</label>
                  <button
                    type="button"
                    onClick={addQuestion}
                    className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-800 font-semibold px-3 py-2 rounded-lg hover:bg-amber-50 transition-colors min-h-[36px]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Question
                  </button>
                </div>

                {questions.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl py-8 text-center">
                    <p className="text-sm text-gray-400 mb-3">No questions yet</p>
                    <button
                      type="button"
                      onClick={addQuestion}
                      className="text-xs text-amber-600 hover:text-amber-800 font-semibold px-3 py-2 rounded-lg hover:bg-amber-50 transition-colors min-h-[36px]"
                    >
                      + Add First Question
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {questions.map((q, i) => (
                      <div key={q.id} className="border border-gray-200 rounded-xl p-3 bg-gray-50">
                        <div className="flex items-start gap-2 mb-2">
                          <div className="flex flex-col gap-0.5 flex-shrink-0 mt-1">
                            <button
                              type="button"
                              onClick={() => moveQuestion(i, 'up')}
                              disabled={i === 0}
                              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 rounded transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveQuestion(i, 'down')}
                              disabled={i === questions.length - 1}
                              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 rounded transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="flex-1">
                            <input
                              type="text"
                              value={q.text}
                              onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                              placeholder={`Question ${i + 1}`}
                              className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-amber-200 ${errors[`q_${i}`] ? 'border-red-400' : 'border-gray-200 focus:border-amber-400'}`}
                            />
                            {errors[`q_${i}`] && <p className="text-xs text-red-500 mt-0.5">{errors[`q_${i}`]}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeQuestion(q.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center mt-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap pl-9">
                          {QUESTION_TYPES.map((t) => {
                            const Icon = t.icon;
                            return (
                              <button
                                key={t.value}
                                type="button"
                                onClick={() => updateQuestion(q.id, { type: t.value })}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all min-h-[32px] ${
                                  q.type === t.value
                                    ? 'bg-amber-100 text-amber-700 border-amber-300'
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-amber-200'
                                }`}
                              >
                                <Icon className="w-3 h-3" />
                                {t.label}
                              </button>
                            );
                          })}
                          <label className="flex items-center gap-1.5 cursor-pointer ml-auto min-h-[32px]">
                            <input
                              type="checkbox"
                              checked={q.required}
                              onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                              className="w-3.5 h-3.5 accent-amber-500"
                            />
                            <span className="text-xs text-gray-500">Required</span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Preview Mode */
            <div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <h3 className="font-bold text-gray-900 text-base">{title || 'Untitled Form'}</h3>
                {description && <p className="text-sm text-gray-600 mt-1">{description}</p>}
              </div>
              <div className="space-y-4">
                {questions.map((q, i) => (
                  <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-gray-800 mb-3">
                      {i + 1}. {q.text || 'Untitled question'}
                      {q.required && <span className="text-red-500 ml-1">*</span>}
                    </p>
                    {q.type === 'rating_5' && (
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <div key={n} className="w-10 h-10 border-2 border-gray-200 rounded-xl flex items-center justify-center text-sm font-bold text-gray-400">
                            {n}
                          </div>
                        ))}
                      </div>
                    )}
                    {q.type === 'rating_10' && (
                      <div className="flex gap-1.5 flex-wrap">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                          <div key={n} className="w-8 h-8 border-2 border-gray-200 rounded-lg flex items-center justify-center text-xs font-bold text-gray-400">
                            {n}
                          </div>
                        ))}
                      </div>
                    )}
                    {q.type === 'yes_no' && (
                      <div className="flex gap-3">
                        <div className="flex-1 py-3 border-2 border-gray-200 rounded-xl text-center text-sm font-semibold text-gray-400">Yes</div>
                        <div className="flex-1 py-3 border-2 border-gray-200 rounded-xl text-center text-sm font-semibold text-gray-400">No</div>
                      </div>
                    )}
                    {q.type === 'text' && (
                      <div className="w-full h-16 border border-gray-200 rounded-xl bg-gray-50" />
                    )}
                  </div>
                ))}
                {questions.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-8">No questions added yet.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition-colors min-h-[48px]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 min-h-[48px]"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : (editForm ? 'Update Form' : 'Create Form')}
          </button>
        </div>
      </div>
    </div>
  );
}
