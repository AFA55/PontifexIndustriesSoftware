'use client';

/**
 * Native background geofencing (Phase C1) — iOS/Android only, no-op on web.
 *
 * Uses @capacitor-community/background-geolocation (a background LOCATION watcher;
 * we do the geofence math in JS since the plugin streams positions rather than
 * exposing OS regions). Two behaviors:
 *   1. AUTO-ARRIVAL — while an assigned job is in_route and the operator comes
 *      within ~0.5 mi of that job's stored jobsite coords, POST the in_progress
 *      transition so they don't have to tap "arrived".
 *   2. BACK-AT-SHOP REMINDER — while clocked in, when they re-enter the shop
 *      radius after having been away, fire a local notification "ready to clock
 *      out?".
 *
 * ⚠️ v1 — must be tuned ON-DEVICE after the first native build (permission flow,
 * distanceFilter, hysteresis, battery). Registered via registerPlugin so nothing
 * from the native plugin is bundled into the web/SSR build.
 */

import { registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation';
import { isNativeApp } from '@/lib/is-native';
import { supabase } from '@/lib/supabase';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

const ARRIVAL_RADIUS_MI = 0.5;   // auto-arrival when within this of the jobsite
const SHOP_RADIUS_MI = 0.15;     // ~250m — "back at shop" trigger
const AWAY_RADIUS_MI = 0.5;      // must have gone this far from shop before a re-entry counts
const TARGET_REFRESH_MS = 5 * 60 * 1000;

interface JobTarget { id: string; lat: number; lng: number; inRoute: boolean }
interface Targets { jobs: JobTarget[]; shop: { lat: number; lng: number } | null; clockedIn: boolean }

let watcherId: string | null = null;
let targets: Targets = { jobs: [], shop: null, clockedIn: false };
let lastTargetFetch = 0;
let leftShop = false;                       // hysteresis for the shop reminder
const arrivedJobs = new Set<string>();      // don't re-fire arrival per job

function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Refresh the geofence targets: the operator's active jobs (with jobsite coords) + shop + clock status. */
async function refreshTargets(): Promise<void> {
  try {
    const headers = await authHeader();
    if (!headers.Authorization) return;
    const [jobsRes, clockRes] = await Promise.all([
      fetch('/api/job-orders?include_helper_jobs=true', { headers }),
      fetch('/api/timecard/current', { headers }),
    ]);
    const jobs: JobTarget[] = [];
    if (jobsRes.ok) {
      const j = await jobsRes.json();
      for (const row of j.data || []) {
        const lat = Number(row.jobsite_latitude);
        const lng = Number(row.jobsite_longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          jobs.push({ id: row.id, lat, lng, inRoute: row.status === 'in_route' });
        }
      }
    }
    let clockedIn = false;
    let shop: { lat: number; lng: number } | null = targets.shop;
    if (clockRes.ok) {
      const c = await clockRes.json();
      clockedIn = c.isClockedIn === true;
      if (c.data?.shop?.lat != null && c.data?.shop?.lng != null) {
        shop = { lat: Number(c.data.shop.lat), lng: Number(c.data.shop.lng) };
      }
    }
    targets = { jobs, shop, clockedIn };
    lastTargetFetch = Date.now();
  } catch {
    /* keep prior targets on transient error */
  }
}

async function onLocation(loc?: Location): Promise<void> {
  if (!loc) return;
  if (Date.now() - lastTargetFetch > TARGET_REFRESH_MS) await refreshTargets();
  const { latitude: lat, longitude: lng } = loc;

  // 1. Auto-arrival at a jobsite for an in_route job.
  for (const job of targets.jobs) {
    if (!job.inRoute || arrivedJobs.has(job.id)) continue;
    if (milesBetween(lat, lng, job.lat, job.lng) <= ARRIVAL_RADIUS_MI) {
      arrivedJobs.add(job.id);
      try {
        await fetch(`/api/job-orders/${job.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify({ status: 'in_progress', latitude: lat, longitude: lng }),
        });
      } catch { /* best-effort */ }
    }
  }

  // 2. Back-at-shop clock-out reminder (hysteresis: must have left first).
  if (targets.clockedIn && targets.shop) {
    const d = milesBetween(lat, lng, targets.shop.lat, targets.shop.lng);
    if (d > AWAY_RADIUS_MI) leftShop = true;
    else if (d <= SHOP_RADIUS_MI && leftShop) {
      leftShop = false;
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        await LocalNotifications.schedule({
          notifications: [{
            id: Math.floor(Date.now() % 2_000_000_000),
            title: 'Back at the shop',
            body: 'Ready to clock out for the day?',
            schedule: { at: new Date(Date.now() + 1000) },
          }],
        });
      } catch { /* best-effort */ }
    }
  }
}

/** Start background geofencing (native only). Safe to call repeatedly. */
export async function startGeofencing(): Promise<void> {
  if (!isNativeApp() || watcherId) return;
  await refreshTargets();
  try {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: 'Tracking your location for auto clock-in/out at the jobsite.',
        backgroundTitle: 'Pontifex — on the clock',
        requestPermissions: true,
        stale: false,
        distanceFilter: 60, // metres between updates — battery vs precision
      },
      (location, error) => {
        if (error) return;
        void onLocation(location);
      },
    );
  } catch {
    watcherId = null;
  }
}

/** Stop background geofencing. */
export async function stopGeofencing(): Promise<void> {
  if (!watcherId) return;
  try {
    await BackgroundGeolocation.removeWatcher({ id: watcherId });
  } catch { /* ignore */ }
  watcherId = null;
  leftShop = false;
  arrivedJobs.clear();
}
