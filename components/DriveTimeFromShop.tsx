'use client';

/**
 * DriveTimeFromShop
 *
 * Shows estimated driving time + distance from the shop (Patriot Concrete
 * Cutting in Piedmont SC) to the destination address. Uses Google Maps
 * Distance Matrix Service via the JS SDK already loaded by the
 * autocomplete component. Fires only when valid coords are passed in,
 * so we don't spam the API on every keystroke.
 *
 * Failures are silent — if the SDK isn't loaded, billing is off, or the
 * address can't be routed, we just don't render the chip.
 */

import { useEffect, useState } from 'react';
import { Car, Loader2 } from 'lucide-react';
import { SHOP_LOCATION } from '@/lib/geolocation';

interface Props {
  /** Destination latitude. When null the component renders nothing. */
  lat?: number | null;
  /** Destination longitude. When null the component renders nothing. */
  lng?: number | null;
  /**
   * Fallback when only the address string is known (e.g. the user picked a
   * past saved address that we don't have coords for). Distance Matrix
   * accepts a free-text destination, so we still get an answer.
   */
  fallbackAddress?: string;
}

interface Result {
  durationText: string;   // e.g. "27 mins"
  distanceText: string;   // e.g. "18.4 mi"
}

export default function DriveTimeFromShop({ lat, lng, fallbackAddress }: Props) {
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hasCoords = typeof lat === 'number' && typeof lng === 'number';
    const hasAddress = !!fallbackAddress && fallbackAddress.trim().length >= 8;
    if (!hasCoords && !hasAddress) {
      setData(null);
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const tryFetch = () => {
      if (cancelled) return;
      const w = window as unknown as { google?: { maps?: { DistanceMatrixService?: any; LatLng?: any; UnitSystem?: { IMPERIAL: number } } } };
      const dms = w.google?.maps?.DistanceMatrixService;
      if (!dms) {
        // SDK not ready yet — retry a few times then give up silently
        if (attempts < 6) {
          attempts += 1;
          setTimeout(tryFetch, 400);
        }
        return;
      }

      setLoading(true);
      const service = new dms();
      const destination = hasCoords
        ? { lat: lat as number, lng: lng as number }
        : (fallbackAddress as string);

      service.getDistanceMatrix(
        {
          origins: [{ lat: SHOP_LOCATION.latitude, lng: SHOP_LOCATION.longitude }],
          destinations: [destination],
          travelMode: 'DRIVING',
          unitSystem: w.google?.maps?.UnitSystem?.IMPERIAL ?? 1,
        },
        (response: any, status: string) => {
          if (cancelled) return;
          setLoading(false);
          if (status !== 'OK' || !response) {
            setData(null);
            return;
          }
          const elem = response.rows?.[0]?.elements?.[0];
          if (!elem || elem.status !== 'OK') {
            setData(null);
            return;
          }
          setData({
            durationText: elem.duration?.text || '',
            distanceText: elem.distance?.text || '',
          });
        }
      );
    };

    // Debounce a beat so we don't fire on stale renders / typing bounces
    const t = setTimeout(tryFetch, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [lat, lng, fallbackAddress]);

  if (loading) {
    return (
      <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Calculating drive time…</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-50 border border-violet-200 text-xs font-medium text-violet-700">
      <Car className="w-3.5 h-3.5" />
      <span>
        ~<span className="font-bold">{data.durationText}</span> drive from shop · {data.distanceText}
      </span>
    </div>
  );
}
