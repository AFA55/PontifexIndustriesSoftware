'use client';

import { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react';
import { ChevronDown, Plus, X, Loader2, Check } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
  meta?: string;
}

export interface SmartComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  addNewLabel?: string;
  onAddNew?: (value: string) => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
}

export interface ContactOption {
  name: string;
  phone: string | null;
  email: string | null;
  job_count?: number;
}

export interface ContactComboboxProps {
  options: ContactOption[];
  value: string;
  onChange: (name: string, phone?: string, email?: string) => void;
  onAddNew?: (name: string) => void;
  loading?: boolean;
  placeholder?: string;
  label?: string;
}

// ---------------------------------------------------------------------------
// SmartCombobox
// ---------------------------------------------------------------------------

export default function SmartCombobox({
  options,
  value,
  onChange,
  placeholder = 'Search or select…',
  addNewLabel,
  onAddNew,
  loading = false,
  disabled = false,
  label,
  icon,
  className = '',
}: SmartComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Close on outside click — commit the typed query as the value if it
  // hasn't been explicitly added/selected yet. This prevents free-text
  // entries (e.g. a new project name) from being silently discarded when
  // the user clicks away or taps Next before clicking the "Add new" row.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const trimmed = query.trim();
        if (trimmed.length > 0) {
          const exactMatch = options.find(
            (o) => o.label.toLowerCase() === trimmed.toLowerCase(),
          );
          if (exactMatch) {
            onChange(exactMatch.value);
          } else if (onAddNew) {
            onAddNew(trimmed);
            onChange(trimmed);
          } else {
            onChange(trimmed);
          }
        }
        setOpen(false);
        setQuery('');
        setActiveIndex(-1);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [query, options, onAddNew, onChange]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const filteredOptions = query.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          (o.sublabel ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  const showAddNew =
    !!onAddNew &&
    query.trim().length > 0 &&
    !filteredOptions.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  // Total navigable items = filtered + (add-new row if shown)
  const totalItems = filteredOptions.length + (showAddNew ? 1 : 0);

  const selectOption = useCallback(
    (option: ComboboxOption) => {
      onChange(option.value);
      setOpen(false);
      setQuery('');
      setActiveIndex(-1);
    },
    [onChange],
  );

  const handleAddNew = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onAddNew?.(trimmed);
    onChange(trimmed);
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
  }, [query, onAddNew, onChange]);

  const clearValue = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange('');
      setQuery('');
      inputRef.current?.focus();
    },
    [onChange],
  );

  const handleInputClick = () => {
    if (disabled) return;
    setOpen(true);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        setActiveIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        setOpen(false);
        setQuery('');
        setActiveIndex(-1);
        break;

      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % totalItems);
        break;

      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev <= 0 ? totalItems - 1 : prev - 1));
        break;

      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
          selectOption(filteredOptions[activeIndex]);
        } else if (activeIndex === filteredOptions.length && showAddNew) {
          handleAddNew();
        } else if (showAddNew && query.trim()) {
          handleAddNew();
        }
        break;
    }
  };

  const selectedLabel = value
    ? (options.find((o) => o.value === value)?.label ?? value)
    : '';

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}

      {/* Input area */}
      <div
        className={[
          'flex items-center gap-2 w-full px-3 py-2.5 bg-white border rounded-lg text-sm',
          'transition-shadow',
          open
            ? 'border-blue-500 ring-2 ring-blue-500'
            : 'border-gray-300 hover:border-gray-400',
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-text',
        ].join(' ')}
        onClick={handleInputClick}
      >
        {icon && <span className="text-gray-400 shrink-0">{icon}</span>}

        {/* Chip when a value is selected and dropdown is closed */}
        {value && !open ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md text-sm font-medium shrink-0 max-w-full overflow-hidden">
            <span className="truncate">{selectedLabel}</span>
            {!disabled && (
              <button
                type="button"
                onClick={clearValue}
                className="shrink-0 text-blue-500 hover:text-blue-700 focus:outline-none"
                aria-label="Clear selection"
              >
                <X size={12} />
              </button>
            )}
          </span>
        ) : (
          <input
            ref={inputRef}
            type="text"
            className="flex-1 min-w-0 bg-transparent outline-none text-gray-900 placeholder-gray-400"
            placeholder={open ? 'Type to search…' : placeholder}
            value={open ? query : ''}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            readOnly={!open}
            onClick={handleInputClick}
            autoComplete="off"
          />
        )}

        {/* Trailing icon */}
        <span className="shrink-0 text-gray-400 ml-auto pl-1">
          {loading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <ChevronDown
              size={15}
              className={`transition-transform ${open ? 'rotate-180' : ''}`}
            />
          )}
        </span>
      </div>

      {/* Dropdown panel */}
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
        >
          {filteredOptions.length === 0 && !showAddNew && (
            <li className="px-3 py-2.5 text-xs text-gray-400 text-center select-none">
              No options found
            </li>
          )}

          {filteredOptions.map((option, idx) => {
            const isActive = idx === activeIndex;
            const isSelected = option.value === value;
            return (
              <li
                key={`${option.value}-${idx}`}
                role="option"
                aria-selected={isSelected}
                className={[
                  'flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b border-gray-50 last:border-0 select-none',
                  isActive || isSelected ? 'bg-blue-50' : 'hover:bg-blue-50',
                ].join(' ')}
                onPointerDown={(e) => {
                  // Prevent blur on the input before we handle the click
                  e.preventDefault();
                }}
                onClick={() => selectOption(option)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{option.label}</p>
                  {option.sublabel && (
                    <p className="text-xs text-gray-500 truncate">{option.sublabel}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {option.meta && (
                    <span className="text-xs text-gray-400">{option.meta}</span>
                  )}
                  {isSelected && <Check size={13} className="text-blue-600" />}
                </div>
              </li>
            );
          })}

          {showAddNew && (
            <li
              role="option"
              aria-selected={false}
              className={[
                'flex items-center gap-2 px-3 py-2.5 cursor-pointer text-green-700 border-t border-gray-100 select-none',
                activeIndex === filteredOptions.length ? 'bg-green-50' : 'hover:bg-green-50',
              ].join(' ')}
              onPointerDown={(e) => e.preventDefault()}
              onClick={handleAddNew}
            >
              <Plus size={14} className="shrink-0" />
              <span className="text-sm font-medium">
                {addNewLabel
                  ? `${addNewLabel}: "${query.trim()}"`
                  : `Add "${query.trim()}" as new`}
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContactCombobox — specialised wrapper for site contacts
// ---------------------------------------------------------------------------

export function ContactCombobox({
  options,
  value,
  onChange,
  onAddNew,
  loading = false,
  placeholder = 'Search contacts…',
  label,
}: ContactComboboxProps) {
  // Dedupe by case-insensitive trimmed name. When multiple records share a
  // name, keep the most-informative one (most fields populated, then highest
  // job_count). This prevents 'two children with the same key' React errors
  // and surfaces a cleaner picker to the user.
  const dedupedOptions = (() => {
    const byKey = new Map<string, ContactOption>();
    for (const c of options) {
      const key = (c.name ?? '').trim().toLowerCase();
      if (!key) continue;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, c);
        continue;
      }
      const score = (x: ContactOption) =>
        (x.phone ? 2 : 0) + (x.email ? 2 : 0) + (x.job_count ?? 0);
      if (score(c) > score(existing)) byKey.set(key, c);
    }
    return Array.from(byKey.values());
  })();

  const comboOptions: ComboboxOption[] = dedupedOptions.map((c) => ({
    value: c.name,
    label: c.name,
    sublabel: c.phone ?? undefined,
    meta: c.email ?? undefined,
  }));

  const handleChange = (selectedName: string) => {
    const match = dedupedOptions.find((c) => c.name === selectedName);
    onChange(selectedName, match?.phone ?? undefined, match?.email ?? undefined);
  };

  return (
    <SmartCombobox
      options={comboOptions}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      addNewLabel="Add contact"
      onAddNew={onAddNew}
      loading={loading}
      label={label}
    />
  );
}
