'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

/**
 * Google Maps loader — modern bootstrap, no @react-google-maps/api.
 *
 * History: we used @react-google-maps/api's useJsApiLoader. It caused two console
 * errors on any page where the script can't load (e.g. local dev on localhost,
 * which the production referrer-restricted key rejects):
 *   1. "Each child in a list should have a unique key prop" (library internals).
 *   2. "Failed to load Google Maps script, retrying in 2 ms" — a TIGHT retry loop
 *      that spams the console forever.
 * Nothing renders <GoogleMap>/<Marker> anymore (the address field migrated to the
 * Places API New via google.maps.importLibrary), so the library was pure overhead.
 *
 * This loads Google's official JS bootstrap ONCE (which is exactly what
 * importLibrary() in GoogleAddressAutocomplete consumes). It injects a single
 * <script>, resolves/rejects ONCE (no retry loop), and exposes the same
 * useGoogleMaps() context. On failure (or no key / disabled) consumers get
 * { isLoaded: false } and degrade gracefully — no console spam.
 */

interface GoogleMapsContextType {
  isLoaded: boolean;
  loadError: Error | undefined;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
  isLoaded: false,
  loadError: undefined,
});

export function useGoogleMaps() {
  return useContext(GoogleMapsContext);
}

// Module-level single-flight: the bootstrap is injected exactly once per page
// load no matter how many providers mount.
let bootstrapPromise: Promise<void> | null = null;

function loadPlaces(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = (window as any).google;
  if (g?.maps?.importLibrary) {
    return g.maps.importLibrary('places').then(() => undefined);
  }
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = new Promise<void>((resolve, reject) => {
    const onReady = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gg = (window as any).google;
      if (gg?.maps?.importLibrary) {
        gg.maps.importLibrary('places').then(() => resolve()).catch(reject);
      } else {
        reject(new Error('Google Maps bootstrap loaded but importLibrary is missing'));
      }
    };

    const existing = document.getElementById('gmaps-bootstrap') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', onReady, { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Google Maps script failed to load')),
        { once: true }
      );
      return;
    }

    const params = new URLSearchParams({
      key,
      v: 'weekly',
      libraries: 'places',
      loading: 'async',
    });
    const script = document.createElement('script');
    script.id = 'gmaps-bootstrap';
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    // Single error — NO retry loop. A blocked referrer (localhost) fails once,
    // consumers degrade to manual entry, and the console stays clean.
    script.onerror = () => {
      bootstrapPromise = null;
      reject(new Error('Google Maps script failed to load'));
    };
    script.onload = onReady;
    document.head.appendChild(script);
  });
  return bootstrapPromise;
}

interface GoogleMapsProviderProps {
  children: ReactNode;
}

export function GoogleMapsProvider({ children }: GoogleMapsProviderProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Error | undefined>(undefined);

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const disabled = process.env.NEXT_PUBLIC_DISABLE_GOOGLE_MAPS === 'true';

  useEffect(() => {
    if (disabled || !key) return; // no key / explicitly off → stay unloaded, no spam
    let cancelled = false;
    loadPlaces(key)
      .then(() => { if (!cancelled) setIsLoaded(true); })
      .catch((e: Error) => { if (!cancelled) setLoadError(e); }); // set once, no loop
    return () => { cancelled = true; };
  }, [key, disabled]);

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}
