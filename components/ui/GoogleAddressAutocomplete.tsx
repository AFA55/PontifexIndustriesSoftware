'use client';

import React, { useRef, useEffect } from 'react';
import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from 'use-places-autocomplete';
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

export function GoogleAddressAutocomplete({
  value,
  onChange,
  placeholder = 'Enter address',
  className = '',
  required = false,
}: GoogleAddressAutocompleteProps) {
  const {
    ready,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      componentRestrictions: { country: 'us' }, // Restrict to US addresses
    },
    debounce: 300,
  });

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value with internal state
  useEffect(() => {
    setValue(value, false);
  }, [value, setValue]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        clearSuggestions();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [clearSuggestions]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    onChange(e.target.value);
  };

  const handleSelect = async (description: string) => {
    setValue(description, false);
    clearSuggestions();

    try {
      const results = await getGeocode({ address: description });
      const { lat, lng } = await getLatLng(results[0]);

      // Extract address components
      const addressComponents = results[0].address_components;
      let city = '';
      let state = '';
      let zipCode = '';
      let country = '';

      addressComponents.forEach((component) => {
        if (component.types.includes('locality')) {
          city = component.long_name;
        }
        if (component.types.includes('administrative_area_level_1')) {
          state = component.short_name;
        }
        if (component.types.includes('postal_code')) {
          zipCode = component.long_name;
        }
        if (component.types.includes('country')) {
          country = component.short_name;
        }
      });

      onChange(description, {
        address: description,
        lat,
        lng,
        city,
        state,
        zipCode,
        country,
      });
    } catch (error) {
      console.error('Error getting place details:', error);
      onChange(description);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInput}
          disabled={!ready}
          placeholder={ready ? placeholder : 'Loading...'}
          required={required}
          autoComplete="off"
          className={`w-full pl-10 pr-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors ${
            !ready ? 'bg-gray-100 cursor-not-allowed' : ''
          } ${className}`}
        />
      </div>

      {/* Suggestions dropdown */}
      {status === 'OK' && data.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto"
        >
          {data.map((suggestion) => {
            const {
              place_id,
              structured_formatting: { main_text, secondary_text },
            } = suggestion;

            return (
              <div
                key={place_id}
                onClick={() => handleSelect(suggestion.description)}
                className="px-4 py-3 hover:bg-orange-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800">{main_text}</p>
                    <p className="text-sm text-gray-500">{secondary_text}</p>
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
