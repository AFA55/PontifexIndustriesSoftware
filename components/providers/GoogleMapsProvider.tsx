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
  // If no API key is configured, skip loading entirely to avoid console error
  // spam on every page. Components that call useGoogleMaps() receive
  // { isLoaded: false } and gracefully degrade (plain text input fallback).
  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <GoogleMapsContext.Provider value={{ isLoaded: false, loadError: undefined }}>
        {children}
      </GoogleMapsContext.Provider>
    );
  }

  return <GoogleMapsLoader>{children}</GoogleMapsLoader>;
}
