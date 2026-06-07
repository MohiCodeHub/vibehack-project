import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from './ui';

export interface PlaceSuggestion {
  placeId: string;
  name: string;
  description: string;
}

interface Props {
  onSelect: (suggestion: PlaceSuggestion) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Called with the current raw query text on every keystroke. */
  onQueryChange?: (q: string) => void;
  emit: (event: string, payload: unknown) => Promise<{ ok: boolean; data?: any; error?: string }>;
  loc: { lat: number; lng: number } | null;
}

export function PlacesAutocomplete({ onSelect, disabled, placeholder = 'Search restaurants…', onQueryChange, emit, loc }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    onQueryChange?.(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!val.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const ack = await emit('restaurant:autocomplete', { query: val.trim(), loc });
      setLoading(false);
      if (ack.ok && ack.data?.suggestions?.length) {
        setSuggestions(ack.data.suggestions);
        setOpen(true);
      } else {
        setSuggestions([]);
        setOpen(false);
      }
    }, 300);
  }

  function handleSelect(s: PlaceSuggestion) {
    setQuery(s.name);
    setOpen(false);
    setSuggestions([]);
    onSelect(s);
  }

  return (
    <div className="places-autocomplete" ref={containerRef}>
      <Input
        variant="search"
        icon={loading ? <span className="places-autocomplete__spinner" /> : <Search />}
        value={query}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoFocus
        autoComplete="off"
        disabled={disabled}
      />
      {open && suggestions.length > 0 && (
        <ul className="places-autocomplete__dropdown" role="listbox">
          {suggestions.map((s) => (
            <li
              key={s.placeId}
              role="option"
              className="places-autocomplete__item"
              onMouseDown={(e) => {
                e.preventDefault(); // keep input focused until selection
                handleSelect(s);
              }}
            >
              <span className="places-autocomplete__item-name">{s.name}</span>
              {s.description && (
                <span className="places-autocomplete__item-desc">{s.description}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
