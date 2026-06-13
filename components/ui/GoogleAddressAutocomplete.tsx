'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { MapPin } from 'lucide-react';

interface GoogleAddressAutocompleteProps {
  value: string;
  onChange: (address: string, placeDetails?: PlaceDetails) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export interface PlaceDetails {
  address: string;
  lat?: number;
  lng?: number;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

// Minimal structural types for the Places API (New). We avoid pulling in the
// full @types/google.maps surface since we only touch a few fields, and the
// global may not exist at all (graceful-degradation path).
interface PlacePrediction {
  placeId: string;
  text: { text: string };
  mainText?: { text: string } | null;
  secondaryText?: { text: string } | null;
  toPlace: () => GooglePlace;
}
interface AutocompleteSuggestion {
  placePrediction: PlacePrediction | null;
}
interface AddressComponent {
  longText?: string | null;
  shortText?: string | null;
  types: string[];
}
interface GooglePlace {
  displayName?: string | null;
  formattedAddress?: string | null;
  location?: { lat: () => number; lng: () => number } | null;
  addressComponents?: AddressComponent[] | null;
  fetchFields: (req: { fields: string[] }) => Promise<unknown>;
}

const DEBOUNCE_MS = 300;
// If Maps hasn't loaded within this window we permanently drop to a plain
// editable text input. The field must NEVER be a dead "Loading…" trap.
const READY_TIMEOUT_MS = 4000;
const READY_POLL_MS = 150;

type Phase = 'pending' | 'ready' | 'fallback';

export function GoogleAddressAutocomplete({
  value,
  onChange,
  placeholder = 'Enter address',
  className = '',
  required = false,
}: GoogleAddressAutocompleteProps) {
  const [phase, setPhase] = useState<Phase>('pending');
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [open, setOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<unknown>(null);
  // Ignore stale async responses (older keystrokes resolving after newer ones).
  const requestSeqRef = useRef(0);

  // ── Detect Places API availability ──────────────────────────────────────
  // Poll for window.google.maps until the script (loaded by GoogleMapsProvider)
  // is ready, then preload the 'places' library. On timeout, drop to fallback
  // so manual address entry is always possible.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    const startedAt = Date.now();

    const tryReady = async () => {
      if (cancelled) return;
      const g = (window as unknown as { google?: { maps?: { importLibrary?: (n: string) => Promise<unknown> } } }).google;
      if (g?.maps?.importLibrary) {
        try {
          await g.maps.importLibrary('places');
          if (!cancelled) setPhase('ready');
          return;
        } catch {
          // Library failed to load (e.g. Places API not enabled on the key).
          if (!cancelled) setPhase('fallback');
          return;
        }
      }
      if (Date.now() - startedAt >= READY_TIMEOUT_MS) {
        if (!cancelled) setPhase('fallback');
        return;
      }
      setTimeout(tryReady, READY_POLL_MS);
    };

    tryReady();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close dropdown when clicking outside.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cancel a pending debounced fetch on unmount so it can't setState after the
  // component is gone (the seq guard also covers stale resolves).
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Fetch autocomplete suggestions (Places API New) ─────────────────────
  const fetchSuggestions = useCallback(async (input: string) => {
    if (phase !== 'ready' || !input.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const g = (window as unknown as {
      google?: {
        maps?: {
          places?: {
            AutocompleteSuggestion?: {
              fetchAutocompleteSuggestions: (req: Record<string, unknown>) => Promise<{ suggestions: AutocompleteSuggestion[] }>;
            };
            AutocompleteSessionToken?: new () => unknown;
          };
        };
      };
    }).google;

    const places = g?.maps?.places;
    if (!places?.AutocompleteSuggestion) return;

    if (!sessionTokenRef.current && places.AutocompleteSessionToken) {
      sessionTokenRef.current = new places.AutocompleteSessionToken();
    }

    const seq = ++requestSeqRef.current;
    try {
      const { suggestions: results } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        includedRegionCodes: ['us'], // US-only restriction
        sessionToken: sessionTokenRef.current ?? undefined,
        language: 'en-US',
      });

      // Drop stale responses.
      if (seq !== requestSeqRef.current) return;

      const preds = results
        .map((s) => s.placePrediction)
        .filter((p): p is PlacePrediction => p != null);

      setSuggestions(preds);
      setOpen(preds.length > 0);
    } catch (error) {
      console.error('Places autocomplete error:', error);
      if (seq === requestSeqRef.current) {
        setSuggestions([]);
        setOpen(false);
      }
    }
  }, [phase]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    onChange(next);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (phase === 'ready') {
      debounceRef.current = setTimeout(() => fetchSuggestions(next), DEBOUNCE_MS);
    }
  };

  const handleSelect = async (prediction: PlacePrediction) => {
    const description = prediction.text?.text ?? '';
    setOpen(false);
    setSuggestions([]);

    try {
      const place = prediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'addressComponents'],
      });

      const formatted = place.formattedAddress || description;

      let city = '';
      let state = '';
      let zipCode = '';
      let country = '';
      (place.addressComponents ?? []).forEach((component) => {
        const types = component.types || [];
        if (types.includes('locality')) city = component.longText || '';
        if (types.includes('administrative_area_level_1')) state = component.shortText || '';
        if (types.includes('postal_code')) zipCode = component.longText || '';
        if (types.includes('country')) country = component.shortText || '';
      });

      const lat = place.location?.lat();
      const lng = place.location?.lng();

      onChange(formatted, {
        address: formatted,
        lat: typeof lat === 'number' ? lat : undefined,
        lng: typeof lng === 'number' ? lng : undefined,
        city,
        state,
        zipCode,
        country,
      });
    } catch (error) {
      console.error('Error getting place details:', error);
      onChange(description);
    } finally {
      // Session ends once details are fetched — rotate the token.
      sessionTokenRef.current = null;
    }
  };

  // While we don't yet know if Maps is available, briefly show "Loading…" as a
  // placeholder ONLY — the input is always editable (never disabled), so the
  // form is never blocked.
  const showLoadingHint = phase === 'pending';

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInput}
          onFocus={() => {
            if (phase === 'ready' && suggestions.length > 0) setOpen(true);
          }}
          placeholder={showLoadingHint ? 'Loading address search…' : placeholder}
          required={required}
          autoComplete="off"
          className={`w-full pl-12 pr-4 py-3.5 sm:py-4 bg-white border border-slate-200 rounded-xl text-base text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none hover:border-slate-300 transition-all duration-200 ${className}`}
        />
      </div>

      {/* Suggestions dropdown */}
      {open && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((prediction) => {
            const main = prediction.mainText?.text ?? prediction.text?.text ?? '';
            const secondary = prediction.secondaryText?.text ?? '';
            return (
              <div
                key={prediction.placeId}
                onClick={() => handleSelect(prediction)}
                className="px-4 py-3 hover:bg-orange-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800">{main}</p>
                    {secondary && <p className="text-sm text-gray-500">{secondary}</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
