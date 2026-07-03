'use client';

/**
 * AdPreview — Facebook-feed-style ad preview for a hiring job, with
 * Instagram (square) and TikTok (dark 9:16) variant toggles. Visual
 * approximation of the generated social creative; the creative surface
 * itself stays light (a Facebook post is white even in dark mode).
 */

import { useState } from 'react';
import {
  ThumbsUp, MessageCircle, Share2, Globe, MapPin, Check, Heart,
  Send, Bookmark, MoreHorizontal, Music2,
} from 'lucide-react';
import type { HiringJob } from '@/lib/hiring/types';
import { useBranding } from '@/lib/branding-context';
import { payText } from './api';

type PreviewChannel = 'facebook' | 'instagram' | 'tiktok';

const CHANNEL_TABS: { value: PreviewChannel; label: string }[] = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
];

function TenantAvatar({ name, logoUrl, size = 'w-10 h-10' }: { name: string; logoUrl: string | null; size?: string }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className={`${size} rounded-full object-contain bg-white ring-1 ring-gray-200`}
      />
    );
  }
  return (
    <div className={`${size} rounded-full bg-brand text-white flex items-center justify-center font-bold`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/** The generated creative itself — shared by all three channel frames. */
function Creative({ job, compact = false }: { job: HiringJob; compact?: boolean }) {
  const bullets = (job.ad_bullets?.length ? job.ad_bullets : job.requirements || []).slice(0, compact ? 3 : 5);
  const benefits = (job.benefits || []).slice(0, compact ? 3 : 5);
  const pay = payText(job.pay_min, job.pay_max, job.pay_period);

  return (
    <div className="bg-white text-gray-900">
      <div className="px-4 pt-4 pb-3">
        <p className="text-[11px] font-extrabold tracking-[0.2em] text-brand uppercase">We&apos;re Hiring</p>
        <h3 className={`font-black leading-tight mt-1 ${compact ? 'text-lg' : 'text-xl sm:text-2xl'}`}>
          {job.ad_headline || `Now Hiring: ${job.title}`}
        </h3>
        {job.location && (
          <p className="mt-1 flex items-center gap-1 text-sm text-gray-600">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            {job.location}
          </p>
        )}
        {bullets.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm font-medium">
                <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {pay && (
        <div className="bg-brand text-white px-4 py-2.5 text-center font-extrabold tracking-wide">
          {pay}
        </div>
      )}
      {benefits.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-[11px] font-bold tracking-widest text-gray-500 uppercase">Benefits</p>
          <ul className="mt-1.5 space-y-1">
            {benefits.map((b, i) => (
              <li key={i} className="text-sm text-gray-700">• {b}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="px-4 pb-4">
        <div className="w-full rounded-lg bg-brand text-white text-center font-bold py-2.5 text-sm">
          Apply Now
        </div>
      </div>
    </div>
  );
}

function FacebookFrame({ job, tenantName, logoUrl }: { job: HiringJob; tenantName: string; logoUrl: string | null }) {
  return (
    <div className="w-full max-w-md mx-auto rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Sponsored-post chrome */}
      <div className="flex items-center gap-3 px-4 pt-4">
        <TenantAvatar name={tenantName} logoUrl={logoUrl} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">{tenantName}</p>
          <p className="flex items-center gap-1 text-xs text-gray-500">
            Sponsored · <Globe className="w-3 h-3" />
          </p>
        </div>
        <MoreHorizontal className="w-5 h-5 text-gray-400" />
      </div>
      {job.ad_primary_text && (
        <p className="px-4 pt-3 text-sm text-gray-800 whitespace-pre-line line-clamp-4">
          {job.ad_primary_text}
        </p>
      )}
      <div className="mt-3 border-y border-gray-200">
        <Creative job={job} />
      </div>
      {/* Fake engagement row */}
      <div className="px-4 py-2 flex items-center justify-between text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white">
            <ThumbsUp className="w-2.5 h-2.5" />
          </span>
          <span className="inline-flex items-center justify-center w-4 h-4 -ml-1.5 rounded-full bg-red-500 text-white">
            <Heart className="w-2.5 h-2.5" />
          </span>
          <span className="ml-1">128</span>
        </span>
        <span>24 comments · 11 shares</span>
      </div>
      <div className="mx-2 border-t border-gray-200 grid grid-cols-3 text-sm font-medium text-gray-600">
        <span className="flex items-center justify-center gap-1.5 py-2"><ThumbsUp className="w-4 h-4" /> Like</span>
        <span className="flex items-center justify-center gap-1.5 py-2"><MessageCircle className="w-4 h-4" /> Comment</span>
        <span className="flex items-center justify-center gap-1.5 py-2"><Share2 className="w-4 h-4" /> Share</span>
      </div>
    </div>
  );
}

function InstagramFrame({ job, tenantName, logoUrl }: { job: HiringJob; tenantName: string; logoUrl: string | null }) {
  return (
    <div className="w-full max-w-sm mx-auto rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="p-[2px] rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600">
          <TenantAvatar name={tenantName} logoUrl={logoUrl} size="w-8 h-8" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '')}
          </p>
          <p className="text-[11px] text-gray-500">Sponsored</p>
        </div>
        <MoreHorizontal className="w-5 h-5 text-gray-400" />
      </div>
      <div className="aspect-square overflow-hidden border-y border-gray-200 flex flex-col justify-center">
        <Creative job={job} compact />
      </div>
      <div className="flex items-center gap-4 px-3 py-2.5 text-gray-800">
        <Heart className="w-6 h-6" />
        <MessageCircle className="w-6 h-6" />
        <Send className="w-6 h-6" />
        <Bookmark className="w-6 h-6 ml-auto" />
      </div>
      <p className="px-3 pb-3 text-sm text-gray-800 line-clamp-2">
        <span className="font-semibold">{tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '')}</span>{' '}
        {job.ad_primary_text || job.ad_headline || `Now hiring: ${job.title}. Apply today!`}
      </p>
    </div>
  );
}

function TikTokFrame({ job, tenantName, logoUrl }: { job: HiringJob; tenantName: string; logoUrl: string | null }) {
  const pay = payText(job.pay_min, job.pay_max, job.pay_period);
  return (
    <div className="relative w-full max-w-[260px] mx-auto aspect-[9/16] rounded-2xl bg-gray-950 text-white overflow-hidden shadow-sm ring-1 ring-gray-200 dark:ring-white/10">
      {/* Center creative echo */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
        <p className="text-[10px] font-extrabold tracking-[0.25em] text-brand uppercase">We&apos;re Hiring</p>
        <h3 className="mt-2 text-lg font-black leading-snug">
          {job.ad_headline || `Now Hiring: ${job.title}`}
        </h3>
        {job.location && <p className="mt-1 text-xs text-white/70">{job.location}</p>}
        {pay && (
          <p className="mt-3 rounded-full bg-brand px-3.5 py-1.5 text-sm font-extrabold">{pay}</p>
        )}
        <p className="mt-4 rounded-lg bg-white text-gray-900 px-4 py-2 text-sm font-bold">Apply Now</p>
      </div>
      {/* Right rail */}
      <div className="absolute right-2.5 bottom-20 flex flex-col items-center gap-4 text-white/90">
        <div className="flex flex-col items-center gap-0.5"><Heart className="w-6 h-6" /><span className="text-[10px]">4.2K</span></div>
        <div className="flex flex-col items-center gap-0.5"><MessageCircle className="w-6 h-6" /><span className="text-[10px]">86</span></div>
        <div className="flex flex-col items-center gap-0.5"><Share2 className="w-6 h-6" /><span className="text-[10px]">Share</span></div>
      </div>
      {/* Caption */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8">
        <div className="flex items-center gap-2">
          <TenantAvatar name={tenantName} logoUrl={logoUrl} size="w-6 h-6" />
          <p className="text-xs font-semibold truncate">@{tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '')}</p>
          <span className="ml-auto rounded bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase">Sponsored</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-white/90 line-clamp-2">
          {job.ad_tiktok_caption || job.ad_primary_text || `${job.title} — apply in 2 minutes.`}
        </p>
        <p className="mt-1 flex items-center gap-1 text-[10px] text-white/60">
          <Music2 className="w-3 h-3" /> Original sound
        </p>
      </div>
    </div>
  );
}

export default function AdPreview({ job }: { job: HiringJob }) {
  const { branding } = useBranding();
  const [channel, setChannel] = useState<PreviewChannel>('facebook');
  const tenantName = branding.company_name || 'Your Company';
  const logoUrl = branding.logo_url;

  return (
    <div>
      {/* Channel toggle */}
      <div className="mb-4 inline-flex rounded-xl bg-slate-100 dark:bg-white/10 p-1">
        {CHANNEL_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setChannel(t.value)}
            className={`min-h-[44px] px-4 rounded-lg text-sm font-semibold transition-colors ${
              channel === t.value
                ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-white/60 hover:text-gray-800 dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {channel === 'facebook' && <FacebookFrame job={job} tenantName={tenantName} logoUrl={logoUrl} />}
      {channel === 'instagram' && <InstagramFrame job={job} tenantName={tenantName} logoUrl={logoUrl} />}
      {channel === 'tiktok' && <TikTokFrame job={job} tenantName={tenantName} logoUrl={logoUrl} />}
    </div>
  );
}
