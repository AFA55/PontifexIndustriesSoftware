'use client';

/**
 * ScreenerEditor — ordered screener-question editor for a hiring job.
 * Add / edit / delete / reorder; free_response or single_choice; options
 * editor; auto-reject toggle + which answers reject. Saves the whole set
 * via PUT /api/hiring/jobs/[id]/screeners and surfaces API validation
 * errors (incl. the server-side ADEA blocklist) clearly.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Scale, ShieldAlert, X, Save,
} from 'lucide-react';
import type { HiringScreenerQuestion, ScreenerType } from '@/lib/hiring/types';
import { containsProhibitedScreenerContent } from '@/lib/hiring/types';
import { Button, Card, Alert, EmptyState } from '@/components/ui';
import { ListChecks } from 'lucide-react';
import { hiringFetch } from './api';

interface ScreenerEditorProps {
  jobId: string;
  screeners: HiringScreenerQuestion[];
  onSaved: (screeners: HiringScreenerQuestion[]) => void;
}

/** Local editable row — new rows have no id yet. */
interface DraftScreener {
  localKey: string;
  id?: string;
  question: string;
  qtype: ScreenerType;
  options: string[];
  auto_reject: boolean;
  auto_reject_answers: string[];
  required: boolean;
  is_followup: boolean;
}

let keyCounter = 0;
const nextKey = () => `draft-${++keyCounter}`;

function toDraft(s: HiringScreenerQuestion): DraftScreener {
  return {
    localKey: s.id || nextKey(),
    id: s.id,
    question: s.question,
    qtype: s.qtype,
    options: [...(s.options || [])],
    auto_reject: s.auto_reject,
    auto_reject_answers: [...(s.auto_reject_answers || [])],
    required: s.required,
    is_followup: s.is_followup,
  };
}

const INPUT_CLS =
  'w-full rounded-xl border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 ' +
  'px-3.5 py-2.5 min-h-[44px] text-base sm:text-sm text-gray-900 dark:text-white ' +
  'placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand/40';

