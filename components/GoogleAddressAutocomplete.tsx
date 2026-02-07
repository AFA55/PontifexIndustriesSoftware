'use client';

import { useEffect, useRef, useState } from 'react';

interface GoogleAddressAutocompleteProps {
  value: string;
  onChange: (address: string, placeDetails?: google.maps.places.PlaceResult) => void;
  onCoordinates?: (lat: number, lng: number) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export default function GoogleAddressAutocomplete({
  value,
  onChange,
  onCoordinates,
  placeholder = 'Enter address...',
  className = '',
  required = false,
}: GoogleAddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
      setError('Google Maps API key not configured');
      console.warn('⚠️ Google Maps API key not set. Address autocomplete disabled.');
      return;
    }

    // Load Google Maps script dynamically
    const loadGoogleMaps = () => {
      // Check if already loaded
      if (window.google && window.google.maps && window.google.maps.places) {
        initializeAutocomplete();
        return;
      }

      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        existingScript.addEventListener('load', initializeAutocomplete);
        return;
      }

      // Load the script
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps`;
      script.async = true;
      script.defer = true;

      // Global callback
      (window as any).initGoogleMaps = () => {
        initializeAutocomplete();
      };

      script.onerror = () => {
        console.error('Error loading Google Maps script');
        setError('Google Maps APIs not enabled - see GOOGLE_MAPS_SETUP.md');
      };

      // Global error handler for API authentication failures
      (window as any).gm_authFailure = () => {
        console.error('⚠️ Google Maps API not activated. Enable APIs in Google Cloud Console.');
        setError('Google Maps APIs not enabled - see GOOGLE_MAPS_SETUP.md');
      };

      document.head.appendChild(script);
    };

    const initializeAutocomplete = () => {
      setIsLoaded(true);
      setError(null);

      if (inputRef.current && !autocompleteRef.current) {
        try {
          // Initialize autocomplete
          autocompleteRef.current = new google.maps.places.Autocomplete(
            inputRef.current,
            {
              types: ['address'],
              componentRestrictions: { country: 'us' }, // Restrict to US addresses
              fields: ['formatted_address', 'geometry', 'address_components', 'name'],
            }
          );

          // Listen for place selection
          autocompleteRef.current.addListener('place_changed', () => {
            const place = autocompleteRef.current?.getPlace();

            if (place && place.formatted_address) {
              // Update the input field value directly
              if (inputRef.current) {
                inputRef.current.value = place.formatted_address;
              }

              onChange(place.formatted_address, place);

              // Extract coordinates if available
              if (place.geometry?.location && onCoordinates) {
                onCoordinates(
                  place.geometry.location.lat(),
                  place.geometry.location.lng()
                );
              }
            }
          });
        } catch (err) {
          console.error('Error initializing autocomplete:', err);
          setError('Autocomplete initialization failed');
        }
      }
    };

    loadGoogleMaps();

    return () => {
      // Cleanup
      if (autocompleteRef.current && window.google?.maps?.event) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [onChange, onCoordinates]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={className}
        autoComplete="off"
      />

      {error && (
        <p className="text-xs text-yellow-600 mt-1">
          ⚠️ {error}. Manual entry enabled.
        </p>
      )}

      {isLoaded && (
        <p className="text-xs text-gray-500 mt-1">
          ✨ Start typing to see suggestions
        </p>
      )}
    </div>
  );
}
