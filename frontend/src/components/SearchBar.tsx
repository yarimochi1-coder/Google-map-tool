import { useRef, useEffect, useCallback } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

interface SearchBarProps {
  onPlaceSelect: (location: { lat: number; lng: number; address: string }) => void;
}

export function SearchBar({ onPlaceSelect }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const places = useMapsLibrary('places');

  const handlePlaceChanged = useCallback(
    (autocomplete: google.maps.places.Autocomplete) => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        onPlaceSelect({
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          address: place.formatted_address ?? '',
        });
      }
    },
    [onPlaceSelect]
  );

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const autocomplete = new places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'jp' },
      fields: ['geometry', 'formatted_address'],
    });

    autocomplete.addListener('place_changed', () => handlePlaceChanged(autocomplete));
  }, [places, handlePlaceChanged]);

  return (
    <div className="absolute top-3 left-3 right-3 z-40">
      <input
        ref={inputRef}
        type="text"
        placeholder="住所を検索..."
        className="w-full px-4 py-3 rounded-xl shadow-lg bg-white/95 backdrop-blur text-sm outline-none focus:ring-2 focus:ring-blue-400"
      />
    </div>
  );
}