export default function ScreenerEditor({ jobId, screeners, onSaved }: ScreenerEditorProps) {
  const [drafts, setDrafts] = useState<DraftScreener[]>(() => screeners.map(toDraft));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Re-sync when the server list changes (e.g. after Regenerate Ad)
  useEffect(() => {
    if (!dirty) setDrafts(screeners.map(toDraft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screeners]);

  const update = (key: string, patch: Partial<DraftScreener>) => {
    setDirty(true);
    setDrafts((list) => list.map((d) => (d.localKey === key ? { ...d, ...patch } : d)));
  };

  const move = (index: number, dir: -1 | 1) => {
    setDirty(true);
    setDrafts((list) => {
      const next = [...list];
      const target = index + dir;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const remove = (key: string) => {
    setDirty(true);
    setDrafts((list) => list.filter((d) => d.localKey !== key));
  };

  const addQuestion = () => {
    setDirty(true);
    setDrafts((list) => [
      ...list,
      {
        localKey: nextKey(),
        question: '',
        qtype: 'single_choice',
        options: ['Yes', 'No'],
        auto_reject: false,
        auto_reject_answers: [],
        required: true,
        is_followup: false,
      },
    ]);
  };

  /** Client-side ADEA pre-check (the API validates too). */
  const prohibited = useMemo(
    () => drafts.filter((d) => d.question.trim() && containsProhibitedScreenerContent(d.question)),
    [drafts],
  );

  const save = async () => {
    setApiError(null);

    const empty = drafts.some((d) => !d.question.trim());
    if (empty) {
      setApiError('Every question needs text — remove empty questions or fill them in.');
      return;
    }
    if (prohibited.length > 0) {
      setApiError(
        `Age-based screening is prohibited (ADEA). Please reword: "${prohibited[0].question.trim()}"`,
      );
      return;
    }

    setSaving(true);
    try {
      const payload = drafts.map((d, i) => ({
        ...(d.id ? { id: d.id } : {}),
        position: i,
        question: d.question.trim(),
        qtype: d.qtype,
        options: d.qtype === 'single_choice' ? d.options.filter((o) => o.trim()) : [],
        auto_reject: d.qtype === 'single_choice' ? d.auto_reject : false,
        auto_reject_answers:
          d.qtype === 'single_choice' && d.auto_reject
            ? d.auto_reject_answers.filter((a) => d.options.includes(a))
            : [],
        required: d.required,
        is_followup: d.is_followup,
      }));
      const data = await hiringFetch<{ screeners: HiringScreenerQuestion[] }>(
        `/api/hiring/jobs/${jobId}/screeners`,
        { method: 'PUT', body: JSON.stringify({ screeners: payload }) },
      );
      onSaved(data.screeners);
      setDrafts(data.screeners.map(toDraft));
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to save screeners');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Legal note */}
      <Alert variant="info" icon={Scale} title="Screening the lawful way">
        Age-based screening is prohibited under federal law (ADEA). Use capability questions
        instead — we generate them for you (e.g. &ldquo;Can you repeatedly lift 60+ lbs and work
        outdoors?&rdquo;).
      </Alert>

      <p className="text-sm text-gray-500 dark:text-white/60">
        Candidates apply on their phones, so keep questions concise.
      </p>

      {apiError && (
        <Alert variant="danger" icon={ShieldAlert} title="Can't save yet">
          {apiError}
        </Alert>
      )}

      {drafts.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="No screener questions yet"
            description="Add questions to filter applicants before they hit your pipeline — or regenerate the ad to get AI-suggested screeners."
            action={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={addQuestion}>Add question</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {drafts.map((d, i) => (
            <Card key={d.localKey} className="!p-4 sm:!p-5">
              <div className="flex items-start gap-3">
                {/* Order controls */}
                <div className="flex flex-col items-center gap-0.5 pt-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-gray-400 dark:text-white/40">{i + 1}</span>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === drafts.length - 1}
                    aria-label="Move down"
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={d.question}
                      onChange={(e) => update(d.localKey, { question: e.target.value })}
                      placeholder="e.g. This role requires repeatedly lifting 60+ lbs. Can you perform this?"
                      className={INPUT_CLS}
                    />
                    <select
                      value={d.qtype}
                      onChange={(e) => {
                        const qtype = e.target.value as ScreenerType;
                        update(d.localKey, {
                          qtype,
                          ...(qtype === 'free_response'
                            ? { auto_reject: false, auto_reject_answers: [] }
                            : { options: d.options.length ? d.options : ['Yes', 'No'] }),
                        });
                      }}
                      className={`${INPUT_CLS} sm:w-44 shrink-0`}
                    >
                      <option value="single_choice">Single choice</option>
                      <option value="free_response">Free response</option>
                    </select>
                  </div>

                  {d.question.trim() && containsProhibitedScreenerContent(d.question) && (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      This looks like an age question — prohibited under the ADEA. Reword as a capability question.
                    </p>
                  )}

                  {d.qtype === 'single_choice' && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 dark:text-white/70 mb-1.5">Answer options</p>
                      <div className="space-y-2">
                        {d.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <input
                              value={opt}
                              onChange={(e) => {
                                const options = [...d.options];
                                const old = options[oi];
                                options[oi] = e.target.value;
                                update(d.localKey, {
                                  options,
                                  auto_reject_answers: d.auto_reject_answers.map((a) =>
                                    a === old ? e.target.value : a,
                                  ),
                                });
                              }}
                              placeholder={`Option ${oi + 1}`}
                              className={INPUT_CLS}
                            />
                            {d.auto_reject && (
                              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-white/70 whitespace-nowrap select-none min-h-[44px] px-1">
                                <input
                                  type="checkbox"
                                  checked={d.auto_reject_answers.includes(opt)}
                                  onChange={(e) => {
                                    const set = new Set(d.auto_reject_answers);
                                    if (e.target.checked) set.add(opt); else set.delete(opt);
                                    update(d.localKey, { auto_reject_answers: Array.from(set) });
                                  }}
                                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                />
                                rejects
                              </label>
                            )}
                            <button
                              type="button"
                              aria-label="Remove option"
                              onClick={() =>
                                update(d.localKey, {
                                  options: d.options.filter((_, x) => x !== oi),
                                  auto_reject_answers: d.auto_reject_answers.filter((a) => a !== opt),
                                })
                              }
                              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => update(d.localKey, { options: [...d.options, ''] })}
                        className="mt-2 min-h-[36px] inline-flex items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-brand hover:bg-brand/10"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add option
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
                    {d.qtype === 'single_choice' && (
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-white/80 select-none min-h-[44px]">
                        <input
                          type="checkbox"
                          checked={d.auto_reject}
                          onChange={(e) =>
                            update(d.localKey, {
                              auto_reject: e.target.checked,
                              ...(e.target.checked ? {} : { auto_reject_answers: [] }),
                            })
                          }
                          className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                        />
                        Auto-reject
                        <span className="hidden sm:inline text-xs text-gray-400 dark:text-white/40">
                          — candidates who pick a rejecting answer are automatically disqualified
                        </span>
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-white/80 select-none min-h-[44px]">
                      <input
                        type="checkbox"
                        checked={d.required}
                        onChange={(e) => update(d.localKey, { required: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                      />
                      Required
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="Delete question"
                  onClick={() => remove(d.localKey)}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex flex-wrap items-center gap-3">
        {drafts.length > 0 && (
          <Button variant="secondary" leftIcon={<Plus className="w-4 h-4" />} onClick={addQuestion}>
            Add question
          </Button>
        )}
        <Button
          leftIcon={<Save className="w-4 h-4" />}
          loading={saving}
          onClick={save}
          disabled={!dirty && !savedFlash}
        >
          {savedFlash ? 'Saved!' : 'Save screeners'}
        </Button>
        {dirty && <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Unsaved changes</span>}
      </div>
    </div>
  );
}
