'use client';

/**
 * AdKitTab — the job workspace "Ad Kit" tab: live ad preview + the four
 * Hireline-style generation layers (Basic Details / Branding / Targeting /
 * Generation Instructions), Regenerate, per-channel copy blocks,
 * Translate (language variant) and Duplicate.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, Languages, CopyPlus, Copy, Check, Palette, MapPin, Wand2,
  FileText, X, Plus,
} from 'lucide-react';
import type { HiringJob, HiringScreenerQuestion } from '@/lib/hiring/types';
import { Button, Card, Alert, Modal, Spinner } from '@/components/ui';
import AdPreview from './AdPreview';
import { hiringFetch, LANGUAGE_LABELS } from './api';

interface AdKitTabProps {
  job: HiringJob;
  onJobUpdate: (job: HiringJob) => void;
  onRegenerated: (job: HiringJob, screeners: HiringScreenerQuestion[]) => void;
}

const INPUT_CLS =
  'w-full rounded-xl border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 ' +
  'px-3.5 py-2.5 min-h-[44px] text-base sm:text-sm text-gray-900 dark:text-white ' +
  'placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand/40';

function SectionNumber({ n }: { n: number }) {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand text-sm font-bold">
      {n}
    </span>
  );
}

function CopyBlock({ label, text }: { label: string; text: string | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
      <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-white/5 px-4 py-2">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-white/70">{label}</p>
        <button
          type="button"
          onClick={copy}
          disabled={!text}
          className="min-h-[44px] min-w-[44px] inline-flex items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-gray-600 dark:text-white/70 hover:bg-gray-200/60 dark:hover:bg-white/10 disabled:opacity-40"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="px-4 py-3 text-sm text-gray-800 dark:text-white/90 whitespace-pre-line">
        {text || <span className="text-gray-400 dark:text-white/40">Not generated yet — hit Regenerate Ad.</span>}
      </p>
    </div>
  );
}

export default function AdKitTab({ job, onJobUpdate, onRegenerated }: AdKitTabProps) {
  const router = useRouter();

  // Section 1 — basic details
  const [title, setTitle] = useState(job.title);
  const [description, setDescription] = useState(job.description);
  const [savingBasics, setSavingBasics] = useState(false);

  // Section 3 — targeting chips
  const [areas, setAreas] = useState<string[]>(job.target_areas || []);
  const [areaDraft, setAreaDraft] = useState('');
  const [savingAreas, setSavingAreas] = useState(false);

  // Section 4 — generation instructions
  const [instructions, setInstructions] = useState(job.generation_instructions || '');
  const [savingInstructions, setSavingInstructions] = useState(false);

  const [regenerating, setRegenerating] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Translate modal
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateLang, setTranslateLang] = useState(job.language === 'es' ? 'en' : 'es');
  const [translating, setTranslating] = useState(false);

  const patchJob = async (patch: Partial<HiringJob>) => {
    const data = await hiringFetch<{ job: HiringJob }>(`/api/hiring/jobs/${job.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    onJobUpdate(data.job);
  };

  const saveBasics = async () => {
    setSavingBasics(true);
    setError(null);
    try {
      await patchJob({ title: title.trim(), description });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingBasics(false);
    }
  };

  const addArea = () => {
    const v = areaDraft.trim();
    if (!v || areas.includes(v)) { setAreaDraft(''); return; }
    setAreas((a) => [...a, v]);
    setAreaDraft('');
  };

  const saveAreas = async () => {
    setSavingAreas(true);
    setError(null);
    try {
      await patchJob({ target_areas: areas });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingAreas(false);
    }
  };

  const saveInstructions = async () => {
    setSavingInstructions(true);
    setError(null);
    try {
      await patchJob({ generation_instructions: instructions.trim() || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingInstructions(false);
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const data = await hiringFetch<{ job: HiringJob; screeners: HiringScreenerQuestion[] }>(
        `/api/hiring/jobs/${job.id}/generate`,
        { method: 'POST' },
      );
      onRegenerated(data.job, data.screeners);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ad generation failed');
    } finally {
      setRegenerating(false);
    }
  };

  const translate = async () => {
    setTranslating(true);
    setError(null);
    try {
      const data = await hiringFetch<{ job: HiringJob }>(`/api/hiring/jobs/${job.id}/translate`, {
        method: 'POST',
        body: JSON.stringify({ language: translateLang }),
      });
      setTranslateOpen(false);
      router.push(`/dashboard/hiring/jobs/${data.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
      setTranslateOpen(false);
    } finally {
      setTranslating(false);
    }
  };

  const duplicate = async () => {
    setDuplicating(true);
    setError(null);
    try {
      const data = await hiringFetch<{ job: HiringJob }>(`/api/hiring/jobs/${job.id}/duplicate`, {
        method: 'POST',
      });
      router.push(`/dashboard/hiring/jobs/${data.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duplicate failed');
      setDuplicating(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="Something went wrong">{error}</Alert>}

      {/* Actions row */}
      <div className="flex flex-wrap gap-3">
        <Button
          leftIcon={<Sparkles className="w-4 h-4" />}
          loading={regenerating}
          onClick={regenerate}
        >
          Regenerate Ad
        </Button>
        <Button
          variant="secondary"
          leftIcon={<Languages className="w-4 h-4" />}
          onClick={() => setTranslateOpen(true)}
        >
          Translate
        </Button>
        <Button
          variant="secondary"
          leftIcon={<CopyPlus className="w-4 h-4" />}
          loading={duplicating}
          onClick={duplicate}
        >
          Duplicate
        </Button>
      </div>
      <p className="text-xs text-gray-500 dark:text-white/50 -mt-3">
        Changes to any section below take effect when you regenerate the ad. We&apos;ll test multiple
        versions to find the best performers.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Preview */}
        <Card title="Ad preview" subtitle="What candidates see in their feed">
          {regenerating ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Spinner size="lg" brand />
              <p className="text-sm font-semibold text-gray-600 dark:text-white/70">Building your ad…</p>
            </div>
          ) : (
            <AdPreview job={job} />
          )}
        </Card>

        {/* Layered sections */}
        <div className="space-y-4">
          {/* 1 — Basic details */}
          <Card>
            <div className="flex items-center gap-2.5 mb-3">
              <SectionNumber n={1} />
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" /> Basic details
              </h3>
            </div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Job title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLS} />
            <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mt-3 mb-1">Job description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className={INPUT_CLS}
            />
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="secondary" loading={savingBasics} onClick={saveBasics}
                disabled={!title.trim() || !description.trim()}>
                Save
              </Button>
            </div>
          </Card>

          {/* 2 — Branding (read-only) */}
          <Card>
            <div className="flex items-center gap-2.5 mb-2">
              <SectionNumber n={2} />
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-gray-400" /> Branding
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-white/70">
              Your ad automatically uses your company logo and brand colors from your company Settings —
              no setup needed here.
            </p>
          </Card>

          {/* 3 — Targeting */}
          <Card>
            <div className="flex items-center gap-2.5 mb-3">
              <SectionNumber n={3} />
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" /> Targeting
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-white/50 mb-2">
              Geographic areas the ad runs in (city, county, or metro).
            </p>
            {areas.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {areas.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand px-3 py-1.5 text-sm font-medium"
                  >
                    {a}
                    <button
                      type="button"
                      aria-label={`Remove ${a}`}
                      onClick={() => setAreas((list) => list.filter((x) => x !== a))}
                      className="ml-0.5 rounded-full hover:bg-brand/20 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={areaDraft}
                onChange={(e) => setAreaDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }}
                placeholder="e.g. Bakersfield, CA"
                className={INPUT_CLS}
              />
              <button
                type="button"
                onClick={addArea}
                aria-label="Add area"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-gray-300 dark:border-white/15 text-gray-600 dark:text-white/80 hover:bg-gray-50 dark:hover:bg-white/5"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="secondary" loading={savingAreas} onClick={saveAreas}>Save</Button>
            </div>
          </Card>

          {/* 4 — Generation instructions */}
          <Card>
            <div className="flex items-center gap-2.5 mb-3">
              <SectionNumber n={4} />
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-gray-400" /> Generation instructions
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-white/50 mb-2">
              Optional instructions for the ad generator — these only affect text content and ordering.
            </p>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder='e.g. "Lead with the pay. Mention weekly pay and no weekends."'
              className={INPUT_CLS}
            />
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="secondary" loading={savingInstructions} onClick={saveInstructions}>Save</Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Per-channel copy blocks */}
      <Card
        title="Copy for Ads Manager"
        subtitle="Paste these into Meta Ads Manager / TikTok Ads until ad accounts are connected"
      >
        <div className="space-y-4">
          <CopyBlock label="Headline (all channels)" text={job.ad_headline} />
          <CopyBlock label="Facebook — primary text" text={job.ad_primary_text} />
          <CopyBlock label="Instagram — caption" text={job.ad_primary_text} />
          <CopyBlock label="TikTok — caption" text={job.ad_tiktok_caption} />
        </div>
      </Card>

      {/* Translate modal */}
      <Modal
        open={translateOpen}
        onClose={() => !translating && setTranslateOpen(false)}
        title="Translate this job"
        description="Creates a linked language variant — same pipeline, ad + screeners translated."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTranslateOpen(false)} disabled={translating}>Cancel</Button>
            <Button leftIcon={<Languages className="w-4 h-4" />} loading={translating} onClick={translate}>
              Translate
            </Button>
          </>
        }
      >
        <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Target language</label>
        <select
          value={translateLang}
          onChange={(e) => setTranslateLang(e.target.value)}
          className={INPUT_CLS}
        >
          {Object.entries(LANGUAGE_LABELS)
            .filter(([code]) => code !== job.language)
            .map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
        </select>
      </Modal>
    </div>
  );
}
