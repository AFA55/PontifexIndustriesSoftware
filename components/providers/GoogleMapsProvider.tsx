'use client';

import { Libraries, useJsApiLoader } from '@react-google-maps/api';
import { createContext, useContext, ReactNode } from 'react';

const libraries: Libraries = ['places'];

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

interface GoogleMapsProviderProps {
  children: ReactNode;
}

/**
 * Inner loader — only rendered when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set.
 * Keeping the hook call here (not in the outer component) avoids a conditional
 * hook violation while still letting us skip the load entirely when no key exists.
 */
function GoogleMapsLoader({ children }: GoogleMapsProviderProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    libraries,
  });

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

export function GoogleMapsProvider({ children }: GoogleMapsProviderProps) {
  // Skip loading entirely when Maps is explicitly disabled OR no API key is set.
  // This avoids the @react-google-maps/api retry loop + Next.js dev error-overlay
  // spam on pages where the script can't load — e.g. local dev on a LAN IP whose
  // referrer the (production-restricted) key doesn't allow. Set
  // NEXT_PUBLIC_DISABLE_GOOGLE_MAPS=true to disable. Components that call
  // useGoogleMaps() receive { isLoaded: false } and gracefully degrade.
  const disabled = process.env.NEXT_PUBLIC_DISABLE_GOOGLE_MAPS === 'true';
  if (disabled || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <GoogleMapsContext.Provider value={{ isLoaded: false, loadError: undefined }}>
        {children}
      </GoogleMapsContext.Provider>
    );
  }

  return <GoogleMapsLoader>{children}</GoogleMapsLoader>;
}
